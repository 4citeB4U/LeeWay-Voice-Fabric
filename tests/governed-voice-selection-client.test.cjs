const test=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const load=()=>import(pathToFileURL(path.resolve(__dirname,'../src/governed-voice-selection-client.js')).href);
const rev=a=>a.repeat(64);
const initial=()=>({authority:'LEEWAY_VOICE_FABRIC',agentId:'agent-lee',personaFamily:'AGENT_LEE_CONSTITUTIONAL',voicePackageId:'kokoro-bm_lewis',selectionRevision:rev('a')});
test('governed selection requires existing owner transport',async()=>{
 const {GovernedVoiceSelectionClient:C}=await load();
 assert.throws(()=>new C(),/TRANSPORT_REQUIRED/);
});
test('rejected or unbound owner cannot change selection',async()=>{
 const {GovernedVoiceSelectionClient:C}=await load();
 let b=initial();
 const c=new C({readBinding:async()=>b,requestSelection:async()=>{throw Error('SHARED_VOICE_SELECTION_OWNER_TRANSPORT_NOT_BOUND')}});
 await assert.rejects(()=>c.select({voicePackageId:'kokoro-af_heart',approvalId:'approval-1'}),/NOT_BOUND/);
 assert.equal(b.voicePackageId,'kokoro-bm_lewis');
});
test('reject missing approval without owner call',async()=>{
 const {GovernedVoiceSelectionClient:C}=await load();
 let calls=0;
 const c=new C({readBinding:async()=>initial(),requestSelection:async()=>{calls++;}});
 await assert.rejects(()=>c.select({voicePackageId:'other'}),/APPROVAL_REQUIRED/);
 assert.equal(calls,0);
});
test('owner response without revision commit cannot pass',async()=>{
 const {GovernedVoiceSelectionClient:C}=await load();
 const c=new C({readBinding:async()=>initial(),requestSelection:async()=>({status:'COMMITTED',authority:'LEEWAY_VOICE_FABRIC'})});
 await assert.rejects(()=>c.select({voicePackageId:'kokoro-af_heart',approvalId:'approved'}),/READBACK_MISMATCH/);
});
test('canonical owner commit and independent revision readback pass',async()=>{
 const {GovernedVoiceSelectionClient:C}=await load();
 let b=initial();
 const c=new C({readBinding:async()=>({...b}),requestSelection:async({voicePackageId,expectedSelectionRevision,approvalId})=>{
  assert.equal(expectedSelectionRevision,rev('a'));assert.equal(approvalId,'approved');
  b={...b,voicePackageId,selectionRevision:rev('b')};
  return {status:'COMMITTED',authority:'LEEWAY_VOICE_FABRIC',selectionRevision:rev('b')};
 }});
 const r=await c.select({voicePackageId:'kokoro-af_heart',approvalId:'approved'});
 assert.equal(r.status,'COMMITTED');assert.equal(r.after.voicePackageId,'kokoro-af_heart');
});
test('persona change and mismatched committed revision fail closed',async()=>{
 const {GovernedVoiceSelectionClient:C}=await load();
 let b=initial();
 const c=new C({readBinding:async()=>b,requestSelection:async()=>{
  b={...b,personaFamily:'OTHER',voicePackageId:'voice2',selectionRevision:rev('b')};
  return {status:'COMMITTED',authority:'LEEWAY_VOICE_FABRIC',selectionRevision:rev('c')};
 }});
 await assert.rejects(()=>c.select({voicePackageId:'voice2',approvalId:'approved'}),/READBACK_MISMATCH/);
});

test('concurrent selection requests are serialized by fail-closed guard',async()=>{
 const {GovernedVoiceSelectionClient:C}=await load();
 let b=initial(),release;const pause=new Promise(r=>release=r);let calls=0;
 const c=new C({readBinding:async()=>b,requestSelection:async({voicePackageId})=>{calls++;await pause;b={...b,voicePackageId,selectionRevision:rev('b')};return {status:'COMMITTED',authority:'LEEWAY_VOICE_FABRIC',selectionRevision:rev('b')};}});
 const first=c.select({voicePackageId:'voice-two',approvalId:'yes'});
 await assert.rejects(()=>c.select({voicePackageId:'voice-three',approvalId:'yes'}),/ALREADY_IN_PROGRESS/);
 release();await first;assert.equal(calls,1);
});
test('denied selection unlocks client for authorized retry',async()=>{
 const {GovernedVoiceSelectionClient:C}=await load();
 let b=initial(),calls=0;
 const c=new C({readBinding:async()=>b,requestSelection:async({voicePackageId})=>{if(++calls===1)throw Error('OWNER_DENIED');b={...b,voicePackageId,selectionRevision:rev('b')};return {status:'COMMITTED',authority:'LEEWAY_VOICE_FABRIC',selectionRevision:rev('b')};}});
 await assert.rejects(()=>c.select({voicePackageId:'voice-two',approvalId:'yes'}),/OWNER_DENIED/);
 assert.equal((await c.select({voicePackageId:'voice-two',approvalId:'yes'})).status,'COMMITTED');
});

test('owner must return its committed selection revision',async()=>{
 const {GovernedVoiceSelectionClient:C}=await load();
 let b=initial();
 const c=new C({readBinding:async()=>b,requestSelection:async({voicePackageId})=>{
   b={...b,voicePackageId,selectionRevision:rev('b')};
   return {status:'COMMITTED',authority:'LEEWAY_VOICE_FABRIC'};
 }});
 await assert.rejects(()=>c.select({voicePackageId:'voice-two',approvalId:'approved'}),/NOT_COMMITTED_BY_OWNER/);
});
