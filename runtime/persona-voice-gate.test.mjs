import fs from 'node:fs';import {validateEmployeeVoiceBinding,applyPersonaDelivery,speechReceipt,sha256} from './persona-voice-gate.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('../voices/catalog.v1.json',import.meta.url),'utf8'));
// Local synthetic owner-binding fixture: never copy personal runtime bindings to GitHub.
const pkg=catalog.packages.find(p=>p.provider==='kokoro'&&p.status==='AVAILABLE')||catalog.packages.find(p=>p.status==='AVAILABLE');
if(!pkg)throw Error('TEST_VOICE_CATALOG_EMPTY');
const b={agentId:'agent-lee',personaFamily:'AGENT_LEE_CONSTITUTIONAL',personaArchetypeId:'ELDER_MALE',voicePackageId:pkg.id};
const v=validateEmployeeVoiceBinding(b,catalog);if(v.state!=='VERIFIED')throw new Error('binding');
const p=applyPersonaDelivery({binding:b,text:'Formula is clean and I am ready to work.',intent:'greeting'});if(p.state!=='VERIFIED'||!p.text.startsWith('Creator,'))throw new Error('persona');
const neg=validateEmployeeVoiceBinding({agentId:'bad'},catalog);if(neg.state!=='BLOCKED')throw new Error('negative');
const r=speechReceipt({binding:b,provider:v.package.provider,body:'unit-test-body',status:'TEST_FIXTURE',textHash:sha256(p.text),audioHash:'test-audio-hash',personaReceiptHash:p.personaReceiptHash});
console.log(JSON.stringify({status:'TEST_FIXTURE_ASSERTIONS_PASS_NOT_AUDIO_PROOF',binding:v.binding,persona:p,negative:neg,receipt:r},null,2));