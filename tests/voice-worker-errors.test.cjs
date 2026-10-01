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
