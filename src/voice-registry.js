import {BUILTIN_VOICE_PACKAGES,normalizeVoicePackage} from './voice-package-core.js';
const DB='leeway-voice-fabric',VERSION=1,PACKAGES='packages',AUDIO='audio',MAX_AUDIO=15_000_000;
const builtin=id=>BUILTIN_VOICE_PACKAGES.find(p=>p.id===id);
const open=()=>new Promise((resolve,reject)=>{const req=indexedDB.open(DB,VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(PACKAGES))db.createObjectStore(PACKAGES,{keyPath:'id'});if(!db.objectStoreNames.contains(AUDIO))db.createObjectStore(AUDIO)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
const txDone=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Voice registry transaction aborted.'))});
const requested=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
export async function audioHash(blob){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function encodePortable(metadata,audio){
 const meta=normalizeVoicePackage(metadata);
 if(meta.provider==='resemble')return {schema:'leeway.voice-package/v2',metadata:{...meta,referenceUrl:null},audio:null,requires:'Resemble account access to this voice UUID'};
 if(!(audio instanceof Blob)||audio.size<1||audio.size>MAX_AUDIO)throw new Error('Portable voice requires reference audio up to 15 MB');
 const sha256=await audioHash(audio),bytes=new Uint8Array(await audio.arrayBuffer());let binary='';
 for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return {schema:'leeway.voice-package/v2',metadata:{...meta,referenceUrl:null,referenceSha256:sha256},audio:{encoding:'base64',mimeType:audio.type||'audio/wav',sha256,data:btoa(binary)}};
}
export async function decodePortable(data){
 if(data?.schema!=='leeway.voice-package/v2')throw new Error('Unsupported voice package schema');
 const metadata=normalizeVoicePackage(data.metadata);
 if(metadata.provider==='resemble'){if(data.audio)throw new Error('Hosted voices do not carry clone reference audio');return {metadata,audio:null};}
 const packed=data.audio;if(!packed||packed.encoding!=='base64'||typeof packed.data!=='string'||packed.data.length>20_000_004)throw new Error('Invalid or oversized portable audio');
 let bytes;try{bytes=Uint8Array.from(atob(packed.data),c=>c.charCodeAt(0));}catch{throw new Error('Invalid base64 audio');}
 if(!bytes.length||bytes.length>MAX_AUDIO)throw new Error('Reference must be between 1 byte and 15 MB');
 const audio=new Blob([bytes],{type:String(packed.mimeType||'audio/wav')});
 const hash=await audioHash(audio);if(hash!==packed.sha256||hash!==metadata.referenceSha256)throw new Error('Reference hash mismatch; package is damaged or changed');
 return {metadata,audio};
}
export class LeeWayVoiceRegistry{
 async list(){
  const db=await open(),tx=db.transaction(PACKAGES,'readonly'),done=txDone(tx);
  const local=await requested(tx.objectStore(PACKAGES).getAll());await done;db.close();
  const byId=new Map((local||[]).map(p=>[p.id,p]));for(const p of BUILTIN_VOICE_PACKAGES)byId.set(p.id,{...p});
  return [...byId.values()].sort((a,b)=>a.name.localeCompare(b.name));
 }
 async get(id){return (await this.list()).find(p=>p.id===id)||null;}
 async save(meta,audioBlob){
  const pkg=normalizeVoicePackage(meta);if(builtin(pkg.id))throw new Error('Choose a new ID; built-in voice identities cannot be overwritten');
  if(pkg.provider!=='resemble'){
   if(!(audioBlob instanceof Blob)||audioBlob.size<1||audioBlob.size>MAX_AUDIO)throw new Error('Voice package requires reference audio smaller than 15 MB');
   pkg.referenceSha256=await audioHash(audioBlob);pkg.referenceUrl=null;
  }
  pkg.source=pkg.provider==='resemble'?'RESEMBLE_HOSTED':'USER_LOCAL';
  const db=await open(),tx=db.transaction([PACKAGES,AUDIO],'readwrite'),done=txDone(tx);
  tx.objectStore(PACKAGES).put(pkg);if(audioBlob)tx.objectStore(AUDIO).put(audioBlob,pkg.id);else tx.objectStore(AUDIO).delete(pkg.id);
  await done;db.close();return pkg;
 }
 async audio(id){
  const pkg=builtin(id);
  if(pkg?.referenceUrl){
   const r=await fetch(pkg.referenceUrl);if(!r.ok)throw new Error('Built-in voice reference unavailable');
   const blob=await r.blob();if(blob.size>MAX_AUDIO)throw new Error('Reference is too large');
   if(pkg.referenceSha256&&await audioHash(blob)!==pkg.referenceSha256)throw new Error('Built-in voice reference hash changed');return blob;
  }
  const db=await open(),tx=db.transaction(AUDIO,'readonly'),done=txDone(tx),blob=await requested(tx.objectStore(AUDIO).get(id));await done;db.close();return blob||null;
 }
 async remove(id){if(builtin(id))throw new Error('Built-in voice packages cannot be deleted');const db=await open(),tx=db.transaction([PACKAGES,AUDIO],'readwrite'),done=txDone(tx);tx.objectStore(PACKAGES).delete(id);tx.objectStore(AUDIO).delete(id);await done;db.close();}
 async exportPackage(id){const metadata=await this.get(id);if(!metadata)throw new Error('Voice package not found');return {metadata,audio:await this.audio(id)};}
 async exportPortable(id){const {metadata,audio}=await this.exportPackage(id);return encodePortable(metadata,audio);}
 async importPortable(data){
  const {metadata,audio}=await decodePortable(data);
  if(builtin(metadata.id))metadata.id+='-imported';
  if(await this.get(metadata.id))throw new Error('A voice with this ID already exists; change the package ID before importing');
  return this.save({...metadata,referenceUrl:null},audio);
 }
}
export const voiceRegistry=new LeeWayVoiceRegistry();
