/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.SDK.CANONICAL.SELECTION
TAG: ONE_VOICE_MULTIPLE_APPLICATIONS
WHO: LeeWay Industries; WHAT: fetch and observe existing owner voice binding
WHY: no per-application speaker settings
WHERE: src/voice-fabric-client.mjs; WHEN: 2026-10-24
HOW: public read-only contract and guarded same-origin API; owner publications
remain in existing owner-approved Studio session.
AUTHORITY: readonly consumer, never a device actuation API.
LICENSE: existing LeeWay Voice Fabric terms.
*/
export const SDK_SCHEMA='leeway.voice-consumer.v1';
export const VOICE_PATTERN=/^kokoro-(?:af|am|bf|bm)_[a-z0-9]+$/;
export function requireVoiceBinding(source){
 const b=source?.binding||source;
 if(!b||typeof b.voicePackageId!=='string'||!VOICE_PATTERN.test(b.voicePackageId))
  throw Error('CANONICAL_KOKORO_VOICE_NOT_AVAILABLE');
 return Object.freeze({voicePackageId:b.voicePackageId,
   revision:source?.recordRevision||source?.revision||null,
   authority:source?.authority||'LEEWAY_VOICE_FABRIC'});
}
export function createLeeWayVoiceClient({
 endpoint='/__leeway/voice-binding',
 fetchImpl=globalThis.fetch?.bind(globalThis),
 pollIntervalMs=5000,
}={}){
 if(!fetchImpl)throw Error('FETCH_IMPLEMENTATION_REQUIRED');
 const interval=Math.max(1000,Math.min(60000,Number(pollIntervalMs)||5000));
 async function current({signal}={}){
  const response=await fetchImpl(endpoint,{method:'GET',credentials:'same-origin',
    headers:{accept:'application/json'},cache:'no-store',signal});
  if(!response.ok)throw Error('VOICE_AUTHORITY_UNAVAILABLE_HTTP_'+response.status);
  return requireVoiceBinding(await response.json());
 }
 function subscribe(callback,{onError=()=>{},signal}={}){
  if(typeof callback!=='function')throw TypeError('CALLBACK_REQUIRED');
  let disposed=false,revision,voice;
  const run=async()=>{
   try{
    const next=await current({signal});
    if(disposed)return;
    if(next.revision!==revision||next.voicePackageId!==voice){
     revision=next.revision;voice=next.voicePackageId;callback(next);
    }
   }catch(error){if(!disposed)onError(error)}
  };
  void run();
  const timer=setInterval(()=>{if(!disposed)void run()},interval);
  const dispose=()=>{disposed=true;clearInterval(timer)};
  signal?.addEventListener?.('abort',dispose,{once:true});
  return dispose;
 }
 function conversationUrl({base='http://127.0.0.1:5173/LeeWay-Edge-RTC/conversation-gate.html',voice}={}){
  const url=new URL(base,globalThis.location?.href||'http://127.0.0.1/');
  if(voice)url.searchParams.set('voice',requireVoiceBinding({voicePackageId:voice}).voicePackageId);
  return url.href;
 }
 return Object.freeze({schema:SDK_SCHEMA,current,subscribe,conversationUrl,
  permission:'READ_ONLY',publication:'OWNER_STUDIO_AUTHORIZED_ONLY'});
}

/** Authenticated Device Bridge voice revision reader for approved remote devices.
 * Browser credentials are scoped to a previously owner-approved session.
 * Does not expose any owner publication or mutate voice settings.
 */
export function createLeeWayAuthenticatedVoiceBindingClient({
 origin,fetchImpl=globalThis.fetch?.bind(globalThis),pollIntervalMs=5000
}={}){
 let target;
 try{target=new URL(origin)}catch{throw Error('LEEWAY_VOICE_HTTPS_ORIGIN_REQUIRED')}
 if(target.protocol!=='https:'||target.pathname!=='/'||target.search||target.hash||
   target.username||target.password||target.hostname==='localhost'||
   target.hostname.endsWith('.github.io'))
   throw Error('LEEWAY_VOICE_HTTPS_ORIGIN_REQUIRED');
 if(typeof fetchImpl!=='function')throw Error('FETCH_IMPLEMENTATION_REQUIRED');
 const endpoint=target.origin+'/v1/voice/canonical-binding';
 const interval=Math.max(1000,Math.min(60000,Number(pollIntervalMs)||5000));
 async function current({signal}={}){
  const response=await fetchImpl(endpoint,{method:'GET',credentials:'include',mode:'cors',
    headers:{accept:'application/json'},cache:'no-store',redirect:'error',signal});
  if(!response.ok)throw Error('LEEWAY_CANONICAL_VOICE_HTTP_'+response.status);
  const data=await response.json();
  if(data.schema!=='leeway.voice-consumer.v1'||data.authority!=='LEEWAY_VOICE_FABRIC'||
    !/^[a-f0-9]{64}$/.test(data.recordRevision||''))throw Error('LEEWAY_CANONICAL_RESPONSE_INVALID');
  const binding=requireVoiceBinding(data);
  return Object.freeze({...binding,revision:data.recordRevision});
 }
 function subscribe(callback,{onError=()=>{},signal}={}){
  if(typeof callback!=='function')throw Error('CALLBACK_REQUIRED');
  let disposed=false,last=null;
  async function refresh(){
   try{
    const next=await current({signal});
    if(!disposed&&next.revision!==last){last=next.revision;callback(next);}
   }catch(error){if(!disposed)onError(error)}
  }
  void refresh();
  const timer=setInterval(()=>{if(!disposed)void refresh()},interval);
  const dispose=()=>{disposed=true;clearInterval(timer)};
  signal?.addEventListener?.('abort',dispose,{once:true});
  return dispose;
 }
 return Object.freeze({current,subscribe,endpoint});
}
