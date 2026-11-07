/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.FABRIC.HTTPS.CLIENT.TEST
TAG: OWNER_SESSION_GPU_ASR_AND_CONTINUUM_EVIDENCE_ONLY
WHO: LeeWay Industries; WHAT: protect public Voice Fabric transport
WHY: submit only a final transcript bound to LeeWay GPU ASR capture evidence
WHERE: Voice Fabric tests; WHEN: 2026-11-07
HOW: injected HTTPS fetch fixture, no external service.
AUTHORITY: session-controlled voice conversation; no device actions.
LICENSE: existing repository terms.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceServiceOrigin,createLeeWayVoiceTransport} from '../src/studio-https-voice-client.mjs';

const evidence=()=>({source:'LEEWAY_EDGE_RTC',transcriptSource:'LEEWAY_EDGE_GPU_ASR',
 inferenceRoute:'LEEWAY_EDGE_GPU',inferenceAuthority:'LEEWAY_EDGE_GPU_ONLY',
 storageAuthority:'LEEWAY_CONTINUUM_ONLY',ownerDeviceId:'pc-primary',segmentId:'seg-001',
 text:'hello LeeWay',audioRecordId:'audio-record-001',audioSha256:'a'.repeat(64),
 captureStartedAt:'2026-11-07T13:00:00.000Z',captureEndedAt:'2026-11-07T13:00:01.000Z'});
const session={schema:'leeway.voice.session.v1',authenticated:true,
 authority:'LEEWAY_DEVICE_BRIDGE_VOICE',csrfToken:'a'.repeat(64)};
const turnResult={schema:'leeway.voice.turn-result.v1',source:'LEEWAY_MACHINE_CONSCIOUSNESS',
 identity:'Agent Lee',verified:true,veritasStatus:'NOT_ASSERTED',status:'VERIFIED',
 evidence:'AUTHENTICATED_AGENT_LEE_TURN_VOICE_FABRIC_AND_CONTINUUM_READBACK',
 continuumRecordId:'continuum-record-001',requestId:'request-001',text:'Agent Lee response',
 voice:{authority:'LEEWAY_VOICE_FABRIC',agentId:'agent-lee',voicePackageId:'kokoro-bm_lewis',
 audioContent:'UklGRg==',sampleRate:24000,format:'wav',playbackVerified:false}};

test('unsafe and public static endpoints are rejected',()=>{
 for(const value of ['','http://127.0.0.1:5173','https://4citeb4u.github.io/',
  'https://user:pw@voice.example.com/','https://voice.example.com/path',
  'javascript:alert(1)'])assert.equal(voiceServiceOrigin(value),null);
 assert.equal(voiceServiceOrigin('https://voice.example.com/'),'https://voice.example.com');
});

test('session required; authenticated production turn sends complete GPU-ASR and Continuum provenance',async()=>{
 const calls=[];
 const client=createLeeWayVoiceTransport({origin:'https://voice.example.com/',
  fetchImpl:async(uri,options)=>{
   calls.push({uri,options});
   return {ok:true,json:async()=>uri.endsWith('/session')?session:turnResult};
  }});
 await assert.rejects(client.turn(evidence()),/SESSION_REQUIRED/);
 await client.connect();
 const answer=await client.turn(evidence());
 assert.equal(answer.text,'Agent Lee response');
 assert.equal(answer.gatewayEvidenceValidated,true);
 assert.equal(answer.veritasStatus,'NOT_ASSERTED','gateway conversation evidence is not an independent Veritas decision');
 assert.equal(answer.playbackVerified,false);
 assert.equal(calls.length,2);
 assert.equal(calls[1].options.credentials,'include');
 assert.equal(calls[1].options.redirect,'error');
 assert.equal(calls[1].options.headers['x-leeway-voice-csrf'],session.csrfToken);
 const sent=JSON.parse(calls[1].options.body);
 assert.equal(sent.schema,'leeway.voice.turn.v1');
 assert.equal(sent.allowDeviceActions,false);
 assert.equal(sent.transcriptSource,'LEEWAY_EDGE_GPU_ASR');
 assert.equal(sent.inferenceAuthority,'LEEWAY_EDGE_GPU_ONLY');
 assert.equal(sent.storageAuthority,'LEEWAY_CONTINUUM_ONLY');
 assert.equal(sent.audioSha256,'a'.repeat(64));
});

