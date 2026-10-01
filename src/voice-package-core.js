const PROVIDER_REFERENCE='https://huggingface.co/onnx-community/chatterbox-ONNX/resolve/3cab09af388d3f02bba43443fce88c1f4525ac43/default_voice.wav';
const PROVIDER_HASH='3ebc531cdaba358a327099c1c4f0448026719957bcf4d8e9868767f227e02f4e';
export const BUILTIN_VOICE_PACKAGES=[{
  id:'chatterbox-default',name:'Chatterbox · Default speaker',owner:'Resemble AI / ONNX Community',
  provider:'chatterbox',packageType:'PROVIDER_REFERENCE',source:'PROVIDER_REFERENCE',
  referenceUrl:PROVIDER_REFERENCE,referenceSha256:PROVIDER_HASH,pace:1,exaggeration:.5,
  speakerId:'chatterbox-default-speaker',gender:'unspecified',status:'AVAILABLE',
  description:'The reference speaker distributed with the ONNX model. Gender is not declared in the model metadata.',
  license:'MIT model distribution',sourceUrl:'https://huggingface.co/onnx-community/chatterbox-ONNX'
},{
  id:'chatterbox-default-calm',
  name:'Chatterbox Default · Calm',
  owner:'LeeWay Shared Voice Pool',
  provider:'chatterbox',
  packageType:'CHATTERBOX_DEFAULT_PROFILE',
  referenceUrl:'https://huggingface.co/onnx-community/chatterbox-ONNX/resolve/main/default_voice.wav',
  referenceSha256:null,
  pace:1.0,
  exaggeration:.2,
  source:'PROVIDER_PROFILE',
  status:'AVAILABLE'
},{
  id:'chatterbox-default-natural',
  name:'Chatterbox Default · Natural',
  owner:'LeeWay Shared Voice Pool',
  provider:'chatterbox',
  packageType:'CHATTERBOX_DEFAULT_PROFILE',
  referenceUrl:'https://huggingface.co/onnx-community/chatterbox-ONNX/resolve/main/default_voice.wav',
  referenceSha256:null,
  pace:1.0,
  exaggeration:.5,
  source:'PROVIDER_PROFILE',
  status:'AVAILABLE'
},{
  id:'chatterbox-default-lively',
  name:'Chatterbox Default · Lively',
  owner:'LeeWay Shared Voice Pool',
  provider:'chatterbox',
  packageType:'CHATTERBOX_DEFAULT_PROFILE',
  referenceUrl:'https://huggingface.co/onnx-community/chatterbox-ONNX/resolve/main/default_voice.wav',
  referenceSha256:null,
  pace:1.08,
  exaggeration:.7,
  source:'PROVIDER_PROFILE',
  status:'AVAILABLE'
},{

  id:'agent-lee-voice-one',
  name:'Agent Lee · Voice One',
  owner:'Agent Lee',
  provider:'chatterbox',
  packageType:'CLONED_REFERENCE',
  referenceUrl:'https://raw.githubusercontent.com/4citeB4U/RapidWebDev/main/brain/public/voices/agent-lee-reference.wav',
  referenceSha256:'638c88b332ecc7a21950511871c724f68f3eb566c59157e46493ee79ec55970e',
  pace:1.22,
  exaggeration:.25,
  source:'BUILTIN_VERSIONED',
  status:'AVAILABLE'
}];

export const KOKORO_VOICE_PACKAGES=[["af_alloy","Alloy","female"],["af_aoede","Aoede","female"],["af_bella","Bella","female"],["af_heart","Heart","female"],["af_jessica","Jessica","female"],["af_kore","Kore","female"],["af_nicole","Nicole","female"],["af_nova","Nova","female"],["af_river","River","female"],["af_sarah","Sarah","female"],["af_sky","Sky","female"],["am_adam","Adam","male"],["am_echo","Echo","male"],["am_eric","Eric","male"],["am_fenrir","Fenrir","male"],["am_liam","Liam","male"],["am_michael","Michael","male"],["am_onyx","Onyx","male"],["am_puck","Puck","male"],["am_santa","Santa","male"],["bf_alice","Alice","female"],["bf_emma","Emma","female"],["bf_isabella","Isabella","female"],["bf_lily","Lily","female"],["bm_daniel","Daniel","male"],["bm_fable","Fable","male"],["bm_george","George","male"],["bm_lewis","Lewis","male"]].map(([voiceId,name,gender])=>({
  id:'kokoro-'+voiceId,voiceId,name:name+' · Kokoro',gender,owner:'hexgrad / Kokoro',provider:'kokoro',
  speakerId:'kokoro-'+voiceId,packageType:'MODEL_VOICE',source:'BUILTIN_LOCAL',pace:1,exaggeration:.5,
  referenceUrl:null,referenceSha256:null,previewUrl:'/api/local/preview/'+voiceId,license:'Apache-2.0',
  sourceUrl:'https://huggingface.co/hexgrad/Kokoro-82M',status:'AVAILABLE',
  description:`${voiceId.startsWith('b')?'British':'American'} English - Distinct local Kokoro model voice. Not a pitch-shifted clone.`
}));
BUILTIN_VOICE_PACKAGES.push(...KOKORO_VOICE_PACKAGES);

