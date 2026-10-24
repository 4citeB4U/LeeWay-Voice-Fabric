<#
REGION: LEEWAY.VOICE.REPAIR; TAG: EXISTING_SPEECH_PIPELINE_BINDING
WHO: Creator-authorized Agent Lee. WHAT: Bind native synthesis to the existing Voice stream and epoch.
WHEN: After speaker ownership repair. WHERE: inspected Voice and Runtime source only.
WHY: Remove the separate UI-owned audio loop without creating another speech engine.
HOW: Exact input hashes, dry run, backup, bounded source replacements, tests and explicit deployment.
LICENSE: MIT
#>
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$RuntimeRoot,[Parameter(Mandatory=$true)][string]$EvidenceDirectory,[switch]$Apply)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
if((& git -C $root remote get-url origin|Out-String).Trim() -ne 'https://github.com/4citeB4U/LeeWay-Voice-Fabric.git'){throw 'VOICE_ORIGIN_MISMATCH'}
if((& git -C $root rev-parse HEAD|Out-String).Trim() -ne '31e49ccc1c2d748708262623b33b2aeade7f8b3c'){throw 'VOICE_SOURCE_CHANGED'}
if((& git -C $RuntimeRoot rev-parse HEAD|Out-String).Trim() -ne '4eb6c0ae1dad2ea259ab376919832d7e278e477d'){throw 'RUNTIME_SOURCE_CHANGED'}
$inputs=[ordered]@{
 (Join-Path $root 'src/speech-pipeline.js')='95ABE3AC78EF29261ED84F79287F0481AFA53C8E9752E6F66580F22F7D1A5C89'
 (Join-Path $root 'src/voice-sdk.js')='14DCD0FFC70CC2896D0956ECDAF07C238BCE0C26CBAB5C1D6FEADC9CA301966A'
 (Join-Path $RuntimeRoot 'machine-consciousness/pocket-voice.html')='FB1985086BAAD3F684016EA1040E67C0E975EDDFB4EFCFD2FE45CDBCA00A122B'
 (Join-Path $RuntimeRoot 'machine-consciousness/carrier-server.mjs')='01D34CC83CAF1DF7EA66F0612D2D729E9814D93D672BEE1B0257EFF47AF9A043'
}
foreach($p in $inputs.Keys){if((Get-FileHash $p -Algorithm SHA256).Hash -ne $inputs[$p]){throw ('REPAIR_INPUT_CHANGED:'+ $p)}}
function Once([string]$s,[string]$old,[string]$new){if(([regex]::Matches($s,[regex]::Escape($old))).Count -ne 1){throw ('EXACT_BOUNDARY_NOT_UNIQUE:'+ $old.Substring(0,[Math]::Min(80,$old.Length)))};$s.Replace($old,$new)}
function Text([string]$p){[IO.File]::ReadAllText($p).Replace("`r`n","`n")}
$changes=[ordered]@{}
$p=Join-Path $root 'src/speech-pipeline.js';$s=Text $p
$s=Once $s @'
    if(!this.ready)throw new Error('Load the browser voice first.');
    if(signal?.aborted)throw aborted();
    this.stop();const epoch=this.epoch,iterator=stream[Symbol.asyncIterator]();let number=0;
'@ @'
    if(signal?.aborted)throw aborted();
    this.stop();const epoch=this.epoch;
    if(this.boundTransport)await this.prepareBound(epoch);
    if(epoch!==this.epoch||signal?.aborted)throw aborted();
    if(!this.ready)throw new Error('Load the browser voice first.');
    const iterator=stream[Symbol.asyncIterator]();let number=0;
