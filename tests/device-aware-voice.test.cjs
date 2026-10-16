const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=file=>path.join(__dirname,'..','src',file);
// These modules have no imports, so they can be loaded as ES modules from a data URL.
const esm=file=>import('data:text/javascript;base64,'+fs.readFileSync(src(file)).toString('base64'));
const tick=()=>new Promise(r=>setImmediate(r));

function env(overrides={}){
  const nav={hardwareConcurrency:8,deviceMemory:8,onLine:true,userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel) Chrome/130',
    storage:{estimate:async()=>({quota:5e9})},gpu:{requestAdapter:async()=>({})},...overrides.navigator};
  return {navigator:nav,WebAssembly:{validate:()=>true},crossOriginIsolated:false,AudioContext:function(){},Audio:function(){},
    speechSynthesis:{getVoices:()=>[{lang:'en-US',name:'Test',localService:true}]},...overrides.env};
}

test('device probe: capable phone is high tier and every fact carries evidence',async()=>{
  const {probeDevice}=await esm('device-probe.js');const p=await probeDevice(env());
  assert.equal(p.tier,'high');assert.equal(p.platform,'android');assert.equal(p.can.kokoroWebGpu,true);assert.equal(p.can.chatterbox,true);
  for(const [name,fact] of Object.entries(p.facts))assert.ok(['OBSERVED','INFERRED','UNKNOWN'].includes(fact.evidence),name);
  assert.equal(p.facts.speechSynthesis.value.englishVoiceCount,1);
});
test('device probe: low memory, no GPU, small storage degrade honestly and do not invent values',async()=>{
  const {probeDevice}=await esm('device-probe.js');
  const p=await probeDevice(env({navigator:{deviceMemory:2,gpu:undefined}}));
  assert.equal(p.tier,'low');assert.equal(p.can.kokoro,true);assert.equal(p.can.kokoroWebGpu,false);assert.equal(p.can.chatterbox,false);
  const unknown=await probeDevice(env({navigator:{deviceMemory:undefined,hardwareConcurrency:undefined,storage:undefined}}));
  assert.equal(unknown.facts.memoryGiB.value,null);assert.equal(unknown.facts.memoryGiB.evidence,'UNKNOWN');assert.equal(unknown.facts.storageQuotaBytes.evidence,'UNKNOWN');
  const small=await probeDevice(env({navigator:{storage:{estimate:async()=>({quota:1e8})}}}));assert.equal(small.tier,'low');
});
test('device probe: no WebAssembly is minimal tier; hanging GPU adapter does not hang the probe',async()=>{
  const {probeDevice}=await esm('device-probe.js');
  const none=await probeDevice(env({env:{WebAssembly:undefined}}));assert.equal(none.tier,'minimal');assert.equal(none.can.kokoro,false);
  const hung=await probeDevice(env({navigator:{gpu:{requestAdapter:()=>new Promise(()=>{})}}}),{timeoutMs:20});
  assert.equal(hung.facts.webgpu.evidence,'UNKNOWN');assert.equal(hung.can.kokoroWebGpu,false);assert.equal(hung.can.kokoro,true);
});
test('device probe: waits for late speech voices, gives up on none',async()=>{
  const {probeDevice}=await esm('device-probe.js');
  let handler;let voices=[];
  const late={getVoices:()=>voices,addEventListener:(t,fn)=>{handler=fn;}};
  const pending=probeDevice(env({env:{speechSynthesis:late}}),{timeoutMs:200});
  await tick();voices=[{lang:'en-GB'}];handler();
  assert.equal((await pending).facts.speechSynthesis.value.voiceCount,1);
  const silent=await probeDevice(env({env:{speechSynthesis:{getVoices:()=>[],addEventListener(){}}}}),{timeoutMs:20});
  assert.equal(silent.can.deviceSpeech,false);
});

