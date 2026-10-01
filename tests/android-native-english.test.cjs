const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/android-bridge.js','utf8').replace(/^import .*;$/gm,'');
function setup(bound=true){
 const calls=[],events=[];let context;
 const pkg={id:'android-installed-english',name:'Android English',provider:'android-tts',status:'AVAILABLE'};
 context=vm.createContext({URLSearchParams,DOMException,Date,setTimeout,clearTimeout,document:{querySelector:()=>null},
 LeeWayBrowserVoice:class{load(){throw Error('Unexpected Chatterbox load')}stop(){}async dispose(){}},
 voiceRegistry:{list:async()=>[pkg],get:async id=>id===pkg.id?pkg:null,audio(){throw Error('Native provider must not load reference')}},
 LeeWayPocketNative:{onReady:value=>events.push(JSON.parse(value))},
 ...(bound?{LeeWayPocketEnglish:{prepare(id){calls.push(['prepare',id]);},speak(id,text){calls.push(['speak',id,text]);},stop(){calls.push(['stop']);}}}:{})});
 vm.runInContext(source,context);
 const reply=(id,result={},error)=>context.LeeWayEnglishResult({id,result,error});
 return {api:context.LeeWayAndroidVoice,calls,events,reply};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('native provider is host gated, no fallback or browser model download',async()=>{
 const absent=setup(false);assert.equal((await absent.api.list())[0].adapterAvailable,false);
 await assert.rejects(absent.api.select('android-installed-english'),/NOT_BOUND/);
 const {api,calls,events,reply}=setup();await api.select('android-installed-english');
 const prepared=api.prepare();await tick();reply(calls.find(c=>c[0]==='prepare')[1],{engine:'test.engine',voice:'english-1',locale:'en-US'});
 assert.equal((await prepared).actualEngine,'test.engine');assert.equal(events[0].actualVoice,'english-1');
 const spoken=api.speak('Four.');await tick();const command=calls.find(c=>c[0]==='speak');assert.equal(command[2],'Four.');reply(command[1],{completed:true});
 assert.equal((await spoken).voicePackageId,'android-installed-english');
 assert.equal(api.status().ready,true);
});
test('native errors propagate and stop rejects outstanding speech without stale completion',async()=>{
 const {api,calls,reply}=setup();await api.select('android-installed-english');
 const prepared=api.prepare();await tick();reply(calls.find(c=>c[0]==='prepare')[1],{locale:'en-US'});await prepared;
 const spoken=api.speak('Hello.');const cancelled=assert.rejects(spoken,{name:'AbortError'});await tick();api.stop();await cancelled;
 const late=calls.find(c=>c[0]==='speak')[1];reply(late,{completed:true});
 assert.equal(api.status().speaking,false);assert.equal(api.status().ready,true);
 const failed=api.speak('Again.');const rejected=assert.rejects(failed,/engine failed/);await tick();reply(calls.filter(c=>c[0]==='speak').at(-1)[1],null,'engine failed');await rejected;
 await assert.rejects(api.streamStart('unsupported'),/STREAMING_UNSUPPORTED/);
});
