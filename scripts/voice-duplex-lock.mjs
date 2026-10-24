/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.ARCHITECTURE.ATTESTATION
TAG: REPRODUCIBLE_DUPLEX_LOCK
WHO: LeeWay Industries; WHAT: immutable SHA-256 source verification
WHY: reproducible deployments, no accidental source drift
WHERE: scripts/voice-duplex-lock.mjs; WHEN: 2026-10-24
HOW: read-only manifest verification. AUTHORITY: source only.
LICENSE: existing terms.
*/
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if((process.argv[2]||'verify')!=='verify')throw Error('ONLY_VERIFY_SUPPORTED');
const manifest=JSON.parse(await readFile(path.join(root,'docs/voice-duplex-lock-v1.json'),'utf8'));
const rows=[];
for(const [name,expected] of Object.entries(manifest.files)){
 const target=name.startsWith('voice-fabric/') ? path.join(root,name.slice(13)) :
   path.join(root,'work/edge-rtc-publish',name);
 try {
  const actual=createHash('sha256').update((await readFile(target,'utf8')).replace(/\r\n/g,'\n')).digest('hex');
  rows.push({name,ok:actual===expected,actual,expected});
 }catch(error){rows.push({name,ok:false,error:error.code||error.message})}
}
const ok=rows.every(v=>v.ok);
console.log(JSON.stringify({schema:manifest.schema,ok,checks:rows.length,
 drift:rows.filter(v=>!v.ok),acoustics:'NOT_VERIFIED'},null,2));
if(!ok)process.exitCode=2;
