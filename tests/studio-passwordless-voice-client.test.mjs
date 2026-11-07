/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.FABRIC.PASSWORDLESS.CLIENT.TEST
TAG: OWNER_PAIRING_BROWSER_WITHOUT_PASSPHRASE
WHO: LeeWay Industries; WHAT: validate browser pairing client
WHY: no unknown voice passphrase and no unauthenticated model turns
WHERE: tests; WHEN: 2026-10-24
HOW: mocked HTTPS JSON with waiting and owner-approved transitions
AUTHORITY: test only. LICENSE: repository terms.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLeeWayVoiceTransport} from '../src/studio-https-voice-client.mjs';
test('passwordless owner approval connects with app-specific voice-only scope',async()=>{
 const calls=[];
 const turnEvidence={source:'LEEWAY_EDGE_RTC',transcriptSource:'LEEWAY_EDGE_GPU_ASR',
  inferenceRoute:'LEEWAY_EDGE_GPU',inferenceAuthority:'LEEWAY_EDGE_GPU_ONLY',
  storageAuthority:'LEEWAY_CONTINUUM_ONLY',ownerDeviceId:'pc-primary',segmentId:'seg-001',
  text:'Hello',audioRecordId:'audio-record-001',audioSha256:'a'.repeat(64),
  captureStartedAt:'2026-11-07T13:00:00Z',captureEndedAt:'2026-11-07T13:00:01Z'};
 const client=createLeeWayVoiceTransport({origin:'https://voice.example.com/',
 fetchImpl:async(uri,options)=>{
  calls.push({uri,options});
  let data={};
  if(uri.endsWith('/start'))data={schema:'leeway.voice.pair-start.v1',
    id:'1'.repeat(32),token:'2'.repeat(64),displayCode:'123456',expires:Date.now()+90000};
  else if(uri.endsWith('/claim')){
   data=calls.filter(x=>x.uri.endsWith('/claim')).length===1?
    {status:'WAITING_FOR_OWNER_APPROVAL'}:
    {schema:'leeway.voice.session.v1',authenticated:true,
     authority:'LEEWAY_DEVICE_BRIDGE_VOICE',csrfToken:'a'.repeat(64),
     appId:'leeway.voice.studio',scope:'voice:turn:readonly'};
  }else data={schema:'leeway.voice.turn-result.v1',source:'LEEWAY_MACHINE_CONSCIOUSNESS',
   identity:'Agent Lee',status:'VERIFIED',evidence:'AUTHENTICATED_AGENT_LEE_TURN_VOICE_FABRIC_AND_CONTINUUM_READBACK',
   continuumRecordId:'continuum-record-001',verified:true,veritasStatus:'NOT_ASSERTED',text:'Agent Lee replied',
   voice:{authority:'LEEWAY_VOICE_FABRIC',agentId:'agent-lee',voicePackageId:'kokoro-bm_lewis',
    audioContent:'UklGRg==',sampleRate:24000,format:'wav',playbackVerified:false}};
  return {ok:true,status:200,json:async()=>data};
 }});
 await assert.rejects(client.turn(turnEvidence),/SESSION_REQUIRED/);
 const challenge=await client.beginPairing();
 assert.equal(await client.claimPairing(challenge).then(x=>x.approved),false);
 assert.equal(client.authenticated,false);
 assert.equal(await client.claimPairing(challenge).then(x=>x.approved),true);
 const reply=await client.turn(turnEvidence);
 assert.equal(reply.text,'Agent Lee replied');
 assert.equal(reply.gatewayEvidenceValidated,true);
 assert.equal(reply.veritasStatus,'NOT_ASSERTED');
 const turnCall=calls.find(x=>x.uri.endsWith('/turn'));
 assert.equal(turnCall.options.headers['x-leeway-voice-csrf'],'a'.repeat(64));
 assert.equal(JSON.parse(turnCall.options.body).allowDeviceActions,false);
 assert.equal(JSON.parse(turnCall.options.body).transcriptSource,'LEEWAY_EDGE_GPU_ASR');
 assert.ok(!JSON.stringify(calls).includes('password'));
});
