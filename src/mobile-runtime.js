import {voiceRegistry} from './voice-registry.js';

const VOICE_ID='agent-lee-voice-one';
const state=document.querySelector('#state');
const voice=new globalThis.LeeWayBrowserVoice();
let prepared=null;

function emit(method,payload={}){
  const message=JSON.stringify({voicePackageId:VOICE_ID,...payload});
  try{
    const bridge=globalThis.AndroidVoice;
    if(bridge&&typeof bridge[method]==='function')bridge[method](message);
  }catch{}
  globalThis.dispatchEvent(new CustomEvent('leeway-mobile-voice',{detail:{method,payload:{voicePackageId:VOICE_ID,...payload}}}));
}
function setState(message){
  if(state)state.textContent=String(message||'');
  emit('onState',{message:String(message||'')});
}
async function prepare(){
  if(prepared)return prepared;
  prepared=(async()=>{
    setState('Preparing Agent Lee Voice One…');
    await voice.load(progress=>{
      const message=progress?.message||progress?.status||'Preparing voice…';
      setState(message);
    });
    const pkg=await voiceRegistry.get(VOICE_ID);
    if(!pkg)throw new Error('VOICE_PACKAGE_NOT_FOUND');
    const blob=await voiceRegistry.audio(pkg.id);
    if(!blob)throw new Error('VOICE_REFERENCE_UNAVAILABLE');
    await voice.setReference(blob);
    voice.exaggeration=Number(pkg.exaggeration);
    voice.setPace(pkg.pace);
    setState('Voice One ready.');
    emit('onReady',{ready:true,device:voice.device});
    return {ready:true,device:voice.device,voicePackageId:VOICE_ID};
  })().catch(error=>{
    prepared=null;
    setState('Voice One unavailable.');
    emit('onError',{error:error?.message||String(error)});
    throw error;
  });
  return prepared;
}
async function speak(text){
  const clean=String(text||'').trim();
  if(!clean)throw new Error('TEXT_REQUIRED');
  await prepare();
  setState('Agent Lee speaking…');
  try{
    await voice.speak(clean,{onState:setState});
    setState('Voice One ready.');
    emit('onComplete',{spoken:true,chars:clean.length});
    return {spoken:true,chars:clean.length,voicePackageId:VOICE_ID};
  }catch(error){
    emit('onError',{error:error?.message||String(error)});
    throw error;
  }
}
function stop(){
  voice.stop();
  setState('Voice stopped.');
  emit('onComplete',{spoken:false,stopped:true});
}
globalThis.LeeWayMobileVoice={prepare,speak,stop,status:()=>({ready:voice.ready,voicePackageId:VOICE_ID,device:voice.device})};
emit('onReady',{pageReady:true,engineReady:false});
prepare().catch(()=>{});
