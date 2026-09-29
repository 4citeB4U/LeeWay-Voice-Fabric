const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
 const scope={performance,DOMException,AbortController,Event,setTimeout,clearTimeout,URL,console};vm.createContext(scope);
 for(const file of ['browser-voice.js','speech-pipeline.js'])vm.runInContext(fs.readFileSync(__dirname+'/../src/'+file,'utf8'),scope);
 const voice=new scope.LeeWayBrowserVoice();voice.ready=true;
 return {voice,Stream:scope.LeeWaySpeechStream,metrics:scope.LeeWayVoiceMetrics};
}
test('first complete clause reaches synthesis before model completion',async()=>{
 const {voice,Stream}=setup(),stream=new Stream(),requests=[];voice.request=async(type,data)=>{requests.push(data.text);return {}};voice.play=async()=>{};
 const run=voice.speakStream(stream);stream.push('This first sentence contains enough words to make a useful spoken opening. ');await tick();assert.deepEqual(requests,['This first sentence contains enough words to make a useful spoken opening.']);
 stream.push('Here is another sentence.');stream.end();await run;assert.equal(requests.length,2);
});
test('prepares exactly one following segment during playout, preserving order',async()=>{
 const {voice,Stream}=setup(),stream=new Stream(),requested=[],played=[],finish=[];
 voice.request=async(type,data)=>{requested.push(data.text);return {text:data.text}};
 voice.play=result=>new Promise(resolve=>{played.push(result.text);finish.push(resolve)});
 stream.push('This is sentence one with enough words for a useful spoken segment. This is sentence two with enough words for a useful spoken segment. This is sentence three with enough words for a useful spoken segment.');stream.end();
 const run=voice.speakStream(stream);await tick();assert.equal(requested.length,2);assert.equal(played.length,1);
 finish.shift()();await tick();assert.equal(requested.length,3);assert.equal(played.length,2);
 finish.shift()();await tick();finish.shift()();await run;assert.deepEqual(played,requested);
});
test('Stop while awaiting next model clause terminates stream and rejects later tokens',async()=>{
 const {voice,Stream}=setup(),stream=new Stream();voice.request=async()=>({});voice.play=async()=>{};
 const run=voice.speakStream(stream),rejection=assert.rejects(run,{name:'AbortError'});await tick();voice.stop();stream.push('These words must never play.');await rejection;
});
test('abort suppresses a prefetched result and records only completed playout',async()=>{
 const {voice,Stream}=setup(),control=new AbortController(),stream=new Stream(control.signal);let resolveNext,played=0,rendered=0;
 voice.request=async()=>{if(!played)return {};return new Promise(resolve=>resolveNext=resolve)};
 voice.play=async()=>{played++;control.abort()};stream.push('This is sentence one with enough words for a useful spoken segment. This is sentence two with enough words for a useful spoken segment.');stream.end();
 await assert.rejects(voice.speakStream(stream,{signal:control.signal,onRendered:()=>rendered++}),{name:'AbortError'});
 resolveNext?.({});await tick();assert.equal(played,1);assert.equal(rendered,0);
});
test('chunker preserves abbreviations and decimal numbers and bounds backlog',async()=>{
 const {Stream}=setup(),s=new Stream();s.push('Please speak with Dr. Lee about the number 3.14 later today. More words are coming.');s.end();
 const result=[];for await(const chunk of s)result.push(chunk);assert.equal(result[0],'Please speak with Dr. Lee about the number 3.14 later today.');
 const full=new Stream();full.push('x'.repeat(12001));await assert.rejects(full.next(),/queue is full/);
});
test('timing log is bounded and excludes text payloads from synthesis events',async()=>{
 const {voice,Stream,metrics}=setup(),s=new Stream();voice.request=async()=>({timings:{generationMs:10}});voice.play=async()=>{};s.push('Private words stay off reports.');s.end();await voice.speakStream(s);
 assert.ok(!JSON.stringify(metrics.snapshot()).includes('Private words'));for(let i=0;i<600;i++)metrics.record('test');assert.equal(metrics.snapshot().length,500);
});
test('unpunctuated streaming text flushes at the dwell deadline without waiting for model completion',async()=>{
 const {Stream}=setup(),stream=new Stream();stream.push('These ten complete words can start playing without a sentence ending ');
 const result=await stream.next();assert.equal(result.done,false);assert.equal(result.value,'These ten complete words can start playing without a sentence ending');stream.end();assert.equal((await stream.next()).done,true);
});
test('a synthesis failure stops the stream and does not report unplayed content as rendered',async()=>{
 const {voice,Stream}=setup(),stream=new Stream();let rendered=0,played=0;
 voice.request=async()=>{throw new Error('GPU unavailable')};voice.play=async()=>played++;
 stream.push('This sentence cannot be synthesized. ');stream.end();
 await assert.rejects(voice.speakStream(stream,{onRendered:()=>rendered++}),/GPU unavailable/);assert.equal(played,0);assert.equal(rendered,0);assert.equal(stream.closed,true);
});
