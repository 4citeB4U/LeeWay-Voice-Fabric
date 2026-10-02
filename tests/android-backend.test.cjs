const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const test=require('node:test');
const source=fs.readFileSync('src/android-bridge.js','utf8').replace(/^import .*;$/m,'');
for(const [search,expected] of [['','auto'],['?device=wasm','auto'],['?device=untrusted','auto']]){
 test('Android Voice One backend '+(search||'default'),()=>{
  let selected;
  const context={URLSearchParams,location:{search},document:{querySelector:()=>null},LeeWayBrowserVoice:class{constructor(options){selected=options.device;}},voiceRegistry:{}};
  vm.runInNewContext(source,context);
  assert.equal(selected??'auto',expected);
  assert.equal(context.LeeWayAndroidVoice.voicePackageId,'agent-lee-voice-one');
 });
}
test('Android readiness reports the backend that actually loaded',async()=>{
 let ready;
 const context={URLSearchParams,location:{search:'?device=wasm'},document:{querySelector:()=>null},
 LeeWayBrowserVoice:class{async load(){this.ready=true;return {device:'wasm'};}async setReference(){}setPace(){}},
 voiceRegistry:{get:async()=>({provider:'chatterbox',pace:1.1,exaggeration:.25}),audio:async()=>({})},
 LeeWayPocketNative:{onReady:json=>ready=JSON.parse(json)}};
 vm.runInNewContext(source,context);
 const result=await context.LeeWayAndroidVoice.prepare();
 assert.equal(result.device,'wasm');assert.equal(ready.device,'wasm');assert.equal(ready.ready,true);
});
test('terminated worker clears Android ready and permits a fresh prepare',async()=>{
 let options,instance,loads=0;
 const context={URLSearchParams,document:{querySelector:()=>null},
 LeeWayBrowserVoice:class{constructor(o){options=o;instance=this;}async load(){loads++;this.ready=true;return {device:'wasm'};}async setReference(){}setPace(){}},
 voiceRegistry:{get:async()=>({provider:'chatterbox',pace:1.1,exaggeration:.25}),audio:async()=>({})}};
 vm.runInNewContext(source,context);
 await context.LeeWayAndroidVoice.prepare();assert.equal(context.LeeWayAndroidVoice.status().ready,true);
 instance.ready=false;options.onUnavailable(Error('timeout'));
 assert.equal(context.LeeWayAndroidVoice.status().ready,false);
 await context.LeeWayAndroidVoice.prepare();assert.equal(loads,2);assert.equal(context.LeeWayAndroidVoice.status().ready,true);
});
