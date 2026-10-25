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
 let authenticated=false;
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
  authenticated=false;
  const state=await request(LEEWAY_VOICE_SESSION,{method:'GET'});
  if(state.authenticated!==true||state.authority!=='LEEWAY_DEVICE_BRIDGE_VOICE')
   throw Error('LEEWAY_VOICE_SESSION_UNAUTHORIZED');
  authenticated=true;
  return {connected:true,authority:state.authority};
 }
 async function turn(transcript){
  if(!authenticated)throw Error('LEEWAY_VOICE_SESSION_REQUIRED');
  if(typeof transcript!=='string'||!transcript.trim()||transcript.length>2500)
   throw Error('FINAL_TRANSCRIPT_INVALID');
  const result=await request(LEEWAY_VOICE_TURN,{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({schema:'leeway.voice.turn.v1',final:true,
    mode:'machine',text:transcript.trim(),allowDeviceActions:false}),
  });
  if(result?.schema!=='leeway.voice.turn-result.v1'||
    result.source!=='LEEWAY_MACHINE_CONSCIOUSNESS'||
    result.verified!==true||result.veritasStatus!=='PASS'||
    typeof result.text!=='string'||!result.text.trim()||result.text.length>4000)
   throw Error('LEEWAY_VOICE_RESPONSE_NOT_VERIFIED');
  return {text:result.text,source:result.source,requestId:result.requestId||null,
   receiptHash:result.receiptHash||null,verified:true};
 }
 return Object.freeze({configured:!!base,origin:base,connect,turn,
  get authenticated(){return authenticated},disconnect(){authenticated=false}});
}
