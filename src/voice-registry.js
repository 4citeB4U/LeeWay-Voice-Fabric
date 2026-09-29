import {BUILTIN_VOICE_PACKAGES,normalizeVoicePackage} from './voice-package-core.js';
const DB='leeway-voice-fabric',VERSION=1,PACKAGES='packages',AUDIO='audio';
const open=()=>new Promise((resolve,reject)=>{const req=indexedDB.open(DB,VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(PACKAGES))db.createObjectStore(PACKAGES,{keyPath:'id'});if(!db.objectStoreNames.contains(AUDIO))db.createObjectStore(AUDIO)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
const txDone=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Voice registry transaction aborted.'))});
export class LeeWayVoiceRegistry{
  async list(){
    const db=await open(),tx=db.transaction(PACKAGES,'readonly'),req=tx.objectStore(PACKAGES).getAll();
    const local=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result||[]);req.onerror=()=>rej(req.error)});await txDone(tx);db.close();
    const byId=new Map(BUILTIN_VOICE_PACKAGES.map(p=>[p.id,{...p}]));for(const p of local)byId.set(p.id,p);return [...byId.values()].sort((a,b)=>a.name.localeCompare(b.name));
  }
  async get(id){return (await this.list()).find(p=>p.id===id)||null;}
  async save(meta,audioBlob){
    const pkg=normalizeVoicePackage(meta);if(!(audioBlob instanceof Blob)||audioBlob.size<1)throw new Error('Voice package requires a reference audio file.');
    if(audioBlob.size>15_000_000)throw new Error('Voice reference must be smaller than 15 MB.');
    const db=await open(),tx=db.transaction([PACKAGES,AUDIO],'readwrite');tx.objectStore(PACKAGES).put(pkg);tx.objectStore(AUDIO).put(audioBlob,pkg.id);await txDone(tx);db.close();return pkg;
  }
  async audio(id){
    const builtin=BUILTIN_VOICE_PACKAGES.find(p=>p.id===id);if(builtin?.referenceUrl){const r=await fetch(builtin.referenceUrl);if(!r.ok)throw new Error('Built-in voice reference unavailable.');return r.blob();}
    const db=await open(),tx=db.transaction(AUDIO,'readonly'),req=tx.objectStore(AUDIO).get(id);const blob=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result||null);req.onerror=()=>rej(req.error)});await txDone(tx);db.close();return blob;
  }
  async remove(id){if(BUILTIN_VOICE_PACKAGES.some(p=>p.id===id))throw new Error('Built-in voice packages cannot be deleted from the local registry.');const db=await open(),tx=db.transaction([PACKAGES,AUDIO],'readwrite');tx.objectStore(PACKAGES).delete(id);tx.objectStore(AUDIO).delete(id);await txDone(tx);db.close();}
  async exportPackage(id){
    const pkg=await this.get(id);if(!pkg)throw new Error('Voice package not found.');const blob=await this.audio(id);return {metadata:pkg,audio:blob};
  }
}
export const voiceRegistry=new LeeWayVoiceRegistry();
