const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const coreURL='data:text/javascript;base64,'+fs.readFileSync(__dirname+'/../src/voice-package-core.js').toString('base64');
const registry=import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(__dirname+'/../src/voice-registry.js','utf8').replace("'./voice-package-core.js'",JSON.stringify(coreURL))).toString('base64'));
const meta={id:'test-voice',name:'Test speaker',owner:'Test',pace:1.15,tuning:{pitch:2,bass:-3},apiKey:'never-export-this'};
test('portable local voice round trip preserves recording and tuning, omits credentials',async()=>{
 const {encodePortable,decodePortable}=await registry;const source=new Blob([new Uint8Array([1,2,3,4])],{type:'audio/wav'});
 const encoded=await encodePortable(meta,source),decoded=await decodePortable(JSON.parse(JSON.stringify(encoded)));
 assert.deepEqual(new Uint8Array(await decoded.audio.arrayBuffer()),new Uint8Array([1,2,3,4]));
 assert.deepEqual(decoded.metadata.tuning,{pitch:2,bass:-3});assert.equal(decoded.metadata.pace,1.15);
 assert.equal(JSON.stringify(encoded).includes('never-export-this'),false);assert.equal(encoded.metadata.referenceUrl,null);
});
test('portable reference tampering, missing audio and unsupported schemas fail',async()=>{
 const {encodePortable,decodePortable}=await registry;const data=await encodePortable(meta,new Blob(['reference']));data.audio.data=btoa('different');
 await assert.rejects(()=>decodePortable(data),/hash mismatch/);await assert.rejects(()=>decodePortable({schema:'leeway.voice-package/v2',metadata:meta}),/audio/);
 await assert.rejects(()=>decodePortable({schema:'future'}),/schema/);
});
test('hosted packages contain UUID metadata, require account and never clone bytes',async()=>{
 const {encodePortable,decodePortable}=await registry;const p=await encodePortable({...meta,provider:'resemble',voiceUuid:'abc-123'},new Blob(['private']));
 assert.equal(p.audio,null);assert.match(p.requires,/account/);assert.equal((await decodePortable(p)).metadata.voiceUuid,'abc-123');
 await assert.rejects(()=>decodePortable({...p,audio:{data:'secret'}}),/do not carry/);
});
test('builtins distinguish two reference speakers from shared delivery presets',async()=>{
 const {BUILTIN_VOICE_PACKAGES:p,normalizeVoicePackage}=await import(coreURL);
 assert.equal(new Set(p.map(x=>x.referenceSha256)).size,2);
 assert.equal(p.filter(x=>x.source==='DELIVERY_PRESET').length,3);
 assert.throws(()=>normalizeVoicePackage({...meta,referenceUrl:'javascript:alert(1)'}),/HTTP/);
 assert.throws(()=>normalizeVoicePackage({...meta,tuning:{pitch:100}}),/pitch/);
 assert.throws(()=>normalizeVoicePackage({...meta,provider:'resemble'}),/UUID/);
});
