/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.STUDIO.INLINE.DUPLEX.BRIDGE
TAG: SINGLE_LIVE_CONVERSATION_AND_SPHERE
WHO: LeeWay Industries; WHAT: connect Edge RTC telemetry to Studio orb
WHY: allow exact live test to animate existing spatial engine without hiding it
WHERE: original Studio; WHEN: 2026-10-24
HOW: origin-checked iframe postMessage, no audio/mic duplication.
AUTHORITY: telemetry only, no device commands; LICENSE: existing terms.
*/
const iframe=document.getElementById('duplexInlineFrame');
const start=document.getElementById('duplexInlineLoad');
const stop=document.getElementById('duplexInlineClose');
const message=document.getElementById('duplexInlineStatus');
const standalone=document.getElementById('duplexSeparateLink');
const target=new URL('http://127.0.0.1:5173/LeeWay-Edge-RTC/conversation-gate.html');
const verifiedOrigin=target.origin;
let active=false;
function choice(){
  const info=document.getElementById('selectedMeta')?.textContent||'';
  const match=info.match(/kokoro[-_]((?:af|am|bf|bm)_[a-z0-9]+)/i);
  return match?'kokoro-'+match[1].toLowerCase():null;
}
function signal(detail){
  document.dispatchEvent(new CustomEvent('leeway:duplex-activity',{detail}));
}
function open(){
 if(active||!iframe)return;
 active=true;
 const url=new URL(target);
 const voice=choice();
 if(voice)url.searchParams.set('voice',voice);
 standalone.href=url.href;
 iframe.src=url.href;
 iframe.hidden=false;
 document.body.classList.add('leeway-duplex-open');
 start.hidden=true;stop.hidden=false;
 message.textContent='Test loaded. Choose conversation mode, prepare Kokoro and enable microphone below.';
 signal({active:true,phase:'ready',inputRms:0});
}
function close(){
 if(!active)return;
 active=false;
 // Destroying the embedded document ends its microphone tracks and TTS
 // even if a Stop click was missed. The voice editor never owns this mic.
 iframe.src='about:blank';iframe.hidden=true;
 document.body.classList.remove('leeway-duplex-open');
 start.hidden=false;stop.hidden=true;
 message.textContent='Test stopped. Browser microphone and playback released with iframe.';
 signal({active:false,phase:'idle',inputRms:0});
}
start?.addEventListener('click',open);
stop?.addEventListener('click',close);
window.addEventListener('message',event=>{
 if(!active||event.source!==iframe?.contentWindow||event.origin!==verifiedOrigin)return;
 const info=event.data;
 if(!info||info.channel!=='LEEWAY_DUPLEX_TELEMETRY_V1'||!['phase','playout','mic-level'].includes(info.kind))return;
 const phases=['ready','starting','listening','thinking','speaking','stopping','stopped','error','idle'];
 const phase=phases.includes(info.phase)?info.phase:'ready';
 const rms=Number.isFinite(info.rms)?Math.max(0,Math.min(1,info.rms)):0;
 if(info.kind==='phase'||info.kind==='playout')message.textContent='Conversation: '+phase+(phase==='speaking'?' (Kokoro playback active)':'');
 signal({active:true,phase,inputRms:rms,kind:info.kind});
});
window.addEventListener('pagehide',close);
