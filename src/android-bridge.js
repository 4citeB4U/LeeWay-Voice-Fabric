/*
LEEWAY
REGION: VOICE.ANDROID.BRIDGE
TAG: VOICE.FABRIC.ANDROID.NATIVE_ADAPTER
WHAT: Narrow Android/WebView adapter for canonical Voice One
WHY: Give Pocket Agent a governed voice route without Android system speech fallback
WHO: LeeWay Industries / Agent Lee / Creator
WHERE: LeeWay Voice Fabric
WHEN: 2026-09-29
HOW: Load Voice One from the canonical registry, synthesize locally, report bounded state to native client
*/
import {voiceRegistry} from './voice-registry.js';

const VOICE_ID='agent-lee-voice-one';
const voice=new globalThis.LeeWayBrowserVoice();
const state={ready:false,preparing:false,lastError:null,voicePackageId:VOICE_ID,engine:'LEEWAY_VOICE_FABRIC'};
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

async function prepare(){
  if(state.ready)return {...state};
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
    await voice.load(progress=>setState('PREPARING_VOICE_ONE',{progress}));
    const blob=await voiceRegistry.audio(VOICE_ID);
    if(!blob)throw new Error('VOICE_ONE_REFERENCE_NOT_FOUND');
    await voice.setReference(blob);
    voice.exaggeration=Number(pkg.exaggeration);
    voice.setPace(pkg.pace);
    state.ready=true;
    setState('VOICE_ONE_READY',{provider:pkg.provider,pace:pkg.pace,exaggeration:pkg.exaggeration});
    emit('onReady',{...state,provider:pkg.provider});
    return {...state,provider:pkg.provider};
  }catch(error){
    state.lastError=error?.message||String(error);
    emit('onError',{stage:'prepare',error:state.lastError,voicePackageId:VOICE_ID});
    throw error;
  }finally{state.preparing=false;}
}

async function speak(text){
  const clean=String(text||'').trim();
  if(!clean)throw new Error('TEXT_REQUIRED');
  try{
    await prepare();
    await voice.speak(clean,{onState:message=>setState(message)});
    emit('onSpeakComplete',{ok:true,chars:clean.length,voicePackageId:VOICE_ID});
    return {ok:true,chars:clean.length,voicePackageId:VOICE_ID};
  }catch(error){
    const message=error?.message||String(error);
    emit('onError',{stage:'speak',error:message,voicePackageId:VOICE_ID});
    throw error;
  }
}

function stop(){
  voice.stop();
  setState('VOICE_STOPPED');
  return {ok:true,stopped:true,voicePackageId:VOICE_ID};
}

globalThis.LeeWayAndroidVoice={
  authority:'4citeB4U/LeeWay-Voice-Fabric',
  voicePackageId:VOICE_ID,
  status:()=>({...state}),
  prepare,
  speak,
  stop
};

setState('ANDROID_BRIDGE_READY');
emit('onBridgeReady',{ok:true,authority:'4citeB4U/LeeWay-Voice-Fabric',voicePackageId:VOICE_ID});
