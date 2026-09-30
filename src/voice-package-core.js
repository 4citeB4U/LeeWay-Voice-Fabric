export const BUILTIN_VOICE_PACKAGES=[{
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

export function normalizeVoicePackage(input={}){
  const id=String(input.id||'').trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');
  const name=String(input.name||'').trim(),owner=String(input.owner||'').trim();
  if(!id||!name||!owner)throw new Error('Voice package requires id, name and owner.');
  const pace=Number(input.pace??1.22),exaggeration=Number(input.exaggeration??.25);
  if(!Number.isFinite(pace)||pace<.85||pace>1.3)throw new Error('Voice pace must be between 0.85 and 1.30.');
  if(!Number.isFinite(exaggeration)||exaggeration<0||exaggeration>1)throw new Error('Voice delivery must be between 0 and 1.');
  return {id,name,owner,provider:String(input.provider||'chatterbox'),packageType:String(input.packageType||'CLONED_REFERENCE'),pace,exaggeration,source:String(input.source||'USER_LOCAL'),status:String(input.status||'AVAILABLE'),createdAt:input.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),referenceUrl:input.referenceUrl||null,referenceSha256:input.referenceSha256||null};
}

export function agentVoiceBinding({agentId,voicePackageId}={}){
  if(!String(agentId||'').trim())throw new Error('agentId required.');
  if(!String(voicePackageId||'').trim())throw new Error('Every LeeWay agent/worker requires a voicePackageId.');
  return {schema:'leeway-agent-voice-binding/v1',agentId:String(agentId),voicePackageId:String(voicePackageId)};
}
