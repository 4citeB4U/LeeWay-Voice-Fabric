let nextId=0;
/** Main-page transport to the app's fixed canonical decoder, never arbitrary JNI. */
export function createNativeDecoderClient(native,root=globalThis){
  if(!native||typeof native.prepare!=='function'||typeof native.decode!=='function'||typeof native.cancel!=='function')return null;
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
      if(operation!=='prepare'&&operation!=='decode')return Promise.reject(Error('Native decoder operation unsupported.'));
      const json=operation==='decode'?JSON.stringify(payload):null;
      if(json?.length>2_000_000)return Promise.reject(Error('Native decoder request too large.'));
      const id='voice-'+crypto.randomUUID()+'-'+(++nextId);
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{pending.delete(id);native.cancel(id);reject(Error('Native decoder timed out.'));},operation==='prepare'?610000:190000);
        pending.set(id,{resolve,reject,timer,progress,operation});
        try{if(operation==='prepare')native.prepare(id);else native.decode(id,json);}
        catch(error){pending.delete(id);clearTimeout(timer);reject(error);}
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
