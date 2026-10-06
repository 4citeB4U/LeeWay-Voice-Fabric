/* REGION: LEEWAY.VOICE.LIVE_QUALIFICATION; TAG: REAL_SELECTED_PROVIDER_NOT_NATIVE_TTS
WHO: Creator-authorized engineering. WHAT: Exercise the installed carrier and actual selected Voice worker.
WHEN: After exact repair restart. WHERE: explicit owner-local carrier only.
WHY: Test fixtures do not prove synthesis, and synthesis does not prove human audibility.
HOW: Current binding readback, negative local-selection attempt, real waveform identity/header validation.
LICENSE: MIT */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const args=new Map();for(let i=2;i<process.argv.length;i+=2)args.set(process.argv[i],process.argv[i+1]);
const origin=args.get('--origin');if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('OWNER_LOCAL_CARRIER_REQUIRED');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const out=path.join(root,'receipts/voice-authority-repair-20261006');
const hash=b=>createHash('sha256').update(b).digest('hex');
const selectionPath=path.join(root,'runtime/employee-voice-bindings.v1.json');const beforeHash=hash(fs.readFileSync(selectionPath));
const checks=[];let error=null;
async function getSettings(){const r=await fetch(origin+'/settings',{signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);return r.json();}
try {
 const state=await getSettings();const selected=state.voiceBinding;
 assert.equal(selected.authority,'LEEWAY_VOICE_FABRIC');assert.equal(selected.deviceMayOverride,false);assert.equal(selected.systemVoiceFallback,false);
 checks.push({name:'Actual carrier resolves Voice-owned binding',status:'PASS',binding:selected});
 const denied=await fetch(origin+'/settings/voice',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({voicePackageId:'android-installed-english',selectedBy:'DEVICE_DEFAULT'}),signal:AbortSignal.timeout(10000)});
 assert.equal(denied.status,409);const rejection=await denied.json();assert.equal(rejection.deviceLocalOverride,false);
 checks.push({name:'Device-local selection write is blocked instead of becoming shared authority',status:'PASS',result:rejection});
 const text='Creator, this is LeeWay Voice. Your device plays the audio. It does not choose my speaker identity.';
 const began=performance.now();
 const response=await fetch(origin+'/render-voice',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text,voicePackageId:'android-installed-english',provider:'android-tts'}),signal:AbortSignal.timeout(120000)});
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));
 assert.equal(result.voicePackageId,selected.voicePackageId);assert.equal(result.voiceId,selected.voiceId);assert.equal(result.provider,selected.provider);
 assert.equal(result.selectionRevision,selected.selectionRevision);assert.equal(result.voiceAuthority,'LEEWAY_VOICE_FABRIC');assert.equal(result.textHash,hash(JSON.stringify(text)));
 const audio=Buffer.from(result.audioContent,'base64');assert.equal(audio.toString('ascii',0,4),'RIFF');assert.equal(audio.toString('ascii',8,12),'WAVE');
 assert.equal(audio.readUInt16LE(20),1);assert.equal(audio.readUInt16LE(34),16);
 let peak=0;for(let i=44;i+1<audio.length;i+=2)peak=Math.max(peak,Math.abs(audio.readInt16LE(i)));assert.ok(peak>0,'SYNTHESIZED_PCM_MUST_NOT_BE_SILENT');
 fs.writeFileSync(path.join(out,'voice-authority-test.wav'),audio);
 checks.push({name:'Actual worker uses only Voice-selected speaker; client override cannot select system TTS',status:'PASS',voicePackageId:result.voicePackageId,provider:result.provider,voiceId:result.voiceId,selectionRevision:result.selectionRevision,textHash:result.textHash,audioSha256:hash(audio),audioBytes:audio.length,sampleRate:audio.readUInt32LE(24),peak16:peak,elapsedMs:performance.now()-began,qualificationOnly:result.qualificationOnly,state:result.state});
 const after=await getSettings();assert.equal(after.voiceBinding.selectionRevision,selected.selectionRevision);assert.equal(hash(fs.readFileSync(selectionPath)),beforeHash);
 checks.push({name:'Owner selection unchanged by worker restart and test requests',status:'PASS',bindingRecordSha256:beforeHash});
}catch(e){error=e.stack||String(e);process.exitCode=1;}
const receipt={schemaVersion:'leeway.voice-authority-live.v1',status:error?'FAILED':'LIVE_SELECTION_AND_SYNTHESIS_VERIFIED_NOT_AUDIBILITY',fixtureProviders:false,checks,error,phoneNativeExecution:false,crossDeviceSelectionSynchronization:false,fullGoldenRelease:false,formulaExecution:'NOT_EXECUTED',humanAudibilityConfirmed:false};
fs.writeFileSync(path.join(out,'live-voice-ownership.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
