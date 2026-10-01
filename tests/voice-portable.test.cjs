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
 assert.equal(new Set(p.filter(x=>x.provider==='chatterbox').map(x=>x.referenceSha256)).size,2);
 assert.equal(p.filter(x=>x.source==='DELIVERY_PRESET').length,3);
 assert.throws(()=>normalizeVoicePackage({...meta,referenceUrl:'javascript:alert(1)'}),/HTTP/);
 assert.throws(()=>normalizeVoicePackage({...meta,tuning:{pitch:100}}),/pitch/);
 assert.throws(()=>normalizeVoicePackage({...meta,provider:'resemble'}),/UUID/);
});


test('Kokoro catalog contains 28 distinct English model voices split15female and13male',async()=>{
 const {BUILTIN_VOICE_PACKAGES}=await import(coreURL),voices=BUILTIN_VOICE_PACKAGES.filter(p=>p.provider==='kokoro');
 assert.equal(voices.length,28);assert.equal(new Set(voices.map(p=>p.voiceId)).size,28);
 assert.equal(voices.filter(p=>p.gender==='female').length,15);assert.equal(voices.filter(p=>p.gender==='male').length,13);
 for(const p of voices){assert.equal(p.packageType,'MODEL_VOICE');assert.equal(p.referenceUrl,null);assert.equal(p.referenceSha256,null);assert.equal(p.license,'Apache-2.0');}
});

test('portable Kokoro model metadata round trip retains identity and tuning without clone bytes',async()=>{
 const {encodePortable,decodePortable}=await registry,{KOKORO_VOICE_PACKAGES}=await import(coreURL);
 for(const model of KOKORO_VOICE_PACKAGES){const p=await encodePortable({...model,id:model.id+'-custom',tuning:{pace:1.15,pitch:-1},apiKey:'secret-not-portable'},new Blob(['must-not-export']));
 const decoded=await decodePortable(JSON.parse(JSON.stringify(p)));assert.equal(decoded.metadata.voiceId,model.voiceId);assert.equal(decoded.metadata.provider,'kokoro');assert.equal(decoded.metadata.gender,model.gender);assert.equal(decoded.metadata.packageType,'MODEL_VOICE');assert.equal(decoded.metadata.license,'Apache-2.0');assert.deepEqual(decoded.metadata.tuning,{pace:1.15,pitch:-1});assert.equal(decoded.audio,null);assert.equal(p.audio,null);assert.match(p.requires,/Kokoro.*model/);assert.ok(!JSON.stringify(p).includes('secret-not-portable'));assert.ok(!JSON.stringify(p).includes('must-not-export'));}
});

test('unrecognized model voice IDs and clone bytes in a model package are rejected',async()=>{
 const {encodePortable,decodePortable}=await registry,{normalizeVoicePackage,KOKORO_VOICE_PACKAGES}=await import(coreURL);
 for(const voiceId of ['',null,'af_unknown','../af_heart','af_heart?token=secret'])assert.throws(()=>normalizeVoicePackage({...meta,provider:'kokoro',voiceId}),/Kokoro voice ID/);
 const p=await encodePortable(KOKORO_VOICE_PACKAGES[0]);await assert.rejects(()=>decodePortable({...p,metadata:{...p.metadata,voiceId:'am_invented'}}),/Kokoro voice ID/);await assert.rejects(()=>decodePortable({...p,audio:{data:'forbidden'}}),/do not carry/);
});

test('bundled built-in reference files match pinned speaker hashes',async()=>{
 const {createHash}=require('node:crypto');const {BUILTIN_VOICE_PACKAGES}=await import(coreURL);
 for(const pkg of BUILTIN_VOICE_PACKAGES.filter(p=>p.provider==='chatterbox')){
  const file=pkg.id==='agent-lee-voice-one'?'agent-lee-reference.wav':'chatterbox-default-reference.wav';
  assert.equal(createHash('sha256').update(fs.readFileSync(__dirname+'/../voices/'+file)).digest('hex'),pkg.referenceSha256,pkg.id);
 }
});
