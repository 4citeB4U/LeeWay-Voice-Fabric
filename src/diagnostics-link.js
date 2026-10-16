/*
LEEWAY HEADER
REGION: VOICE.FABRIC.DIAGNOSTICS_LINK
TAG: VOICE.FABRIC.DIAGNOSTICS.LINK
Reads the diagnostics a LeeWay device already publishes and reduces them to a
small, validated, audio-focused summary the voice router can reason about.

Sources, tried independently (a failed source never hides a working one):
  1. NATIVE_HOST   env.LeeWayDeviceDiagnostics.snapshot()  (Android WebView host)
  2. DEVICE_BRIDGE loopback LeeWay Device Bridge, http://127.0.0.1:5323
                   /health is open; /passport /capabilities /bridge require the
                   owner-issued bearer token, which the CALLER must supply. This
                   module never discovers, guesses or stores a token.

Everything read is untrusted input: fields are allow-listed, type-checked and
bounded. Nothing from a diagnostics source is ever executed or evaluated.
*/
export const DIAGNOSTICS_SCHEMA='leeway.voice.diagnostics/v1';
export const DEVICE_BRIDGE_LOOPBACK='http://127.0.0.1:5323';
const MAX_BYTES=256*1024;

const num=(v,min=-Infinity,max=Infinity)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
const str=(v,max=120)=>typeof v==='string'?v.slice(0,max):null;
const bool=v=>typeof v==='boolean'?v:null;
const strList=(v,max=12,len=80)=>Array.isArray(v)?v.slice(0,max).map(x=>str(x,len)).filter(x=>x!==null):[];

export function isLoopbackUrl(value){
  let url;try{url=new URL(String(value));}catch{return false;}
  return url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&!url.username&&!url.password;
}

export function normalizeAudio(raw){
  if(!raw||typeof raw!=='object')return null;
  const volume=raw.streamVolume&&typeof raw.streamVolume==='object'?raw.streamVolume:{};
  const music=volume.music&&typeof volume.music==='object'?volume.music:{};
  return {
    outputs:Array.isArray(raw.outputs)?raw.outputs.slice(0,16).map(o=>({type:str(o?.type,40),productName:str(o?.productName,80)})):[],
    musicVolume:{current:num(music.current,0,10_000),max:num(music.max,0,10_000)},
    muted:bool(raw.muted),
    sampleRate:num(raw.sampleRate,8000,384000),
    framesPerBuffer:num(raw.framesPerBuffer,16,65536),
    lowLatency:bool(raw.lowLatency),
    ttsEngines:strList(raw.ttsEngines),
    speechBusy:bool(raw.speechBusy)
  };
}

function normalizePassport(raw){
  if(!raw||typeof raw!=='object')return null;
  const memory=raw.memory&&typeof raw.memory==='object'?raw.memory:{};
  return {
    authority:str(raw.authority,60),manufacturer:str(raw.manufacturer,60),model:str(raw.model,80),
    androidRelease:str(raw.androidRelease,20),sdkInt:num(raw.sdkInt,1,200),
    supportedAbis:strList(raw.supportedAbis,8,30),
    memory:{totalBytes:num(memory.totalBytes,0,2**50),availableBytes:num(memory.availableBytes,0,2**50),lowMemory:bool(memory.lowMemory)}
  };
}

function normalizeNative(raw){
  if(!raw||typeof raw!=='object')return null;
  return {
    authority:str(raw.authority,60),
    batteryPercent:num(raw.batteryPercent,0,100),
    passport:normalizePassport(raw.passport),
    audio:normalizeAudio(raw.audio)
  };
}