test('router: Kokoro first, device voice second, clone only when allowed on a high-tier device',async()=>{
  const {probeDevice}=await esm('device-probe.js'),{planProviders}=await esm('provider-router.js');
  const p=await probeDevice(env());
  let plan=planProviders(p);
  assert.deepEqual(plan.providers.map(s=>s.provider),['kokoro','device-speech']);assert.equal(plan.providers[0].device,'webgpu');
  assert.ok(plan.excluded.some(x=>x.provider==='chatterbox'&&/optional/.test(x.reason)));
  plan=planProviders(p,{allowClone:true});assert.deepEqual(plan.providers.map(s=>s.provider),['kokoro','device-speech','chatterbox']);
  plan=planProviders(p,{allowClone:true,preferred:'chatterbox'});assert.equal(plan.providers[0].provider,'chatterbox');
  const weak=await probeDevice(env({navigator:{deviceMemory:2}}));
  plan=planProviders(weak,{allowClone:true,preferred:'chatterbox'});
  assert.ok(!plan.providers.some(s=>s.provider==='chatterbox'));assert.ok(plan.excluded.some(x=>x.provider==='chatterbox'&&/high-tier/.test(x.reason)));
});
test('router: a device with no WebAssembly still gets device speech; a device with nothing says so',async()=>{
  const {probeDevice}=await esm('device-probe.js'),{planProviders,prepareWithFailover}=await esm('provider-router.js');
  const p=await probeDevice(env({env:{WebAssembly:undefined}}));
  assert.deepEqual(planProviders(p).providers.map(s=>s.provider),['device-speech']);
  const bare=await probeDevice(env({env:{WebAssembly:undefined,speechSynthesis:undefined}}));
  const result=await prepareWithFailover(planProviders(bare),async()=>{});
  assert.equal(result.ok,false);assert.match(result.error,/No voice provider/);
});
test('router: failover records each failed attempt, never loops, and a stop is not a provider fault',async()=>{
  const {prepareWithFailover}=await esm('provider-router.js');
  const plan={providers:[{provider:'kokoro',device:'wasm'},{provider:'device-speech',device:'system'}]};
  const ok=await prepareWithFailover(plan,async s=>{if(s.provider==='kokoro')throw new Error('network down');});
  assert.equal(ok.ok,true);assert.equal(ok.provider,'device-speech');assert.equal(ok.fallback,true);
  assert.deepEqual(ok.attempts.map(a=>[a.provider,a.ok]),[['kokoro',false],['device-speech',true]]);assert.match(ok.attempts[0].error,/network down/);
  const all=await prepareWithFailover(plan,async()=>{throw new Error('boom');});assert.equal(all.ok,false);assert.equal(all.attempts.length,2);
  let calls=0;
  await assert.rejects(prepareWithFailover(plan,async()=>{calls++;throw new DOMException('stopped','AbortError');}),{name:'AbortError'});
  assert.equal(calls,1);
});