'@
$extension=@'

  /* REGION: LEEWAY.VOICE.NATIVE_BINDING; TAG: SAME_STREAM_SAME_EPOCH
  WHO: Voice Fabric. WHAT: Bind an identity-verified renderer to the existing speech pipeline.
  WHEN: Prepared text/stream. WHERE: portable JS with supplied native transport.
  WHY: The UI owns no segmentation, queue, default speaker or native-TTS fallback.
  HOW: Explicit selection, serial native inference, stop epochs and live revision checks. LICENSE: MIT */
  function selection(value){
    const fields=['agentId','personaFamily','personaArchetypeId','voicePackageId','provider','selectionRevision'];
    if(value?.authority!=='LEEWAY_VOICE_FABRIC'||value.deviceMayOverride!==false||value.systemVoiceFallback!==false||
       fields.some(k=>typeof value[k]!=='string'||!value[k])||!(/^[a-f0-9]{64}$/).test(value.selectionRevision)||
       !['kokoro','chatterbox'].includes(value.provider))throw Error('VOICE_BOUND_SELECTION_INVALID');
    if(value.provider==='kokoro'&&(typeof value.voiceId!=='string'||!value.voiceId))throw Error('VOICE_BOUND_SPEAKER_REQUIRED');
    return Object.freeze({...value});
  }
  function decodeBoundWave(result,selected){
    if(result?.voiceAuthority!==selected.authority||result.selectionRevision!==selected.selectionRevision||
       ['agentId','personaFamily','personaArchetypeId','voicePackageId','provider'].some(k=>result[k]!==selected[k])||
       (selected.voiceId&&result.voiceId!==selected.voiceId))throw Error('VOICE_BOUND_RESULT_IDENTITY_MISMATCH');
    if(result.format!=='wav'||typeof result.audioContent!=='string'||result.audioContent.length>16000000)throw Error('VOICE_BOUND_WAVE_REQUIRED');
    const raw=atob(result.audioContent),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    if(bytes.length<44)throw Error('VOICE_BOUND_WAVE_TRUNCATED');
    const view=new DataView(bytes.buffer),tag=at=>String.fromCharCode(...bytes.subarray(at,at+4));
    if(tag(0)!=='RIFF'||tag(8)!=='WAVE'||view.getUint32(4,true)+8!==bytes.length)throw Error('VOICE_BOUND_WAVE_CONTAINER_INVALID');
    let rate=0,data=null,format=false;
    for(let at=12;at+8<=bytes.length;){const name=tag(at),size=view.getUint32(at+4,true),begin=at+8,end=begin+size;
      if(end>bytes.length)throw Error('VOICE_BOUND_WAVE_CHUNK_INVALID');
      if(name==='fmt '){if(format||size<16||view.getUint16(begin,true)!==1||view.getUint16(begin+2,true)!==1||view.getUint16(begin+14,true)!==16)throw Error('VOICE_BOUND_PCM_FORMAT_UNSUPPORTED');
        rate=view.getUint32(begin+4,true);if(rate<8000||rate>192000||view.getUint16(begin+12,true)!==2||view.getUint32(begin+8,true)!==rate*2)throw Error('VOICE_BOUND_PCM_RATE_INVALID');format=true;}
      if(name==='data'){if(data)throw Error('VOICE_BOUND_MULTIPLE_DATA_CHUNKS');data={begin,size};}
      at=end+(size%2);
    }
    if(!format||!data||data.size===0||data.size%2||data.size>rate*120*2)throw Error('VOICE_BOUND_PCM_LENGTH_INVALID');
    const samples=new Float32Array(data.size/2);for(let i=0;i<samples.length;i++){const n=view.getInt16(data.begin+2*i,true);samples[i]=n/(n<0?32768:32767);}
    return {audio:samples.buffer,sampleRate:rate,selectionRevision:selected.selectionRevision,voicePackageId:selected.voicePackageId};
  }
  Voice.decodeBoundWave=decodeBoundWave;
  Voice.prototype.bindProvider=function(transport){
    if(this.boundTransport||this.worker||this.ready)throw Error('VOICE_PROVIDER_ALREADY_BOUND');
    if(typeof transport?.resolveSelection!=='function'||typeof transport?.render!=='function')throw Error('VOICE_PROVIDER_TRANSPORT_REQUIRED');
    this.boundTransport=transport;this.boundTail=Promise.resolve();this.boundSelection=null;this.playbackRate=1;return this;
  };
  Voice.prototype.prepareBound=async function(epoch=this.epoch){
    const selected=selection(await this.boundTransport.resolveSelection());
    if(epoch!==this.epoch)throw aborted();this.boundSelection=selected;this.ready=true;this.device='VOICE_FABRIC_BOUND_PROVIDER';
    this.playbackRate=1;return selected;
  };
  const originalLoad=Voice.prototype.load,originalRequest=Voice.prototype.request,originalPlay=Voice.prototype.play;
  const originalReference=Voice.prototype.setReference,originalPace=Voice.prototype.setPace;
  Voice.prototype.load=function(...args){return this.boundTransport?this.prepareBound():originalLoad.apply(this,args);};
  Voice.prototype.setReference=function(...args){if(this.boundTransport)throw Error('SHARED_VOICE_SELECTION_REQUIRED');return originalReference.apply(this,args);};
  Voice.prototype.setPace=function(...args){if(this.boundTransport)throw Error('VOICE_PACKAGE_DELIVERY_POLICY_OWNS_PACE');return originalPace.apply(this,args);};
  Voice.prototype.request=function(type,data={},...rest){
    if(!this.boundTransport)return originalRequest.call(this,type,data,...rest);
    if(type!=='generate'||!this.boundSelection)throw Error('VOICE_BOUND_REQUEST_NOT_ALLOWED');
    const epoch=this.epoch,selected=this.boundSelection,id=++this.id;
    return new Promise((resolve,reject)=>{
      const record={type:'generate',resolve,reject,timer:null};this.pending.set(id,record);
      const task=this.boundTail.then(async()=>{
        if(epoch!==this.epoch||!this.pending.has(id))throw aborted();
        const controller=new AbortController();const nativeDeadline=setTimeout(()=>controller.abort(),120000);
        try{
          const before=selection(await this.boundTransport.resolveSelection());
          if(before.selectionRevision!==selected.selectionRevision)throw Error('STALE_VOICE_SELECTION_AUDIO_REJECTED');
          const result=await this.boundTransport.render({text:data.text,signal:controller.signal});
          if(epoch!==this.epoch||!this.pending.has(id))throw aborted();
          const after=selection(await this.boundTransport.resolveSelection());
          if(after.selectionRevision!==selected.selectionRevision)throw Error('STALE_VOICE_SELECTION_AUDIO_REJECTED');
          const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data.text)));
          const textHash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
          if(result.textHash!==textHash)throw Error('VOICE_PREPARED_TEXT_MISMATCH');
          if(epoch!==this.epoch||!this.pending.has(id))throw aborted();
          return decodeBoundWave(result,selected);
        }finally{clearTimeout(nativeDeadline);}
      });
      this.boundTail=task.catch(()=>{});
      task.then(value=>{if(this.pending.delete(id))resolve(value)},error=>{if(this.pending.delete(id))reject(error)});
    });
  };
  Voice.prototype.play=async function(result,epoch){
    if(!this.boundTransport)return originalPlay.call(this,result,epoch);
    const expected=this.boundSelection;
    const valid=async()=>{const current=selection(await this.boundTransport.resolveSelection());
      if(epoch!==this.epoch)throw aborted();
      if(!expected||result.selectionRevision!==expected.selectionRevision||current.selectionRevision!==expected.selectionRevision)throw Error('STALE_VOICE_SELECTION_AUDIO_REJECTED');};
    await valid();if(epoch!==this.epoch)throw aborted();
    let active=true,timer=null;const watch=async()=>{
      if(!active||epoch!==this.epoch)return;
      try{await valid();}catch(error){if(active&&epoch===this.epoch){this.stop();try{this.options.onUnavailable?.(error)}catch{}}return;}
      if(active&&epoch===this.epoch)timer=setTimeout(watch,500);
    };
    timer=setTimeout(watch,500);
    try{return await originalPlay.call(this,result,epoch);}finally{active=false;clearTimeout(timer);}
  };
