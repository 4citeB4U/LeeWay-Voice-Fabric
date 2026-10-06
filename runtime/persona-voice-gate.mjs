import {resolveAgentVoiceSelection} from '../src/voice-package-core.js';
import crypto from 'node:crypto';
export const sha256=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function validateEmployeeVoiceBinding(binding,catalog){
 const missing=['agentId','personaFamily','personaArchetypeId','voicePackageId'].filter(k=>!binding?.[k]);
 if(missing.length)return{state:'BLOCKED',reason:'VOICE_BINDING_INCOMPLETE',missing};
 const pkg=catalog?.packages?.find(x=>x.id===binding.voicePackageId&&x.status==='AVAILABLE');
 if(!pkg)return{state:'BLOCKED',reason:'VOICE_PACKAGE_NOT_AVAILABLE',voicePackageId:binding.voicePackageId};
 return{state:'VERIFIED',binding:{...binding,provider:pkg.provider,voiceId:pkg.voiceId||null},package:pkg};
}
export function applyPersonaDelivery({binding,text,intent='unknown'}){
 const clean=String(text||'').trim();if(!clean)return{state:'BLOCKED',reason:'EMPTY_RESPONSE'};
 const policy=binding.personaFamily==='AGENT_LEE_CONSTITUTIONAL'?{address:'Creator',register:'grounded-rhythmic-professional-direct',rules:['speak-as-Agent-Lee','no-human-lived-experience-claim','state-evidence-boundaries','no-fabricated-capability']}:{register:'professional-role-aligned',rules:['state-evidence-boundaries','no-fabricated-capability']};
 let delivered=clean;if(policy.address&&!new RegExp('^'+policy.address+'\\b','i').test(delivered))delivered=policy.address+', '+delivered.charAt(0).toLowerCase()+delivered.slice(1);
 const out={state:'VERIFIED',agentId:binding.agentId,personaFamily:binding.personaFamily,personaArchetypeId:binding.personaArchetypeId,intent,text:delivered,policy};out.personaReceiptHash=sha256(out);return out;
}
export function speechReceipt({binding,provider,body,textHash,audioHash,personaReceiptHash,status='PASS'}){
 const out={schemaVersion:'leeway.speech-receipt.v1',status,agentId:binding.agentId,personaFamily:binding.personaFamily,personaArchetypeId:binding.personaArchetypeId,voicePackageId:binding.voicePackageId,provider,body,textHash,audioHash,personaReceiptHash,at:new Date().toISOString()};out.receiptHash=sha256(out);return out;
}
/* REGION: LEEWAY.VOICE.RUNTIME; TAG: RESOLVE_RENDER_RECHECK
WHO: Voice Fabric. WHAT: Execute the selected speaker through a supplied native provider transport.
WHEN: A prepared-text request. WHERE: existing Voice runtime; adapters do not choose speakers.
WHY: A provider failure or binding change must not authorize stale/substitute audio.
HOW: Re-read canonical binding, dispatch one provider, check returned identity and selection revision.
LICENSE: MIT */
export function voiceSelectionSnapshot({bindings,catalog,agentId='agent-lee'}={}){
 const selected=resolveAgentVoiceSelection({bindings,catalog,agentId});
 return Object.freeze({...selected,selectionRevision:sha256(selected)});
}
export async function renderBoundAgentSpeech({text,resolveSelection,providers}={}){
 if(typeof text!=='string'||!text.trim()||text.length>1500)throw new Error('VOICE_PREPARED_TEXT_INVALID');
 if(typeof resolveSelection!=='function')throw new Error('VOICE_BINDING_RESOLVER_REQUIRED');
 const selected=await resolveSelection();
 if(selected?.authority!=='LEEWAY_VOICE_FABRIC'||!selected.selectionRevision)throw new Error('VOICE_SELECTION_SNAPSHOT_REQUIRED');
 const provider=Object.hasOwn(providers||{},selected.provider)?providers[selected.provider]:null;
 if(typeof provider!=='function')throw new Error('SELECTED_VOICE_PROVIDER_UNBOUND');
 const rendered=await provider({text,voicePackageId:selected.voicePackageId,voiceId:selected.voiceId,provider:selected.provider});
 if(rendered?.voicePackageId!==selected.voicePackageId||rendered?.provider!==selected.provider||
    (selected.voiceId && rendered.voiceId!==selected.voiceId))throw new Error('VOICE_RENDERER_IDENTITY_MISMATCH');
 if(typeof rendered.audioContent!=='string'||!rendered.audioContent||rendered.format!=='wav')throw new Error('VOICE_AUDIO_UNAVAILABLE');
 const audio=Buffer.from(rendered.audioContent,'base64');
 if(audio.length<44||audio.length>24000*120*4||audio.toString('ascii',0,4)!=='RIFF'||audio.toString('ascii',8,12)!=='WAVE')throw new Error('VOICE_AUDIO_CONTAINER_INVALID');
 const now=await resolveSelection();
 if(now.selectionRevision!==selected.selectionRevision)throw new Error('STALE_VOICE_SELECTION_AUDIO_REJECTED');
 return {...rendered,agentId:selected.agentId,personaFamily:selected.personaFamily,personaArchetypeId:selected.personaArchetypeId,
   voiceAuthority:selected.authority,selectionRevision:selected.selectionRevision,qualificationOnly:selected.qualificationOnly,
   productionAdmitted:selected.productionAdmitted,textHash:sha256(text),state:'SYNTHESIZED_NOT_PLAYBACK_VERIFIED',
   deviceMayOverride:false,systemVoiceFallback:false};
}