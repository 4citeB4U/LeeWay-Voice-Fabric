// Pinned canonical Chatterbox CPU assets. Sizes are revision metadata, not hash proof.
export const MODEL='onnx-community/chatterbox-ONNX';
export const REVISION='3cab09af388d3f02bba43443fce88c1f4525ac43';
export const BASE=`https://huggingface.co/${MODEL}/resolve/${REVISION}/`;
export const CACHE='transformers-cache';
export const COMPONENTS=[
  {key:'embed_tokens',file:'embed_tokens',dtype:'fp32',graphBytes:13286,dataBytes:61640704},
  {key:'speech_encoder',file:'speech_encoder',dtype:'fp32',graphBytes:1184608,dataBytes:591274880},
  {key:'model',file:'language_model_q4',dtype:'q4',graphBytes:227911,dataBytes:353621248},
  {key:'conditional_decoder',file:'conditional_decoder',dtype:'fp32',graphBytes:6350448,dataBytes:533970816}
];
export const ASSETS=[
  ...COMPONENTS.flatMap(c=>[{file:`onnx/${c.file}.onnx`,bytes:c.graphBytes},{file:`onnx/${c.file}.onnx_data`,bytes:c.dataBytes}]),
  {file:'config.json',bytes:1097},{file:'generation_config.json',bytes:93},
  {file:'preprocessor_config.json',bytes:130},{file:'tokenizer.json',bytes:28543},{file:'tokenizer_config.json',bytes:244}
];

// Cache writes consume a stream. Android native mode excludes the two largest
// fixed voice-conditioning/rendering components from WebView cache entirely.
export async function stageVoiceAssets({signal,onProgress=()=>{},assets=ASSETS,
  cacheStorage=globalThis.caches,fetcher=globalThis.fetch,idleMs=60000,fileMs=15*60000,attempts=2,nativeDecoder=false}={}){
  if(!cacheStorage)throw Error('Voice model storage is unavailable.');
  const cache=await cacheStorage.open(CACHE);
  const abortError=()=>signal?.reason||new DOMException('Voice preparation cancelled.','AbortError');
  for(const asset of assets){
    if(nativeDecoder&&['onnx/conditional_decoder.','onnx/speech_encoder.'].some(prefix=>asset.file.startsWith(prefix)))continue;
    if(signal?.aborted)throw abortError();
    const url=BASE+asset.file;
    const cached=await cache.match(url);
    if(cached?.ok && Number(cached.headers.get('content-length'))===asset.bytes){
      onProgress({status:'cached',file:asset.file,loaded:asset.bytes,total:asset.bytes});continue;
    }
    if(cached)await cache.delete(url);
    for(let attempt=1;attempt<=attempts;attempt++){
      const controller=new AbortController();
      const cancel=()=>controller.abort(abortError());
      signal?.addEventListener('abort',cancel,{once:true});
      let idleTimer,reader;
      const resetIdle=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>controller.abort(Error('Voice download stopped progressing.')),idleMs);};
      const deadline=setTimeout(()=>controller.abort(Error('Voice download exceeded its time limit.')),fileMs);
      let loaded=0;
      try{
        resetIdle();
        onProgress({status:'download',file:asset.file,loaded,total:asset.bytes,attempt});
        const response=await fetcher(url,{signal:controller.signal});
        if(!response.ok || !response.body)throw Error(`Voice download HTTP ${response.status}: ${asset.file}`);
        reader=response.body.getReader();
        const body=new ReadableStream({
          async pull(target){
            try{
              if(controller.signal.aborted)throw controller.signal.reason;
              const {done,value}=await reader.read();
              if(done){
                if(loaded!==asset.bytes)throw Error(`Voice download size mismatch: ${asset.file}`);
                target.close();return;
              }
              loaded+=value.byteLength;
              if(loaded>asset.bytes)throw Error(`Voice download too large: ${asset.file}`);
              resetIdle();onProgress({status:'progress',file:asset.file,loaded,total:asset.bytes});target.enqueue(value);
            }catch(error){target.error(error);controller.abort(error);}
          },cancel(reason){controller.abort(reason);return reader.cancel(reason);}
        });
        const headers=new Headers(response.headers);headers.set('content-length',String(asset.bytes));
        await cache.put(url,new Response(body,{status:200,headers}));
        if(controller.signal.aborted)throw controller.signal.reason;
        onProgress({status:'cached',file:asset.file,loaded,total:asset.bytes});break;
      }catch(error){
        controller.abort(error);await reader?.cancel(error).catch(()=>{});await cache.delete(url);
        if(signal?.aborted)throw abortError();
        if(attempt===attempts)throw Error(`Voice download failed: ${asset.file}: ${error?.message||error}`);
        onProgress({status:'retry',file:asset.file,attempt:attempt+1,message:'Retrying voice model download'});
      }finally{
        clearTimeout(idleTimer);clearTimeout(deadline);signal?.removeEventListener('abort',cancel);
      }
    }
  }
}
