/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.FABRIC.PORTABLE_SDK
TAG: DEVICE_FIRST_VOICE_SDK
WHO: LeeWay Industries. WHAT: Portable per-device Kokoro voice client.
WHY: Applications need voice and settings without a laptop relay.
WHERE: Browser/PWA on iPhone, Android, tablet, laptop.
WHEN: 2026-10-24. HOW: existing browser Kokoro and versioned voice catalog.
AUTHORITY: local speech output only; no remote actions, inference authority, or owner credential.
LICENSE: Existing LeeWay repository terms.
*/
import {KOKORO_VOICE_PACKAGES} from './voice-package-core.js';
import {synthesizeKokoroInBrowser} from './studio-kokoro-browser-synthesis.mjs';
const VALID=/^kokoro-(?:af|am|bf|bm)_[a-z0-9]+$/;
const voices=KOKORO_VOICE_PACKAGES.map(({id,name,gender})=>Object.freeze({
 id,name,gender,provider:'kokoro',offlineAfterCache:true
}));
const ids=new Set(voices.map(x=>x.id));
export const LEEWAY_DEVICE_VOICE_SDK_SCHEMA='leeway.device-voice-sdk.v1';
export function createLeeWayDeviceVoice({
 initialVoice='kokoro-am_michael',
 synthesize=synthesizeKokoroInBrowser,
 makeAudio=()=>new Audio(),
 createObjectUrl=bytes=>URL.createObjectURL(new Blob([bytes],{type:'audio/wav'})),
 revokeObjectUrl=url=>URL.revokeObjectURL(url),
}={}){
 if(!ids.has(initialVoice))throw Error('LEEWAY_VOICE_NOT_IN_CATALOG');
 let selected=initialVoice,rate=1,volume=1,player=null,objectUrl=null;
 const settings=()=>Object.freeze({voiceId:selected,rate,volume,provider:'kokoro',
  execution:'DEVICE_BROWSER_WASM_OR_WEBGPU',serverRequired:false});
 function configure(next={}){
  if(next.voiceId!==undefined){
   if(!ids.has(next.voiceId))throw Error('LEEWAY_VOICE_NOT_IN_CATALOG');
  }
  for(const field of ['rate','volume']){
   if(next[field]===undefined)continue;
   const v=next[field];
   if(typeof v!=='number'||!Number.isFinite(v)||
     (field==='rate'&&(v<0.5||v>2))||
     (field==='volume'&&(v<0||v>1)))throw Error('LEEWAY_VOICE_SETTING_INVALID');
  }
  if(next.voiceId!==undefined)selected=next.voiceId;
  if(next.rate!==undefined)rate=next.rate;
  if(next.volume!==undefined)volume=next.volume;
  return settings();
 }
 function stop(){
  if(player){player.pause();player.removeAttribute?.('src');player=null;}
  if(objectUrl){revokeObjectUrl(objectUrl);objectUrl=null;}
 }
 async function speak(text,{play=true}={}){
  if(typeof text!=='string'||!text.trim()||text.length>1200)throw Error('LEEWAY_VOICE_TEXT_INVALID');
  const snapshot=settings();
  const audio=await synthesize(text,snapshot.voiceId);
  if(!(audio.wav instanceof Uint8Array)||audio.wav.length<44)throw Error('LEEWAY_VOICE_AUDIO_INVALID');
  if(!play)return {audio:audio.wav,voiceId:snapshot.voiceId,execution:audio.execution,played:false};
  stop();
  const current=makeAudio();
  const url=createObjectUrl(audio.wav);
  player=current;objectUrl=url;
  current.src=url;current.playbackRate=snapshot.rate;current.volume=snapshot.volume;
  try{await current.play();}
  catch(error){stop();throw error;}
  return {voiceId:snapshot.voiceId,execution:audio.execution,played:true,
   completion:new Promise((resolve,reject)=>{
    const done=()=>{current.removeEventListener('ended',ended);current.removeEventListener('error',failed);
     if(player===current)stop();};
    const ended=()=>{done();resolve();},failed=()=>{done();reject(Error('LEEWAY_VOICE_PLAYBACK_FAILED'));};
    current.addEventListener('ended',ended,{once:true});
    current.addEventListener('error',failed,{once:true});
   })};
 }
 return Object.freeze({
  schema:LEEWAY_DEVICE_VOICE_SDK_SCHEMA,
  listVoices:()=>voices.slice(),
  getSettings:settings,configure,stop,speak,
  describe:()=>({schema:LEEWAY_DEVICE_VOICE_SDK_SCHEMA,requiresDeviceModel:true,
   modelDownloadOnFirstUse:true,serverRequired:false,
   note:'Model loading requires network on first use unless cached; not all iOS browsers support WebGPU. WASM depends on device memory.'})
 });
}
