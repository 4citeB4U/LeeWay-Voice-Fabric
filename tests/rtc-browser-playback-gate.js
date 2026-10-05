/* Run in the candidate lab via a browser's evaluation API with a user gesture.
 * Real HTMLAudioElement playback of the existing Voice One WAV, NOT TTS inference.
 * No ready flag, neural worker, provider, or upstream reasoning is mocked/promoted.
 */
(async()=>{
  const {createRtcVoiceBinding,normalizeRtcVoiceEvent}=await import(new URL('src/edge-rtc-voice-adapter.js',location.href));
  const checks=[];
  const assert=(condition,name,detail={})=>{checks.push({name,pass:!!condition,...detail});if(!condition)throw new Error(name);};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const until=async(predicate,label)=>{const start=performance.now();while(!predicate()){if(performance.now()-start>5000)throw new Error('Timeout: '+label);await wait(30);}};
  const voice=new globalThis.LeeWayBrowserVoice();
  const binding=createRtcVoiceBinding({voice,sessionId:'p2-browser-fixture',voicePackageId:'agent-lee-voice-one'});
  const ctx=new AudioContext();
  let failure=null;
  try{
    const response=await fetch(new URL('voices/agent-lee-preview.wav',location.href));
    assert(response.ok,'versioned Voice One sample is reachable');
    const bytes=await response.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const decoded=await ctx.decodeAudioData(bytes),samples=decoded.getChannelData(0).slice();
    let energy=0;for(const x of samples)energy+=x*x;
    assert(energy/samples.length>0,'fixture has nonzero audio',{durationSeconds:decoded.duration,sha256:digest});
    const epoch=voice.epoch;let playError;
    const playing=voice.play({audio:samples.buffer,sampleRate:decoded.sampleRate},epoch).catch(e=>{playError=e;});
    await until(()=>voice.sources.size===1&&[...voice.sources][0].media.currentTime>.15,'real media progression');
    const source=[...voice.sources][0],media=source.media;
    assert(!media.paused&&media.currentTime>.15,'HTMLAudioElement starts and its clock advances');
    await binding.handle({type:'speech.pause',sessionId:'p2-browser-fixture'});
    const pausedAt=media.currentTime;await wait(350);
    assert(media.paused&&Math.abs(media.currentTime-pausedAt)<.05&&voice.epoch===epoch,'pause freezes position without invalidation',{pausedAt,afterPause:media.currentTime});
    await binding.handle({type:'speech.resume',sessionId:'p2-browser-fixture'});
    await until(()=>media.currentTime>pausedAt+.15,'resume progression');
    assert([...voice.sources][0]===source&&!media.paused,'resume continues the same media object',{resumedAt:media.currentTime});
    const stopped=await binding.handle({type:'barge-in',sessionId:'p2-browser-fixture'});await playing;
    assert(media.paused&&!media.getAttribute('src')&&voice.sources.size===0&&playError?.name==='AbortError','barge-in detaches media and rejects old playback');
    let staleRejected=false;try{await voice.play({audio:samples.buffer,sampleRate:decoded.sampleRate},epoch);}catch(e){staleRejected=e.name==='AbortError';}
    assert(staleRejected&&voice.sources.size===0,'stale-epoch audio cannot restart');
    await binding.handle({type:'speech.resume',sessionId:'p2-browser-fixture'});await wait(150);
    assert(voice.sources.size===0&&stopped.voicePackageId===binding.snapshot().voicePackageId,'resume after interruption does not resurrect audio or change package');
    const input=normalizeRtcVoiceEvent({type:'transcript.final',sessionId:'p2-browser-fixture',text:'  Speaking on main.  '});
    assert(input.text==='Speaking on main.'&&input.personaAuthority==='UPSTREAM_AGENT_LEE_RUNTIME','browser executes transcript normalization with upstream persona authority');
  }catch(error){failure=error.message;}
  finally{binding.dispose();await voice.dispose();await ctx.close();}
  const result={schema:'leeway.voice.p2.browser-playback.v1',at:new Date().toISOString(),page:location.href,
    status:failure?'FAIL':'PASS',failure,checks,voicePackageId:'agent-lee-voice-one',
    audioSource:'versioned Voice One sample fixture',freshTextSynthesis:'NOT_EXECUTED',
    microphoneRtcReasoning:'NOT_TESTED',humanAudibility:'AWAITING_CREATOR',formulaExecution:'NOT_EXECUTED'};
  globalThis.__voiceP2BrowserEvidence=result;
  return JSON.stringify(result);
})();