test('diagnostics: loopback only, owner token required for passport, hostile fields dropped',async()=>{
  const {readDeviceDiagnostics,isLoopbackUrl,constraintsFromDiagnostics}=await esm('diagnostics-link.js');
  assert.equal(isLoopbackUrl('http://127.0.0.1:5323'),true);assert.equal(isLoopbackUrl('http://localhost:5323/x'),true);
  for(const bad of ['https://evil.example','http://192.168.1.5:5323','http://127.0.0.1.evil.com','http://user:pw@127.0.0.1','file:///x','nonsense'])assert.equal(isLoopbackUrl(bad),false,bad);
  const calls=[];
  const fetchImpl=async(url,init)=>{calls.push({url,auth:init.headers.Authorization});
    if(url.endsWith('/health'))return {ok:true,text:async()=>JSON.stringify({running:true,port:5323,agentAccessEnabled:true,secret:'x'})};
    return {ok:true,text:async()=>JSON.stringify({manufacturer:'Google',model:'Pixel',sdkInt:35,evil:'<script>',memory:{totalBytes:8e9,availableBytes:4e9,lowMemory:false}})};};
  let r=await readDeviceDiagnostics({env:{},fetchImpl});
  assert.equal(r.bridge.reachable,true);assert.equal(r.bridge.agentAccessEnabled,true);assert.equal(r.bridge.passport,undefined);
  assert.deepEqual(calls.map(c=>c.url),['http://127.0.0.1:5323/health']);assert.equal(calls[0].auth,undefined);
  assert.ok(r.sources.some(s=>s.name==='DEVICE_BRIDGE:/passport'&&/No owner bearer token/.test(s.error)));
  calls.length=0;r=await readDeviceDiagnostics({env:{},fetchImpl,bearerToken:'owner-token'});
  assert.equal(calls[1].auth,'Bearer owner-token');assert.equal(r.bridge.passport.model,'Pixel');assert.equal(r.bridge.passport.evil,undefined);assert.equal(JSON.stringify(r).includes('secret'),false);
  const blocked=await readDeviceDiagnostics({env:{},bridgeUrl:'https://evil.example',fetchImpl});
  assert.equal(blocked.sources.find(s=>s.name==='DEVICE_BRIDGE').evidence,'BLOCKED');
  const off=await readDeviceDiagnostics({env:{},fetchImpl:async()=>{throw new Error('should not fetch');},useDeviceBridge:false});
  assert.equal(off.sources.some(s=>s.name.startsWith('DEVICE_BRIDGE')),false);
  assert.equal(constraintsFromDiagnostics(off).avoidHeavyModels,false);
});
test('diagnostics: owner has not enabled agent access is reported as BLOCKED, not hidden',async()=>{
  const {readDeviceDiagnostics}=await esm('diagnostics-link.js');
  const fetchImpl=async url=>url.endsWith('/health')?{ok:true,text:async()=>'{"running":true,"port":5323,"agentAccessEnabled":false}'}:{ok:false,status:403,text:async()=>'{}'};
  const r=await readDeviceDiagnostics({env:{},fetchImpl,bearerToken:'t'});
  const s=r.sources.find(x=>x.name==='DEVICE_BRIDGE:/passport');assert.equal(s.evidence,'BLOCKED');assert.match(s.error,/enabled agent access/);assert.equal(r.bridge.authorized,false);
});
test('diagnostics: native host audio snapshot is validated and turns into routing notes',async()=>{
  const {readDeviceDiagnostics,constraintsFromDiagnostics}=await esm('diagnostics-link.js');
  const snapshot={authority:'LOCAL_DEVICE_RUNTIME',batteryPercent:55,audio:{outputs:[{type:'speaker',productName:'Phone'}],streamVolume:{music:{current:0,max:15}},muted:true,sampleRate:48000,ttsEngines:['com.google.android.tts'],junk:{a:1}},
    passport:{memory:{lowMemory:true,totalBytes:2e9,availableBytes:1e8}}};
  const asString=await readDeviceDiagnostics({env:{LeeWayDeviceDiagnostics:{snapshot:()=>JSON.stringify(snapshot)}},useDeviceBridge:false});
  assert.equal(asString.audio.sampleRate,48000);assert.equal(asString.audio.junk,undefined);assert.equal(asString.audio.ttsEngines[0],'com.google.android.tts');
  const c=constraintsFromDiagnostics(asString);assert.equal(c.avoidHeavyModels,true);assert.ok(c.notes.some(n=>/muted/.test(n)));assert.ok(c.notes.some(n=>/volume is 0/.test(n)));
  const bad=await readDeviceDiagnostics({env:{LeeWayDeviceDiagnostics:{snapshot:()=>'not json'}},useDeviceBridge:false});
  assert.equal(bad.sources[0].ok,false);assert.equal(bad.audio,null);
  const clamp=await readDeviceDiagnostics({env:{LeeWayDeviceDiagnostics:{snapshot:()=>({audio:{sampleRate:5,muted:'yes'}})}},useDeviceBridge:false});
  assert.equal(clamp.audio.sampleRate,null);assert.equal(clamp.audio.muted,null);
});

