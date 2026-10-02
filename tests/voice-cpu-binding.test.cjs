const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/chatterbox.worker.js','utf8').replace(/^import .*;$/gm,'')
 .replace("await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/webgpu/+esm')",'await testOrt()');
for(const [requested,turbo,native=false] of [['wasm',false],['webgpu',false],['wasm',true],['wasm',false,true]]){
 test(`CPU artifact override is isolated: ${requested}, turbo=${turbo}, native=${native}`,async()=>{
  let sequential=0,original=0,selected,components;
  const env={backends:{onnx:{wasm:{},webgpu:{}}}},ort={env:{wasm:{}}};
  const sessions={embed_tokens:{inputNames:['exaggeration']}};
  class ChatterboxModel{constructor(){this.can_generate=true;this.sessions=sessions;}static async from_pretrained(_model,options){original++;selected=options;return {sessions};}}
  const context=vm.createContext({env,URL,ChatterboxModel,BASE:'https://example.test/',CACHE:'test',
   AutoConfig:{from_pretrained:async()=>({})},AutoProcessor:{from_pretrained:async()=>({})},
   InterruptableStoppingCriteria:class{},testOrt:async()=>ort,
   COMPONENTS:[{key:'embed_tokens'},{key:'speech_encoder'},{key:'conditional_decoder'}],
   createCpuSessions:async options=>{components=options.components;sequential++;return sessions;},
   fetch:async()=>({ok:true,json:async()=>({})}),caches:{open:async()=>({match:async()=>({ok:true,json:async()=>({})})})},
   self:{location:{href:'https://example.test/worker.js'+(turbo?'?model=turbo':'')},navigator:{gpu:{requestAdapter:async()=>({features:new Set(['shader-f16'])})}},postMessage(){},addEventListener(){}}});
  context.navigator=context.self.navigator;
  vm.runInContext(source,context);
  if(native)vm.runInContext('nativeRequest=async()=>({ready:true})',context);
  await vm.runInContext(`load(1,${JSON.stringify(requested)},${native})`,context);
  if(requested==='wasm'&&!turbo){
   assert.equal(sequential,1);assert.equal(original,0);
   assert.match(ort.env.wasm.wasmPaths.mjs,/\/ort-wasm-simd-threaded\.mjs$/);
   assert.match(ort.env.wasm.wasmPaths.wasm,/\/ort-wasm-simd-threaded\.wasm$/);
   assert.equal(components.some(c=>c.key==='conditional_decoder'),!native);
   assert.equal(components.some(c=>c.key==='speech_encoder'),!native);
  }else{
   assert.equal(sequential,0);assert.equal(original,1);assert.equal(ort.env.wasm.wasmPaths,undefined);
   assert.equal(selected.dtype.language_model,requested==='webgpu'?'q4f16':'q4');
  }
 });
}
