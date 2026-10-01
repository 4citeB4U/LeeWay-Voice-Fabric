/*
LEEWAY
REGION: VOICE.ANDROID.BRIDGE
TAG: VOICE.FABRIC.ANDROID.NATIVE_ADAPTER
WHAT: Android/WebView adapter for canonical Agent Lee Voice One
WHY: Give authorized Android clients the same prepared-text and streaming Voice One route used by LeeWay hosts
WHO: LeeWay Industries / Agent Lee / Creator
WHERE: LeeWay Voice Fabric
WHEN: 2026-09-30
HOW: Keep Voice One prepared in a native WebView; accept speak/stream/stop commands; report bounded state to native client
*/
import {voiceRegistry} from './voice-registry.js';

const VOICE_ID='agent-lee-voice-one';
// An Android adapter can avoid a crashing GPU driver without changing Voice One.
const requestedDevice=new URLSearchParams(globalThis.location?.search||'').get('device');
const device=requestedDevice==='wasm'?'wasm':undefined;
const voice=new globalThis.LeeWayBrowserVoice({device,nativeDecoder:globalThis.LeeWayPocketDecoder,onUnavailable:error=>{
  state.ready=false;state.device=null;
  state.lastError=error?.message||'Voice runtime is unavailable.';
  emit('onError',{stage:'runtime',error:state.lastError,voicePackageId:VOICE_ID});
}});
const state={
  ready:false,
  preparing:false,
  speaking:false,
  streaming:false,
  lastError:null,
  voicePackageId:VOICE_ID,
  engine:'LEEWAY_VOICE_FABRIC'
};
let activeStream=null;
let activeStreamId=null;
let activeTask=null;

const native=()=>globalThis.LeeWayPocketNative||null;
const emit=(method,payload)=>{
  const target=native();
  if(!target||typeof target[method]!=='function')return;
  try{target[method](JSON.stringify(payload));}catch{}
};
const setState=(message,extra={})=>{
  const payload={message,voicePackageId:VOICE_ID,...extra};
  const el=document.querySelector('#state');if(el)el.textContent=message;
  emit('onState',payload);
};
const requireStream=id=>{
  if(!activeStream||activeStreamId!==String(id||''))throw new Error('UNKNOWN_STREAM');
  return activeStream;
};

async function prepare(){
  if(state.ready&&voice.ready)return {...state};
  state.ready=false;
  if(state.preparing)return new Promise((resolve,reject)=>{
    const poll=setInterval(()=>{
      if(state.ready){clearInterval(poll);resolve({...state});}
      else if(state.lastError){clearInterval(poll);reject(new Error(state.lastError));}
    },100);
  });
  state.preparing=true;state.lastError=null;
  try{
    const pkg=await voiceRegistry.get(VOICE_ID);
    if(!pkg)throw new Error('VOICE_ONE_PACKAGE_NOT_FOUND');
    const blob=await voiceRegistry.audio(VOICE_ID);
    if(!blob)throw new Error('VOICE_ONE_REFERENCE_NOT_FOUND');
    // Supply the registry-authorized reference to the initial load so the same
    // speaker is not encoded twice on a constrained phone CPU.
    const loaded=await voice.load(progress=>setState('PREPARING_VOICE_ONE',{progress}),{referenceBlob:blob});
    state.device=loaded.device;
    voice.exaggeration=Number(pkg.exaggeration);
    voice.setPace(pkg.pace);
    state.ready=true;
    setState('VOICE_ONE_READY',{provider:pkg.provider,pace:pkg.pace,exaggeration:pkg.exaggeration});
    emit('onReady',{...state,provider:pkg.provider});
    return {...state,provider:pkg.provider};
  }catch(error){
    state.ready=false;
    state.lastError=error?.message||String(error);
    emit('onError',{stage:'prepare',error:state.lastError,voicePackageId:VOICE_ID});
    throw error;
  }finally{state.preparing=false;}
}

function stop(){
  try{activeStream?.fail(new DOMException('Speech was stopped.','AbortError'));}catch{}
  activeStream=null;activeStreamId=null;activeTask=null;
  state.speaking=false;state.streaming=false;
  voice.stop();
  setState('VOICE_STOPPED');
  emit('onStopped',{ok:true,voicePackageId:VOICE_ID});
  return {ok:true,stopped:true,voicePackageId:VOICE_ID};
}

async function speak(text){
  const clean=String(text||'').trim();
  if(!clean)throw new Error('TEXT_REQUIRED');
  try{
    await prepare();
    stop();
    state.speaking=true;
    setState('VOICE_ONE_SPEAKING',{chars:clean.length});
    await voice.speak(clean,{onState:message=>setState(message)});
    state.speaking=false;
    emit('onSpeakComplete',{ok:true,chars:clean.length,voicePackageId:VOICE_ID});
    return {ok:true,chars:clean.length,voicePackageId:VOICE_ID};
  }catch(error){
    state.speaking=false;
    const message=error?.message||String(error);
    if(error?.name!=='AbortError')emit('onError',{stage:'speak',error:message,voicePackageId:VOICE_ID});
    throw error;
  }
}

async function streamStart(streamId){
  const id=String(streamId||'').trim();
  if(!id)throw new Error('STREAM_ID_REQUIRED');
  await prepare();
  stop();
  activeStreamId=id;
  activeStream=new globalThis.LeeWaySpeechStream();
  state.streaming=true;state.speaking=true;
  setState('VOICE_ONE_STREAM_READY',{streamId:id});
  activeTask=voice.speakStream(activeStream,{
    onState:message=>setState(message,{streamId:id}),
    onRendered:text=>emit('onRendered',{streamId:id,text,voicePackageId:VOICE_ID})
  }).then(()=>{
    state.streaming=false;state.speaking=false;
    emit('onStreamComplete',{ok:true,streamId:id,voicePackageId:VOICE_ID});
  }).catch(error=>{
    state.streaming=false;state.speaking=false;
    if(error?.name!=='AbortError')emit('onError',{stage:'stream',streamId:id,error:error?.message||String(error),voicePackageId:VOICE_ID});
  }).finally(()=>{
    if(activeStreamId===id){activeStream=null;activeStreamId=null;activeTask=null;}
  });
  return {ok:true,streamId:id,voicePackageId:VOICE_ID};
}

function streamChunk(streamId,text){
  const id=String(streamId||'');
  const clean=String(text||'');
  if(!clean)return {ok:true,accepted:false,streamId:id,voicePackageId:VOICE_ID};
  requireStream(id).push(clean);
  emit('onChunkAccepted',{streamId:id,chars:clean.length,voicePackageId:VOICE_ID});
  return {ok:true,accepted:true,chars:clean.length,streamId:id,voicePackageId:VOICE_ID};
}

async function streamEnd(streamId){
  const id=String(streamId||'');
  const stream=requireStream(id);
  stream.end();
  const task=activeTask;
  if(task)await task;
  return {ok:true,completed:true,streamId:id,voicePackageId:VOICE_ID};
}

globalThis.LeeWayAndroidVoice={
  authority:'4citeB4U/LeeWay-Voice-Fabric',
  voicePackageId:VOICE_ID,
  status:()=>({...state,ready:state.ready&&voice.ready,activeStreamId}),
  prepare,
  speak,
  streamStart,
  streamChunk,
  streamEnd,
  stop
};

setState('ANDROID_BRIDGE_READY');
emit('onBridgeReady',{ok:true,authority:'4citeB4U/LeeWay-Voice-Fabric',voicePackageId:VOICE_ID});