for(const pkg of BUILTIN_VOICE_PACKAGES){
  if(pkg.packageType==='CHATTERBOX_DEFAULT_PROFILE')Object.assign(pkg,{
    referenceUrl:PROVIDER_REFERENCE,referenceSha256:PROVIDER_HASH,
    source:'DELIVERY_PRESET',speakerId:'chatterbox-default-speaker',presetOf:'chatterbox-default',
    gender:'unspecified',description:'Delivery preset of the same Chatterbox default speaker; not a different voice.',
    license:'MIT model distribution',sourceUrl:'https://huggingface.co/onnx-community/chatterbox-ONNX'
  });
  if(pkg.id==='agent-lee-voice-one')Object.assign(pkg,{speakerId:'agent-lee-voice-one',gender:'male',
    description:'Creator-selected Voice One clone. Distinct from the provider default reference.'});
}

export function normalizeSynthesis(value={}){
  const limits={exaggeration:[0,1,.5],temperature:[.5,1,.8],top_p:[.5,1,.95],top_k:[10,100,50]};
  const out={};for(const [key,[low,high,fallback]] of Object.entries(limits)){
    const n=value[key]??fallback;if(typeof n!=='number'||!Number.isFinite(n)||n<low||n>high)throw new Error(`Invalid synthesis ${key}`);
    out[key]=key==='top_k'?Math.round(n):n;
  }return out;
}

function safeUrl(value){
  if(!value)return null;
  const url=new URL(String(value));if(!['https:','http:'].includes(url.protocol))throw new Error('Voice source must use HTTP or HTTPS');
  return url.href;
}

export function normalizeVoicePackage(input={}){
  const id=String(input.id||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');
  const name=String(input.name||'').trim(),owner=String(input.owner||'').trim();
  if(!id||!name||!owner)throw new Error('Voice package requires id, name and owner.');
  const pace=Number(input.pace??1.22),exaggeration=Number(input.exaggeration??.25);
  if(!Number.isFinite(pace)||pace<.6||pace>1.6)throw new Error('Voice pace must be between 0.60 and 1.60.');
  if(!Number.isFinite(exaggeration)||exaggeration<0||exaggeration>1)throw new Error('Voice delivery must be between 0 and 1.');
  const provider=String(input.provider||'chatterbox');if(!['chatterbox','resemble','kokoro'].includes(provider))throw new Error('Unsupported voice provider');
  const tuning={};const ranges={pace:[.6,1.6],pitch:[-6,6],bass:[-9,9],warmth:[-9,9],presence:[-9,9],air:[-9,9],highpass:[40,180],deEss:[0,1],noiseReduction:[0,1],compression:[1,4],gain:[-9,6]};
  for(const [key,[low,high]] of Object.entries(ranges))if(input.tuning?.[key]!==undefined){const n=input.tuning[key];if(typeof n!=='number'||!Number.isFinite(n)||n<low||n>high)throw new Error(`Invalid tuning ${key}`);tuning[key]=n;}
  const voiceUuid=provider==='resemble'?String(input.voiceUuid||''):null;
  const voiceId=provider==='kokoro'?String(input.voiceId||''):null;
  if(provider==='kokoro'&&!KOKORO_VOICE_PACKAGES.some(p=>p.voiceId===voiceId))throw new Error('Unknown Kokoro voice ID');
  if(provider==='resemble'&&!/^[A-Za-z0-9_-]{1,128}$/.test(voiceUuid))throw new Error('Hosted voice requires a provider voice UUID');
  return {id,name:name.slice(0,120),owner:owner.slice(0,120),provider,packageType:String(input.packageType||'CLONED_REFERENCE'),pace,exaggeration,source:String(input.source||'USER_LOCAL'),status:String(input.status||'AVAILABLE'),createdAt:input.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),referenceUrl:safeUrl(input.referenceUrl),referenceSha256:input.referenceSha256||null,speakerId:String(input.speakerId||id),gender:String(input.gender||'unspecified'),description:String(input.description||'').slice(0,1000),license:String(input.license||'User-provided reference'),sourceUrl:safeUrl(input.sourceUrl),previewUrl:provider==='kokoro'?'/api/local/preview/'+voiceId:safeUrl(input.previewUrl),voiceId,voiceUuid,tuning,synthesis:normalizeSynthesis(input.synthesis||{exaggeration})};
}

export function agentVoiceBinding({agentId,voicePackageId}={}){
  if(!String(agentId||'').trim())throw new Error('agentId required.');
  if(!String(voicePackageId||'').trim())throw new Error('Every LeeWay agent/worker requires a voicePackageId.');
  return {schema:'leeway-agent-voice-binding/v1',agentId:String(agentId),voicePackageId:String(voicePackageId)};
}