test('plain transcript or non-LeeWay provenance is rejected before network submission',async()=>{
 let calls=0;
 const client=createLeeWayVoiceTransport({origin:'https://voice.example.com/',
  fetchImpl:async uri=>{calls++;return {ok:true,json:async()=>session}}});
 await client.connect();
 await assert.rejects(client.turn('hello'),/GPU_ASR_CAPTURE_EVIDENCE_REQUIRED/);
 await assert.rejects(client.turn({...evidence(),transcriptSource:'BROWSER_SPEECH_RECOGNITION'}),/GPU_ASR_CAPTURE_EVIDENCE_REQUIRED/);
 await assert.rejects(client.turn({...evidence(),storageAuthority:'LOCAL_SQLITE'}),/GPU_ASR_CAPTURE_EVIDENCE_REQUIRED/);
 await assert.rejects(client.turn({...evidence(),captureEndedAt:'2026-11-06T12:00:00Z'}),/GPU_ASR_CAPTURE_EVIDENCE_REQUIRED/);
 assert.equal(calls,1,'only the initial session check reached the service');
});

test('unqualified, wrong-identity, or misrepresented Veritas responses are rejected',async()=>{
 for(const mutate of [
  body=>({...body,source:'OLLAMA_QWEN35_4B'}),
  body=>({...body,identity:'Codex'}),
  body=>({...body,veritasStatus:'PASS'}),
  body=>({...body,voice:{...body.voice,authority:'BROWSER_TTS'}}),
  body=>({...body,voice:{...body.voice,audioContent:'not-base64'}}),
  body=>({...body,voice:{...body.voice,playbackVerified:true}}),
 ]){
  const client=createLeeWayVoiceTransport({origin:'https://voice.example.com/',fetchImpl:async(uri)=>({
   ok:true,json:async()=>uri.endsWith('/session')?session:mutate(turnResult),
  })});
  await client.connect();
  await assert.rejects(client.turn(evidence()),/RESPONSE_NOT_VERIFIED/);
 }
});

test('human interruption carries GPU and Continuum provenance and requires an epoch readback',async()=>{
 const calls=[];
 const client=createLeeWayVoiceTransport({origin:'https://voice.example.com/',fetchImpl:async(uri,options)=>{
  calls.push({uri,options});
  return {ok:true,json:async()=>uri.endsWith('/session')?session:
   {schema:'leeway.voice.interrupt-result.v1',authority:'LEEWAY_MACHINE_CONSCIOUSNESS',
    interruptionEpoch:7,staleOutputGuard:'EPOCH_ADVANCED'}};
 }});
 await client.connect();
 const result=await client.interrupt({source:'LEEWAY_EDGE_RTC',transcriptSource:'LEEWAY_EDGE_GPU_ASR',
  inferenceRoute:'LEEWAY_EDGE_GPU',inferenceAuthority:'LEEWAY_EDGE_GPU_ONLY',
  storageAuthority:'LEEWAY_CONTINUUM_ONLY',ownerDeviceId:'pc-primary',segmentId:'interrupt-001'});
 assert.equal(result.interruptionEpoch,7);
 assert.equal(JSON.parse(calls[1].options.body).schema,'leeway.voice.interrupt.v1');
 assert.equal(calls[1].options.headers['x-leeway-voice-csrf'],session.csrfToken);
 await assert.rejects(client.interrupt({source:'BROWSER',segmentId:'bad',ownerDeviceId:'pc-primary'}),/GPU_ASR_INTERRUPT_EVIDENCE_REQUIRED/);
});

test('synthesis request binds Agent Lee and verifies Voice Fabric identity',async()=>{
 const calls=[];
 const client=createLeeWayVoiceTransport({origin:'https://voice.example.com/',fetchImpl:async(uri,options)=>{
  calls.push({uri,options});
  return {ok:true,json:async()=>uri.endsWith('/session')?session:{
   schema:'leeway.voice.synthesis-result.v1',authority:'LEEWAY_VOICE_FABRIC',agentId:'agent-lee',
   voicePackageId:'kokoro-bm_lewis',audioContent:'UklGRg==',sampleRate:24000,format:'wav',playbackVerified:false,
  }};
 }});
 await client.connect();
 const output=await client.synthesize('Agent Lee response','kokoro-bm_lewis');
 assert.equal(output.authority,'LEEWAY_VOICE_FABRIC');
 assert.equal(JSON.parse(calls[1].options.body).agentId,'agent-lee');
 assert.equal(calls[1].options.headers['x-leeway-voice-csrf'],session.csrfToken);
});