'@
$s=Once $s '})(globalThis);' ($extension+"`n})(globalThis);");$changes[$p]=$s
$p=Join-Path $root 'src/voice-sdk.js';$s=Text $p
$s+=@'

/* REGION: LEEWAY.VOICE.SDK; TAG: EXISTING_PIPELINE_BOUND_TRANSPORT
WHO: Voice Fabric. WHAT: Connect the existing speech class to its Runtime transport.
WHEN: Agent UI startup. WHERE: same authorized origin; no independent UI speaker or queue.
WHY: Native worker rendering must use the same canonical speech pipeline.
HOW: Existing LeeWayBrowserVoice + LeeWaySpeechStream, exact Voice-owned selection. LICENSE: MIT */
export function createLeeWayBoundVoice({runtimeOrigin,onState=()=>{},onError=()=>{}}={}){
 const origin=new URL(runtimeOrigin).origin;
 if(origin!==globalThis.location?.origin)throw Error('VOICE_RUNTIME_SAME_ORIGIN_REQUIRED');
 if(typeof globalThis.LeeWayBrowserVoice?.prototype.bindProvider!=='function')throw Error('CANONICAL_VOICE_PIPELINE_NOT_LOADED');
 const voice=new globalThis.LeeWayBrowserVoice({onUnavailable:onError});
 async function json(route,body,signal){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),body===undefined?10000:120000);
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  try{const r=await fetch(origin+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
   const text=await r.text();if(text.length>16000000)throw Error('VOICE_RESPONSE_LIMIT');const value=JSON.parse(text);if(!r.ok)throw Error(value.error||'VOICE_TRANSPORT_UNAVAILABLE');return value;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
 }
 voice.bindProvider({resolveSelection:async()=>(await json('/voice/binding')).voiceBinding,render:async({text,signal})=>(await json('/voice/segment',{text},signal)).voice});
 return Object.freeze({
  prepare:()=>voice.load(),
  speak:text=>voice.speak(String(text),{onState}),
  createStream:()=>new globalThis.LeeWaySpeechStream(),
  speakStream:(stream,options={})=>voice.speakStream(stream,{...options,onState}),
  stop:()=>{voice.stop();onState('Stopped');},
  metrics:()=>({events:globalThis.LeeWayVoiceMetrics.snapshot(),binding:voice.boundSelection,authority:'LEEWAY_VOICE_FABRIC'}),
  dispose:()=>voice.dispose()
 });
}
'@
$changes[$p]=$s
$p=Join-Path $RuntimeRoot 'machine-consciousness/carrier-server.mjs';$s=Text $p
$s=Once $s "if(req.method==='GET'&&u.pathname==='/settings')" "if(req.method==='GET'&&u.pathname==='/voice/binding')return json(res,200,{voiceBinding:voiceState()});if(req.method==='GET'&&u.pathname==='/settings')"
$changes[$p]=$s
$p=Join-Path $RuntimeRoot 'machine-consciousness/pocket-voice.html';$s=Text $p
$start=$s.IndexOf('    let leeWayAudio = new Audio();');$end=$s.IndexOf('    // --- HAMBURGER MENU DRAWER ---',$start)
if($start -lt 0 -or $end -lt $start){throw 'UI_DUPLICATE_SPEECH_LOOP_BOUNDARY_MISSING'}
$s=$s.Substring(0,$start)+@'
    // UI requests speech; Voice Fabric owns stream, synthesis, epoch and audio output.
    async function agentLeeSpeak(prompt) {
      if(!window.LeeWayAgentSpeech){statusText.textContent='LeeWay Voice interface is still loading';return;}
      return window.LeeWayAgentSpeech.respond(prompt);
    }

