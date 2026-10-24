import {voiceRegistry} from './voice-registry.js';
import {probeDevice} from './device-probe.js';
import {readDeviceDiagnostics,constraintsFromDiagnostics} from './diagnostics-link.js';
import {planProviders,prepareWithFailover,routerProviderFor,DEFAULT_KOKORO_VOICE_ID,DEVICE_VOICE_ID} from './provider-router.js';
const VERSION='2.1.0';
const token=new URLSearchParams(location.hash.slice(1)).get('token')||'';
// Three engines share one interface; only the active one may speak (one-mouth law).
// Chatterbox (clone) is optional and only runs when its voice is explicitly selected on a capable device.
const engines={
  kokoro:new globalThis.LeeWayKokoroVoice(),
  'device-speech':new globalThis.LeeWayDeviceSpeechVoice(),
  // The selected Chatterbox package supplies its own reference after model load.
  // Do not spend time encoding the unrelated provider-default reference first.
  chatterbox:new globalThis.LeeWayBrowserVoice({skipDefaultReference:true})
};
let voice=engines.kokoro,activeProvider='kokoro';
let activeStream=null,activeStreamId=null,selectedVoiceId=DEFAULT_KOKORO_VOICE_ID;
let profile=null,lastPlan=null,lastAttempts=[],lastError=null,lastFallback=null,preparing=null;
let preparedReferenceId=null;
const clearStream=()=>{activeStream?.fail(new DOMException('Speech was stopped.','AbortError'));activeStream=null;activeStreamId=null;};
const reply=(source,origin,id,ok,data,error)=>source.postMessage({token,replyTo:id,ok,data,error},origin);
const event=(source,origin,type,data)=>source.postMessage({token,type,data},origin);
const requireStream=id=>{if(!activeStream||activeStreamId!==id)throw new Error('Unknown voice stream.');return activeStream;};
const remember=error=>{lastError={message:String(error?.message||error).slice(0,300),at:new Date().toISOString(),provider:activeProvider};};

function useEngine(provider){
  const next=engines[provider];if(!next)throw new Error(`Unknown voice provider "${provider}".`);
  if(voice!==next){voice.stop();voice=next;}
  activeProvider=provider;
}
async function applyVoicePackage(id){
  const pkg=await voiceRegistry.get(id);if(!pkg)throw new Error('Voice package not found.');
  const provider=routerProviderFor(pkg);
  if(!provider)throw new Error(`Voice "${pkg.name}" uses provider "${pkg.provider}", which this bridge cannot run.`);
  useEngine(provider);
  if(provider==='kokoro')voice.setVoice(pkg.voiceId);
  if(provider==='chatterbox'&&voice.ready&&preparedReferenceId!==pkg.id){
    const blob=await voiceRegistry.audio(pkg.id);if(!blob)throw new Error('Voice reference unavailable.');
    await voice.setReference(blob);preparedReferenceId=pkg.id;
  }
  voice.exaggeration=Number(pkg.exaggeration);voice.setPace(pkg.pace);selectedVoiceId=pkg.id;return pkg;
}
const fallbackVoiceFor=(provider,pkg)=>provider==='kokoro'?DEFAULT_KOKORO_VOICE_ID:provider==='device-speech'?DEVICE_VOICE_ID:pkg.id;

/**
 * Probe the device, plan providers, and walk the plan until one prepares.
 * A change of provider is reported as a labelled fallback; it is never silent.
 */
