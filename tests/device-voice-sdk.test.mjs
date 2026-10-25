/* LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.FABRIC.PORTABLE_SDK.TEST
TAG: DEVICE_FIRST_VOICE_SDK_REGRESSION
WHO: LeeWay Industries. WHAT: Voice selection, settings, local audio route.
WHY: Prevent device clients depending on laptop HTTP service.
WHERE: tests. WHEN: 2026-10-24. HOW: injected local synthesis fixtures.
AUTHORITY: TEST_ONLY. LICENSE: Existing LeeWay repository terms. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLeeWayDeviceVoice} from '../src/device-voice-sdk.mjs';
test('device SDK exposes real canonical voice catalog and settings',()=>{
 const sdk=createLeeWayDeviceVoice();
 assert(sdk.listVoices().some(v=>v.id==='kokoro-bm_lewis'));
 assert(sdk.listVoices().some(v=>v.id==='kokoro-am_michael'));
 assert.equal(sdk.getSettings().voiceId,'kokoro-am_michael');
 assert.equal(sdk.configure({voiceId:'kokoro-bm_lewis',rate:1.2,volume:0.8}).voiceId,'kokoro-bm_lewis');
 assert.equal(sdk.getSettings().rate,1.2);
 assert.throws(()=>sdk.configure({voiceId:'kokoro-hacker'}),/NOT_IN_CATALOG/);
 assert.throws(()=>sdk.configure({volume:2}),/SETTING_INVALID/);
});
test('local synthesis runs without any remote API and supports WAV export',async()=>{
 let id=null;
 const sdk=createLeeWayDeviceVoice({synthesize:async(text,voiceId)=>{
  id=voiceId;assert.equal(text,'Hello LeeWay');
  return {wav:new Uint8Array(48),execution:'BROWSER_WASM_OR_WEBGPU'};
 }});
 sdk.configure({voiceId:'kokoro-bm_lewis'});
 const reply=await sdk.speak('Hello LeeWay',{play:false});
 assert.equal(reply.audio.length,48);
 assert.equal(id,'kokoro-bm_lewis');
 assert.equal(reply.played,false);
 assert.equal(sdk.describe().serverRequired,false);
});
test('device playback applies local speed and loudness settings',async()=>{
 let audio;
 const sdk=createLeeWayDeviceVoice({
  synthesize:async()=>({wav:new Uint8Array(48),execution:'BROWSER_WASM_OR_WEBGPU'}),
  makeAudio:()=>audio={play:async()=>{},pause:()=>{},removeAttribute:()=>{},
   addEventListener:()=>{},removeEventListener:()=>{}},
  createObjectUrl:()=> 'blob:fixture',
  revokeObjectUrl:()=>{}
 });
 sdk.configure({rate:1.5,volume:0.4});
 const result=await sdk.speak('Test');
 assert.equal(audio.playbackRate,1.5);
 assert.equal(audio.volume,0.4);
 assert.equal(result.played,true);
 sdk.stop();
});

test('canonical revision controls device voice',async()=>{
 let emit;
 const client={current:async()=>({voicePackageId:'kokoro-bm_lewis',revision:'r1'}),
 subscribe:fn=>{emit=fn;return ()=>{};}};
 const sdk=createLeeWayDeviceVoice();
 await sdk.connectCanonical({client});
 assert.equal(sdk.getSettings().voiceId,'kokoro-bm_lewis');
 assert.throws(()=>sdk.configure({voiceId:'kokoro-am_michael'}));
 emit({voicePackageId:'kokoro-af_bella',revision:'r2'});
 assert.equal(sdk.getSettings().canonicalRevision,'r2');
 sdk.disconnectCanonical();
 await assert.rejects(sdk.speak('hello',{play:false,requireCanonical:true}));
});