'@+$s.Substring($end)
$s=Once $s '    async function toggleVoiceInteraction() {' ('    async function toggleVoiceInteraction() {'+"`n      window.LeeWayAgentSpeech?.stop();")
$client=@'
<script src="/voice-fabric/src/browser-voice.js"></script>
<script src="/voice-fabric/src/speech-pipeline.js"></script>
<script type="module">
import {createLeeWayBoundVoice} from '/voice-fabric/src/voice-sdk.js';
function status(message){statusText.textContent=message;statusBadge.classList.add('active');}
const voice=createLeeWayBoundVoice({runtimeOrigin:location.origin,
 onState:message=>{isSpeaking=message.startsWith('Speaking');if(!isSpeaking)voiceAmplitude=0;status(message);},
 onError:error=>{isSpeaking=false;voiceAmplitude=0;status('LeeWay Voice: '+error.message);}});
let responseRequest=0;
window.LeeWayAgentSpeech=Object.freeze({
 async respond(text){
  if(typeof text!=='string'||!text.trim())return;
  const turn=++responseRequest;voice.stop();status('Agent Lee preparing response');
  try{
   const r=await fetch('/respond',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
   const data=await r.json();if(turn!==responseRequest)return {state:'SPEECH_INVALIDATED_RUNTIME_NOT_CANCELLED'};
   if(!r.ok||typeof data.text!=='string')throw Error(data.error||'RUNTIME_RESPONSE_UNAVAILABLE');
   await voice.speak(data.text);if(turn===responseRequest){isSpeaking=false;voiceAmplitude=0;status('Tap sphere to speak');}
   return {state:'VOICE_PIPELINE_COMPLETED',personaDelivery:data.personaDelivery};
  }catch(error){if(error.name==='AbortError')return {state:'VOICE_STOPPED'};isSpeaking=false;status('LeeWay Voice: '+error.message);return {state:'BLOCKED',error:error.message};}
 },
 stop(){responseRequest++;isSpeaking=false;voiceAmplitude=0;voice.stop();},
 metrics(){return voice.metrics();}
});
window.addEventListener('pagehide',()=>voice.dispose(),{once:true});
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.getElementById('drawer')?.classList.contains('open'))window.LeeWayAgentSpeech.stop();});
</script>
'@
$s=Once $s '</body>' ($client+"`n</body>")
if($s -match 'leeWayAudio|/voice/segment|new Audio\('){throw 'DUPLICATE_UI_SPEECH_EXECUTOR_REMAINS'}
$changes[$p]=$s
$plan=[ordered]@{status='DRY_RUN';files=@($changes.Keys);sharedSession='EXISTING_SPEECH_STREAM_AND_BROWSER_VOICE_EPOCH';newVoiceEngine=$false;newVoiceRegistry=$false;selectedSpeakerChanged=$false;phoneInstalled=$false;goldenPromoted=$false}
if(!$Apply){$plan|ConvertTo-Json -Depth 8;return}
if(Test-Path $EvidenceDirectory){throw 'EVIDENCE_DESTINATION_EXISTS'}
[void][IO.Directory]::CreateDirectory($EvidenceDirectory)
$utf8=New-Object Text.UTF8Encoding($false);$i=0
foreach($file in $changes.Keys){Copy-Item -LiteralPath $file -Destination (Join-Path $EvidenceDirectory (([string]$i)+'-'+[IO.Path]::GetFileName($file)));$i++}
foreach($file in $changes.Keys){[IO.File]::WriteAllText($file,$changes[$file],$utf8)}
$plan.status='APPLIED_TESTS_AND_LIVE_READBACK_REQUIRED';$plan['sourceBefore']=@(foreach($file in $inputs.Keys){@{path=$file;sha256=$inputs[$file]}});$plan['sourceAfter']=@(foreach($file in $changes.Keys){@{path=$file;sha256=(Get-FileHash $file -Algorithm SHA256).Hash}})
$plan|ConvertTo-Json -Depth 8|Set-Content (Join-Path $EvidenceDirectory 'repair-receipt.json') -Encoding UTF8
$plan|ConvertTo-Json -Depth 8
