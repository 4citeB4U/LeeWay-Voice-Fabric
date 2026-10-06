<#
REGION: LEEWAY.VOICE.REPAIR
TAG: HOST_NEVER_OWNS_AGENT_SPEAKER
WHO: Creator-authorized Agent Lee. WHAT: Remove carrier-owned default/selection and delegate to Voice Fabric.
WHEN: Voice-authority interruption; WHERE: inspected Voice Fabric and existing Runtime carrier.
WHY: Missing provider or device change must not change speaker, persona binding or ownership.
HOW: Exact hashes, dry run, backup, existing-module extensions, native provider identity readback, tests.
LICENSE: MIT
#>
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Carrier,[Parameter(Mandatory=$true)][string]$EvidenceDirectory,[switch]$Apply)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
if((& git -C $root remote get-url origin|Out-String).Trim() -ne 'https://github.com/4citeB4U/LeeWay-Voice-Fabric.git'){throw 'VOICE_REPOSITORY_AUTHORITY_MISMATCH'}
if((& git -C $root branch --show-current|Out-String).Trim() -ne 'repair/voice-authority-boundary'){throw 'VOICE_REPAIR_BRANCH_REQUIRED'}
$inputs=[ordered]@{
 (Join-Path $root 'src/voice-package-core.js')='ABC86953951A9AD15C531FEED44E80958A67B625C567D0DE36E4E80F1A0A5423'
 (Join-Path $root 'runtime/persona-voice-gate.mjs')='55D3A17C7A13E2A8FED09DF938B22794B763F0E706621356351F6650C0D59487'
 (Join-Path $root 'adapters/local-voice/server.mjs')='AB2A37AB8ED8C1D30F213852FC27A318DB0221DD6403F7B6060CCCA8FCA40C57'
 $Carrier='7E680FA32128560AF3AD6A7E4D3B6CF08F43E93CB3747C4DCB5FD53BCE081176'
}
foreach($file in $inputs.Keys){if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $inputs[$file]){throw ('SOURCE_CHANGED:'+ $file)}}
function Once([string]$s,[string]$old,[string]$new){if(([regex]::Matches($s,[regex]::Escape($old))).Count -ne 1){throw ('REPAIR_BOUNDARY_NOT_UNIQUE:'+ $old.Substring(0,[Math]::Min(90,$old.Length)))};$s.Replace($old,$new)}
$changes=[ordered]@{}
$p=Join-Path $root 'src/voice-package-core.js';$s=[IO.File]::ReadAllText($p)
$s+=@'