async function prepareVoice({onState=()=>{},requestedProvider,exclude=[]}={}){
  if(preparing)return preparing;
  preparing=(async()=>{
    const pkg=await voiceRegistry.get(selectedVoiceId)||await voiceRegistry.get(DEFAULT_KOKORO_VOICE_ID);
    profile=await probeDevice(globalThis);
    // Only the in-process host is read here; loopback bridges are read on explicit request
    // because a hosted page reaching 127.0.0.1 can trigger a browser permission prompt.
    const diagnostics=await readDeviceDiagnostics({env:globalThis,useDeviceBridge:false});
    const constraints=constraintsFromDiagnostics(diagnostics);
    const wanted=requestedProvider||routerProviderFor(pkg);
    const plan=planProviders(profile,{preferred:wanted,allowClone:wanted==='chatterbox'&&!constraints.avoidHeavyModels});
    plan.providers=plan.providers.filter(step=>!exclude.includes(step.provider));
    lastPlan=plan;
    const outcome=await prepareWithFailover(plan,async step=>{
      useEngine(step.provider);
      if(step.provider==='kokoro')voice.requestedDevice=step.device==='wasm'?'wasm':null;
      await voice.load(onState);
      if(step.provider==='chatterbox'){
        const blob=await voiceRegistry.audio(pkg.id);if(!blob)throw new Error('Voice reference unavailable.');
        await voice.setReference(blob);preparedReferenceId=pkg.id;
      }
    });
    lastAttempts=outcome.attempts;
    if(!outcome.ok){const error=new Error(`${outcome.error} ${outcome.attempts.map(a=>`${a.provider}: ${a.error}`).join('; ')}`.trim());remember(error);throw error;}
    const target=routerProviderFor(pkg)===outcome.provider?pkg.id:fallbackVoiceFor(outcome.provider,pkg);
    const applied=await applyVoicePackage(target);
    lastFallback=target!==pkg.id?{requested:pkg.id,actual:applied.id,provider:outcome.provider,
      reason:outcome.attempts.filter(a=>!a.ok).map(a=>`${a.provider}: ${a.error}`).join('; ')||plan.excluded.map(x=>`${x.provider}: ${x.reason}`).join('; ')}:null;
    lastError=null;
    return {ready:true,provider:outcome.provider,device:voice.device,selectedVoiceId:applied.id,voice:applied,
      fallback:lastFallback,attempts:outcome.attempts,tier:profile.tier};
  })().finally(()=>{preparing=null;});
  return preparing;
}
async function ensureReady(source,origin){
  if(voice.ready)return;
  const result=await prepareVoice({onState:p=>event(source,origin,'voice.state',p)});
  if(result.fallback)event(source,origin,'voice.fallback',result.fallback);
}
const isAbort=error=>error?.name==='AbortError';
/** One speak with a single recovery: if the engine fails mid-turn, move to the next provider once. */
async function speakWithRecovery(source,origin,text){
  await ensureReady(source,origin);
  const state=s=>event(source,origin,'voice.state',{message:s,selectedVoiceId});
  try{await voice.speak(text,{onState:state});}
  catch(error){
    if(isAbort(error))throw error;
    remember(error);
    const failed=activeProvider;voice.stop();voice.ready=false;
    const result=await prepareVoice({onState:p=>event(source,origin,'voice.state',p),exclude:[failed]});
    event(source,origin,'voice.fallback',{requested:selectedVoiceId,actual:result.selectedVoiceId,provider:result.provider,reason:`${failed} failed: ${error.message}`});
    await voice.speak(text,{onState:state});
  }
}
async function speakSelectedVoice(source,origin,text){
  await ensureReady(source,origin);
  const state=s=>event(source,origin,'voice.state',{message:s,selectedVoiceId});
  await voice.speak(text,{onState:state});
}
function peakAndRms(buffer){
  const samples=new Float32Array(buffer);let peak=0,sum=0;
  for(const x of samples){if(!Number.isFinite(x))return {peak:NaN,rms:NaN,samples:samples.length};const a=Math.abs(x);if(a>peak)peak=a;sum+=x*x;}
  return {peak,rms:samples.length?Math.sqrt(sum/samples.length):0,samples:samples.length};
}
/** Measured end-to-end check. It only claims what it measured. */
async function selfTest(source,origin,{audible=false,bridgeUrl,bearerToken}={}){
  const steps=[],started=performance.now();
  const step=(check,ok,detail)=>steps.push({check,ok,...detail});
  try{
    profile=await probeDevice(globalThis);
    step('device-probe',true,{tier:profile.tier,platform:profile.platform,can:profile.can});
  }catch(error){step('device-probe',false,{error:error.message});}
  const diagnostics=await readDeviceDiagnostics({env:globalThis,bridgeUrl,bearerToken,useDeviceBridge:!!bridgeUrl});
  const constraints=constraintsFromDiagnostics(diagnostics);
  // A missing host (evidence UNKNOWN) is normal in a plain browser; only a source that exists and errored is a failure.
  step('diagnostics',!diagnostics.sources.some(s=>s.evidence==='FAILED'),{available:diagnostics.sources.some(s=>s.ok),sources:diagnostics.sources,notes:constraints.notes,audio:diagnostics.audio});
  let prepared=null;
  try{
    prepared=await prepareVoice({onState:p=>event(source,origin,'voice.state',p)});
    step('prepare',true,{provider:prepared.provider,device:prepared.device,selectedVoiceId:prepared.selectedVoiceId,fallback:prepared.fallback,attempts:prepared.attempts});
  }catch(error){step('prepare',false,{error:error.message,attempts:lastAttempts});}
  if(prepared&&activeProvider!=='device-speech'){
    try{
      const out=await voice.request('generate',{text:'Voice check.',exaggeration:voice.exaggeration});
      const m=peakAndRms(out.audio);
      step('synthesis',m.samples>0&&m.peak>0.01&&Number.isFinite(m.rms),{...m,sampleRate:out.sampleRate,seconds:m.samples/out.sampleRate});
    }catch(error){step('synthesis',false,{error:error.message});}
  }else if(prepared){
    const voices=globalThis.speechSynthesis?.getVoices?.()||[];
    step('synthesis',voices.length>0,{note:'System speech returns no samples; only voice availability is measured.',voiceCount:voices.length});
  }
  if(audible&&prepared){
    try{await speakWithRecovery(source,origin,'Voice check complete.');step('playback',true,{note:'Playback finished without error; an audible result must be confirmed by the listener.'});}
    catch(error){step('playback',false,{error:error.message});}
  }
  return {ok:steps.every(s=>s.ok),provider:prepared?.provider||null,device:prepared?.device||null,
    selectedVoiceId,fallback:lastFallback,notes:constraints.notes,steps,durationMs:Math.round(performance.now()-started)};
}

