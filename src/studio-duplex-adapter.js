/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.STUDIO.SINGLE_VOICE_BINDING
TAG: ONE_VOICE_ALL_CONVERSATION
WHO: LeeWay Industries; WHAT: wire selected existing Voice Fabric speaker to child
WHY: no second test voice picker or disconnected per-session speaker
WHERE: original spatial Studio; WHEN: 2026-10-24
HOW: existing leeway:studio events, owner binding and frame lifecycle.
AUTHORITY: shared publication stays behind existing owner CSRF/revision consent.
LICENSE: existing terms.
*/
const iframe=document.getElementById('duplexInlineFrame');
const start=document.getElementById('duplexInlineLoad');
const stop=document.getElementById('duplexInlineClose');
const message=document.getElementById('duplexInlineStatus');
const standalone=document.getElementById('duplexSeparateLink');
const target=new URL('http://127.0.0.1:5173/LeeWay-Edge-RTC/conversation-gate.html');
const verifiedOrigin=target.origin;
const canonical=/^kokoro-(?:af|am|bf|bm)_[a-z0-9]+$/;
let active=false;
let selected=null;
let lastPublished=null;
let syncRevision=null;
function selectedFromStudio(){
 const info=document.getElementById('selectedMeta')?.textContent||'';
 const match=info.match(/kokoro[-_]((?:af|am|bf|bm)_[a-z0-9]+)/i);
 return match ? 'kokoro-'+match[1].toLowerCase() : null;
}
function updateCurrentSelection(){
 const picked=selectedFromStudio();
 if(picked && canonical.test(picked))selected=picked;
 return selected;
}
function signal(detail){
 document.dispatchEvent(new CustomEvent('leeway:duplex-activity',{detail}));
}
function openUrl(){
 const url=new URL(target);
 if(selected)url.searchParams.set('voice',selected);
 standalone.href=url.href;
 return url.href;
}
function restartForVoiceChange(){
 if(!active||!iframe)return;
 // Release the previous ASR/TTS session before admitting a different voice.
 iframe.src='about:blank';
 signal({active:true,phase:'stopping',inputRms:0});
 const url=openUrl();
 iframe.src=url;
 message.textContent='Voice changed in Studio. Previous voice session released; resume listening with '+selected+'.';
 signal({active:true,phase:'ready',inputRms:0});
}
function open(){
 if(active||!iframe)return;
 if(!updateCurrentSelection()){
  message.textContent='Select a supported local Kokoro voice from the Studio voice library first.';
  return;
 }
 active=true;
 iframe.src=openUrl();
 iframe.hidden=false;
 document.body.classList.add('leeway-duplex-open');
 start.hidden=true;stop.hidden=false;
 message.textContent='Using Studio voice '+selected+'. Load the engine or enable microphone below.';
 signal({active:true,phase:'ready',inputRms:0});
}
function close(){
 if(!active)return;
 active=false;
 iframe.src='about:blank';iframe.hidden=true;
 document.body.classList.remove('leeway-duplex-open');
 start.hidden=false;stop.hidden=true;
 message.textContent='Test stopped; the Studio voice selection is preserved.';
 signal({active:false,phase:'idle',inputRms:0});
}
start?.addEventListener('click',open);
stop?.addEventListener('click',close);
// Studio dispatches draft-change for all voice selection and tuning edits.
// Changes take effect in the voice test automatically; no second selector.
document.addEventListener('leeway:studio',event=>{
 const info=event.detail||{};
 if(info.type!=='draft-change'&&info.type!=='selected')return;
 const previous=selected;
 if(typeof info.voicePackageId==='string' && canonical.test(info.voicePackageId)){
  selected=info.voicePackageId;
 } else updateCurrentSelection();
 if(previous && selected!==previous)restartForVoiceChange();
});
// Shared owner publication is the canonical cross-device voice choice.
// It changes only through the existing explicit Studio Apply operation.
document.addEventListener('leeway:shared-voice',event=>{
 const detail=event.detail||{};
 if(typeof detail.voicePackageId!=='string')return;
 if(!canonical.test(detail.voicePackageId))return;
 lastPublished=detail.voicePackageId;
 syncRevision=detail.revision||null;
 if(!active && !selected)selected=lastPublished;
});
window.addEventListener('message',event=>{
 if(!active||event.source!==iframe?.contentWindow||event.origin!==verifiedOrigin)return;
 const info=event.data;
 if(!info||info.channel!=='LEEWAY_DUPLEX_TELEMETRY_V1'||!['phase','playout','mic-level'].includes(info.kind))return;
 const phases=['ready','starting','listening','thinking','speaking','stopping','stopped','error','idle'];
 const phase=phases.includes(info.phase)?info.phase:'ready';
 const rms=Number.isFinite(info.rms)?Math.max(0,Math.min(1,info.rms)):0;
 if(info.kind==='phase'||info.kind==='playout')
   message.textContent='Voice: '+selected+' · Conversation: '+phase;
 signal({active:true,phase,inputRms:rms,kind:info.kind});
});
window.addEventListener('pagehide',close);