function engineScope(extra={}){
  const scope={performance,DOMException,AbortController,Event,setTimeout,clearTimeout,URL,console,Float32Array,...extra};
  vm.createContext(scope);
  for(const file of ['browser-voice.js','speech-pipeline.js','kokoro-browser.js','device-speech.js'])vm.runInContext(fs.readFileSync(src(file),'utf8'),scope);
  return scope;
}
function fakeKokoro({failDevices=[]}={}){
  const calls=[];
  return {calls,loader:async()=>({KokoroTTS:{from_pretrained:async(model,opts)=>{
    calls.push({model,dtype:opts.dtype,device:opts.device});
    if(failDevices.includes(opts.device))throw new Error(`${opts.device} init failed`);
    opts.progress_callback({status:'progress',loaded:1});
    return {generate:async(text,o)=>({audio:new Float32Array([0,.5,-.5,.25]),sampling_rate:24000,_voice:o.voice})};
  }}})};
}
test('Kokoro engine: WebGPU failure retries once on WebAssembly with the 8-bit model',async()=>{
  const scope=engineScope({navigator:{gpu:{}}}),k=fakeKokoro({failDevices:['webgpu']}),progress=[];
  const voice=new scope.LeeWayKokoroVoice({loader:k.loader});
  const result=await voice.load(p=>progress.push(p));
  assert.equal(result.device,'wasm');assert.equal(voice.ready,true);
  assert.deepEqual(k.calls.map(c=>[c.device,c.dtype]),[['webgpu','fp32'],['wasm','q8']]);
  assert.ok(progress.some(p=>p.status==='warning'&&/Trying wasm/.test(p.message)));
});
test('Kokoro engine: both devices failing rejects with the real error and stays unready',async()=>{
  const scope=engineScope({navigator:{gpu:{}}}),k=fakeKokoro({failDevices:['webgpu','wasm']});
  const voice=new scope.LeeWayKokoroVoice({loader:k.loader});
  await assert.rejects(voice.load(),/wasm init failed/);assert.equal(voice.ready,false);assert.equal(voice.loading,null);
});
test('Kokoro engine: voice IDs are validated, generation returns a copied PCM buffer',async()=>{
  const scope=engineScope(),k=fakeKokoro(),voice=new scope.LeeWayKokoroVoice({loader:k.loader,device:'wasm'});
  assert.throws(()=>voice.setVoice('../etc/passwd'),/Invalid Kokoro voice/);
  voice.setVoice('kokoro-bf_emma');assert.equal(voice.voiceId,'bf_emma');
  await voice.load();const out=await voice.request('generate',{text:'Hello.'});
  assert.equal(out.sampleRate,24000);assert.equal(new Float32Array(out.audio).length,4);
  await assert.rejects(voice.request('load'),/does not support/);
});
test('Kokoro engine speaks through the shared streaming pipeline in order and stops cleanly',async()=>{
  const scope=engineScope(),k=fakeKokoro(),voice=new scope.LeeWayKokoroVoice({loader:k.loader,device:'wasm'});
  await voice.load();const played=[];voice.play=async(r,epoch)=>{if(epoch!==voice.epoch)throw new DOMException('x','AbortError');played.push(new Float32Array(r.audio).length);};
  const rendered=[];
  await voice.speak('First sentence here. Second sentence follows. Third one ends.',{onState(){}});
  assert.ok(played.length>=1);
  const stream=new scope.LeeWaySpeechStream();stream.push('One. Two. Three.');
  const task=voice.speakStream(stream,{onRendered:t=>rendered.push(t)});stream.end();await task;
  assert.deepEqual(rendered.join(' ').replace(/\s+/g,' ').trim(),'One. Two. Three.');
  voice.stop();assert.equal(voice.pending.size,0);
});

