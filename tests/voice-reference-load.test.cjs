const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('supplied canonical reference is encoded once without redundant default fetch',async()=>{
 let fetches=0,encodes=0,encoded;
 const context=vm.createContext({URL,DOMException,AbortController,setTimeout,clearTimeout,fetch:async()=>{fetches++;throw Error('Unexpected default fetch');}});
 vm.runInContext(fs.readFileSync('src/browser-voice.js','utf8'),context);
 const voice=vm.runInContext('new LeeWayBrowserVoice()',context),reference={size:720078};
 voice.audioContext=async()=>({});voice.request=async()=>({device:'wasm'});
 voice.setReference=async blob=>{encodes++;encoded=blob;};
 await voice.load(()=>{},{referenceBlob:reference});
 assert.equal(fetches,0);assert.equal(encodes,1);assert.equal(encoded,reference);assert.equal(voice.ready,true);
});
test('ordinary browser load retains its default reference behavior',async()=>{
 let fetches=0,encodes=0;
 const reference={size:720078},context=vm.createContext({URL,DOMException,AbortController,setTimeout,clearTimeout,fetch:async()=>{fetches++;return {ok:true,blob:async()=>reference};}});
 vm.runInContext(fs.readFileSync('src/browser-voice.js','utf8'),context);
 const voice=vm.runInContext('new LeeWayBrowserVoice()',context);
 voice.audioContext=async()=>({});voice.request=async()=>({device:'webgpu'});
 voice.setReference=async blob=>{assert.equal(blob,reference);encodes++;};
 await voice.load();assert.equal(fetches,1);assert.equal(encodes,1);
});
test('Android supplies registered Voice One audio directly without a second encode',async()=>{
 let supplied,extraEncodes=0;const reference={size:720078};
 const context=vm.createContext({URLSearchParams,document:{querySelector:()=>null},
 LeeWayBrowserVoice:class{async load(_progress,{referenceBlob}){supplied=referenceBlob;this.ready=true;return {device:'wasm'};}async setReference(){extraEncodes++;}setPace(){}},
 voiceRegistry:{get:async()=>({provider:'chatterbox',pace:1.1,exaggeration:.25}),audio:async()=>reference}});
 vm.runInContext(fs.readFileSync('src/android-bridge.js','utf8').replace(/^import .*;$/m,''),context);
 await context.LeeWayAndroidVoice.prepare();assert.equal(supplied,reference);assert.equal(extraEncodes,0);
});
