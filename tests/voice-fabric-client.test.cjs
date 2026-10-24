/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.SDK.REGRESSION
TAG: ONE_CANONICAL_OWNER_VOICE
WHO: LeeWay Industries; WHAT: reusable multi-app read-only voice consumer
WHY: apps should not store independent Agent Lee voice choice
WHERE: Voice Fabric tests; WHEN: 2026-10-24
HOW: mocked canonical API binding and revision observation.
LICENSE: existing repository terms.
*/
const test=require('node:test'),assert=require('node:assert/strict');
test('SDK uses one canonical voice binding and never exposes publishing',async()=>{
 const {createLeeWayVoiceClient}=await import('../src/voice-fabric-client.mjs');
 let current='kokoro-bm_lewis',revision='v1';
 const client=createLeeWayVoiceClient({endpoint:'http://127.0.0.1:5173/__leeway/voice-binding',
   fetchImpl:async()=>({ok:true,json:async()=>({authority:'LEEWAY_VOICE_FABRIC',
    binding:{voicePackageId:current},recordRevision:revision})})});
 const first=await client.current();
 assert.equal(first.voicePackageId,'kokoro-bm_lewis');
 assert.equal(first.revision,'v1');
 assert.equal(client.publish,undefined);
 current='kokoro-am_michael';revision='v2';
 const later=await client.current();
 assert.equal(later.voicePackageId,'kokoro-am_michael');
 assert.equal(later.revision,'v2');
 assert.match(client.conversationUrl({voice:later.voicePackageId}),/voice=kokoro-am_michael/);
});
test('SDK fails closed on missing or unsupported shared voice',async()=>{
 const {createLeeWayVoiceClient}=await import('../src/voice-fabric-client.mjs');
 const client=createLeeWayVoiceClient({fetchImpl:async()=>({ok:true,json:async()=>({
 authority:'LEEWAY_VOICE_FABRIC',binding:{voicePackageId:'unrecognized-voice'},recordRevision:'v1'})})});
 await assert.rejects(client.current(),/CANONICAL_KOKORO_VOICE_NOT_AVAILABLE/);
});
