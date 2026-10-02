let nextId=0;
/** Main-page transport to the app's fixed canonical decoder, never arbitrary JNI. */
export function createNativeDecoderClient(native,root=globalThis){
  if(!native||typeof native.prepare!=='function'||typeof native.encode!=='function'||typeof native.decode!=='function'||typeof native.cancel!=='function')return null;
  const pending=new Map();
  const receive=message=>{
    const request=pending.get(message?.id);if(!request)return;
    if(message.progress){request.progress?.(message.progress);return;}
    pending.delete(message.id);clearTimeout(request.timer);
    if(message.error)request.reject(Error(String(message.error)));else request.resolve(message.result);
  };
  root.LeeWayNativeDecoderResult=receive;
  return {
    request(operation,payload,progress){
      if(!['prepare','encode','decode'].includes(operation))return Promise.reject(Error('Native voice operation unsupported.'));
      const json=operation==='prepare'?null:JSON.stringify(payload);
      const limit=operation==='encode'?4_100_000:2_000_000;
      if(json?.length>limit)return Promise.reject(Error('Native voice request too large.'));
      const id='voice-'+crypto.randomUUID()+'-'+(++nextId);
      return new Promise((resolve,reject)=>{
        const timeout=operation==='prepare'?1_210_000:operation==='encode'?310_000:190_000;
        const timer=setTimeout(()=>{pending.delete(id);native.cancel(id);reject(Error('Native voice timed out.'));},timeout);
        pending.set(id,{resolve,reject,timer,progress,operation});
        try{
          if(operation==='prepare')native.prepare(id);
          else if(operation==='encode')native.encode(id,json);
          else native.decode(id,json);
        }catch(error){pending.delete(id);clearTimeout(timer);reject(error);}
      });
    },
    cancel(decodesOnly=false){
      for(const [id,request] of pending){
        if(decodesOnly&&request.operation!=='decode')continue;
        pending.delete(id);clearTimeout(request.timer);native.cancel(id);request.reject(new DOMException('Native voice stopped.','AbortError'));
      }
    }
  };
}

export function tensorToWire(tensor){
  if(!['int64','float32'].includes(tensor.type))throw Error('Native tensor type unsupported.');
  const data=tensor.data;
  if(!ArrayBuffer.isView(data)||data.byteLength>960000)throw Error('Native tensor size unsupported.');
  const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);let binary='';
  for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {dtype:tensor.type,dims:tensor.dims,data:btoa(binary)};
}
export function audioTensorToWire(tensor){
  if(tensor?.type!=='float32'||!Array.isArray(tensor.dims)||tensor.dims.length!==2||tensor.dims[0]!==1||!Number.isInteger(tensor.dims[1])||tensor.dims[1]<24_000||tensor.dims[1]>720_000)
    throw Error('Native encoder audio shape invalid.');
  const data=tensor.data;
  if(!(data instanceof Float32Array)||data.byteLength!==tensor.dims[1]*4||data.byteLength>2_880_000)throw Error('Native encoder audio size invalid.');
  if(!data.every(Number.isFinite))throw Error('Native encoder audio contains invalid samples.');
  const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);let binary='';
  for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {dtype:'float32',dims:tensor.dims,data:btoa(binary)};
}
export function tensorMapFromWire(result,ort){
  const expected=['audio_features','audio_tokens','speaker_embeddings','speaker_features'];
  if(!result||typeof result!=='object'||Object.keys(result).sort().join('|')!==[...expected].sort().join('|'))throw Error('Native encoder output names invalid.');
  const out={};let total=0;
  for(const name of expected){
    const value=result[name],dtype=name==='audio_tokens'?'int64':'float32';
    if(value?.dtype!==dtype||!Array.isArray(value.dims)||!value.dims.length||value.dims.some(x=>!Number.isInteger(x)||x<1))throw Error('Native encoder output metadata invalid.');
    const count=value.dims.reduce((a,b)=>a*b,1),bytesPer=dtype==='int64'?8:4;
    if(!Number.isSafeInteger(count)||count<1||count>2_000_000||typeof value.data!=='string')throw Error('Native encoder output shape invalid.');
    const binary=atob(value.data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    if(bytes.length!==count*bytesPer)throw Error('Native encoder output size invalid.');
    total+=bytes.length;if(total>8_000_000)throw Error('Native encoder outputs too large.');
    const data=dtype==='int64'?new BigInt64Array(bytes.buffer):new Float32Array(bytes.buffer);
    if(dtype==='float32'&& !data.every(Number.isFinite))throw Error('Native encoder output contains invalid samples.');
    out[name]=new ort.Tensor(dtype,data,value.dims);
  }
  return out;
}
export function waveformFromWire(result,ort){
  if(result?.dtype!=='float32'||!Array.isArray(result.dims)||result.dims.length!==2||result.dims[0]!==1||!Number.isInteger(result.dims[1])||result.dims[1]<1||result.dims[1]>720000)
    throw Error('Native waveform shape invalid.');
  if(typeof result.data!=='string'||result.data.length>3840000)throw Error('Native waveform payload invalid.');
  const binary=atob(result.data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  if(bytes.length!==result.dims[1]*4)throw Error('Native waveform size invalid.');
  const samples=new Float32Array(bytes.buffer);
  if(!samples.every(Number.isFinite))throw Error('Native waveform contains invalid samples.');
  return new ort.Tensor('float32',samples,result.dims);
}
export function waveformStats(samples){
  if(!samples?.length)throw Error('Voice waveform is empty.');
  let energy=0,peak=0;
  for(const value of samples){if(!Number.isFinite(value))throw Error('Voice waveform contains invalid samples.');energy+=value*value;peak=Math.max(peak,Math.abs(value));}
  const rms=Math.sqrt(energy/samples.length);
  if(peak<=1e-6||rms<=1e-7)throw Error('Voice waveform is digitally silent.');
  return {rms,peak,samples:samples.length};
}
