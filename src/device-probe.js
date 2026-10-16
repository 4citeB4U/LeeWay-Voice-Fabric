/*
LEEWAY HEADER
REGION: VOICE.FABRIC.DEVICE_PROBE
TAG: VOICE.FABRIC.DEVICE.PROBE
Device awareness for Voice Fabric. Every fact carries an evidence class so a
consumer can tell what was OBSERVED on this device from what is only INFERRED.
No hardware is claimed that the runtime did not actually observe.
*/
export const DEVICE_PROFILE_SCHEMA='leeway.voice.device-profile/v1';
export const EVIDENCE=Object.freeze({OBSERVED:'OBSERVED',INFERRED:'INFERRED',UNKNOWN:'UNKNOWN'});
const fact=(value,evidence,source)=>({value:value??null,evidence,source});
// Smallest valid module using a SIMD instruction; validate() is the standard feature test.
const SIMD_PROBE=new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]);

function platformOf(nav){
  const text=`${nav?.userAgentData?.platform||''} ${nav?.platform||''} ${nav?.userAgent||''}`.toLowerCase();
  if(/android/.test(text))return 'android';
  if(/iphone|ipad|ipod/.test(text))return 'ios';
  if(/win/.test(text))return 'windows';
  if(/mac/.test(text))return 'macos';
  if(/cros|linux|x11/.test(text))return 'linux';
  return 'unknown';
}

async function withTimeout(promise,ms,fallback){
  let timer;
  try{return await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),ms);})]);}
  catch{return fallback;}finally{clearTimeout(timer);}
}

async function probeWebGpu(nav,timeoutMs){
  if(!nav?.gpu?.requestAdapter)return fact(false,EVIDENCE.OBSERVED,'navigator.gpu absent');
  const adapter=await withTimeout(nav.gpu.requestAdapter(),timeoutMs,undefined);
  if(adapter===undefined)return fact(false,EVIDENCE.UNKNOWN,'navigator.gpu.requestAdapter timed out or threw');
  return fact(adapter!==null,EVIDENCE.OBSERVED,'navigator.gpu.requestAdapter');
}

async function probeSpeech(env,timeoutMs){
  const synth=env.speechSynthesis;
  if(!synth||typeof synth.getVoices!=='function')return {available:false,voiceCount:0,englishVoiceCount:0};
  let voices=synth.getVoices()||[];
  if(!voices.length&&typeof synth.addEventListener==='function'){
    voices=await withTimeout(new Promise(resolve=>{
      synth.addEventListener('voiceschanged',()=>resolve(synth.getVoices()||[]),{once:true});
    }),timeoutMs,[]);
  }
  const english=voices.filter(v=>/^en([-_]|$)/i.test(String(v.lang||'')));
  return {available:true,voiceCount:voices.length,englishVoiceCount:english.length};
}

function tierOf({webgpu,wasm,memoryGiB,cores,quotaBytes}){
  if(!wasm)return 'minimal';
  const lowMemory=memoryGiB!==null&&memoryGiB<=2,fewCores=cores!==null&&cores<=2;
  const smallStorage=quotaBytes!==null&&quotaBytes<300_000_000;
  if(lowMemory||fewCores||smallStorage)return 'low';
  return webgpu?'high':'mid';
}

/**
 * Observe this device. `env` is injectable so the same code runs in a page,
 * a worker, an Android WebView and in unit tests.
 */
export async function probeDevice(env=globalThis,{timeoutMs=1500}={}){
  const nav=env.navigator||{};
  const [webgpu,speech,storage]=await Promise.all([
    probeWebGpu(nav,timeoutMs),
    probeSpeech(env,timeoutMs),
    withTimeout(Promise.resolve(nav.storage?.estimate?.()),timeoutMs,null)
  ]);
  const wasm=typeof env.WebAssembly==='object'&&env.WebAssembly!==null;
  let simd=false;try{simd=!!(wasm&&env.WebAssembly.validate(SIMD_PROBE));}catch{simd=false;}
  const memoryGiB=Number.isFinite(nav.deviceMemory)?nav.deviceMemory:null;
  const cores=Number.isFinite(nav.hardwareConcurrency)?nav.hardwareConcurrency:null;
  const quotaBytes=Number.isFinite(storage?.quota)?storage.quota:null;
  const platform=platformOf(nav);
  const audioContext=typeof env.AudioContext==='function'||typeof env.webkitAudioContext==='function';
  const audioElement=typeof env.Audio==='function';
  const androidEnglish=!!env.LeeWayPocketEnglish,androidNative=!!env.LeeWayPocketNative||!!env.LeeWayPocketDecoder;
  const nativeDiagnostics=!!env.LeeWayDeviceDiagnostics&&typeof env.LeeWayDeviceDiagnostics.snapshot==='function';
  const facts={
    platform:fact(platform,platform==='unknown'?EVIDENCE.UNKNOWN:EVIDENCE.INFERRED,'userAgent/userAgentData'),
    logicalProcessors:fact(cores,cores===null?EVIDENCE.UNKNOWN:EVIDENCE.OBSERVED,'navigator.hardwareConcurrency'),
    memoryGiB:fact(memoryGiB,memoryGiB===null?EVIDENCE.UNKNOWN:EVIDENCE.OBSERVED,'navigator.deviceMemory (rounded, capped by the browser)'),
    storageQuotaBytes:fact(quotaBytes,quotaBytes===null?EVIDENCE.UNKNOWN:EVIDENCE.OBSERVED,'navigator.storage.estimate'),
    online:fact(typeof nav.onLine==='boolean'?nav.onLine:null,typeof nav.onLine==='boolean'?EVIDENCE.OBSERVED:EVIDENCE.UNKNOWN,'navigator.onLine'),
    webgpu,
    wasm:fact(wasm,EVIDENCE.OBSERVED,'typeof WebAssembly'),
    wasmSimd:fact(simd,wasm?EVIDENCE.OBSERVED:EVIDENCE.UNKNOWN,'WebAssembly.validate(simd module)'),
    wasmThreads:fact(!!(env.crossOriginIsolated&&typeof env.SharedArrayBuffer==='function'),EVIDENCE.OBSERVED,'crossOriginIsolated && SharedArrayBuffer'),
    audioOutput:fact(audioContext||audioElement,EVIDENCE.OBSERVED,'AudioContext/Audio constructors (output hardware is not proven until a self-test plays)'),
    speechSynthesis:fact(speech,EVIDENCE.OBSERVED,'window.speechSynthesis.getVoices'),
    androidEnglishHost:fact(androidEnglish,EVIDENCE.OBSERVED,'LeeWayPocketEnglish host object'),
    androidNativeHost:fact(androidNative,EVIDENCE.OBSERVED,'LeeWayPocketNative/Decoder host object'),
    nativeDiagnosticsHost:fact(nativeDiagnostics,EVIDENCE.OBSERVED,'LeeWayDeviceDiagnostics host object')
  };
  const tier=tierOf({webgpu:webgpu.value===true,wasm,memoryGiB,cores,quotaBytes});
  return {
    schema:DEVICE_PROFILE_SCHEMA,
    capturedAt:new Date().toISOString(),
    platform,
    tier,
    facts,
    // Flat booleans for routers and agents that do not need evidence detail.
    can:{
      kokoro:wasm&&tier!=='minimal',
      kokoroWebGpu:webgpu.value===true&&wasm&&tier!=='minimal',
      chatterbox:wasm&&tier==='high',
      deviceSpeech:speech.available&&speech.voiceCount>0,
      androidSpeech:androidEnglish,
      audioOutput:audioContext||audioElement
    }
  };
}
