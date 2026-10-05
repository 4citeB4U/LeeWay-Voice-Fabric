const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// Load and EXECUTE the ESM adapter. Source-string assertions are not evidence.
const adapter = import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(root,'src/edge-rtc-voice-adapter.js'),'utf8')).toString('base64'));
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject}; };
const pcm = () => ({audio:new Float32Array(240).fill(.1).buffer,sampleRate:24000});
function engine() {
  const media=[];
  class Audio {
    constructor(url){this.src=url;this.paused=true;this.currentTime=0;this.plays=0;media.push(this);}
    play(){this.paused=false;this.plays++;this.onplaying?.();return Promise.resolve();}
    pause(){this.paused=true;}
    removeAttribute(name){if(name==='src')this.src='';}
    load(){}
    end(){this.onended?.();}
  }
  const scope={performance,DOMException,AbortController,Event,setTimeout,clearTimeout,URL,URLSearchParams,Blob,Audio,console};
  vm.createContext(scope);
  for(const file of ['browser-voice.js','speech-pipeline.js'])vm.runInContext(fs.readFileSync(path.join(root,'src',file),'utf8'),scope);
  const voice=new scope.LeeWayBrowserVoice();voice.ready=true;voice.request=async()=>pcm();
  return {voice,media,scope,Stream:scope.LeeWaySpeechStream};
}
async function fixture(options={}) {
  const state=engine();let identity='agent-lee-voice-one';
  const {createRtcVoiceBinding}=await adapter;
  const binding=createRtcVoiceBinding({voice:state.voice,sessionId:'main',voicePackageId:identity,getVoicePackageId:()=>identity,...options});
  const event=(type,extra={})=>binding.handle({type,sessionId:'main',...extra});
  return {...state,binding,event,changeIdentity:id=>identity=id};
}
for(const [type,kind,action] of [['transcript.final','voice.input.final',undefined],['speech.stop','voice.control','stop'],['speech.pause','voice.control','pause'],['speech.resume','voice.control','resume'],['barge-in','voice.interrupt','invalidate-stale-speech']]){
  test('executes normalization: '+type,async()=>{
    const {normalizeRtcVoiceEvent}=await adapter;
    const result=normalizeRtcVoiceEvent({type,sessionId:'main',text:'  Hello.  '});
    assert.equal(result.kind,kind);assert.equal(result.action,action);assert.equal(result.sessionId,'main');
    assert.equal(result.voiceAuthority,'4citeB4U/LeeWay-Voice-Fabric');
    if(type==='transcript.final'){assert.equal(result.text,'Hello.');assert.equal(result.personaAuthority,'UPSTREAM_AGENT_LEE_RUNTIME');}
  });
}
test('rejects malformed inputs, missing identity, non-text transcripts and unsupported events',async()=>{
  const {normalizeRtcVoiceEvent:n}=await adapter;
  for(const input of [undefined,null,[],5,'event',{}, {type:'speech.stop',sessionId:5}, {type:'speech.stop',sessionId:' '}, {type:'transcript.final',sessionId:'main',text:3}, {type:'transcript.final',sessionId:'main',text:' '}]) assert.throws(()=>n(input));
  assert.throws(()=>n({type:'unknown',sessionId:'main'}),/UNSUPPORTED/);
});
test('final transcript is handed upstream once and is never echoed into TTS',async()=>{
  const inputs=[];const f=await fixture({onTranscript:input=>inputs.push(input)});
  await f.event('transcript.final',{text:'  Tell me a story.  ',personaAuthority:'INJECTED'});
  assert.equal(inputs.length,1);assert.equal(inputs[0].text,'Tell me a story.');
  assert.equal(inputs[0].personaAuthority,'UPSTREAM_AGENT_LEE_RUNTIME');
  assert.equal(inputs[0].voicePackageId,'agent-lee-voice-one');assert.equal(f.media.length,0);
});
test('missing upstream handler fails instead of pretending to perform reasoning',async()=>{
  const f=await fixture();await assert.rejects(f.event('transcript.final',{text:'Hello'}),/UPSTREAM_HANDLER_REQUIRED/);assert.equal(f.media.length,0);
});
test('adapter passes upstream persona text and options unchanged to canonical speech',async()=>{
  const f=await fixture(),received=[];const text='  Speaking on main. Leonard, letâ€™s make this count.  ';const options={onState(){}};
  f.voice.speak=async(...args)=>received.push(args);
  const result=await f.binding.speak(text,options);
  assert.equal(received[0][0],text);assert.equal(received[0][1],options);assert.equal(result.voicePackageId,'agent-lee-voice-one');
});
test('pause/resume retains the actual media object, playback position, epoch and voice identity',async()=>{
  const f=await fixture();const run=f.binding.speak('Speaking on main. This is the first live sentence.');await tick();
  assert.equal(f.media.length,1);const media=f.media[0],epoch=f.voice.epoch;media.currentTime=1.75;
  const paused=await f.event('speech.pause');assert.equal(media.paused,true);assert.equal(paused.paused,true);assert.equal(f.voice.epoch,epoch);
  const resumed=await f.event('speech.resume');assert.equal(media.paused,false);assert.equal(media.currentTime,1.75);assert.equal(f.media.length,1);
  assert.equal(resumed.voicePackageId,paused.voicePackageId);assert.equal(f.voice.epoch,epoch);media.end();await run;
});
test('pause during slow synthesis prevents later audio from starting until resume',async()=>{
  const f=await fixture(),pending=deferred();f.voice.request=()=>pending.promise;
  const run=f.binding.speak('This sentence finishes synthesizing after pause.');await tick();await f.event('speech.pause');
  pending.resolve(pcm());await tick();assert.equal(f.media.length,1);assert.equal(f.media[0].plays,0);assert.equal(f.media[0].paused,true);
  await f.event('speech.resume');assert.equal(f.media[0].plays,1);f.media[0].end();await run;
});
for(const type of ['speech.stop','barge-in'])test(type+' stops active media, invalidates queue and rejects the interrupted task',async()=>{
  const f=await fixture();const run=f.binding.speak('This is an active spoken sentence.');const rejected=assert.rejects(run,{name:'AbortError'});await tick();const epoch=f.voice.epoch;
  const result=await f.event(type);await rejected;
  assert.ok(f.voice.epoch>epoch);assert.equal(f.media[0].paused,true);assert.equal(f.media[0].src,'');assert.equal(result.activeSources,0);assert.equal(result.bufferedCharacters,0);
  assert.equal(result.voicePackageId,'agent-lee-voice-one');
});
test('late audio generation after barge-in can never start playback',async()=>{
  const f=await fixture(),pending=deferred();f.voice.request=()=>pending.promise;
  const run=f.binding.speak('A late waveform must be thrown away.');const rejected=assert.rejects(run,{name:'AbortError'});await tick();
  await f.event('barge-in');pending.resolve(pcm());await rejected;await tick();assert.equal(f.media.length,0);assert.equal(f.voice.sources.size,0);
});
test('barge-in discards speculative next audio and stops the current audio without queue resurrection',async()=>{
  const f=await fixture(),next=deferred();let requests=0;
  f.voice.request=()=>++requests===1?Promise.resolve(pcm()):next.promise;
  const text='This is sentence one with enough words for a useful spoken segment. This is sentence two with enough words for a useful spoken segment. This is sentence three with enough words for a useful spoken segment.';
  const run=f.binding.speak(text);const rejected=assert.rejects(run,{name:'AbortError'});await tick();assert.equal(requests,2);assert.equal(f.media.length,1);
  await f.event('barge-in');await rejected;next.resolve(pcm());await tick();assert.equal(f.media.length,1);assert.equal(f.voice.sources.size,0);assert.equal(requests,2);
});
test('stop while paused then resume never replays discarded content; a fresh turn still works',async()=>{
  const f=await fixture();const old=f.binding.speak('This speech will be discarded.');const rejected=assert.rejects(old,{name:'AbortError'});await tick();
  await f.event('speech.pause');await f.event('speech.stop');await rejected;await f.event('speech.resume');
  assert.equal(f.media.length,1);assert.equal(f.media[0].plays,1);assert.equal(f.media[0].paused,true);
  const fresh=f.binding.speak('Only this new sentence may speak.');await tick();assert.equal(f.media.length,2);f.media[1].end();await fresh;
});
test('wrong-session and wrong-package commands cannot stop current speech',async()=>{
  const f=await fixture();const run=f.binding.speak('The other session must not stop this sentence.');await tick();const epoch=f.voice.epoch;
  await assert.rejects(f.event('speech.stop',{sessionId:'other'}),/SESSION_MISMATCH/);
  await assert.rejects(f.event('speech.stop',{voicePackageId:'other'}),/PACKAGE_MISMATCH/);
  assert.equal(f.voice.epoch,epoch);assert.equal(f.media[0].paused,false);f.media[0].end();await run;
});
test('voice identity drift fails closed rather than silently switching speakers',async()=>{
  const f=await fixture();const run=f.binding.speak('Keep one stable voice identity.');const rejected=assert.rejects(run,{name:'AbortError'});await tick();
  f.changeIdentity('other-voice');await assert.rejects(f.event('speech.resume'),/IDENTITY_DRIFT/);await rejected;assert.equal(f.voice.sources.size,0);
});
test('disposed RTC binding rejects new events and clears speech',async()=>{
  const f=await fixture();f.binding.dispose();f.binding.dispose();assert.equal(f.binding.snapshot().disposed,true);
  await assert.rejects(f.event('speech.resume'),/DISPOSED/);await assert.rejects(f.binding.speak('Do not speak.'),/DISPOSED/);
});
test('SDK pause/resume/interrupt send executable RTC commands bound to the client session',async()=>{
  const scope={crypto:require('node:crypto').webcrypto,Uint32Array,URL,setTimeout,clearTimeout};
  vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(root,'src/voice-sdk.js'),'utf8').replace(/export /g,'')+';globalThis.Client=LeeWayVoiceClient;',scope);
  const client=new scope.Client(),calls=[];client.call=async(command,data)=>calls.push({command,...data});
  await client.pause();await client.resume();await client.interrupt();await client.rtcEvent({type:'speech.stop',sessionId:'forged'});
  assert.deepEqual(calls.map(x=>x.type),['speech.pause','speech.resume','barge-in','speech.stop']);
  assert.ok(calls.every(x=>x.command==='rtcEvent'&&x.sessionId===client.rtcSessionId));
});

