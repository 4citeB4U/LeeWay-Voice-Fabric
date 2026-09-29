import {voiceRegistry} from './voice-registry.js';
const $=s=>document.querySelector(s),voice=new globalThis.LeeWayBrowserVoice();
let selectedId='agent-lee-voice-one',packages=[];
const log=(message,data)=>{$('#log').textContent+=`[${new Date().toLocaleTimeString()}] ${message}${data?' '+JSON.stringify(data):''}\n`;$('#log').scrollTop=$('#log').scrollHeight;};
const state=message=>{$('#state').textContent=message;const ready=$('#voiceReadyState');if(ready)ready.textContent=message;log(message);};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
async function refresh(){
 packages=(await voiceRegistry.list()).filter(p=>p.id==='agent-lee-voice-one'||p.source==='USER_LOCAL');if(!packages.some(p=>p.id===selectedId))selectedId='agent-lee-voice-one';
 $('#voiceList').innerHTML=packages.map(p=>`<button class="voice-item ${p.id===selectedId?'active':''}" data-id="${esc(p.id)}"><strong>${esc(p.name)}</strong><small>${esc(p.owner)} · ${esc(p.source)} · ${esc(p.id)}</small></button>`).join('');
 document.querySelectorAll('.voice-item').forEach(b=>b.onclick=()=>select(b.dataset.id));
 if(selectedId)await select(selectedId,false);state('Agent Lee Voice One selected. Preparing automatically...');prepareSelected().catch(e=>state('ERROR: '+e.message));
}
async function select(id,rerender=true){
 const pkg=packages.find(p=>p.id===id)||await voiceRegistry.get(id);if(!pkg)throw new Error('Voice package not found.');selectedId=id;
 if(rerender){document.querySelectorAll('.voice-item').forEach(b=>b.classList.toggle('active',b.dataset.id===id));}
 $('#selectedTitle').textContent=pkg.name;$('#selectedMeta').textContent=`${pkg.owner} · ${pkg.provider} · ${pkg.id}`;
 $('#delivery').value=String(pkg.exaggeration);$('#pace').value=String(pkg.pace);$('#paceValue').value=Number(pkg.pace).toFixed(2)+'×';
 voice.exaggeration=Number(pkg.exaggeration);voice.setPace(pkg.pace);voice.ready=false;
 $('#sdkExample').textContent=`const voice = createLeeWayVoice();\nawait voice.selectVoice("${pkg.id}");\nawait voice.prepare();\nawait voice.speak("Hello from ${pkg.name}.");`;
 state(`Selected ${pkg.name}. Prepare before speaking.`);
}
async function prepareSelected(){
 const pkg=await voiceRegistry.get(selectedId);if(!pkg)throw new Error('Select a voice package.');
 state(`Preparing ${pkg.name} automatically...`);await voice.load(()=>state('Loading Agent Lee Voice One...'));
 const blob=await voiceRegistry.audio(pkg.id);if(!blob)throw new Error('Voice reference audio unavailable.');
 await voice.setReference(blob);voice.exaggeration=Number(pkg.exaggeration);voice.setPace(pkg.pace);state('Agent Lee Voice One ready.');
 if(audioAuthorized&&!greetingSpoken){greetingSpoken=true;await voice.speak(VOICE_ONE_GREETING,{onState:state});}
}
$('#stop').onclick=()=>{voice.stop();state('Stopped speaking.');};
$('#delivery').onchange=e=>{voice.exaggeration=Number(e.target.value);state('Session delivery updated.');};
$('#pace').oninput=e=>{$('#paceValue').value=Number(e.target.value).toFixed(2)+'×';voice.setPace(e.target.value);};
$('#speak').onclick=async()=>{try{if(!voice.ready)await prepareSelected();await voice.speak($('#text').value,{onState:state});}catch(e){if(e.name!=='AbortError')state('ERROR: '+e.message);}};
$('#stream').onclick=async()=>{try{if(!voice.ready)await prepareSelected();const stream=new globalThis.LeeWaySpeechStream(),task=voice.speakStream(stream,{onState:state,onRendered:t=>log('Rendered',t)});for(const word of $('#text').value.split(/(\s+)/)){stream.push(word);await new Promise(r=>setTimeout(r,90));}stream.end();await task;}catch(e){if(e.name!=='AbortError')state('ERROR: '+e.message);}};
$('#saveVoice').onclick=async()=>{try{
 const file=$('#newReference').files?.[0];if(!file)throw new Error('Choose a reference audio file.');
 const pkg=await voiceRegistry.save({id:$('#newId').value,name:$('#newName').value,owner:$('#newOwner').value,pace:Number($('#newPace').value),exaggeration:Number($('#newDelivery').value),provider:'chatterbox',source:'USER_LOCAL'},file);
 selectedId=pkg.id;await refresh();state(`Saved ${pkg.name}. It is now available to Voice Fabric clients on this browser/device.`);
}catch(e){state('ERROR: '+e.message);}};
$('#deleteVoice').onclick=async()=>{try{await voiceRegistry.remove(selectedId);selectedId='agent-lee-voice-one';await refresh();state('Local voice package deleted.');}catch(e){state('ERROR: '+e.message);}};
$('#exportVoice').onclick=async()=>{try{const {metadata,audio}=await voiceRegistry.exportPackage(selectedId);const zipLike={...metadata,audioFile:'reference-audio (download separately)'};const meta=new Blob([JSON.stringify(zipLike,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(meta);a.download=`${metadata.id}.voice-package.json`;a.click();URL.revokeObjectURL(a.href);const b=document.createElement('a');b.href=URL.createObjectURL(audio);b.download=`${metadata.id}-reference`;b.click();setTimeout(()=>URL.revokeObjectURL(b.href),1000);state('Voice package export started.');}catch(e){state('ERROR: '+e.message);}};
addEventListener('leeway-voice-metric',()=>{const last=globalThis.LeeWayVoiceMetrics.snapshot().at(-1);if(last)log(last.stage,last);});
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
