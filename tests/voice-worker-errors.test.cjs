const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('stop message cannot steal the active request error destination',async()=>{
 const messages=[],listeners={};
 const context=vm.createContext({env:{backends:{onnx:{wasm:{},webgpu:{}}}},URL,
 InterruptableStoppingCriteria:class{interrupt(){}},
 self:{location:{href:'https://example.test/worker.js'},postMessage:m=>messages.push(m),addEventListener:(n,f)=>listeners[n]=f}});
 vm.runInContext(fs.readFileSync('src/chatterbox.worker.js','utf8').replace(/^import .*;$/gm,''),context);
 vm.runInContext('run=async()=>new Promise(()=>{});self.onmessage({data:{id:42,type:"load"}})',context);
 await new Promise(r=>setImmediate(r));
 vm.runInContext('self.onmessage({data:{type:"stop",epoch:1}})',context);
 listeners.unhandledrejection({preventDefault(){},reason:Error('network failure')});
 assert.equal(messages.at(-1).id,42);assert.equal(messages.at(-1).data.fatal,true);
});
test('inference timeout invalidates readiness and notifies native adapter',async()=>{
 let deadline,unavailable;
 class Worker{postMessage(){}terminate(){this.terminated=true;}}
 const context=vm.createContext({Worker,URL,DOMException,setTimeout:fn=>{deadline=fn;return 1;},clearTimeout(){}});
 vm.runInContext(fs.readFileSync('src/browser-voice.js','utf8'),context);
 const voice=vm.runInContext('new LeeWayBrowserVoice()',context);
 voice.options.onUnavailable=error=>unavailable=error;
 voice.ready=true;
 const generation=voice.request('generate'),failed=assert.rejects(generation,/too long/);
 deadline();await failed;
 assert.equal(voice.ready,false);assert.equal(voice.worker,null);assert.match(unavailable.message,/too long/);
});
test('failed preparation terminates poisoned worker and next request creates another',async()=>{
 const workers=[];
 class Worker{constructor(){workers.push(this);}postMessage(m){this.last=m;}terminate(){this.terminated=true;}}
 const context=vm.createContext({Worker,URL,setTimeout,clearTimeout,DOMException});
 vm.runInContext(fs.readFileSync('src/browser-voice.js','utf8'),context);
 const voice=vm.runInContext('new LeeWayBrowserVoice()',context);
 const first=voice.request('load'),rejected=assert.rejects(first,/network failure/);
 workers[0].onmessage({data:{id:1,type:'error',data:{message:'network failure',fatal:true}}});
 await rejected;assert.equal(workers[0].terminated,true);assert.equal(voice.worker,null);
 const second=voice.request('load');assert.equal(workers.length,2);
 workers[1].onmessage({data:{id:2,type:'complete',data:{device:'wasm'}}});
 assert.equal((await second).device,'wasm');
});

test('late native dispatch after stop receives AbortError without starting native work',async()=>{
 const sent=[];let calls=0;
 class Worker{postMessage(m){sent.push(m)}terminate(){}}
 const context=vm.createContext({Worker,URL,DOMException,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync('src/browser-voice.js','utf8'),context);
 const voice=vm.runInContext('new LeeWayBrowserVoice()',context);
 voice.nativeDecoder={request(){calls++;return Promise.resolve({})},cancel(){}};
 const pending=voice.request('generate');const rejected=assert.rejects(pending,{name:'AbortError'});
 voice.stop();await rejected;
 voice.worker.onmessage({data:{id:1,type:'native-decoder',data:{callId:9,operation:'decode',payload:{}}}});
 assert.equal(calls,0);assert.equal(sent.at(-1).errorName,'AbortError');assert.equal(sent.at(-1).callId,9);
});

test('worker stop rejects in-flight native RPC and releases its serial lane',async()=>{
 const messages=[];
 const context=vm.createContext({env:{backends:{onnx:{wasm:{},webgpu:{}}}},URL,
 InterruptableStoppingCriteria:class{interrupt(){}},
 self:{location:{href:'https://example.test/worker.js'},postMessage:m=>messages.push(m),addEventListener(){}}});
 vm.runInContext(fs.readFileSync('src/chatterbox.worker.js','utf8').replace(/^import .*;$/gm,''),context);
 vm.runInContext("run=async m=>m.type==='generate'?nativeRequest('decode',{}):{};self.onmessage({data:{id:1,type:'generate',epoch:0}})",context);
 await new Promise(r=>setImmediate(r));
 assert.equal(messages[0].type,'native-decoder');
 vm.runInContext("self.onmessage({data:{type:'stop',epoch:1}});self.onmessage({data:{id:2,type:'speaker',epoch:1}})",context);
 await new Promise(r=>setImmediate(r));
 assert.equal(messages.find(m=>m.id===1&&m.type==='error').data.name,'AbortError');
 assert.equal(messages.at(-1).id,2);assert.equal(messages.at(-1).type,'complete');
 assert.equal(vm.runInContext('nativePending.size',context),0);
});
