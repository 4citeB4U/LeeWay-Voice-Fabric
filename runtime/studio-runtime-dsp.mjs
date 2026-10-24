/* REGION: LEEWAY.VOICE.RUNTIME; TAG: CANONICAL_STUDIO_DSP_FOR_BOUND_AUDIO
WHO: Voice Fabric. WHAT: Apply the existing Studio DSP to a selected runtime waveform.
WHY: Browser-only audition tuning must not be mistaken for cross-device delivery.
HOW: Bounded PCM16 WAV decode -> existing studio-audio.js renderAudio -> processed WAV + evidence.
No voice identity substitution or new synthesizer. LICENSE: MIT. */
import crypto from 'node:crypto';
import {renderAudio,normalizeTuning} from '../src/studio-audio.js';
export function decodePcm16Wav(bytes){
 const b=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);if(b.length<44||b.length>11520000||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE')throw Error('VOICE_WAV_INVALID');
 let format=null,data=null,offset=12;
 while(offset+8<=b.length){const id=b.toString('ascii',offset,offset+4),size=b.readUInt32LE(offset+4),start=offset+8,end=start+size;if(end>b.length)throw Error('VOICE_WAV_CHUNK_BOUNDS');
  if(id==='fmt '){if(format||size<16)throw Error('VOICE_WAV_FORMAT_INVALID');format={encoding:b.readUInt16LE(start),channels:b.readUInt16LE(start+2),sampleRate:b.readUInt32LE(start+4),blockAlign:b.readUInt16LE(start+12),bits:b.readUInt16LE(start+14)};}
  if(id==='data'){if(data)throw Error('VOICE_WAV_DUPLICATE_DATA');data=b.subarray(start,end);}
  offset=end+(size%2);
 }
 if(!format||!data||format.encoding!==1||format.bits!==16||![1,2].includes(format.channels)||format.blockAlign!==2*format.channels||format.sampleRate<8000||format.sampleRate>96000||data.length%format.blockAlign)throw Error('VOICE_WAV_UNSUPPORTED_PCM_FORMAT');
 const count=data.length/format.blockAlign;if(!count||count>format.sampleRate*120)throw Error('VOICE_WAV_DURATION_LIMIT');const pcm=new Float32Array(count);
 for(let i=0;i<count;i++){let sum=0;for(let c=0;c<format.channels;c++)sum+=data.readInt16LE(i*format.blockAlign+c*2)/32768;pcm[i]=sum/format.channels;}
 return {audio:pcm,sampleRate:format.sampleRate};
}
export async function applySelectedStudioTuning(rendered,selection){
 if(!selection.tuning)return rendered;
 if(selection.tuningProcessor!=='LEEWAY_STUDIO_DSP_V1')throw Error('VOICE_TUNING_PROCESSOR_NOT_ADMITTED');
 const input=Buffer.from(rendered.audioContent,'base64'),decoded=decodePcm16Wav(input);const result=await renderAudio(decoded,normalizeTuning(selection.tuning));const output=Buffer.from(await result.blob.arrayBuffer());
 return {...rendered,audioContent:output.toString('base64'),format:'wav',sampleRate:result.sampleRate,acousticEvidence:{processor:'LEEWAY_STUDIO_DSP_V1',sourceAudioSha256:crypto.createHash('sha256').update(input).digest('hex'),processedAudioSha256:crypto.createHash('sha256').update(output).digest('hex'),tuning:result.metrics.tuning,metrics:result.metrics,scope:'PROCESSED_AUDIO_NOT_ACOUSTIC_PLAYBACK_PROOF'}};
}