addEventListener('message',async e=>{
  const m=e.data||{};if(m.scope!=='leeway.voice.v1'||m.token!==token||!m.id)return;
  try{
    switch(m.command){
      case 'ping': reply(e.source,e.origin,m.id,true,{version:VERSION,selectedVoiceId,provider:activeProvider});break;
      case 'listVoices': reply(e.source,e.origin,m.id,true,{voices:await voiceRegistry.list(),selectedVoiceId});break;
      case 'getVoice': reply(e.source,e.origin,m.id,true,{voice:await voiceRegistry.get(String(m.data?.voicePackageId||''))});break;
      case 'selectVoice':{
        const pkg=await applyVoicePackage(String(m.data?.voicePackageId||''));
        reply(e.source,e.origin,m.id,true,{selectedVoiceId:pkg.id,provider:activeProvider,voice:pkg});break;
      }
      case 'prepare':{
        const requested=typeof m.data?.provider==='string'?m.data.provider:undefined;
        const result=await prepareVoice({requestedProvider:engines[requested]?requested:undefined,onState:p=>event(e.source,e.origin,'voice.state',p)});
        if(result.fallback)event(e.source,e.origin,'voice.fallback',result.fallback);
        reply(e.source,e.origin,m.id,true,result);break;
      }
      case 'probeDevice':{
        profile=await probeDevice(globalThis);
        const diagnostics=await readDeviceDiagnostics({env:globalThis,useDeviceBridge:false});
        const plan=planProviders(profile,{preferred:routerProviderFor(await voiceRegistry.get(selectedVoiceId))});
        reply(e.source,e.origin,m.id,true,{profile,plan,diagnostics,constraints:constraintsFromDiagnostics(diagnostics)});break;
      }
      case 'getDiagnostics':{
        const bearerToken=typeof m.data?.bearerToken==='string'&&m.data.bearerToken.length<=512?m.data.bearerToken:undefined;
        const report=await readDeviceDiagnostics({env:globalThis,bridgeUrl:m.data?.bridgeUrl||undefined,bearerToken,useDeviceBridge:m.data?.useDeviceBridge!==false});
        reply(e.source,e.origin,m.id,true,{diagnostics:report,constraints:constraintsFromDiagnostics(report)});break;
      }
      case 'selfTest':
        reply(e.source,e.origin,m.id,true,await selfTest(e.source,e.origin,{audible:m.data?.audible===true,bridgeUrl:m.data?.bridgeUrl,
          bearerToken:typeof m.data?.bearerToken==='string'?m.data.bearerToken.slice(0,512):undefined}));break;
      case 'status':
        reply(e.source,e.origin,m.id,true,{version:VERSION,ready:voice.ready,provider:activeProvider,device:voice.device,selectedVoiceId,
          tier:profile?.tier||null,plan:lastPlan,attempts:lastAttempts,fallback:lastFallback,lastError});break;
      case 'configure':
        if(Number.isFinite(Number(m.data?.pace)))voice.setPace(Number(m.data.pace));
        if(Number.isFinite(Number(m.data?.exaggeration)))voice.exaggeration=Math.max(0,Math.min(1,Number(m.data.exaggeration)));
        reply(e.source,e.origin,m.id,true,{pace:voice.playbackRate,exaggeration:voice.exaggeration,selectedVoiceId});break;
      case 'setReference':{
        const bytes=m.data?.audio;if(!(bytes instanceof ArrayBuffer))throw new Error('Reference audio ArrayBuffer required.');
        useEngine('chatterbox');
        preparedReferenceId=null;
        await voice.setReference(new Blob([bytes],{type:m.data.type||'audio/wav'}));
        reply(e.source,e.origin,m.id,true,{name:m.data.name||'custom-reference'});break;
      }
      case 'speak':
        if(m.data?.allowFallback===false)await speakSelectedVoice(e.source,e.origin,String(m.data?.text||''));
        else await speakWithRecovery(e.source,e.origin,String(m.data?.text||''));
        reply(e.source,e.origin,m.id,true,{completed:true,selectedVoiceId,provider:activeProvider});break;
      case 'streamStart':{
        await ensureReady(e.source,e.origin);
        voice.stop();activeStreamId=String(m.data?.streamId||'');if(!activeStreamId)throw new Error('streamId required.');
        const startedStreamId=activeStreamId;
        activeStream=new globalThis.LeeWaySpeechStream();
        activeStream.task=voice.speakStream(activeStream,{onState:s=>event(e.source,e.origin,'voice.state',{message:s,selectedVoiceId}),onRendered:text=>event(e.source,e.origin,'voice.rendered',{streamId:startedStreamId,text,selectedVoiceId})})
          .catch(error=>{if(error.name!=='AbortError'){remember(error);event(e.source,e.origin,'voice.error',{message:error.message,selectedVoiceId,provider:activeProvider});}});
        reply(e.source,e.origin,m.id,true,{streamId:activeStreamId,selectedVoiceId,provider:activeProvider});break;
      }
      case 'streamChunk':
        requireStream(String(m.data?.streamId)).push(String(m.data?.text||''));reply(e.source,e.origin,m.id,true,{accepted:true});break;
      case 'streamEnd':{
        const stream=requireStream(String(m.data?.streamId));stream.end();await stream.task;activeStream=null;activeStreamId=null;
        reply(e.source,e.origin,m.id,true,{completed:true,selectedVoiceId});break;
      }
      case 'stop':
        voice.stop();activeStream?.fail(new DOMException('Speech was stopped.','AbortError'));activeStream=null;activeStreamId=null;
        reply(e.source,e.origin,m.id,true,{stopped:true,selectedVoiceId});break;
      case 'metrics':
        reply(e.source,e.origin,m.id,true,{events:globalThis.LeeWayVoiceMetrics?.snapshot?.()||[],selectedVoiceId,provider:activeProvider,lastError});break;
      case 'dispose':
        for(const engine of Object.values(engines))await engine.dispose();activeStream=null;activeStreamId=null;preparedReferenceId=null;reply(e.source,e.origin,m.id,true,{disposed:true});break;
      default: throw new Error('Unknown Voice Fabric command.');
    }
  }catch(error){if(!isAbort(error))remember(error);reply(e.source,e.origin,m.id,false,null,error.message||String(error));}
});
parent.postMessage({token,type:'voice.ready',data:{version:VERSION}},'*');

