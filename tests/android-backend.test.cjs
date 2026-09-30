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
