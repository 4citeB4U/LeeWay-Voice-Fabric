/* Live lab acceptance: real Chatterbox inference and real HTMLAudioElement.
 * Run with a browser user gesture. No mock, preview recording or substitute voice.
 * The play wrapper observes the existing engine without changing its result.
 */
(()=>{
 if(globalThis.__voiceP2FreshEvidence?.status==='RUNNING')throw new Error('Fresh speech gate already running');
 const evidence=globalThis.__voiceP2FreshEvidence={schema:'leeway.voice.p2.fresh-speech.v1',startedAt:new Date().toISOString(),status:'RUNNING',checks:[],humanAudibility:'AWAITING_CREATOR',microphoneRtcReasoning:'NOT_TESTED',formulaExecution:'NOT_EXECUTED'};
 const gate=globalThis.LeeWayVoiceLiveGate,Voice=globalThis.LeeWayBrowserVoice;
 const originalPlay=Voice.prototype.play;let engine;
 Voice.prototype.play=function(...args){engine=this;return originalPlay.apply(this,args);};
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(condition,name,detail={})=>{evidence.checks.push({name,pass:!!condition,...detail});if(!condition)throw new Error(name);};
 const until=async(predicate,name,timeout=120000)=>{const start=performance.now();while(!predicate()){if(performance.now()-start>timeout)throw new Error('Timeout: '+name);if(document.querySelector('#state').textContent.startsWith('ERROR:'))throw new Error(document.querySelector('#state').textContent);await wait(50);}};
 const initialText=document.querySelector('#text').value;
 globalThis.LeeWayVoiceMetrics.clear();
 (async()=>{
  try{
   assert(JSON.parse(document.querySelector('#gateSnapshot').textContent).ready,'canonical engine is ready before testing');
   const voicePackageId=gate.snapshot().voicePackageId;
   assert(voicePackageId==='agent-lee-voice-one','Voice One is bound');
   const task=document.querySelector('#speak').onclick();
   await until(()=>engine?.sources.size&&[...engine.sources][0].media.currentTime>.15,'fresh synthesized audio');
   const media=[...engine.sources][0].media,epoch=engine.epoch;
   const metrics=globalThis.LeeWayVoiceMetrics.snapshot();
   assert(metrics.some(e=>e.stage==='tts-start')&&metrics.some(e=>e.stage==='tts-ready')&&metrics.some(e=>e.stage==='playback-start'),'new text passed through neural synthesis and started real playback',{device:engine.device});
   await document.querySelector('#pause').onclick();const pausedAt=media.currentTime;await wait(400);
   assert(media.paused&&Math.abs(media.currentTime-pausedAt)<.05&&engine.epoch===epoch,'pause retains fresh audio position and generation',{pausedAt,afterPause:media.currentTime});
   await document.querySelector('#resume').onclick();await until(()=>media.currentTime>pausedAt+.15,'resume playback',5000);
   assert([...engine.sources][0]?.media===media&&!media.paused,'resume continues the same newly generated media',{resumedAt:media.currentTime});
   await document.querySelector('#interrupt').onclick();await task;await wait(700);
   assert(media.paused&&engine.sources.size===0&&engine.epoch>epoch&&!engine.activeStream,'interruption stops current speech and invalidates stream');
   await document.querySelector('#resume').onclick();await wait(300);
   assert(engine.sources.size===0,'resume does not replay discarded speech');
   assert(gate.snapshot().voicePackageId===voicePackageId,'voicePackageId remains stable across all controls');
   document.querySelector('#text').value='Speaking on main. Leonard, the new speech turn is ready for your listening test.';
   const freshTask=document.querySelector('#speak').onclick();
   await until(()=>engine.sources.size&&[...engine.sources][0].media.currentTime>.1,'new turn after interruption');
   assert(true,'new neural speech turn starts after interruption');
   await Promise.race([freshTask,wait(60000).then(()=>{throw new Error('Fresh turn did not finish');})]);
   assert(globalThis.LeeWayVoiceMetrics.snapshot().some(e=>e.stage==='segment-rendered'),'new turn completes actual playout');
   evidence.status='PASS';
  }catch(error){evidence.status='FAIL';evidence.error=error.message;await gate.control('speech.stop').catch(()=>{});}
  finally{Voice.prototype.play=originalPlay;document.querySelector('#text').value=initialText;evidence.finishedAt=new Date().toISOString();evidence.metrics=globalThis.LeeWayVoiceMetrics.snapshot();evidence.final=gate.snapshot();}
 })();
 return {status:'STARTED',evidenceKey:'__voiceP2FreshEvidence'};
})();
