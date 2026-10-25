/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.FABRIC.HTTPS.TRANSPORT
TAG: AUTHENTICATED_VOICE_ONLY_NO_GPU_CHANGES
WHO: LeeWay Industries
WHAT: public Studio client contract for an existing authenticated LeeWay voice service
WHY: GitHub Pages cannot call owner-local HTTP or relay device control commands
WHERE: Voice Fabric browser; WHEN: 2026-10-24
HOW: fixed HTTPS /v1/voice/session and /v1/voice/turn, credentialed CORS,
verified read-only response, no browser-held token or device actions
AUTHORITY: session controlled by deployed LeeWay HTTPS host; none provisioned here
LICENSE: existing repository terms.
*/
export const LEEWAY_VOICE_SESSION='/v1/voice/session';
export const LEEWAY_VOICE_TURN='/v1/voice/turn';
export function voiceServiceOrigin(value){
 if(!value)return null;
 let u;try{u=new URL(value)}catch{return null}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||
  u.hostname.endsWith('.github.io')||u.hostname==='github.io'||
  ['localhost','127.0.0.1','0.0.0.0','[::1]'].includes(u.hostname))return null;
 return u.origin;
}
export function createLeeWayVoiceTransport({origin,fetchImpl=globalThis.fetch?.bind(globalThis)}={}){
 const base=voiceServiceOrigin(origin);
 if(!fetchImpl)throw Error('FETCH_REQUIRED');
 let authenticated=false,csrfToken=null;
 async function request(route,init={}){
  if(!base)throw Error('LEEWAY_HTTPS_VOICE_SERVICE_NOT_CONFIGURED');
  const reply=await fetchImpl(base+route,{
   ...init,credentials:'include',mode:'cors',redirect:'error',
   cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(18000),
   headers:{accept:'application/json',...(init.headers||{})},
  });
  if(!reply.ok)throw Error('LEEWAY_VOICE_HTTP_'+reply.status);
  const response=await reply.json();
  if(response?.schema!=='leeway.voice.session.v1'&&route===LEEWAY_VOICE_SESSION)
   throw Error('LEEWAY_VOICE_SESSION_SCHEMA_INVALID');
  return response;
 }
 async function connect(){
  authenticated=false;csrfToken=null;
  const state=await request(LEEWAY_VOICE_SESSION,{method:'GET'});
  if(state.authenticated!==true||state.authority!=='LEEWAY_DEVICE_BRIDGE_VOICE')
   throw Error('LEEWAY_VOICE_SESSION_UNAUTHORIZED');
  if(typeof state.csrfToken!=='string'||!/^[a-f0-9]{64}$/.test(state.csrfToken))
   throw Error('LEEWAY_VOICE_CSRF_SESSION_INVALID');
  csrfToken=state.csrfToken;authenticated=true;
  return {connected:true,authority:state.authority};
 }
 async function login(password){
  if(typeof password!=='string'||password.length<16||password.length>256)
   throw Error('LEEWAY_VOICE_LOGIN_INVALID');
  const response=await request('/v1/voice/login',{method:'POST',
   headers:{'content-type':'application/json'},body:JSON.stringify({password})});
  if(response.authenticated!==true||response.authority!=='LEEWAY_DEVICE_BRIDGE_VOICE'||
    !/^[a-f0-9]{64}$/.test(response.csrfToken||''))throw Error('LEEWAY_VOICE_LOGIN_FAILED');
  csrfToken=response.csrfToken;authenticated=true;
  return {connected:true,authority:response.authority};
 }
 async function beginPairing(appId='leeway.voice.studio'){
  if(appId!=='leeway.voice.studio')throw Error('APPLICATION_NOT_REGISTERED');
  const result=await request('/v1/voice/pair/start',{method:'POST',
   headers:{'content-type':'application/json'},body:JSON.stringify({appId})});
  if(result.schema!=='leeway.voice.pair-start.v1'||
    !/^[a-f0-9]{32}$/.test(result.id||'')||
    !/^[a-f0-9]{64}$/.test(result.token||'')||
    !/^[0-9]{6}$/.test(result.displayCode||'')||
   result.expires<=Date.now()||result.expires>Date.now()+180000)
   throw Error('OWNER_PAIRING_CHALLENGE_INVALID');
  authenticated=false;csrfToken=null;
  return {id:result.id,token:result.token,displayCode:result.displayCode,expires:result.expires};
 }
 async function claimPairing(challenge){
  if(!challenge||!/^[a-f0-9]{32}$/.test(challenge.id||'')||
   !/^[a-f0-9]{64}$/.test(challenge.token||''))throw Error('PAIRING_CHALLENGE_INVALID');
  const result=await request('/v1/voice/pair/claim',{method:'POST',
   headers:{'content-type':'application/json'},
   body:JSON.stringify({id:challenge.id,token:challenge.token})});
  if(result.status==='WAITING_FOR_OWNER_APPROVAL')return {approved:false};
  if(result.schema!=='leeway.voice.session.v1'||result.authenticated!==true||
    result.authority!=='LEEWAY_DEVICE_BRIDGE_VOICE'||
    result.appId!=='leeway.voice.studio'||result.scope!=='voice:turn:readonly'||
    !/^[a-f0-9]{64}$/.test(result.csrfToken||''))
   throw Error('OWNER_APPROVAL_SESSION_INVALID');
  csrfToken=result.csrfToken;authenticated=true;
  return {approved:true,appId:result.appId};
 }
 async function turn(transcript,{mode='machine'}={}){
  if(!['machine','llm'].includes(mode))throw Error('LEEWAY_VOICE_MODE_INVALID');
  if(!authenticated)throw Error('LEEWAY_VOICE_SESSION_REQUIRED');
  if(typeof transcript!=='string'||!transcript.trim()||transcript.length>2500)
   throw Error('FINAL_TRANSCRIPT_INVALID');
  const result=await request(LEEWAY_VOICE_TURN,{
   method:'POST',headers:{'content-type':'application/json','x-leeway-voice-csrf':csrfToken},
   body:JSON.stringify({schema:'leeway.voice.turn.v1',final:true,
    mode,text:transcript.trim(),allowDeviceActions:false}),
  });
  const validText=typeof result?.text==='string'&&!!result.text.trim()&&result.text.length<=4000;
  const validMachine=mode==='machine'&&result?.source==='LEEWAY_MACHINE_CONSCIOUSNESS'&&
    result?.verified===true&&result?.veritasStatus==='PASS';
  const validLlm=mode==='llm'&&result?.source==='OLLAMA_QWEN35_4B'&&
    result?.status==='GENERATED_NOT_VERITAS_VERIFIED'&&result?.verified===false&&
    result?.gpuInferenceVerified===false;
  if(result?.schema!=='leeway.voice.turn-result.v1'||!validText||
     !(validMachine||validLlm))throw Error('LEEWAY_VOICE_RESPONSE_NOT_VERIFIED');
  return {text:result.text,source:result.source,requestId:result.requestId||null,
   receiptHash:result.receiptHash||null,verified:validMachine,
   gpuInferenceVerified:false,mode};
 }
 async function synthesize(text,voicePackageId){
  if(!authenticated)throw Error('VOICE_SESSION_REQUIRED');
  const output=await request('/v1/voice/synthesize',{method:'POST',headers:{'content-type':'application/json','x-leeway-voice-csrf':csrfToken},body:JSON.stringify({schema:'leeway.voice.synthesize.v1',text,voicePackageId})});
  if(output.schema!=='leeway.voice.synthesis-result.v1')throw Error('VOICE_SYNTHESIS_RESPONSE_INVALID');
  return output;
 }
 return Object.freeze({configured:!!base,origin:base,connect,login,beginPairing,claimPairing,turn,synthesize,
  get authenticated(){return authenticated},disconnect(){authenticated=false;csrfToken=null}});
}
