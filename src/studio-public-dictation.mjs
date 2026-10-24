/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.FABRIC.PUBLIC.DICTATION
TAG: HTTPS_BROWSER_ASR_WITHOUT_LOCALHOST_IFRAME
WHO: LeeWay Industries; WHAT: capture speech into You said on public HTTPS Studio
WHY: GitHub Pages cannot supply a loopback Agent Lee conversation backend
WHERE: public Voice Fabric Studio; WHEN: 2026-10-24
HOW: explicit browser SpeechRecognition, no TTS, no device commands
AUTHORITY: microphone starts only after user click. The browser might send
speech to its recognition provider. This is NOT offline LeeWay ASR.
LICENSE: existing repository terms.
*/
export function createBrowserDictation({
 Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition,
 onText=()=>{},onState=()=>{},
}={}){
 let engine=null,active=false;
 const api={
  supported:typeof Recognition==='function',
  start(){
   if(active)return false;
   if(typeof Recognition!=='function'){onState('unsupported');return false;}
   let instance;
   try{
    instance=new Recognition();
    instance.lang=globalThis.navigator?.language||'en-US';
    instance.continuous=true;instance.interimResults=true;instance.maxAlternatives=1;
   }catch{onState('unavailable');return false;}
   engine=instance;active=true;
   instance.onstart=()=>{if(active)onState('listening')};
   instance.onspeechstart=()=>{if(active)onState('hearing')};
   instance.onresult=event=>{
    if(!active)return;
    let completed='',interim='';
    for(let i=0;i<(event.results?.length||0);i++){
     const first=event.results[i]?.[0];
     const text=typeof first?.transcript==='string'?first.transcript.trim():'';
     if(!text)continue;
     if(event.results[i].isFinal)completed+=(completed?' ':'')+text;
     else interim+=(interim?' ':'')+text;
    }
    onText([completed,interim].filter(Boolean).join(' ').slice(0,3000),
      {final:!interim&&Boolean(completed)});
   };
   instance.onerror=event=>{
    if(!active)return;
    const kind=typeof event?.error==='string'?event.error:'recognition-failed';
    onState(kind);
    if(['not-allowed','service-not-allowed','audio-capture'].includes(kind))api.stop();
   };
   instance.onend=()=>{
    if(!active)return;
    active=false;engine=null;onState('ended');
   };
   try{instance.start();onState('requesting-microphone');return true}
   catch{active=false;engine=null;onState('start-failed');return false}
  },
  stop(){
   if(!active)return;
   active=false;const current=engine;engine=null;
   try{current?.stop?.()}catch{}
   onState('stopped');
  },
  get active(){return active},
 };
 return api;
}
export function mountPublicDictation(doc=globalThis.document,{
 hostname=globalThis.location?.hostname||'',
 Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition,
}={}){
 if(hostname.toLowerCase()!=='4citeb4u.github.io'||!doc)return null;
 const container=doc.getElementById('duplexInline');
 const obsolete=doc.getElementById('duplexInlineLoad');
 const obsoleteStop=doc.getElementById('duplexInlineClose');
 const frame=doc.getElementById('duplexInlineFrame');
 const oldStatus=doc.getElementById('duplexInlineStatus');
 if(!container||!obsolete||!frame)return null;
 doc.body.dataset.publicVoice='dictation';
 obsolete.hidden=true;obsolete.style.display='none';
 if(obsoleteStop){obsoleteStop.hidden=true;obsoleteStop.style.display='none'}
 frame.hidden=true;frame.style.display='none';frame.removeAttribute('src');
 const controls=doc.createElement('div');
 controls.className='leeway-public-dictation';
 controls.innerHTML=[
  '<div class="leeway-duplex-controls">',
  '<button id="publicDictationStart" type="button" class="primary">Enable microphone & listen</button>',
  '<button id="publicDictationStop" type="button" disabled>Stop listening</button>',
  '</div>',
  '<p id="publicDictationStatus" role="status" aria-live="polite">Microphone off. Dictation uses this browser\'s speech recognition service.</p>',
  '<section class="panel" aria-label="Recognized speech"><h3>You said</h3>',
  '<div id="publicDictationText" aria-live="polite"></div></section>',
  '<p class="hint">Browser dictation only. GitHub Pages cannot run the local Agent Lee/Qwen response engine.',
  'Browser speech recognition may use an online provider. For full Agent Lee conversation,',
  'open the standalone application on the computer running LeeWay Edge RTC.</p>',
 ].join('');
 container.append(controls);
 const heading=container.querySelector('h3');
 if(heading)heading.textContent='Browser voice dictation';
 if(oldStatus)oldStatus.textContent='Public Studio: microphone dictation available; Agent Lee conversation backend not connected.';
 const start=controls.querySelector('#publicDictationStart');
 const stop=controls.querySelector('#publicDictationStop');
 const status=controls.querySelector('#publicDictationStatus');
 const transcript=controls.querySelector('#publicDictationText');
 const signal=phase=>doc.dispatchEvent(new CustomEvent('leeway:duplex-activity',{
  detail:{active:phase!=='idle',kind:'phase',phase,inputRms:0}}));
 const asr=createBrowserDictation({Recognition,
  onText:text=>{transcript.textContent=text},
  onState:state=>{
   const labels={
    listening:'Listening. Speak normally.',hearing:'Hearing speech…',
    'requesting-microphone':'Waiting for microphone permission…',
    stopped:'Listening stopped.',
    ended:'Recognition ended. Select Enable microphone to try again.',
    unsupported:'Speech recognition is unavailable in this browser. Use compatible Chrome/Edge or LeeWay local ASR.',
    'not-allowed':'Microphone permission denied. Enable it in the browser site settings.',
    'service-not-allowed':'The browser recognition service denied this request.',
    'audio-capture':'No usable microphone detected.',
    network:'Speech recognition network unavailable. Your browser may require an online service.',
    'no-speech':'No speech detected. Try again.',
   };
   status.textContent=labels[state]||('Recognition status: '+state);
   start.disabled=asr.active;stop.disabled=!asr.active;
   signal(asr.active?'listening':'idle');
  },
 });
 start.addEventListener('click',()=>asr.start());
 stop.addEventListener('click',()=>asr.stop());
 globalThis.addEventListener?.('pagehide',()=>asr.stop());
 signal('idle');
 return asr;
}
if(typeof document!=='undefined')mountPublicDictation();
