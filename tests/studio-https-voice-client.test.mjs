/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.FABRIC.HTTPS.CLIENT.TEST
TAG: OWNER_SESSION_AND_VERIFIED_RESPONSE_ONLY
WHO: LeeWay Industries; WHAT: protect public Voice Fabric transport
WHY: do not send speech without authenticated LeeWay voice session
WHERE: Voice Fabric tests; WHEN: 2026-10-24
HOW: injected HTTPS fetch fixture, no external service.
AUTHORITY: no device commands and no GPU behavior. LICENSE: existing terms.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceServiceOrigin,createLeeWayVoiceTransport} from '../src/studio-https-voice-client.mjs';
test('unsafe and public static endpoints are rejected',()=>{
 for(const value of ['','http://127.0.0.1:5173','https://4citeb4u.github.io/',
  'https://user:pw@voice.example.com/','https://voice.example.com/path',
  'javascript:alert(1)'])assert.equal(voiceServiceOrigin(value),null);
 assert.equal(voiceServiceOrigin('https://voice.example.com/'),'https://voice.example.com');
});
test('session required, HTTPS credentialed and verified machine reply only',async()=>{
 const calls=[];
 const client=createLeeWayVoiceTransport({origin:'https://voice.example.com/',
  fetchImpl:async(uri,options)=>{
   calls.push({uri,options});
   return {ok:true,json:async()=>uri.endsWith('/session')?
    {schema:'leeway.voice.session.v1',authenticated:true,
      authority:'LEEWAY_DEVICE_BRIDGE_VOICE',csrfToken:'a'.repeat(64)}:
    {schema:'leeway.voice.turn-result.v1',source:'LEEWAY_MACHINE_CONSCIOUSNESS',
      verified:true,veritasStatus:'PASS',text:'Verified Agent Lee answer'}};
  }});
 await assert.rejects(client.turn('hi'),/SESSION_REQUIRED/);
 await client.connect();
 assert.equal((await client.turn('hello')).text,'Verified Agent Lee answer');
 assert.equal(calls.length,2);
 assert.equal(calls[1].options.credentials,'include');
 assert.equal(calls[1].options.redirect,'error');
 const sent=JSON.parse(calls[1].options.body);
 assert.equal(sent.allowDeviceActions,false);
 assert.equal(sent.mode,'machine');
});
test('explicit Qwen selection keeps provenance unverified and denies device actions',async()=>{
 const client=createLeeWayVoiceTransport({origin:'https://voice.example.com/',fetchImpl:async(uri,options)=>({
  ok:true,json:async()=>uri.endsWith('/session')?
  {schema:'leeway.voice.session.v1',authenticated:true,authority:'LEEWAY_DEVICE_BRIDGE_VOICE',csrfToken:'a'.repeat(64)}:
  {schema:'leeway.voice.turn-result.v1',source:'OLLAMA_QWEN35_4B',
   status:'GENERATED_NOT_VERITAS_VERIFIED',verified:false,gpuInferenceVerified:false,
   text:'Hello from local Qwen'}
 })});
 await client.connect();
 const result=await client.turn('hello',{mode:'llm'});
 assert.equal(result.source,'OLLAMA_QWEN35_4B');
 assert.equal(result.verified,false);
 assert.equal(result.gpuInferenceVerified,false);
 await assert.rejects(client.turn('hello',{mode:'execute'}),/MODE_INVALID/);
});
test('password login obtains session CSRF without exposing it in turn body',async()=>{
 const calls=[];
 const client=createLeeWayVoiceTransport({origin:'https://voice.example.com/',fetchImpl:async(uri,opts)=>{
  calls.push({uri,opts});
  return {ok:true,json:async()=>uri.endsWith('/login')?
   {schema:'leeway.voice.session.v1',authenticated:true,
    authority:'LEEWAY_DEVICE_BRIDGE_VOICE',csrfToken:'b'.repeat(64)}:
   {schema:'leeway.voice.turn-result.v1',source:'OLLAMA_QWEN35_4B',
    status:'GENERATED_NOT_VERITAS_VERIFIED',verified:false,
    gpuInferenceVerified:false,text:'Qwen response'}};
 }});
 await client.login('this-is-a-test-only-voice-passphrase');
 const answer=await client.turn('Hello',{mode:'llm'});
 assert.equal(answer.verified,false);
 assert.equal(calls[1].opts.headers['x-leeway-voice-csrf'],'b'.repeat(64));
 assert.equal(JSON.parse(calls[1].opts.body).allowDeviceActions,false);
 assert.equal(JSON.stringify(calls[1].opts.body).includes('passphrase'),false);
 client.disconnect();
 await assert.rejects(client.turn('Again',{mode:'llm'}),/SESSION_REQUIRED/);
});
test('no unverified reply can enter Studio',async()=>{
 const client=createLeeWayVoiceTransport({origin:'https://voice.example.com/',fetchImpl:async(uri)=>({
  ok:true,json:async()=>uri.endsWith('/session')?
  {schema:'leeway.voice.session.v1',authenticated:true,authority:'LEEWAY_DEVICE_BRIDGE_VOICE',csrfToken:'a'.repeat(64)}:
  {schema:'leeway.voice.turn-result.v1',source:'OLLAMA_QWEN35_4B',
   verified:true,veritasStatus:'PASS',text:'A disguised fallback'}
 })});
 await client.connect();
 await assert.rejects(client.turn('hi'),/NOT_VERIFIED/);
});
