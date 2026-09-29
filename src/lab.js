const $=s=>document.querySelector(s),voice=new globalThis.LeeWayBrowserVoice();
const log=(message,data)=>{$('#log').textContent+=`[${new Date().toLocaleTimeString()}] ${message}${data?' '+JSON.stringify(data):''}\n`;$('#log').scrollTop=$('#log').scrollHeight;};
const state=message=>{$('#state').textContent=message;log(message);};
$('#prepare').onclick=async()=>{try{state('Preparing Voice One...');await voice.load(p=>state(p.message||p.status||'Preparing...'));state(`Ready on ${voice.device}`);}catch(e){state('ERROR: '+e.message);}};
$('#stop').onclick=()=>{voice.stop();state('Stopped.');};
$('#delivery').onchange=e=>{voice.exaggeration=Number(e.target.value);state('Delivery updated.');};
$('#pace').oninput=e=>{$('#paceValue').value=Number(e.target.value).toFixed(2)+'×';voice.setPace(e.target.value);};
$('#reference').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{await voice.setReference(file);state('Custom reference loaded for this session.');}catch(err){state('ERROR: '+err.message);}};
$('#speak').onclick=async()=>{try{await voice.speak($('#text').value,{onState:state});}catch(e){if(e.name!=='AbortError')state('ERROR: '+e.message);}};
$('#stream').onclick=async()=>{
 try{
  if(!voice.ready)throw new Error('Prepare the voice first.');
  const stream=new globalThis.LeeWaySpeechStream(),task=voice.speakStream(stream,{onState:state,onRendered:t=>log('Rendered',t)});
  const words=$('#text').value.split(/(\s+)/);
  for(const word of words){stream.push(word);await new Promise(r=>setTimeout(r,90));}
  stream.end();await task;
 }catch(e){if(e.name!=='AbortError')state('ERROR: '+e.message);}
};
addEventListener('leeway-voice-metric',()=>{const last=globalThis.LeeWayVoiceMetrics.snapshot().at(-1);if(last)log(last.stage,last);});