const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const modulePromise=import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('src/native-decoder-client.js','utf8')).toString('base64'));
test('native request IDs isolate generations and cancelled replies are discarded',async()=>{
 const {createNativeDecoderClient}=await modulePromise;const root={},ids=[],cancelled=[];
 const client=createNativeDecoderClient({prepare:id=>ids.push(id),decode:id=>ids.push(id),cancel:id=>cancelled.push(id)},root);
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
 const client=createNativeDecoderClient({prepare(){throw Error('unexpected')},decode(){throw Error('unexpected')},cancel(){}},{});
 await assert.rejects(client.request('openFile',{}),/unsupported/);
 await assert.rejects(client.request('decode',{data:'x'.repeat(2_000_000)}),/too large/);
});
test('tensor transport preserves byte content and rejects malformed waveform output',async()=>{
 const {tensorToWire,waveformFromWire}=await modulePromise;
 const samples=new Float32Array([.25,-.5]);const encoded=tensorToWire({type:'float32',dims:[1,2],data:samples});
 class Tensor{constructor(type,data,dims){this.type=type;this.data=data;this.dims=dims;}}
 assert.deepEqual([...waveformFromWire(encoded,{Tensor}).data],[.25,-.5]);
 assert.throws(()=>waveformFromWire({...encoded,dims:[1,3]},{Tensor}),/size/);
 assert.throws(()=>waveformFromWire({...encoded,dims:[1,720001]},{Tensor}),/shape/);
 assert.throws(()=>tensorToWire({type:'uint8',data:new Uint8Array(1)}),/type/);
});