async function fetchJson(fetchImpl,url,{token,timeoutMs}){
  const headers={Accept:'application/json'};if(token)headers.Authorization=`Bearer ${token}`;
  const response=await fetchImpl(url,{method:'GET',headers,credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
  if(!response.ok){const error=new Error(`HTTP ${response.status}`);error.status=response.status;throw error;}
  const text=await response.text();
  if(text.length>MAX_BYTES)throw new Error('Diagnostics response is too large.');
  return JSON.parse(text);
}

/**
 * @param {object} options
 * @param {object} [options.env=globalThis]
 * @param {string} [options.bridgeUrl]  must be loopback http; defaults to the Device Bridge port
 * @param {string} [options.bearerToken] owner-issued; required for /passport and /bridge
 * @param {boolean} [options.useDeviceBridge=true]
 */
export async function readDeviceDiagnostics({env=globalThis,bridgeUrl=DEVICE_BRIDGE_LOOPBACK,bearerToken,useDeviceBridge=true,fetchImpl=globalThis.fetch,timeoutMs=2000}={}){
  const sources=[],report={schema:DIAGNOSTICS_SCHEMA,capturedAt:new Date().toISOString(),sources,native:null,bridge:null,audio:null};

  const host=env.LeeWayDeviceDiagnostics;
  if(host&&typeof host.snapshot==='function'){
    try{
      const value=await host.snapshot();
      const parsed=normalizeNative(typeof value==='string'?JSON.parse(value.slice(0,MAX_BYTES)):value);
      if(!parsed)throw new Error('Host snapshot was not an object.');
      report.native=parsed;report.audio=parsed.audio;
      sources.push({name:'NATIVE_HOST',ok:true,evidence:'OBSERVED'});
    }catch(error){sources.push({name:'NATIVE_HOST',ok:false,evidence:'FAILED',error:String(error.message||error).slice(0,200)});}
  }else sources.push({name:'NATIVE_HOST',ok:false,evidence:'UNKNOWN',error:'No LeeWayDeviceDiagnostics host object on this device.'});

  if(useDeviceBridge){
    if(!isLoopbackUrl(bridgeUrl)||typeof fetchImpl!=='function'){
      sources.push({name:'DEVICE_BRIDGE',ok:false,evidence:'BLOCKED',error:'Only a loopback http URL may be read.'});
    }else{
      const base=new URL(bridgeUrl).origin,bridge={reachable:false,authorized:null};
      try{
        const health=await fetchJson(fetchImpl,base+'/health',{timeoutMs});
        bridge.reachable=true;bridge.running=bool(health.running);bridge.port=num(health.port,1,65535);
        bridge.agentAccessEnabled=bool(health.agentAccessEnabled);
        sources.push({name:'DEVICE_BRIDGE:/health',ok:true,evidence:'OBSERVED'});
      }catch(error){
        sources.push({name:'DEVICE_BRIDGE:/health',ok:false,evidence:'FAILED',error:String(error.message||error).slice(0,200)});
      }
      if(bridge.reachable&&bearerToken){
        try{
          const passport=normalizePassport(await fetchJson(fetchImpl,base+'/passport',{token:bearerToken,timeoutMs}));
          bridge.authorized=true;bridge.passport=passport;
          sources.push({name:'DEVICE_BRIDGE:/passport',ok:true,evidence:'OBSERVED'});
        }catch(error){
          bridge.authorized=error.status===401||error.status===403?false:null;
          sources.push({name:'DEVICE_BRIDGE:/passport',ok:false,evidence:error.status===403?'BLOCKED':'FAILED',
            error:error.status===403?'Owner has not enabled agent access on the device.':String(error.message||error).slice(0,200)});
        }
      }else if(bridge.reachable){
        sources.push({name:'DEVICE_BRIDGE:/passport',ok:false,evidence:'UNKNOWN',error:'No owner bearer token supplied; /passport not requested.'});
      }
      report.bridge=bridge;
    }
  }
  return report;
}

/**
 * Turn diagnostics into routing facts. A diagnostic can only make routing more
 * conservative or confirm what the probe saw; it never unlocks a provider the
 * browser could not run.
 */
export function constraintsFromDiagnostics(report){
  const notes=[];let avoidHeavyModels=false;
  const memory=report?.native?.passport?.memory||report?.bridge?.passport?.memory;
  if(memory?.lowMemory===true){avoidHeavyModels=true;notes.push('Device reports low memory.');}
  const audio=report?.audio;
  if(audio?.muted===true)notes.push('Device music stream is muted; speech will be inaudible.');
  if(audio&&audio.musicVolume.current===0)notes.push('Device music volume is 0.');
  if(audio&&audio.outputs.length===0&&report.sources.some(s=>s.name==='NATIVE_HOST'&&s.ok))notes.push('Device reports no audio output.');
  return {avoidHeavyModels,notes};
}
