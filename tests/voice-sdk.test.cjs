const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){
 let now=0,next=0,listener;const timers=new Map();
 const frame={contentWindow:{postMessage(){}},setAttribute(){},remove(){this.removed=true;}};
 const context={URL,Uint32Array,crypto:{getRandomValues:a=>a.fill(123)},setTimeout(fn,delay){const id=++next;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),document:{createElement:()=>frame,body:{appendChild(){}}},window:{addEventListener(type,fn){listener=fn;},removeEventListener(){listener=null;}}};
 vm.runInNewContext(fs.readFileSync('src/voice-sdk.js','utf8').replace(/export /g,'')+';globalThis.Client=LeeWayVoiceClient;',context);
 const client=new context.Client();
 const send=(data,overrides={})=>listener?.({origin:'https://4citeb4u.github.io',source:frame.contentWindow,data:{token:client.token,...data},...overrides});
 const advance=ms=>{now+=ms;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
 return {client,timers,frame,send,advance};
}
async function connected(){const h=harness();const ready=h.client.connect();h.send({type:'voice.ready'});await ready;return h;}
test('authenticated progress refreshes preparation only; ordinary selection retains deadline',async()=>{
 const h=await connected(),prepare=h.client.prepare(),selection=h.client.selectVoice('agent-lee-voice-one');
 const failure=assert.rejects(selection,/timed out/);await Promise.resolve();
 assert.equal(h.client.pending.get(1).command,'prepare');
 h.advance(100000);h.send({type:'voice.state',data:{status:'progress',loaded:10,total:100}});
 assert.equal(h.timers.get(h.client.pending.get(1).timer).at,1000000);
 h.advance(20000);await failure;h.advance(800000);assert.equal(h.client.pending.has(1),true);
 h.send({replyTo:1,ok:true,data:{ready:true}});await prepare;assert.equal(h.timers.size,0);
});
test('wrong origin/source/token and unrelated events cannot extend preparation',async()=>{
 const h=await connected(),prepare=h.client.prepare();const failure=assert.rejects(prepare,/stopped reporting progress/);await Promise.resolve();
 const initial=h.client.pending.get(1).timer;h.advance(200000);
 const data={type:'voice.state',data:{status:'progress',progress:42}};
 h.send(data,{origin:'https://untrusted.example'});h.send(data,{source:{}});h.send({...data,token:'wrong'});
 h.send({type:'voice.error',data:{message:'unrelated'}});h.send({type:'voice.state',data:{message:'Generating speech'}});
 assert.equal(h.client.pending.get(1).timer,initial);h.advance(700000);await failure;assert.equal(h.timers.size,0);
});
test('destroy clears connection and pending preparation timers and iframe',async()=>{
 const first=harness(),ready=first.client.connect(),failed=assert.rejects(ready,/destroyed/);
 first.client.destroy();await failed;assert.equal(first.timers.size,0);assert.equal(first.frame.removed,true);
 const h=await connected(),prepare=h.client.prepare(),rejected=assert.rejects(prepare,/destroyed/);await Promise.resolve();
 h.send({type:'voice.state',data:{status:'progress',progress:12}});h.client.destroy();await rejected;
 assert.equal(h.timers.size,0);assert.equal(h.client.pending.size,0);
});

test('destroy before a queued call resumes cannot create a new pending timer',async()=>{
 const h=await connected(),prepare=h.client.prepare(),failed=assert.rejects(prepare,/destroyed/);
 h.client.destroy();await failed;assert.equal(h.timers.size,0);assert.equal(h.client.pending.size,0);
 await assert.rejects(h.client.connect(),/destroyed/);
});
