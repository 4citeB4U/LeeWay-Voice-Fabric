const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const data=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const cacheUrl=data(fs.readFileSync('src/voice-model-cache.js','utf8'));
const cacheModule=import(cacheUrl);
const sessionsModule=import(data(fs.readFileSync('src/voice-cpu-sessions.js','utf8').replace("'./voice-model-cache.js'",JSON.stringify(cacheUrl))));
function storage(){
 const entries=new Map(),events=[];
 const cache={match:async key=>entries.get(key)?.clone(),delete:async key=>entries.delete(key),put:async(key,response)=>{
  const bytes=await response.arrayBuffer();events.push('put');entries.set(key,new Response(bytes,{headers:response.headers}));
 }};
 return {entries,events,open:async()=>cache};
}
test('stream cache staging finishes before use and reuses exact sized entries',async()=>{
 const {stageVoiceAssets,BASE}=await cacheModule,c=storage();let fetches=0;
 const options={cacheStorage:c,assets:[{file:'test',bytes:3}],fetcher:async()=>{fetches++;return new Response(new Uint8Array([1,2,3]));}};
 await stageVoiceAssets(options);assert.equal(c.entries.has(BASE+'test'),true);
 await stageVoiceAssets(options);assert.equal(fetches,1);
});
test('truncated stream is discarded, retries are bounded',async()=>{
 const {stageVoiceAssets}=await cacheModule,c=storage();let count=0;
 await assert.rejects(stageVoiceAssets({cacheStorage:c,assets:[{file:'test',bytes:3}],fetcher:async()=>{count++;return new Response(new Uint8Array([1]));}}),/size mismatch/);
 assert.equal(count,2);assert.equal(c.entries.size,0);
});
test('network rejection retries then succeeds',async()=>{
 const {stageVoiceAssets}=await cacheModule,c=storage();let count=0;
 await stageVoiceAssets({cacheStorage:c,assets:[{file:'test',bytes:1}],fetcher:async()=>{if(++count===1)throw Error('network failure');return new Response(new Uint8Array([1]));}});
 assert.equal(count,2);assert.equal(c.entries.size,1);
});
test('owner cancellation does not retry',async()=>{
 const {stageVoiceAssets}=await cacheModule,c=storage(),controller=new AbortController();let count=0;
 await assert.rejects(stageVoiceAssets({signal:controller.signal,cacheStorage:c,assets:[{file:'test',bytes:1}],fetcher:async()=>{count++;controller.abort();throw controller.signal.reason;}}),{name:'AbortError'});
 assert.equal(count,1);assert.equal(c.entries.size,0);
});
test('idle fetch aborts instead of leaving prepare pending',async()=>{
 const {stageVoiceAssets}=await cacheModule;
 await assert.rejects(stageVoiceAssets({cacheStorage:storage(),assets:[{file:'test',bytes:1}],attempts:1,idleMs:10,fileMs:1000,
 fetcher:(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))}),/stopped progressing/);
});
test('CPU reads only one component before creating it, releases earlier sessions on failure',async()=>{
 const {createCpuSessions}=await sessionsModule,events=[];
 const cacheStorage={open:async()=>({match:async url=>{events.push('read:'+url.split('/').pop());return new Response(new Uint8Array([1]));}})};
 let creates=0;
 const ort={InferenceSession:{create:async()=>{events.push('create');if(++creates===2)throw Error('native failure');return {release:async()=>events.push('release')};}}};
 const components=['one','two'].map(file=>({key:file,file,dtype:'fp32',graphBytes:1,dataBytes:1}));
 await assert.rejects(createCpuSessions({ort,config:{},cacheStorage,components}),/native failure/);
 assert.deepEqual(events,['read:one.onnx','read:one.onnx_data','create','read:two.onnx','read:two.onnx_data','create','release']);
});
test('Android native mode excludes speech encoder and conditional decoder from WebView cache',async()=>{
 const {stageVoiceAssets,BASE}=await cacheModule,c=storage();const fetched=[];
 const assets=[
  {file:'onnx/speech_encoder.onnx',bytes:1},{file:'onnx/speech_encoder.onnx_data',bytes:1},
  {file:'onnx/conditional_decoder.onnx',bytes:1},{file:'onnx/conditional_decoder.onnx_data',bytes:1},
  {file:'onnx/language_model_q4.onnx',bytes:1}
 ];
 await stageVoiceAssets({cacheStorage:c,assets,nativeDecoder:true,fetcher:async url=>{fetched.push(url);return new Response(new Uint8Array([1]));}});
 assert.deepEqual(fetched,[BASE+'onnx/language_model_q4.onnx']);
});
