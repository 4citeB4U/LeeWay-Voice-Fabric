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
export const LEEWAY_VOICE_INTERRUPT='/v1/voice/interrupt';
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SHA=/^[a-f0-9]{64}$/i;
const captureTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function validateTurnEvidence(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
  value.source!=='LEEWAY_EDGE_RTC'||value.transcriptSource!=='LEEWAY_EDGE_GPU_ASR'||
  value.inferenceRoute!=='LEEWAY_EDGE_GPU'||value.inferenceAuthority!=='LEEWAY_EDGE_GPU_ONLY'||
  value.storageAuthority!=='LEEWAY_CONTINUUM_ONLY'||!ID.test(value.ownerDeviceId||'')||
  !ID.test(value.segmentId||'')||!ID.test(value.audioRecordId||'')||!SHA.test(value.audioSha256||'')||
  typeof value.text!=='string'||!value.text.trim()||value.text.length>2500||
  !captureTime(value.captureStartedAt)||!captureTime(value.captureEndedAt)||
  Date.parse(value.captureEndedAt)<Date.parse(value.captureStartedAt))
  throw Error('LEEWAY_GPU_ASR_CAPTURE_EVIDENCE_REQUIRED');
 return Object.freeze({schema:'leeway.voice.turn.v1',final:true,allowDeviceActions:false,
  source:value.source,transcriptSource:value.transcriptSource,inferenceRoute:value.inferenceRoute,
  inferenceAuthority:value.inferenceAuthority,storageAuthority:value.storageAuthority,
  ownerDeviceId:value.ownerDeviceId,segmentId:value.segmentId,requestId:ID.test(value.requestId||'')?value.requestId:undefined,
  text:value.text.trim(),audioRecordId:value.audioRecordId,audioSha256:value.audioSha256.toLowerCase(),
  captureStartedAt:value.captureStartedAt,captureEndedAt:value.captureEndedAt,
  ...(typeof value.startedAt==='string'?{startedAt:value.startedAt}:{}),
  ...(value.playbackTelemetry&&typeof value.playbackTelemetry==='object'?{playbackTelemetry:value.playbackTelemetry}:{}),
  ...(value.interruptionTelemetry&&typeof value.interruptionTelemetry==='object'?{interruptionTelemetry:value.interruptionTelemetry}:{}),
  ...(value.latencyTelemetry&&typeof value.latencyTelemetry==='object'?{latencyTelemetry:value.latencyTelemetry}:{}),
  ...(value.deliveryTelemetry&&typeof value.deliveryTelemetry==='object'?{deliveryTelemetry:value.deliveryTelemetry}:{})});
}
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
 async function request(route,init={},timeoutMs=18000){
  if(!base)throw Error('LEEWAY_HTTPS_VOICE_SERVICE_NOT_CONFIGURED');
  const reply=await fetchImpl(base+route,{
   ...init,credentials:'include',mode:'cors',redirect:'error',
   cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(timeoutMs),
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
 async function turn(evidence){
  if(!authenticated)throw Error('LEEWAY_VOICE_SESSION_REQUIRED');
  const body=validateTurnEvidence(evidence);
  const result=await request(LEEWAY_VOICE_TURN,{
   method:'POST',headers:{'content-type':'application/json','x-leeway-voice-csrf':csrfToken},
   body:JSON.stringify(body),
  },90000);
  const validText=typeof result?.text==='string'&&!!result.text.trim()&&result.text.length<=4000;
  const voice=result?.voice;
  const validMachine=result?.source==='LEEWAY_MACHINE_CONSCIOUSNESS'&&result?.identity==='Agent Lee'&&
    result?.verified===true&&result?.veritasStatus==='NOT_ASSERTED'&&result?.status==='VERIFIED'&&
    result?.evidence==='AUTHENTICATED_AGENT_LEE_TURN_VOICE_FABRIC_AND_CONTINUUM_READBACK'&&
    ID.test(result?.continuumRecordId||'')&&voice?.authority==='LEEWAY_VOICE_FABRIC'&&
    voice?.agentId==='agent-lee'&&/^kokoro-(?:af|am|bf|bm)_[a-z0-9]+$/.test(voice?.voicePackageId||'')&&
    voice?.format==='wav'&&Number.isFinite(voice?.sampleRate)&&voice.sampleRate>0&&
    typeof voice?.audioContent==='string'&&voice.audioContent.length<=23000000&&
    /^[A-Za-z0-9+/]+={0,2}$/.test(voice.audioContent)&&voice.playbackVerified===false;
  if(result?.schema!=='leeway.voice.turn-result.v1'||!validText||!validMachine)
   throw Error('LEEWAY_VOICE_RESPONSE_NOT_VERIFIED');
  return {text:result.text,source:result.source,requestId:result.requestId||null,
   continuumRecordId:result.continuumRecordId,voice,gatewayEvidenceValidated:true,
   veritasStatus:result.veritasStatus,playbackVerified:false};
 }
 async function interrupt(evidence){
  if(!authenticated)throw Error('LEEWAY_VOICE_SESSION_REQUIRED');
  if(!evidence||typeof evidence!=='object'||evidence.source!=='LEEWAY_EDGE_RTC'||
   evidence.transcriptSource!=='LEEWAY_EDGE_GPU_ASR'||evidence.inferenceRoute!=='LEEWAY_EDGE_GPU'||
   evidence.inferenceAuthority!=='LEEWAY_EDGE_GPU_ONLY'||evidence.storageAuthority!=='LEEWAY_CONTINUUM_ONLY'||
   !ID.test(evidence.ownerDeviceId||'')||!ID.test(evidence.segmentId||''))
   throw Error('LEEWAY_GPU_ASR_INTERRUPT_EVIDENCE_REQUIRED');
  const result=await request(LEEWAY_VOICE_INTERRUPT,{
   method:'POST',headers:{'content-type':'application/json','x-leeway-voice-csrf':csrfToken},
   body:JSON.stringify({schema:'leeway.voice.interrupt.v1',...evidence}),
  },15000);
  if(result?.schema!=='leeway.voice.interrupt-result.v1'||
   result?.authority!=='LEEWAY_MACHINE_CONSCIOUSNESS'||!Number.isInteger(result?.interruptionEpoch)||
   result?.staleOutputGuard!=='EPOCH_ADVANCED')throw Error('LEEWAY_VOICE_INTERRUPT_NOT_VERIFIED');
  return result;
 }
 async function synthesize(text,voicePackageId){
  if(!authenticated)throw Error('VOICE_SESSION_REQUIRED');
  const output=await request('/v1/voice/synthesize',{method:'POST',headers:{'content-type':'application/json','x-leeway-voice-csrf':csrfToken},body:JSON.stringify({schema:'leeway.voice.synthesize.v1',agentId:'agent-lee',text,voicePackageId})},90000);
  if(output.schema!=='leeway.voice.synthesis-result.v1'||output.authority!=='LEEWAY_VOICE_FABRIC'||
   output.agentId!=='agent-lee'||output.voicePackageId!==voicePackageId||output.format!=='wav'||
   typeof output.audioContent!=='string'||!Number.isFinite(output.sampleRate)||output.playbackVerified!==false)
   throw Error('VOICE_SYNTHESIS_RESPONSE_INVALID');
  return output;
 }
 return Object.freeze({configured:!!base,origin:base,connect,login,beginPairing,claimPairing,turn,interrupt,synthesize,
  get authenticated(){return authenticated},disconnect(){authenticated=false;csrfToken=null}});
}