function fakeSpeech(voices,{failWith}={}){
  const spoken=[];
  class Utterance{constructor(text){this.text=text;}}
  const synth={getVoices:()=>voices,spoken,cancelled:0,cancel(){this.cancelled++;},
    speak(u){spoken.push(u);setImmediate(()=>failWith?u.onerror({error:failWith}):u.onend());}};
  return {synth,Utterance};
}
test('device speech: prefers a local English voice, speaks clauses in order, reports its own provider name',async()=>{
  const scope=engineScope(),{synth,Utterance}=fakeSpeech([{name:'Remote',lang:'en-US',localService:false},{name:'Local',lang:'en-US',localService:true},{name:'French',lang:'fr-FR',localService:true}]);
  const voice=new scope.LeeWayDeviceSpeechVoice({speechSynthesis:synth,Utterance});
  await voice.load();assert.equal(voice.voice.name,'Local');assert.equal(voice.provider,'device-speech');
  await voice.speak('Hello there. How are you today?');
  assert.equal(synth.spoken.map(u=>u.text).join(' '),'Hello there. How are you today?');assert.equal(synth.spoken[0].voice.name,'Local');
});
test('device speech: no voices rejects load; stop cancels; engine errors surface',async()=>{
  const scope=engineScope(),empty=fakeSpeech([]);
  await assert.rejects(new scope.LeeWayDeviceSpeechVoice({speechSynthesis:empty.synth,Utterance:empty.Utterance}).load(),/no installed speech voices/);
  const none=new scope.LeeWayDeviceSpeechVoice({speechSynthesis:null});scope.speechSynthesis=undefined;
  await assert.rejects(none.load(),/no speech synthesis/);
  const failing=fakeSpeech([{name:'V',lang:'en-US',localService:true}],{failWith:'audio-hardware'});
  const bad=new scope.LeeWayDeviceSpeechVoice({speechSynthesis:failing.synth,Utterance:failing.Utterance});await bad.load();
  await assert.rejects(bad.speak('Hi there.'),/audio-hardware/);
  const stoppable=fakeSpeech([{name:'V',lang:'en-US',localService:true}]);
  stoppable.synth.speak=u=>{stoppable.synth.spoken.push(u);};
  const v=new scope.LeeWayDeviceSpeechVoice({speechSynthesis:stoppable.synth,Utterance:stoppable.Utterance});await v.load();
  const p=v.speak('This will be interrupted.');await tick();v.stop();stoppable.synth.spoken[0].onerror({error:'interrupted'});
  await assert.rejects(p,{name:'AbortError'});assert.ok(stoppable.synth.cancelled>=1);
});

test('MCP tool manifest matches the code, validates input and forwards to the SDK',async()=>{
  const {VOICE_TOOL_DEFINITIONS,createVoiceTools}=await esm('voice-tools.js');
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','contracts','voice-tools.v1.json'),'utf8'));
  assert.deepEqual(manifest.tools,JSON.parse(JSON.stringify(VOICE_TOOL_DEFINITIONS)));
  const calls=[];const client=new Proxy({},{get:(_,name)=>(...args)=>{calls.push([name,...args]);return Promise.resolve({ok:true,name});}});
  const tools=Object.fromEntries(createVoiceTools(client).map(t=>[t.name,t]));
  assert.deepEqual(Object.keys(tools).sort(),['voice_device_profile','voice_diagnostics','voice_list_voices','voice_select_voice','voice_self_test','voice_speak','voice_status','voice_stop']);
  const result=await tools.voice_speak.handler({text:'Hello'});assert.deepEqual(calls[0],['speak','Hello']);assert.equal(JSON.parse(result.content[0].text).ok,true);
  await assert.rejects(tools.voice_speak.handler({text:''}),/text must be/);await assert.rejects(tools.voice_speak.handler({text:'x'.repeat(12001)}),/text must be/);
  await assert.rejects(tools.voice_select_voice.handler({}),/voicePackageId/);
  await tools.voice_self_test.handler({audible:true,junk:1});assert.deepEqual(calls.at(-1),['selfTest',{audible:true,bridgeUrl:undefined,bearerToken:undefined}]);
  for(const t of Object.values(tools))assert.equal(t.inputSchema.additionalProperties,false);
});
test('contract defaults: Kokoro is the default voice; the clone is listed as optional',()=>{
  const c=JSON.parse(fs.readFileSync(path.join(__dirname,'..','contracts','voice-fabric.v1.json'),'utf8'));
  assert.equal(c.defaultVoice,'kokoro-am_michael');assert.deepEqual(c.optionalVoices,['agent-lee-voice-one']);
  for(const cmd of ['status','probeDevice','getDiagnostics','selfTest'])assert.ok(cmd in c.commands,cmd);
  const profile=JSON.parse(fs.readFileSync(path.join(__dirname,'..','profiles','agent-lee-active-voice.v1.json'),'utf8'));
  assert.equal(profile.voicePackageId,'kokoro-am_michael');assert.equal(profile.offlinePolicy.silentSubstitution,false);
});