async function bridgeFixture(){
 const f=engine(),messages=[];let listener,sequence=0;
 const Original=f.scope.LeeWayBrowserVoice;
 f.scope.LeeWayBrowserVoice=class extends Original{constructor(){super();return f.voice;}};
 f.voice.setReference=async()=>{};
 f.scope.createRtcVoiceBinding=(await adapter).createRtcVoiceBinding;
 f.scope.voiceRegistry={get:async id=>({id,exaggeration:.25,pace:1.22}),audio:async()=>new Blob(['audio'])};
 f.scope.location={hash:'#token=test-owner-token'};
 f.scope.parent={postMessage:message=>messages.push(message)};
 f.scope.addEventListener=(type,fn)=>{if(type==='message')listener=fn;};
 vm.runInContext(fs.readFileSync(path.join(root,'src/bridge-runtime.js'),'utf8').replace(/^import .*?;\r?\n/gm,''),f.scope);
 const send=async(command,data={},overrides={})=>{
  const id=++sequence;
  await listener({source:f.scope.parent,origin:'https://leeway.example',data:{id,scope:'leeway.voice.v1',token:'test-owner-token',command,data},...overrides});
  return messages.find(m=>m.replyTo===id);
 };
 return {...f,messages,send};
}
test('real bridge handler normalizes a final transcript and hands it to its parent without TTS',async()=>{
 const f=await bridgeFixture();const result=await f.send('rtcEvent',{type:'transcript.final',sessionId:'rtc-main',text:'  Ready now.  '});
 assert.equal(result.ok,true);const event=f.messages.find(m=>m.type==='voice.input.final');assert.equal(event.data.text,'Ready now.');
 assert.equal(event.data.personaAuthority,'UPSTREAM_AGENT_LEE_RUNTIME');assert.equal(f.media.length,0);
});
test('SDK message path reaches actual browser pause/resume/stop instead of merely acknowledging strings',async()=>{
 const f=await bridgeFixture();const speech=f.send('speak',{text:'This is the actual bridge speech task.'});await tick();
 const media=f.media[0];media.currentTime=2;
 const paused=await f.send('rtcEvent',{type:'speech.pause',sessionId:'rtc-main'});assert.equal(paused.ok,true);assert.equal(media.paused,true);
 const resumed=await f.send('rtcEvent',{type:'speech.resume',sessionId:'rtc-main'});assert.equal(resumed.ok,true);assert.equal(media.paused,false);assert.equal(media.currentTime,2);
 const stopped=await f.send('rtcEvent',{type:'barge-in',sessionId:'rtc-main'});assert.equal(stopped.data.activeSources,0);
 const reply=await speech;assert.equal(reply.ok,false);assert.equal(media.paused,true);
 assert.equal(stopped.data.voicePackageId,'agent-lee-voice-one');
});
test('bridge rejects foreign source and token before any execution',async()=>{
 const f=await bridgeFixture(),epoch=f.voice.epoch;
 const foreign=await f.send('stop',{}, {source:{postMessage(){throw new Error('must not reply')}}});assert.equal(foreign,undefined);
 const token=await f.send('stop',{}, {data:{id:900,scope:'leeway.voice.v1',token:'wrong',command:'stop'}});assert.equal(token,undefined);assert.equal(f.voice.epoch,epoch);
});
test('bridge streamEnd returns failure for a failed synthesis, never completed true',async()=>{
 const f=await bridgeFixture();f.voice.request=async()=>{throw new Error('inference unavailable')};
 assert.equal((await f.send('streamStart',{streamId:'s1'})).ok,true);
 await f.send('streamChunk',{streamId:'s1',text:'This phrase cannot render.'});
 const ended=await f.send('streamEnd',{streamId:'s1'});assert.equal(ended.ok,false);assert.match(ended.error,/inference unavailable/);assert.equal(f.media.length,0);
});
test('superseding an old stream cannot erase the current stream or accept stale chunks',async()=>{
 const f=await bridgeFixture();await f.send('streamStart',{streamId:'old'});await f.send('streamChunk',{streamId:'old',text:'Old speech is active.'});
 const oldEnd=f.send('streamEnd',{streamId:'old'});await tick();assert.equal(f.media.length,1);
 await f.send('streamStart',{streamId:'new'});await oldEnd;
 assert.equal((await f.send('streamChunk',{streamId:'old',text:'Stale.'})).ok,false);
 assert.equal((await f.send('streamChunk',{streamId:'new',text:'The new speech survives.'})).ok,true);
 const newEnd=f.send('streamEnd',{streamId:'new'});await tick();assert.equal(f.media.length,2);f.media[1].end();
 const result=await newEnd;assert.equal(result.ok,true);assert.equal(result.data.completed,true);
});
