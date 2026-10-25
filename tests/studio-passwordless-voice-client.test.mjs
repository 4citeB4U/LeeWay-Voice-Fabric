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
  }else data={schema:'leeway.voice.turn-result.v1',source:'OLLAMA_QWEN35_4B',
   status:'GENERATED_NOT_VERITAS_VERIFIED',verified:false,
   gpuInferenceVerified:false,text:'Agent Lee replied'};
  return {ok:true,status:200,json:async()=>data};
 }});
 await assert.rejects(client.turn('Hello',{mode:'llm'}),/SESSION_REQUIRED/);
 const challenge=await client.beginPairing();
 assert.equal(await client.claimPairing(challenge).then(x=>x.approved),false);
 assert.equal(client.authenticated,false);
 assert.equal(await client.claimPairing(challenge).then(x=>x.approved),true);
 const reply=await client.turn('Hello',{mode:'llm'});
 assert.equal(reply.text,'Agent Lee replied');
 assert.equal(reply.verified,false);
 const turnCall=calls.find(x=>x.uri.endsWith('/turn'));
 assert.equal(turnCall.options.headers['x-leeway-voice-csrf'],'a'.repeat(64));
 assert.equal(JSON.parse(turnCall.options.body).allowDeviceActions,false);
 assert.ok(!JSON.stringify(calls).includes('password'));
});
