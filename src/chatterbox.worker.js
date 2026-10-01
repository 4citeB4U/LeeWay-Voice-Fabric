// Adapted to the public Resemble AI Transformers.js Chatterbox demo architecture.
// Model card/license: https://huggingface.co/onnx-community/chatterbox-ONNX
import {ChatterboxModel,AutoConfig,AutoProcessor,Tensor,InterruptableStoppingCriteria,env} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm';
import {createCpuSessions} from './voice-cpu-sessions.js';
import {BASE,CACHE,COMPONENTS} from './voice-model-cache.js';
import {tensorToWire,waveformFromWire,waveformStats} from './native-decoder-client.js';

const turbo=new URL(self.location.href).searchParams.get('model')==='turbo';
const MODEL=turbo?'ResembleAI/chatterbox-turbo-ONNX':'onnx-community/chatterbox-ONNX';
const REVISION=turbo?'d21799bd0354adb85e348b8a0442a8405110a2cf':'3cab09af388d3f02bba43443fce88c1f4525ac43';
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1; // GitHub Pages needs no cross-origin isolation.
env.backends.onnx.wasm.proxy=false;
env.backends.onnx.webgpu.powerPreference='high-performance';
let model,processor,speaker,device,epoch=0,chain=Promise.resolve();
let activeRequestId=null;
let activeRequestEpoch=0,nativeSequence=0;
const nativePending=new Map();
function nativeRequest(operation,payload){
  if(operation==='decode'&&activeRequestEpoch!==epoch)return Promise.reject(Object.assign(Error('Speech request interrupted.'),{fatal:true,name:'AbortError'}));
  const callId=++nativeSequence;
  return new Promise((resolve,reject)=>{
    nativePending.set(callId,{resolve,reject});
    reply(activeRequestId,'native-decoder',{callId,operation,payload});
  });
}
function cancelNativePending(){
  for(const pending of nativePending.values())pending.reject(Object.assign(Error('Speech was stopped.'),{name:'AbortError',fatal:true}));
  nativePending.clear();
}
const stopping=new InterruptableStoppingCriteria();
const reply=(id,type,data={})=>self.postMessage({id,type,data});
const progress=(id,data)=>reply(id,'progress',data);
self.addEventListener('unhandledrejection',event=>{
  if(activeRequestId!==null){
    event.preventDefault();
    reply(activeRequestId,'error',{message:'Voice worker failed: '+String(event.reason?.message||'Unhandled runtime failure'),fatal:true});
  }
});
function freeSpeaker(){if(speaker)for(const tensor of Object.values(speaker))tensor?.dispose?.();speaker=null;}
async function load(id,requested,useNativeDecoder=false){
  if(model&&processor)return {device,revision:REVISION};
  let adapter=null;
  if(requested!=='wasm'&&self.navigator.gpu)try{adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'})}catch{}
  device=requested==='wasm'||!adapter?'wasm':'webgpu';
  const dtype={embed_tokens:'fp32',speech_encoder:'fp32',conditional_decoder:'fp32',language_model:device==='webgpu'&&adapter?.features.has('shader-f16')?'q4f16':'q4'};
  if(requested==='wasm'&&!turbo){
    const ort=await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/webgpu/+esm');
    ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
    const prefix='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/';
    ort.env.wasm.wasmPaths={mjs:prefix+'ort-wasm-simd-threaded.mjs',wasm:prefix+'ort-wasm-simd-threaded.wasm'};
    const config=await AutoConfig.from_pretrained(MODEL,{revision:REVISION,progress_callback:data=>progress(id,data)});
    const cache=await caches.open(CACHE),generation=await cache.match(BASE+'generation_config.json');
    if(!generation?.ok)throw Error('Canonical voice generation config is not cached.');
    const generation_config=await generation.json();
    if(useNativeDecoder)await nativeRequest('prepare');
    const components=useNativeDecoder?COMPONENTS.filter(c=>c.key!=='conditional_decoder'):COMPONENTS;
    const sessions=await createCpuSessions({ort,config,components,onProgress:data=>progress(id,data)});
    if(useNativeDecoder)sessions.conditional_decoder={
      inputNames:['speech_tokens','speaker_embeddings','speaker_features'],outputNames:['waveform'],
      config:{dtype:'fp32',device:'native-cpu'},release:async()=>{},
      async run(feeds){
        progress(activeRequestId,{message:'Rendering canonical voice with native CPU decoder'});
        const result=await nativeRequest('decode',Object.fromEntries(this.inputNames.map(name=>[name,tensorToWire(feeds[name])])));
        return {waveform:waveformFromWire(result,ort)};
      }
    };
    try{
      model=new ChatterboxModel(config,sessions,{generation_config});
      if(!model.can_generate)throw Error('Canonical voice model cannot generate.');
      processor=await AutoProcessor.from_pretrained(MODEL,{revision:REVISION,progress_callback:data=>progress(id,data)});
      return {device,model:MODEL,revision:REVISION,dtype,decoderBackend:useNativeDecoder?'onnxruntime-android-cpu':'wasm',loader:'SEQUENTIAL_CACHED_CPU',exaggerationSupported:model.sessions.embed_tokens.inputNames.includes('exaggeration')};
    }catch(error){
      model=null;processor=null;
      for(const session of Object.values(sessions))await session.release().catch(()=>{});
      throw error;
    }
  }
  processor=await AutoProcessor.from_pretrained(MODEL,{revision:REVISION,progress_callback:data=>progress(id,data)});
  const configResponse=await fetch(`https://huggingface.co/${MODEL}/resolve/${REVISION}/config.json`);
  if(!configResponse.ok)throw new Error('Chatterbox config could not be loaded.');
  const config=await configResponse.json();
  config.architectures=['ChatterboxModel'];
  model=await ChatterboxModel.from_pretrained(MODEL,{revision:REVISION,config,device,dtype,progress_callback:data=>progress(id,data)});
  return {device,model:MODEL,revision:REVISION,dtype,exaggerationSupported:model.sessions.embed_tokens.inputNames.includes('exaggeration')};
}
async function run(message){
  const {id,type,data={},epoch:turn=epoch}=message;
  if(type==='load')return load(id,data.device,data.nativeDecoder===true);
  if(type==='dispose'){freeSpeaker();await model?.dispose();model=null;processor=null;return {};}
  if(turn!==epoch)throw new Error('Speech request was interrupted.');
  if(!model||!processor)throw new Error('Load browser voice before requesting speech.');
  if(type==='speaker'){
    const audio=new Float32Array(data.audio);
    if(!audio.length||audio.length>24_000*30)throw new Error('Voice reference must be at most 30 seconds.');
    const input=new Tensor('float32',audio,[1,audio.length]);
    let result;
    try{result=await model.encode_speech(input);}finally{input.dispose?.();}
    if(turn!==epoch){for(const tensor of Object.values(result))tensor?.dispose?.();throw new Error('Voice reference was interrupted.');}
    freeSpeaker();speaker=result;return {};
  }
  if(type==='generate'){
    if(!speaker)throw new Error('Load a voice reference before speaking.');
    if(typeof data.text!=='string'||data.text.length>350)throw new Error('Speech chunk is too long.');
    stopping.reset();const inputs=await processor._call(data.text);
    let waveform;
    try{
      if(turn!==epoch)throw new Error('Speech request was interrupted.');
      const started=performance.now();let decodedAt=null,steps=0;
      const streamer={put(){if(++steps%16===0)progress(id,{message:`Generating speech: ${steps} audio tokens...`})},end(){decodedAt=performance.now();progress(id,{message:'Rendering the speech waveform...'})}};
      const exaggeration=Number.isFinite(data.exaggeration)?Math.max(0,Math.min(1,data.exaggeration)):.25;
      // Greedy decoding dropped whole phrases in the Voice One content check.
      waveform=await model.generate({...inputs,...speaker,exaggeration,do_sample:true,temperature:.8,top_p:.95,top_k:50,max_new_tokens:384,stopping_criteria:[stopping],streamer});
      if(turn!==epoch)throw new Error('Speech request was interrupted.');
      const samples=waveform.data,buffer=samples.buffer.slice(samples.byteOffset,samples.byteOffset+samples.byteLength);
      const metrics=waveformStats(samples);
      progress(id,{stage:'waveform-ready',message:'Voice waveform rendered',...metrics});
      self.postMessage({id,type:'complete',data:{audio:buffer,sampleRate:24000,metrics,timings:{generationMs:performance.now()-started,tokenPhaseMs:decodedAt===null?null:decodedAt-started,waveformPhaseMs:decodedAt===null?null:performance.now()-decodedAt,audioSeconds:samples.length/24000}}},[buffer]);return null;
    }finally{waveform?.dispose?.();for(const value of Object.values(inputs))value?.dispose?.();}
  }
  throw new Error('Unknown voice-worker command.');
}
self.onmessage=event=>{
  const message=event.data;
  if(message.type==='native-decoder-result'){
    const request=nativePending.get(message.callId);if(!request)return;
    nativePending.delete(message.callId);
    if(message.error)request.reject(Object.assign(Error(message.error),{fatal:true,name:message.errorName||'Error'}));else request.resolve(message.result);
    return;
  }
  if(message.type==='stop'){epoch=message.epoch;stopping.interrupt();cancelNativePending();return;}
  if(message.type==='dispose')cancelNativePending();
  // Every operation uses one serial work lane. Old queued requests are discarded.
  chain=chain.then(async()=>{
    activeRequestId=message.id;
    activeRequestEpoch=message.epoch??epoch;
    try{const result=await run(message);if(result!==null)reply(message.id,'complete',result)}
    catch(error){reply(message.id,'error',{message:error.message||'Browser voice failed.',name:error.name,fatal:!!error.fatal})}
    finally{activeRequestId=null;}
  });
};