/* REGION: LEEWAY.VOICE.IDENTITY; TAG: OWNER_SELECTION_NOT_HOST_DEFAULT
WHO: Existing Voice Fabric authority. WHAT: Resolve an explicit agent binding; no device inference.
WHEN: Every spoken request. WHERE: portable core. WHY: One speaker across authorized bodies.
HOW: Existing binding and catalog; qualification remains distinct from Creator production approval.
LICENSE: MIT */
export function resolveAgentVoiceSelection({bindings,catalog,agentId='agent-lee'}={}){
  if(bindings?.authority!=='LEEWAY_VOICE_FABRIC')throw new Error('VOICE_FABRIC_AUTHORITY_REQUIRED');
  if(typeof agentId!=='string'||!agentId||!Object.hasOwn(bindings.bindings||{},agentId))throw new Error('VOICE_SELECTION_REQUIRED');
  const record=bindings.bindings[agentId];
  if(record?.agentId!==agentId)throw new Error('VOICE_AGENT_IDENTITY_MISMATCH');
  if(['agentId','personaFamily','personaArchetypeId','voicePackageId'].some(k=>typeof record[k]!=='string'||!record[k].trim()))throw new Error('VOICE_BINDING_INCOMPLETE');
  const binding=agentVoiceBinding(record);
  const qualificationOnly=record.state==='TEMPORARY_VERIFIED_PROVIDER'&&record.selectedBy==='CREATOR_PENDING_FINAL_AUDITION';
  if(!qualificationOnly && !(record.state==='VERIFIED_CATALOG_SELECTION'&&record.selectedBy==='CREATOR'))throw new Error('CREATOR_VOICE_SELECTION_REQUIRED');
  const matches=Array.isArray(catalog?.packages)?catalog.packages.filter(p=>p.id===binding.voicePackageId):[];
  if(matches.length!==1)throw new Error('VOICE_PACKAGE_MISSING_OR_AMBIGUOUS');
  const pkg=matches[0];
  if(pkg.status!=='AVAILABLE')throw new Error('VOICE_PACKAGE_UNAVAILABLE');
  if(!['kokoro','chatterbox'].includes(pkg.provider))throw new Error('DEVICE_TTS_NOT_AGENT_VOICE');
  if(pkg.provider==='kokoro' && (typeof pkg.voiceId!=='string'||!pkg.voiceId))throw new Error('VOICE_PROVIDER_SPEAKER_REQUIRED');
  return Object.freeze({...binding,authority:'LEEWAY_VOICE_FABRIC',provider:pkg.provider,voiceId:pkg.voiceId||null,
    speakerId:pkg.speakerId||pkg.id,selectionState:record.state,selectedBy:record.selectedBy,qualificationOnly,
    productionAdmitted:!qualificationOnly,deviceMayOverride:false,systemVoiceFallback:false});
}
'@
$changes[$p]=$s
$p=Join-Path $root 'runtime/persona-voice-gate.mjs';$s=[IO.File]::ReadAllText($p)
$s="import {resolveAgentVoiceSelection} from '../src/voice-package-core.js';`n"+$s
$s+=@'

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
'@
$changes[$p]=$s
$p=Join-Path $root 'adapters/local-voice/server.mjs';$s=[IO.File]::ReadAllText($p)
$s=Once $s "audioContent:result.wav.toString('base64'),sampleRate" "voicePackageId:'kokoro-'+result.voiceId,provider:'kokoro',voiceId:result.voiceId,audioContent:result.wav.toString('base64'),sampleRate"
$s=Once $s 'pending.set(id,{resolve,reject,timer});' 'pending.set(id,{resolve,reject,timer,voiceId:voice});'
$s=Once $s 'job.resolve({wav:Buffer.from(data.wav),metrics:data.metrics})' "(data.voiceId===job.voiceId?job.resolve({wav:Buffer.from(data.wav),metrics:data.metrics,voiceId:data.voiceId}):job.reject(new Error('VOICE_WORKER_SPEAKER_MISMATCH')))"
$s=Once $s 'parentPort.postMessage({id,...result});' 'parentPort.postMessage({id,...result,voiceId:voice});'
$changes[$p]=$s
$s=[IO.File]::ReadAllText($Carrier)
$s=Once $s 'applyPersonaDelivery,speechReceipt,sha256 as voiceSha256' 'applyPersonaDelivery,speechReceipt,voiceSelectionSnapshot,renderBoundAgentSpeech,sha256 as voiceSha256'
$start=$s.IndexOf('const VOICE_BINDING_PATH=');$end=$s.IndexOf('const ENTITY_AUTHORITY_PATH=',$start)
if($start -lt 0 -or $end -lt $start){throw 'CARRIER_VOICE_BLOCK_NOT_FOUND'}
$replacement=@'
// Voice Fabric owns the employee selection. The carrier has no default speaker and no per-device selection store.
const VOICE_EMPLOYEE_RECORD=new URL('../../voice/runtime/employee-voice-bindings.v1.json',import.meta.url);
const VOICE_CATALOG_RECORD=new URL('../../voice/voices/catalog.v1.json',import.meta.url);
function currentVoice(){return voiceSelectionSnapshot({bindings:JSON.parse(fs.readFileSync(VOICE_EMPLOYEE_RECORD,'utf8').replace(/^\uFEFF/,'')),catalog:JSON.parse(fs.readFileSync(VOICE_CATALOG_RECORD,'utf8').replace(/^\uFEFF/,'')),agentId:'agent-lee'});}
function voiceState(){try{return currentVoice()}catch(error){return{state:'BLOCKED',error:error.message,voicePackageId:null,provider:null,voiceId:null,authority:'LEEWAY_VOICE_FABRIC'}}}
'@
$s=$s.Substring(0,$start)+$replacement+"`n"+$s.Substring($end)
$s=$s.Replace('ACTIVE_VOICE.voicePackageId','voiceState().voicePackageId').Replace('ACTIVE_VOICE.provider','voiceState().provider').Replace('ACTIVE_VOICE.voiceId','voiceState().voiceId').Replace('voiceBinding:ACTIVE_VOICE','voiceBinding:voiceState()')
$s=Once $s "voice:{ready:true,state:'client-runtime',message:'Canonical Voice Fabric browser package selected by Agent Lee UI.'" "voice:{ready:voice.ready===true&&Boolean(voiceState().voicePackageId),state:voice.ready===true?'VOICE_PROVIDER_REPORTED_READY':'VOICE_PROVIDER_UNAVAILABLE',message:'Selection belongs to LeeWay Voice Fabric; provider readiness does not change it.'"
$start=$s.IndexOf('async function speak(text){');$end=$s.IndexOf('const json=',$start)
if($start -lt 0 -or $end -lt $start){throw 'CARRIER_SYNTH_BOUNDARY_MISSING'}
$s=$s.Substring(0,$start)+@'
async function speak(text){return renderBoundAgentSpeech({text,resolveSelection:currentVoice,providers:{
 kokoro:request=>jsonFetch(VOICE+'/synthesize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({voiceId:request.voiceId,text:request.text})}),
 chatterbox:request=>jsonFetch(VOICE_STUDIO+'/api/local/synthesize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({voicePackageId:request.voicePackageId,text:request.text})})
}});}
'@+"`n"+$s.Substring($end)
$start=$s.IndexOf("if(req.method==='POST'&&u.pathname==='/settings/voice')");$end=$s.IndexOf("if(req.method==='POST'&&u.pathname==='/render-voice')",$start)
if($start -lt 0 -or $end -lt $start){throw 'CARRIER_SELECTION_WRITE_BOUNDARY_MISSING'}
$s=$s.Substring(0,$start)+"if(req.method==='POST'&&u.pathname==='/settings/voice')return json(res,409,{error:'SHARED_VOICE_SELECTION_OWNER_TRANSPORT_NOT_BOUND',authority:'LEEWAY_VOICE_FABRIC',deviceLocalOverride:false});"+$s.Substring($end)
$s=$s.Replace('binding:AGENT_VOICE_BINDING','binding:currentVoice()').Replace('...AGENT_VOICE_BINDING','...currentVoice()')
if($s -match 'ACTIVE_VOICE|VOICE_BINDING_PATH|AGENT_VOICE_BINDING'){throw 'CARRIER_SPEAKER_AUTHORITY_RESIDUE'}
$changes[$Carrier]=$s
$plan=[ordered]@{status='DRY_RUN';paths=@($changes.Keys);existingVoiceSelectionChanged=$false;carrierOwnedSpeakerStoreRemoved=$true;defaultOnReadFailureRemoved=$true;remoteOwnerSelectionTransport='UNBOUND_NOT_REPLACED_BY_DEVICE_AUTHORITY';nativeTtsFallback=$false;phoneInstalled=$false}
if(!$Apply){$plan|ConvertTo-Json -Depth 6;return}
if(Test-Path $EvidenceDirectory){throw 'VOICE_BACKUP_DESTINATION_EXISTS'}
[void][IO.Directory]::CreateDirectory($EvidenceDirectory)
$utf8=New-Object Text.UTF8Encoding($false);$before=@();$i=0
foreach($file in $changes.Keys){$copy=([string]$i)+'-'+[IO.Path]::GetFileName($file);Copy-Item -LiteralPath $file -Destination (Join-Path $EvidenceDirectory $copy);$before+=@{source=$file;backup=$copy;sha256=$inputs[$file]};$i++}
foreach($file in $changes.Keys){[IO.File]::WriteAllText($file,$changes[$file],$utf8)}
$plan.status='SOURCE_REPAIRED_TEST_AND_RESTART_REQUIRED';$plan['before']=$before;$plan['after']=@(foreach($file in $changes.Keys){@{source=$file;sha256=(Get-FileHash $file -Algorithm SHA256).Hash}})
$plan|ConvertTo-Json -Depth 8|Set-Content (Join-Path $EvidenceDirectory 'repair-receipt.json') -Encoding UTF8
$plan|ConvertTo-Json -Depth 8
