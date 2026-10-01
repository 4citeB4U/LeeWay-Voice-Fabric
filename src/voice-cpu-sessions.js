import {BASE,CACHE,COMPONENTS} from './voice-model-cache.js';

// Session creation alone being serialized is insufficient: loading all external
// bodies concurrently can exhaust a mobile renderer. Read/create one at a time.
export async function createCpuSessions({ort,config,onProgress=()=>{},cacheStorage=globalThis.caches,components=COMPONENTS}){
  const cache=await cacheStorage.open(CACHE),sessions={};
  const stage=(stage,component)=>onProgress({stage,component,message:`CPU voice: ${stage} / ${component}`});
  async function bytes(file,expected){
    stage('reading cached model',file);
    const response=await cache.match(BASE+'onnx/'+file);
    if(!response?.ok)throw Error('Voice model cache missing: '+file);
    const value=new Uint8Array(await response.arrayBuffer());
    if(value.byteLength!==expected)throw Error('Voice model cache size mismatch: '+file);
    return value;
  }
  try{
    for(const spec of components){
      const graph=await bytes(spec.file+'.onnx',spec.graphBytes);
      const data=await bytes(spec.file+'.onnx_data',spec.dataBytes);
      const options={executionProviders:['wasm'],logSeverityLevel:3,externalData:[{path:spec.file+'.onnx_data',data}]};
      const custom=config['transformers.js_config']??{};
      const selected={...custom,...(custom.device_config?.wasm??{})};
      if(selected.free_dimension_overrides)options.freeDimensionOverrides=selected.free_dimension_overrides;
      stage('initializing model',spec.key);
      const session=await ort.InferenceSession.create(graph,options);
      session.config={dtype:spec.dtype,device:'wasm'};
      sessions[spec.key]=session;
      stage('model initialized',spec.key);
    }
    return sessions;
  }catch(error){
    for(const session of Object.values(sessions))await session.release().catch(()=>{});
    throw error;
  }
}
