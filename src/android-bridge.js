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

// Fabric retains its global default. Clients choose another registered package
// explicitly through select(); no APK-side duplicate voice catalog is required.
let VOICE_ID='agent-lee-voice-one';
// An Android adapter can avoid a crashing GPU driver without changing Voice One.
const requestedDevice=new URLSearchParams(globalThis.location?.search||'').get('device');
// Fold6 C3-4 LOD repair: honor the client's explicit backend hint without changing Voice One identity.
// The voicePackageId remains agent-lee-voice-one; only the replaceable rendering backend changes.
// This is fail-closed: if the constrained backend cannot prepare, no Android/system TTS substitution occurs.
const device=requestedDevice==='wasm'?'wasm':undefined;
const voice=new globalThis.LeeWayBrowserVoice({device,nativeDecoder:globalThis.LeeWayPocketDecoder,onUnavailable:error=>{
  state.ready=false;state.device=null;
  if(error?.name==='AbortError'){
    state.lastError=null;setState('VOICE_STOPPED',{ready:false});return;
  }
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
let selection=Promise.resolve();
let preparation=null;
let selectedProvider='chatterbox';
let nativeSequence=0;
const nativePending=new Map();
const nativeEnglish=()=>globalThis.LeeWayPocketEnglish;
const available=pkg=>pkg.provider==='chatterbox'||(pkg.provider==='android-tts'&&!!nativeEnglish());
const engineReady=()=>selectedProvider==='android-tts'?state.ready:voice.ready;
globalThis.LeeWayEnglishResult=message=>{
  const request=nativePending.get(message.id);if(!request)return;
  nativePending.delete(message.id);clearTimeout(request.timer);
  if(message.error)request.reject(Object.assign(Error(message.error),{name:message.errorName||'Error'}));
  else request.resolve(message.result);
};
function nativeRequest(operation,text){
  if(!nativeEnglish())return Promise.reject(Error('VOICE_PROVIDER_NOT_BOUND'));
  const id='speech-'+Date.now()+'-'+(++nativeSequence);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{nativePending.delete(id);nativeEnglish()?.stop();reject(Error('ANDROID_SPEECH_TIMEOUT'));},operation==='prepare'?30000:120000);
    nativePending.set(id,{resolve,reject,timer});
    try{if(operation==='prepare')nativeEnglish().prepare(id);else nativeEnglish().speak(id,text);}
    catch(error){nativePending.delete(id);clearTimeout(timer);reject(error);}
  });
}
function stopNative(){
  nativeEnglish()?.stop();
  for(const pending of nativePending.values()){clearTimeout(pending.timer);pending.reject(new DOMException('Speech was stopped.','AbortError'));}
  nativePending.clear();
}

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

async function list(){
  return (await voiceRegistry.list()).map(pkg=>({...pkg,adapterAvailable:available(pkg),preferredForConversation:pkg.provider==='android-tts'&&available(pkg)}));
}
async function get(id=VOICE_ID){return voiceRegistry.get(String(id));}
function select(id){
  const requested=String(id||'');
  const operation=selection.catch(()=>{}).then(async()=>{
    const pkg=await voiceRegistry.get(requested);
    if(!pkg)throw Error('VOICE_PACKAGE_NOT_FOUND');
    if(!available(pkg))throw Error('VOICE_PROVIDER_NOT_BOUND');
    if(pkg.status!=='AVAILABLE')throw Error('VOICE_PACKAGE_UNAVAILABLE');
    if(requested!==VOICE_ID){
      stop();await voice.dispose();
      if(preparation)await preparation.catch(()=>{});
      VOICE_ID=requested;selectedProvider=pkg.provider;state.voicePackageId=requested;
      state.ready=false;state.device=null;state.lastError=null;
    }
    const result={...pkg,voicePackageId:VOICE_ID,selected:true,ready:state.ready&&engineReady()};
    emit('onSelection',result);return result;
  });
  selection=operation;return operation;
}
async function prepare(){
  await selection;
  if(state.ready&&engineReady()){emit('onReady',{...state});return {...state};}
  state.ready=false;
  if(preparation)return preparation;
  preparation=prepareSelected();
  try{return await preparation;}finally{preparation=null;}
}
async function prepareSelected(){
  state.preparing=true;state.lastError=null;
  try{
    const pkg=await voiceRegistry.get(VOICE_ID);
    if(!pkg)throw new Error('VOICE_PACKAGE_NOT_FOUND');
    if(pkg.provider==='android-tts'){
      const loaded=await nativeRequest('prepare');
      state.device='android-native';state.encoderBackend=null;state.decoderBackend=null;state.provider=pkg.provider;
      state.voiceName=pkg.name;state.actualEngine=loaded.engine;state.actualVoice=loaded.voice;state.locale=loaded.locale;
      state.ready=true;setState('VOICE_READY',{provider:pkg.provider,...loaded});emit('onReady',{...state});return {...state};
    }
    const blob=await voiceRegistry.audio(VOICE_ID);
    if(!blob)throw new Error('VOICE_REFERENCE_NOT_FOUND');
    // Supply the registry-authorized reference to the initial load so the same
    // speaker is not encoded twice on a constrained phone CPU.
    const loaded=await voice.load(progress=>setState('PREPARING_VOICE',{progress}),{referenceBlob:blob});
    state.device=loaded.device;
    state.encoderBackend=loaded.encoderBackend||null;
    state.decoderBackend=loaded.decoderBackend||null;
    state.provider=pkg.provider;state.voiceName=pkg.name;
    voice.exaggeration=Number(pkg.exaggeration);
    voice.setPace(pkg.pace);
    state.ready=true;
    setState('VOICE_READY',{provider:pkg.provider,pace:pkg.pace,exaggeration:pkg.exaggeration});
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
  voice.stop();stopNative();
  setState('VOICE_STOPPED',{ready:state.ready&&engineReady()});
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
    setState('VOICE_SPEAKING',{chars:clean.length});
    if(selectedProvider==='android-tts')await nativeRequest('speak',clean);
    else await voice.speak(clean,{onState:message=>setState(message)});
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
  if(selectedProvider==='android-tts')throw Error('VOICE_PROVIDER_STREAMING_UNSUPPORTED');
  stop();
  activeStreamId=id;
  activeStream=new globalThis.LeeWaySpeechStream();
  state.streaming=true;state.speaking=true;
  setState('VOICE_STREAM_READY',{streamId:id});
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
  get voicePackageId(){return VOICE_ID;},
  status:()=>({...state,ready:state.ready&&engineReady(),activeStreamId}),
  list,
  get,
  select,
  prepare,
  speak,
  streamStart,
  streamChunk,
  streamEnd,
  stop
};

setState('ANDROID_BRIDGE_READY');
emit('onBridgeReady',{ok:true,authority:'4citeB4U/LeeWay-Voice-Fabric',voicePackageId:VOICE_ID});
