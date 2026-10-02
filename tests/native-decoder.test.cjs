const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const modulePromise=import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('src/native-decoder-client.js','utf8')).toString('base64'));
const nativeStub=(ids=[],cancelled=[])=>({prepare:id=>ids.push(id),encode:id=>ids.push(id),decode:id=>ids.push(id),cancel:id=>cancelled.push(id)});
test('native request IDs isolate generations and cancelled replies are discarded',async()=>{
 const {createNativeDecoderClient}=await modulePromise;const root={},ids=[],cancelled=[];
 const client=createNativeDecoderClient(nativeStub(ids,cancelled),root);
 const first=client.request('decode',{}),failed=assert.rejects(first,{name:'AbortError'});
 client.cancel(true);await failed;
 const second=client.request('decode',{});assert.notEqual(ids[0],ids[1]);
 root.LeeWayNativeDecoderResult({id:ids[0],result:{wrong:true}});
 root.LeeWayNativeDecoderResult({id:ids[1],result:{correct:true}});
 assert.equal((await second).correct,true);assert.deepEqual(cancelled,[ids[0]]);
});
test('waveform diagnostics reject digital silence and nonfinite samples',async()=>{
 const {waveformStats}=await modulePromise;
 assert.throws(()=>waveformStats(new Float32Array(24)),/silent/);
 assert.throws(()=>waveformStats(new Float32Array([NaN])),/invalid/);
 const metrics=waveformStats(new Float32Array([.25,-.25]));assert.equal(metrics.rms,.25);assert.equal(metrics.peak,.25);
});
test('fixed operation and message size limits fail before reaching native',async()=>{
 const {createNativeDecoderClient}=await modulePromise;
 const client=createNativeDecoderClient(nativeStub(),{});
 await assert.rejects(client.request('openFile',{}),/unsupported/);
 await assert.rejects(client.request('decode',{data:'x'.repeat(2_000_000)}),/too large/);
 await assert.rejects(client.request('encode',{data:'x'.repeat(4_100_000)}),/too large/);
});
test('tensor transport preserves decoder bytes and bounded encoder audio',async()=>{
 const {tensorToWire,audioTensorToWire,waveformFromWire}=await modulePromise;
 const samples=new Float32Array([.25,-.5]);const encoded=tensorToWire({type:'float32',dims:[1,2],data:samples});
 class Tensor{constructor(type,data,dims){this.type=type;this.data=data;this.dims=dims;}}
 assert.deepEqual([...waveformFromWire(encoded,{Tensor}).data],[.25,-.5]);
 assert.throws(()=>waveformFromWire({...encoded,dims:[1,3]},{Tensor}),/size/);
 assert.throws(()=>tensorToWire({type:'uint8',data:new Uint8Array(1)}),/type/);
 const audio=new Float32Array(24_000);const wire=audioTensorToWire({type:'float32',dims:[1,24_000],data:audio});
 assert.equal(wire.dims[1],24_000);
 assert.throws(()=>audioTensorToWire({type:'float32',dims:[1,720_001],data:new Float32Array(1)}),/shape/);
});
test('native encoder tensor map restores the four Chatterbox conditioning outputs',async()=>{
 const {tensorMapFromWire}=await modulePromise;
 class Tensor{constructor(type,data,dims){this.type=type;this.data=data;this.dims=dims;}}
 const b64=typed=>Buffer.from(typed.buffer,typed.byteOffset,typed.byteLength).toString('base64');
 const f=(data,dims)=>({dtype:'float32',dims,data:b64(new Float32Array(data))});
 const i=(data,dims)=>({dtype:'int64',dims,data:b64(new BigInt64Array(data.map(BigInt)))});
 const result=tensorMapFromWire({
  audio_features:f([.1,.2],[1,1,2]),audio_tokens:i([1,2],[1,2]),
  speaker_embeddings:f([.3,.4],[1,2]),speaker_features:f([.5,.6],[1,1,2])
 },{Tensor});
 assert.deepEqual(Object.keys(result).sort(),['audio_features','audio_tokens','speaker_embeddings','speaker_features']);
 assert.deepEqual([...result.audio_tokens.data],[1n,2n]);
 assert.throws(()=>tensorMapFromWire({audio_features:f([1],[1])},{Tensor}),/names/);
});
