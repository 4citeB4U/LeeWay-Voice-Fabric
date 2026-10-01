const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/android-bridge.js','utf8').replace(/^import .*;$/gm,'');
const packages=[{id:'agent-lee-voice-one',name:'Voice One',provider:'chatterbox',status:'AVAILABLE',pace:1.1,exaggeration:.25},
 {id:'chatterbox-default-natural',name:'Natural',provider:'chatterbox',status:'AVAILABLE',pace:1,exaggeration:.5},
 {id:'unbound-native',name:'Native adapter',provider:'not-registered-provider',status:'AVAILABLE'}];
function setup(){
 const used=[],events=[];let instance;
 const context=vm.createContext({URLSearchParams,DOMException,document:{querySelector:()=>null},
  LeeWayBrowserVoice:class{constructor(){instance=this;}async load(_progress,{referenceBlob}){used.push(referenceBlob.id);this.ready=true;return {device:'wasm'};}setPace(){}stop(){}async dispose(){this.ready=false;}async speak(){}},
  voiceRegistry:{list:async()=>packages,get:async id=>packages.find(p=>p.id===id)||null,audio:async id=>({id})},
  LeeWayPocketNative:{onReady:value=>events.push(JSON.parse(value)),onSelection:value=>events.push(JSON.parse(value))}});
 vm.runInContext(source,context);return {api:context.LeeWayAndroidVoice,used,events,instance};
}
test('list/get/select use registry and preserve Fabric default until explicit selection',async()=>{
 const {api}=setup();assert.equal(api.voicePackageId,'agent-lee-voice-one');
 assert.equal((await api.list()).length,3);assert.equal((await api.get('chatterbox-default-natural')).name,'Natural');
 assert.equal((await api.list()).find(p=>p.id==='unbound-native').adapterAvailable,false);
 await api.select('chatterbox-default-natural');assert.equal(api.voicePackageId,'chatterbox-default-natural');
});
test('selected package alone supplies reference and all ready/speech results keep that binding',async()=>{
 const {api,used,events}=setup();await api.select('chatterbox-default-natural');
 const ready=await api.prepare();const spoken=await api.speak('Hello.');
 assert.deepEqual(used,['chatterbox-default-natural']);
 assert.equal(ready.voicePackageId,'chatterbox-default-natural');assert.equal(spoken.voicePackageId,'chatterbox-default-natural');
 assert.equal(events.at(-1).voicePackageId,'chatterbox-default-natural');
});
test('unknown and unsupported selections cannot silently choose a different voice',async()=>{
 const {api}=setup();await assert.rejects(api.select('missing'),/NOT_FOUND/);
 assert.equal(api.voicePackageId,'agent-lee-voice-one');
 await assert.rejects(api.select('unbound-native'),/NOT_BOUND/);
 await api.select('chatterbox-default-natural');assert.equal(api.voicePackageId,'chatterbox-default-natural');
});
test('changing a prepared profile invalidates readiness and reencodes the selected reference',async()=>{
 const {api,used}=setup();await api.prepare();await api.select('chatterbox-default-natural');
 assert.equal(api.status().ready,false);await api.prepare();
 assert.deepEqual(used,['agent-lee-voice-one','chatterbox-default-natural']);
});
