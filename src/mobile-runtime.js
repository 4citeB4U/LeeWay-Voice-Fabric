import {createLeeWayVoice} from './voice-sdk.js';

const VOICE_PACKAGE_ID='agent-lee-voice-one';
const stateElement=()=>document.querySelector('#state');
const androidBridge=()=>globalThis.LeeWayAndroidVoice;
const emit=(type,data={})=>{
  const payload={type,voicePackageId:VOICE_PACKAGE_ID,at:new Date().toISOString(),...data};
  const state=stateElement();
  if(state&&data.message)state.textContent=data.message;
  try{androidBridge()?.event(type,JSON.stringify(payload));}catch{}
  globalThis.dispatchEvent?.(new CustomEvent('leeway-mobile-voice',{detail:payload}));
};

let client=null;
let prepareTask=null;
let ready=false;

function getClient(){
  if(client)return client;
  client=createLeeWayVoice({origin:'https://4citeb4u.github.io/LeeWay-Voice-Fabric'});
  client.on('voice.state',data=>emit('voice.state',{message:String(data?.message||'Voice state changed.'),data}));
  return client;
}

async function prepare(){
  if(ready)return {ready:true,voicePackageId:VOICE_PACKAGE_ID};
  if(prepareTask)return prepareTask;
  prepareTask=(async()=>{
    emit('voice.prepare.start',{message:'Preparing Agent Lee Voice One…'});
    const c=getClient();
    await c.connect();
    const selected=await c.selectVoice(VOICE_PACKAGE_ID);
    if(selected?.selectedVoiceId!==VOICE_PACKAGE_ID)throw new Error('VOICE_IDENTITY_MISMATCH');
    const result=await c.prepare('browser-chatterbox');
    if(result?.selectedVoiceId!==VOICE_PACKAGE_ID)throw new Error('VOICE_PREPARE_IDENTITY_MISMATCH');
    ready=true;
    emit('voice.engine.ready',{message:'Agent Lee Voice One ready.',device:result?.device||null});
    return {ready:true,voicePackageId:VOICE_PACKAGE_ID,device:result?.device||null};
  })();
  try{return await prepareTask;}
  catch(error){
    ready=false;
    emit('voice.error',{message:error?.message||String(error),phase:'prepare'});
    throw error;
  }finally{prepareTask=null;}
}

async function speak(text){
  const clean=String(text||'').trim();
  if(!clean)throw new Error('TEXT_REQUIRED');
  try{
    await prepare();
    emit('voice.speak.start',{message:'Agent Lee is speaking.',chars:clean.length});
    await getClient().speak(clean);
    emit('voice.speak.complete',{message:'Agent Lee Voice One ready.',chars:clean.length});
    return {completed:true,voicePackageId:VOICE_PACKAGE_ID};
  }catch(error){
    emit('voice.error',{message:error?.message||String(error),phase:'speak'});
    throw error;
  }
}

async function stop(){
  if(client)await client.stop().catch(()=>{});
  emit('voice.stop',{message:'Agent Lee speech stopped.'});
  return {stopped:true,voicePackageId:VOICE_PACKAGE_ID};
}

function status(){
  return {ready,voicePackageId:VOICE_PACKAGE_ID,engine:'LEEWAY_VOICE_FABRIC_BROWSER_CHATTERBOX'};
}

globalThis.LeeWayMobileVoice={prepare,speak,stop,status,VOICE_PACKAGE_ID};
emit('voice.page.ready',{message:'Mobile bridge loaded; Voice One engine not yet prepared.'});
