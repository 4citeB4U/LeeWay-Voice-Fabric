import {voiceRegistry} from './voice-registry.js';
import {createRtcVoiceBinding} from './edge-rtc-voice-adapter.js';
const $=s=>document.querySelector(s),voice=new globalThis.LeeWayBrowserVoice();
let selectedId='agent-lee-voice-one',packages=[],rtcBinding=null,preparing=null;
const rtcSessionId='voice-lab-p2';
function rtc(){if(!rtcBinding)rtcBinding=createRtcVoiceBinding({voice,sessionId:rtcSessionId,voicePackageId:selectedId,getVoicePackageId:()=>selectedId});return rtcBinding;}
function gateSnapshot(){const snapshot=rtc().snapshot();const node=$('#gateSnapshot');if(node)node.textContent=JSON.stringify({gate:'P2_CANDIDATE_NOT_PROMOTED',ready:voice.ready,...snapshot},null,2);return snapshot;}
async function control(type){try{const result=await rtc().handle({type,sessionId:rtcSessionId});state(type);gateSnapshot();return result;}catch(error){state('ERROR: '+error.message);throw error;}}
const log=(message,data)=>{$('#log').textContent+=`[${new Date().toLocaleTimeString()}] ${message}${data?' '+JSON.stringify(data):''}\n`;if($('#log').textContent.length>16000)$('#log').textContent=$('#log').textContent.slice(-16000);$('#log').scrollTop=$('#log').scrollHeight;};
const state=message=>{if($('#state').textContent===message)return;$('#state').textContent=message;const ready=$('#voiceReadyState');if(ready)ready.textContent=message;log(message);};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
async function refresh(){
 packages=(await voiceRegistry.list()).filter(p=>p.id==='agent-lee-voice-one'||p.source==='USER_LOCAL');if(!packages.some(p=>p.id===selectedId))selectedId='agent-lee-voice-one';
 $('#voiceList').innerHTML=packages.map(p=>`<button class="voice-item ${p.id===selectedId?'active':''}" data-id="${esc(p.id)}"><strong>${esc(p.name)}</strong><small>${esc(p.owner)} · ${esc(p.source)} · ${esc(p.id)}</small></button>`).join('');
 document.querySelectorAll('.voice-item').forEach(b=>b.onclick=()=>select(b.dataset.id));
 if(selectedId)await select(selectedId,false);
 if(selectedId==='agent-lee-voice-one'){
   state('Agent Lee Voice One selected. Preparing automatically...');
   queueMicrotask(()=>prepareSelected().catch(e=>state('ERROR: '+e.message)));
 }else{
   state('Voice package selected. It will prepare automatically when spoken.');
 }
}
async function select(id,rerender=true){
 const pkg=packages.find(p=>p.id===id)||await voiceRegistry.get(id);if(!pkg)throw new Error('Voice package not found.');rtcBinding?.dispose();rtcBinding=null;selectedId=id;
 if(rerender){document.querySelectorAll('.voice-item').forEach(b=>b.classList.toggle('active',b.dataset.id===id));}
 $('#selectedTitle').textContent=pkg.name;$('#selectedMeta').textContent=`${pkg.owner} · ${pkg.provider} · ${pkg.id}`;
 $('#delivery').value=String(pkg.exaggeration);$('#pace').value=String(pkg.pace);$('#paceValue').value=Number(pkg.pace).toFixed(2)+'×';
 voice.exaggeration=Number(pkg.exaggeration);voice.setPace(pkg.pace);voice.ready=false;
 $('#sdkExample').textContent=`const voice = createLeeWayVoice();\nawait voice.selectVoice("${pkg.id}");\nawait voice.prepare();\nawait voice.speak("Hello from ${pkg.name}.");`;
 state(`Selected ${pkg.name}. Prepare before speaking.`);
}
async function prepareSelected(){
 if(preparing)return preparing;
 preparing=prepareSelectedOnce();try{return await preparing;}finally{preparing=null;gateSnapshot();}
}
async function prepareSelectedOnce(){
 const pkg=await voiceRegistry.get(selectedId);if(!pkg)throw new Error('Select a voice package.');
 state(`Preparing ${pkg.name} automatically...`);let progressAt=0;
 await voice.load(p=>{const now=Date.now();if(now-progressAt<500&&p.status!=='ready')return;progressAt=now;
  const progress=Number.isFinite(p.progress)?` ${Math.round(p.progress)}%`:'';
  state(p.message||`Loading Agent Lee Voice One${progress}...`);
 });
 const blob=await voiceRegistry.audio(pkg.id);if(!blob)throw new Error('Voice reference audio unavailable.');
 await voice.setReference(blob);voice.exaggeration=Number($('#delivery').value);voice.setPace($('#pace').value);state('Agent Lee Voice One ready.');
 if(audioAuthorized&&!greetingSpoken){greetingSpoken=true;await voice.speak(VOICE_ONE_GREETING,{onState:state});}
}
$('#stop').onclick=()=>control('speech.stop').catch(()=>{});
$('#pause').onclick=()=>control('speech.pause').catch(()=>{});
$('#resume').onclick=()=>control('speech.resume').catch(()=>{});
$('#interrupt').onclick=()=>control('barge-in').catch(()=>{});
$('#exportGate').onclick=()=>{
 const receipt={schema:'leeway.voice.p2.local.v1',at:new Date().toISOString(),url:location.href,
   automatedGate:'NOT_RUN_IN_THIS_RECEIPT',humanAudibility:'AWAITING_CREATOR',microphoneUpstream:'NOT_TESTED',
   formulaExecution:'NOT_EXECUTED',...gateSnapshot(),metrics:globalThis.LeeWayVoiceMetrics.snapshot()};
 const url=URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download='voice-p2-live-receipt.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
// Read-only diagnostics plus the same public controls used by the UI.
globalThis.LeeWayVoiceLiveGate={snapshot:gateSnapshot,control,metrics:()=>globalThis.LeeWayVoiceMetrics.snapshot()};
$('#delivery').onchange=e=>{voice.exaggeration=Number(e.target.value);state('Session delivery updated.');};
$('#pace').oninput=e=>{$('#paceValue').value=Number(e.target.value).toFixed(2)+'×';voice.setPace(e.target.value);};
$('#speak').onclick=async()=>{try{if(!voice.ready)await prepareSelected();await rtc().speak($('#text').value,{onState:state});gateSnapshot();}catch(e){if(e.name!=='AbortError')state('ERROR: '+e.message);}};
$('#stream').onclick=async()=>{try{if(!voice.ready)await prepareSelected();const stream=new globalThis.LeeWaySpeechStream(),task=voice.speakStream(stream,{onState:state,onRendered:t=>log('Rendered',t)});for(const word of $('#text').value.split(/(\s+)/)){stream.push(word);await new Promise(r=>setTimeout(r,90));}stream.end();await task;}catch(e){if(e.name!=='AbortError')state('ERROR: '+e.message);}};
$('#saveVoice').onclick=async()=>{try{
 const file=$('#newReference').files?.[0];if(!file)throw new Error('Choose a reference audio file.');
 const pkg=await voiceRegistry.save({id:$('#newId').value,name:$('#newName').value,owner:$('#newOwner').value,pace:Number($('#newPace').value),exaggeration:Number($('#newDelivery').value),provider:'chatterbox',source:'USER_LOCAL'},file);
 selectedId=pkg.id;await refresh();state(`Saved ${pkg.name}. It is now available to Voice Fabric clients on this browser/device.`);
}catch(e){state('ERROR: '+e.message);}};
$('#deleteVoice').onclick=async()=>{try{await voiceRegistry.remove(selectedId);selectedId='agent-lee-voice-one';await refresh();state('Local voice package deleted.');}catch(e){state('ERROR: '+e.message);}};
$('#exportVoice').onclick=async()=>{try{const {metadata,audio}=await voiceRegistry.exportPackage(selectedId);const zipLike={...metadata,audioFile:'reference-audio (download separately)'};const meta=new Blob([JSON.stringify(zipLike,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(meta);a.download=`${metadata.id}.voice-package.json`;a.click();URL.revokeObjectURL(a.href);const b=document.createElement('a');b.href=URL.createObjectURL(audio);b.download=`${metadata.id}-reference`;b.click();setTimeout(()=>URL.revokeObjectURL(b.href),1000);state('Voice package export started.');}catch(e){state('ERROR: '+e.message);}};
addEventListener('leeway-voice-metric',()=>{const last=globalThis.LeeWayVoiceMetrics.snapshot().at(-1);if(last)log(last.stage,last);if(rtcBinding)gateSnapshot();});
refresh().catch(e=>state('ERROR: '+e.message));
const VOICE_ONE_GREETING='Agent Lee Voice One is active.';
let audioAuthorized=false,greetingSpoken=false;
async function authorizeVoiceAudio(){
  if(audioAuthorized)return;
  audioAuthorized=true;
  try{
    const ctx=await voice.audioContext();
    if(ctx.state==='suspended')await ctx.resume();
    state(voice.ready?'Agent Lee Voice One ready.':'Agent Lee Voice One loading automatically...');
    if(voice.ready&&!greetingSpoken){
      greetingSpoken=true;
      await voice.speak(VOICE_ONE_GREETING,{onState:state});
    }
  }catch(e){state('Voice One audio activation blocked: '+e.message);}
}
addEventListener('pointerdown',authorizeVoiceAudio,{once:true});
addEventListener('touchstart',authorizeVoiceAudio,{once:true,passive:true});
// A deliberate speech/control gesture takes priority over the automatic greeting.
// Capture runs before the existing bubble-phase audio-authorization listener.
function prioritizeSpeechControl(event){
  if(event.target?.closest?.('#speak,#stream,#pause,#resume,#stop,#interrupt'))greetingSpoken=true;
}
addEventListener('pointerdown',prioritizeSpeechControl,{capture:true});
addEventListener('touchstart',prioritizeSpeechControl,{capture:true,passive:true});
