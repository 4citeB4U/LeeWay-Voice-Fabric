/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.FABRIC.BROWSER_KOKORO
TAG: GITHUB_PAGES_DEVICE_INDEPENDENT_SYNTHESIS
WHO: LeeWay Industries. WHAT: Use existing browser Kokoro with Studio WAV playback.
WHY: GitHub Pages cannot host an always-on Python synthesis process.
WHERE: Voice Fabric public Studio. WHEN: 2026-10-24.
HOW: load existing Kokoro browser adapter, synthesize into PCM16 WAV.
AUTHORITY: audio-only after authenticated conversation; no GPU/Veritas promotion.
LICENSE: Existing LeeWay repository terms.
*/
export function pcm16Wav(samples,rate=24000){
 if(!(samples instanceof Float32Array)||samples.length===0||
   samples.length>12_000_000||!Number.isInteger(rate)||rate<8000||rate>96000)
  throw Error('KOKORO_BROWSER_PCM_INVALID');
 const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
 const tag=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
 tag(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);tag(8,'WAVE');
 tag(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);
 view.setUint16(22,1,true);view.setUint32(24,rate,true);
 view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
 tag(36,'data');view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){
  if(!Number.isFinite(samples[i]))throw Error('KOKORO_BROWSER_AUDIO_NONFINITE');
  const v=Math.max(-1,Math.min(1,samples[i]));
  view.setInt16(44+i*2,v<0?Math.round(v*32768):Math.round(v*32767),true);
 }
 return new Uint8Array(buffer);
}
let sharedEngine=null;
export async function synthesizeKokoroInBrowser(text,voicePackageId,{
 Engine=globalThis.LeeWayKokoroVoice,
 loadAdapter=()=>import('./kokoro-browser.js'),
}={}){
 if(typeof text!=='string'||!text.trim()||text.length>1200)
  throw Error('KOKORO_BROWSER_TEXT_INVALID');
 if(!/^kokoro-[a-z]{2}_[a-z]+$/.test(voicePackageId||''))
  throw Error('KOKORO_BROWSER_VOICE_INVALID');
 if(!Engine){await loadAdapter();Engine=globalThis.LeeWayKokoroVoice;}
 if(typeof Engine!=='function')throw Error('KOKORO_BROWSER_ENGINE_UNAVAILABLE');
 if(!sharedEngine||!(sharedEngine instanceof Engine))sharedEngine=new Engine();
 sharedEngine.setVoice(voicePackageId);
 await sharedEngine.load();
 const out=await sharedEngine.request('generate',{text});
 const raw=out.audio;
 if(!(raw instanceof ArrayBuffer))throw Error('KOKORO_BROWSER_PCM_INVALID');
 const wav=pcm16Wav(new Float32Array(raw),out.sampleRate);
 return {schema:'leeway.voice.synthesis-result.v1',audioContent:null,wav,voicePackageId,
  sampleRate:out.sampleRate,execution:'BROWSER_WASM_OR_WEBGPU',gpuInferenceVerified:false,
  productionVeritasVerified:false};
}
