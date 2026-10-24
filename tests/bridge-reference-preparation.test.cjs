const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Chatterbox prepares only the selected reference and encodes it once', async () => {
  const source = fs.readFileSync('src/bridge-runtime.js', 'utf8')
    .replace("import {voiceRegistry} from './voice-registry.js';", 'const {voiceRegistry}=globalThis.__deps;')
    .replace("import {probeDevice} from './device-probe.js';", 'const {probeDevice}=globalThis.__deps;')
    .replace("import {readDeviceDiagnostics,constraintsFromDiagnostics} from './diagnostics-link.js';", 'const {readDeviceDiagnostics,constraintsFromDiagnostics}=globalThis.__deps;')
    .replace("import {planProviders,prepareWithFailover,routerProviderFor,DEFAULT_KOKORO_VOICE_ID,DEVICE_VOICE_ID} from './provider-router.js';", 'const {planProviders,prepareWithFailover,routerProviderFor,DEFAULT_KOKORO_VOICE_ID,DEVICE_VOICE_ID}=globalThis.__deps;');

  const reference = new Blob(['voice one']);
  const pkg = {id:'agent-lee-voice-one', provider:'chatterbox', pace:1.22, exaggeration:.25};
  const calls = {audio:0, setReference:0, references:[], loadOptions:null};
  class Kokoro { stop(){} setVoice(){} setPace(){} }
  class DeviceSpeech { stop(){} }
  class Chatterbox {
    constructor(options) { calls.loadOptions = options; this.ready = false; }
    stop(){}
    async load() { this.ready = true; return {device:'webgpu'}; }
    async setReference(blob) { calls.setReference++; calls.references.push(blob); }
    setPace(){}
  }
  const handlers = new Map();
  const messages = [];
  const context = vm.createContext({
    URLSearchParams,
    Blob,
    location:{hash:'#token=test-token'},
    parent:{postMessage:(message)=>messages.push(message)},
    addEventListener:(type,handler)=>handlers.set(type,handler),
    LeeWayKokoroVoice:Kokoro,
    LeeWayDeviceSpeechVoice:DeviceSpeech,
    LeeWayBrowserVoice:Chatterbox,
    __deps:{
      voiceRegistry:{
        get:async()=>pkg,
        audio:async()=>{calls.audio++;return reference;},
      },
      probeDevice:async()=>({tier:'high',can:{chatterbox:true}}),
      readDeviceDiagnostics:async()=>({sources:[]}),
      constraintsFromDiagnostics:()=>({avoidHeavyModels:false}),
      routerProviderFor:voice=>voice.provider,
      planProviders:()=>({providers:[{provider:'chatterbox',device:'webgpu'}],excluded:[]}),
      prepareWithFailover:async(plan,prepare)=>{
        const step=plan.providers[0];await prepare(step);
        return {ok:true,provider:step.provider,device:step.device,attempts:[{provider:step.provider,ok:true}]};
      },
      DEFAULT_KOKORO_VOICE_ID:'kokoro-am_michael',
      DEVICE_VOICE_ID:'android-installed-english',
    },
  });
  vm.runInContext(source, context);
  const send = async (id, command, data={}) => {
    await handlers.get('message')({
      data:{scope:'leeway.voice.v1',token:'test-token',id,command,data},
      source:{postMessage:(message)=>messages.push(message)},
      origin:'https://example.test',
    });
    return messages.findLast(message=>message.replyTo===id);
  };

  assert.equal((await send(1,'selectVoice',{voicePackageId:pkg.id})).ok, true);
  const prepared = await send(2,'prepare',{provider:'chatterbox'});
  assert.equal(prepared.ok, true);
  assert.equal(prepared.data.selectedVoiceId, pkg.id);
  assert.equal(calls.loadOptions.skipDefaultReference, true);
  assert.equal(calls.audio, 1, 'the selected Voice One reference is retrieved once');
  assert.equal(calls.setReference, 1, 'the selected Voice One reference is encoded once');
  assert.equal(calls.references[0], reference);

  await send(3,'selectVoice',{voicePackageId:pkg.id});
  assert.equal(calls.setReference, 1, 'reapplying the active voice does not re-encode it');

  const customAudio = vm.runInContext('new ArrayBuffer(2)', context);
  await send(4,'setReference',{audio:customAudio,type:'audio/wav'});
  assert.equal(calls.setReference, 2);
  await send(5,'selectVoice',{voicePackageId:pkg.id});
  assert.equal(calls.audio, 2, 'reselecting Voice One restores its canonical reference after a custom reference');
  assert.equal(calls.setReference, 3);
  assert.equal(calls.references[2], reference);
});

