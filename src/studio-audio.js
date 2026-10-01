/* Portable local audition DSP. No models, network calls or provider dependencies.
 * WSOLA: waveform similarity overlap-add (Verhelst & Roelands, ICASSP 1993).
 * WSOLA reference: https://www.isca-archive.org/eurospeech_1993/roelands93_eurospeech.html
 * Biquads follow Robert Bristow-Johnson's Audio EQ Cookbook: https://www.w3.org/TR/audio-eq-cookbook/
 * Noise reduction is gentle low-level expansion, NOT spectral restoration.
 * Pitch/time edits can introduce artifacts, especially at extreme settings.
 */
(function(root){
'use strict';
const DEFAULT_TUNING=Object.freeze({pace:1,pitch:0,bass:0,warmth:0,presence:0,air:0,highpass:40,deEss:0,noiseReduction:0,compression:1,gain:0});
const RANGES={pace:[.6,1.6],pitch:[-6,6],bass:[-9,9],warmth:[-9,9],presence:[-9,9],air:[-9,9],highpass:[40,180],deEss:[0,1],noiseReduction:[0,1],compression:[1,4],gain:[-9,6]};
const MAX_SECONDS=180,MAX_RATE=96000;
function normalizeTuning(input={}){const out={};for(const [key,[lo,hi]] of Object.entries(RANGES)){const value=input?.[key];out[key]=typeof value==='number'&&Number.isFinite(value)?Math.min(hi,Math.max(lo,value)):DEFAULT_TUNING[key];}return out;}
function resample(input,factor){
 if(Math.abs(factor-1)<1e-7)return input.slice();
 const out=new Float32Array(Math.max(1,Math.round(input.length/factor))),radius=20,cutoff=Math.min(1,1/factor)*.95;
 for(let i=0;i<out.length;i++){const pos=i*factor,base=Math.floor(pos);let value=0,weight=0;
  for(let k=base-radius+1;k<=base+radius;k++){if(k<0||k>=input.length)continue;const d=pos-k;if(Math.abs(d)>=radius)continue;const x=Math.PI*d*cutoff;const sinc=Math.abs(x)<1e-9?1:Math.sin(x)/x;const w=cutoff*sinc*(.5+.5*Math.cos(Math.PI*d/radius));value+=input[k]*w;weight+=w;}
  out[i]=weight?value/weight:0;
 }return out;
}
function stretch(input,tempo,rate,targetLength){
 if(Math.abs(tempo-1)<1e-6){const out=new Float32Array(targetLength);out.set(input.subarray(0,targetLength));return out;}
 const hop=Math.max(32,Math.round(rate*.02)),window=2*hop,search=Math.round(rate*.012);
 const out=new Float32Array(targetLength+window),weights=new Float32Array(targetLength+window);
 const win=Float32Array.from({length:window},(_,i)=>Math.sin(Math.PI*(i+.5)/window)**2);
 let previous=0;
 for(let dest=0,frame=0;dest<targetLength;dest+=hop,frame++){
  const expected=Math.round(frame*hop*tempo);let chosen=Math.min(expected,Math.max(0,input.length-window));
  if(frame&&input.length>window){
   const lo=Math.max(0,expected-search),hi=Math.min(input.length-window,expected+search);let best=-Infinity;
   const score=(candidate)=>{let cross=0,a2=0,b2=0;for(let j=0;j<hop;j+=4){const a=input[previous+hop+j]||0,b=input[candidate+j]||0;cross+=a*b;a2+=a*a;b2+=b*b;}return a2*b2>1e-14?cross/Math.sqrt(a2*b2)-1e-5*Math.abs(candidate-expected)/search:-Math.abs(candidate-expected);};
   for(let candidate=lo;candidate<=hi;candidate+=8){const s=score(candidate);if(s>best){best=s;chosen=candidate;}}
   const coarse=chosen;for(let candidate=Math.max(lo,coarse-7);candidate<=Math.min(hi,coarse+7);candidate++){const s=score(candidate);if(s>best){best=s;chosen=candidate;}}
  }
  for(let j=0;j<window&&dest+j<out.length;j++){out[dest+j]+=(input[chosen+j]||0)*win[j];weights[dest+j]+=win[j];}previous=chosen;
 }
 const result=out.slice(0,targetLength);for(let i=0;i<result.length;i++)result[i]=weights[i]>1e-10?result[i]/weights[i]:0;
 return result;
}
function biquad(audio,rate,type,freq,db=0,q=.707){
 const w=2*Math.PI*Math.min(freq,rate*.32)/rate,c=Math.cos(w),s=Math.sin(w),A=10**(db/40),alpha=s/(2*q),beta=2*Math.sqrt(A)*alpha;
 let b0,b1,b2,a0,a1,a2;
 if(type==='highpass'){b0=(1+c)/2;b1=-(1+c);b2=b0;a0=1+alpha;a1=-2*c;a2=1-alpha;}
 if(type==='peak'){b0=1+alpha*A;b1=-2*c;b2=1-alpha*A;a0=1+alpha/A;a1=-2*c;a2=1-alpha/A;}
 if(type==='low'){b0=A*((A+1)-(A-1)*c+beta);b1=2*A*((A-1)-(A+1)*c);b2=A*((A+1)-(A-1)*c-beta);a0=(A+1)+(A-1)*c+beta;a1=-2*((A-1)+(A+1)*c);a2=(A+1)+(A-1)*c-beta;}
 if(type==='high'){b0=A*((A+1)+(A-1)*c+beta);b1=-2*A*((A-1)+(A+1)*c);b2=A*((A+1)+(A-1)*c-beta);a0=(A+1)-(A-1)*c+beta;a1=2*((A-1)-(A+1)*c);a2=(A+1)-(A-1)*c-beta;}
 b0/=a0;b1/=a0;b2/=a0;a1/=a0;a2/=a0;let z1=0,z2=0;
 for(let i=0;i<audio.length;i++){const x=audio[i],y=b0*x+z1;z1=b1*x-a1*y+z2;z2=b2*x-a2*y;audio[i]=y;}
}
function dynamics(audio,rate,t){
 const attack=Math.exp(-1/(rate*.002)),release=Math.exp(-1/(rate*.075)),lp=1-Math.exp(-2*Math.PI*2200/rate),gain=10**(t.gain/20);let envelope=0,highEnvelope=0,low=0,expand=1;
 for(let i=0;i<audio.length;i++){
  let x=audio[i];const magnitude=Math.abs(x),coef=magnitude>envelope?attack:release;envelope=coef*envelope+(1-coef)*magnitude;
  low+=lp*(x-low);const high=x-low;highEnvelope=.95*highEnvelope+.05*Math.abs(high);
  const sibilance=Math.max(0,Math.min(1,(highEnvelope/(envelope+1e-7)-.15)*2));x-=high*t.deEss*sibilance*.65;
  // At most 12 dB attenuation below -48 dBFS; gradual release preserves tails.
  const quiet=Math.max(0,Math.min(1,1-envelope/.004));const wanted=10**(-12*t.noiseReduction*quiet/20);expand=.995*expand+.005*wanted;x*=expand;
  const over=Math.max(0,20*Math.log10(Math.max(1e-9,envelope))+18);x*=10**(-over*(1-1/t.compression)/20);
  audio[i]=x*gain;
 }
}
function encodeWav(audio,sampleRate){const bytes=new ArrayBuffer(44+audio.length*2),view=new DataView(bytes);const str=(p,s)=>{for(let i=0;i<s.length;i++)view.setUint8(p+i,s.charCodeAt(i));};str(0,'RIFF');view.setUint32(4,36+audio.length*2,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,audio.length*2,true);for(let i=0;i<audio.length;i++){const x=Math.max(-1,Math.min(1,audio[i]));view.setInt16(44+i*2,Math.round(x*(x<0?32768:32767)),true);}return new Blob([bytes],{type:'audio/wav'});}
async function decode(audio,sampleRate){
 if(audio instanceof Float32Array)return {audio,sampleRate};
 if(!(audio instanceof ArrayBuffer))throw new TypeError('Audio must be PCM Float32Array or an encoded audio ArrayBuffer.');
 if(audio.byteLength>64*1024*1024)throw new RangeError('Encoded audio exceeds the 64 MB local limit.');
 const Context=root.AudioContext||root.webkitAudioContext;if(!Context)throw new Error('Encoded audio decoding requires browser Web Audio.');
 const context=new Context();try{const decoded=await context.decodeAudioData(audio.slice(0));if(decoded.duration>MAX_SECONDS)throw new RangeError('Audio exceeds the 180 second local limit.');const mono=new Float32Array(decoded.length);for(let c=0;c<decoded.numberOfChannels;c++){const channel=decoded.getChannelData(c);for(let i=0;i<mono.length;i++)mono[i]+=channel[i]/decoded.numberOfChannels;}return {audio:mono,sampleRate:decoded.sampleRate};}finally{await context.close();}
}
async function renderAudio(input,tuning={}){
 const t=normalizeTuning(tuning);const decoded=await decode(input?.audio,input?.sampleRate),rate=decoded.sampleRate,source=decoded.audio;
 if(!Number.isInteger(rate)||rate<8000||rate>MAX_RATE)throw new RangeError('Sample rate must be an integer between 8000 and 96000 Hz.');
 if(!source.length||source.length>rate*MAX_SECONDS)throw new RangeError('Audio must contain samples and be at most 180 seconds.');
 const targetLength=Math.round(source.length/t.pace);if(targetLength>rate*MAX_SECONDS)throw new RangeError('Rendered audio would exceed 180 seconds. Shorten the source or increase pace.');
 const clean=Float32Array.from(source,x=>Number.isFinite(x)?Math.max(-1,Math.min(1,x)):0),pitchFactor=2**(t.pitch/12);
 let audio=stretch(resample(clean,pitchFactor),t.pace/pitchFactor,rate,targetLength);
 biquad(audio,rate,'highpass',t.highpass);
 for(const [key,type,freq,q] of [['bass','low',150,.707],['warmth','peak',450,.8],['presence','peak',2800,.9],['air','high',7500,.707]])if(t[key])biquad(audio,rate,type,freq,t[key],q);
 dynamics(audio,rate,t);let prePeak=0;for(const x of audio)if(Number.isFinite(x))prePeak=Math.max(prePeak,Math.abs(x));
 const guard=prePeak>.98?.98/prePeak:1;let peak=0,sum=0;for(let i=0;i<audio.length;i++){audio[i]=Number.isFinite(audio[i])?audio[i]*guard:0;peak=Math.max(peak,Math.abs(audio[i]));sum+=audio[i]**2;}
 return {audio,sampleRate:rate,blob:encodeWav(audio,rate),metrics:{durationSeconds:audio.length/rate,sourceDurationSeconds:source.length/rate,samplePeak:peak,rms:Math.sqrt(sum/audio.length),peakGuardGainDb:20*Math.log10(guard),sampleCount:audio.length,noiseReductionMethod:'gentle low-level expansion; no spectral denoising',tuning:t}};
}
const api={DEFAULT_TUNING,normalizeTuning,renderAudio};root.LeeWayStudioAudio=api;
})(typeof globalThis!=='undefined'?globalThis:this);
export const { DEFAULT_TUNING, normalizeTuning, renderAudio } = globalThis.LeeWayStudioAudio;


