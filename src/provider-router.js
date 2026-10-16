/*
LEEWAY HEADER
REGION: VOICE.FABRIC.PROVIDER_ROUTER
TAG: VOICE.FABRIC.PROVIDER.ROUTER
Chooses which speech engines this device can run, in order, and fails over
visibly. A failover is never silent: every attempt is recorded and the caller
is told which provider is actually speaking.
*/
export const DEFAULT_KOKORO_VOICE_ID='kokoro-am_michael';
export const DEVICE_VOICE_ID='android-installed-english';
const KOKORO_MIN_QUOTA=150_000_000; // ~92 MB model plus cache headroom

/**
 * @returns {{providers:Array<{provider:string,device?:string,reason:string}>,excluded:Array<{provider:string,reason:string}>}}
 */
export function planProviders(profile,{preferred,allowClone=false}={}){
  const providers=[],excluded=[];
  const f=profile?.facts||{},quota=f.storageQuotaBytes?.value;
  const kokoroBlocked=!profile?.can?.kokoro
    ?'WebAssembly unavailable or device tier is minimal'
    :(typeof quota==='number'&&quota<KOKORO_MIN_QUOTA?'storage quota too small for the 92 MB model':null);
  if(!kokoroBlocked){
    providers.push({provider:'kokoro',device:profile.can.kokoroWebGpu?'webgpu':'wasm',
      reason:profile.can.kokoroWebGpu?'WebGPU adapter observed':'WebAssembly observed'});
  }else excluded.push({provider:'kokoro',reason:kokoroBlocked});
  if(profile?.can?.androidSpeech)providers.push({provider:'device-speech',device:'android-native',reason:'Android host exposes installed English speech'});
  else if(profile?.can?.deviceSpeech)providers.push({provider:'device-speech',device:'system',reason:'System speech voices observed'});
  else excluded.push({provider:'device-speech',reason:'no system speech voices observed'});
  if(allowClone){
    if(profile?.can?.chatterbox)providers.push({provider:'chatterbox',device:'webgpu',reason:'Clone voice explicitly allowed on a high-tier device'});
    else excluded.push({provider:'chatterbox',reason:'clone voice needs a high-tier device with WebAssembly'});
  }else excluded.push({provider:'chatterbox',reason:'clone voice is optional and not enabled'});
  // An explicit user choice moves to the front only if this device can run it.
  if(preferred){
    const index=providers.findIndex(p=>p.provider===preferred);
    if(index>0)providers.unshift(...providers.splice(index,1));
  }
  return {providers,excluded};
}

/** Maps a Voice Package provider field to a router provider name. */
export function routerProviderFor(voicePackage){
  switch(voicePackage?.provider){
    case 'kokoro':return 'kokoro';
    case 'android-tts':return 'device-speech';
    case 'chatterbox':return 'chatterbox';
    default:return null;
  }
}

/**
 * Try each provider in order until one prepares. `prepare(step)` must throw on
 * failure. Abort errors stop the walk immediately: that is a user cancel, not
 * a provider fault.
 */
export async function prepareWithFailover(plan,prepare){
  const attempts=[];
  for(const step of plan.providers){
    const started=Date.now();
    try{
      const result=await prepare(step);
      attempts.push({provider:step.provider,device:step.device,ok:true,ms:Date.now()-started});
      return {ok:true,provider:step.provider,device:step.device,result,attempts,fallback:attempts.length>1};
    }catch(error){
      if(error?.name==='AbortError')throw error;
      attempts.push({provider:step.provider,device:step.device,ok:false,ms:Date.now()-started,error:String(error?.message||error).slice(0,300)});
    }
  }
  return {ok:false,provider:null,device:null,result:null,attempts,fallback:false,
    error:plan.providers.length?'Every voice provider failed on this device.':'No voice provider can run on this device.'};
}
