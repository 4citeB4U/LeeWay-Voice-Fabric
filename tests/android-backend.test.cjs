const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const test=require('node:test');
const source=fs.readFileSync('src/android-bridge.js','utf8').replace(/^import .*;$/m,'');
for(const [search,expected] of [['','auto'],['?device=wasm','wasm'],['?device=untrusted','auto']]){
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
 LeeWayBrowserVoice:class{async load(){return {device:'wasm'};}async setReference(){}setPace(){}},
 voiceRegistry:{get:async()=>({provider:'chatterbox',pace:1.1,exaggeration:.25}),audio:async()=>({})},
 LeeWayPocketNative:{onReady:json=>ready=JSON.parse(json)}};
 vm.runInNewContext(source,context);
 const result=await context.LeeWayAndroidVoice.prepare();
 assert.equal(result.device,'wasm');assert.equal(ready.device,'wasm');assert.equal(ready.ready,true);
});
