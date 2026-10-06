<#
REGION: LEEWAY.VOICE.LIVE_QUALIFICATION
TAG: NARROW_VOICE_AND_CARRIER_RESTART
WHO: Creator-authorized Agent Lee. WHAT: Admit the tested Voice-owned selection repair into existing processes.
WHEN: After regression PASS. WHERE: supplied body binding, existing Voice worker/studio/carrier only.
WHY: A source repair is not runtime evidence. HOW: Busy check, exact process owner checks, scoped restart/readback.
LICENSE: MIT
#>
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BodyRoot,[switch]$Apply)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$voice=Split-Path $PSScriptRoot -Parent
$evidence=Join-Path $voice 'receipts/voice-authority-repair-20261006'
$repair=Get-Content (Join-Path $evidence 'repair-receipt.json') -Raw|ConvertFrom-Json
foreach($entry in $repair.after){if((Get-FileHash -LiteralPath $entry.source -Algorithm SHA256).Hash -ne $entry.sha256){throw 'VOICE_QUALIFIED_SOURCE_CHANGED'}}
$tests=Get-Content (Join-Path $evidence 'voice-regressions.tap') -Raw
if($tests -notmatch '(?m)^# pass 111\s*$' -or $tests -notmatch '(?m)^# fail 0\s*$'){throw 'VOICE_FULL_REGRESSION_REQUIRED'}
$selection=Join-Path $voice 'runtime/employee-voice-bindings.v1.json'
$selectionHash=(Get-FileHash $selection -Algorithm SHA256).Hash
$health=Invoke-RestMethod 'http://127.0.0.1:8878/status' -TimeoutSec 5
if($health.busy){throw 'VOICE_BUSY_DO_NOT_INTERRUPT_OWNER_SPEECH'}
$expected=@{
 8878=@{name='node.exe';fragment='local-voice[\\/]server.mjs'}
 8877=@{name='python.exe';fragment='adapters[\\/]studio-server.py'}
 8890=@{name='node.exe';fragment='machine-consciousness[\\/]carrier-server.mjs'}
}
$owners=@()
foreach($port in @(8878,8877,8890)){
 $listener=Get-NetTCPConnection -LocalPort $port -State Listen|Select-Object -First 1
 $proc=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener.OwningProcess)
 if($proc.Name -ne $expected[$port].name -or $proc.CommandLine -notmatch $expected[$port].fragment){throw ('PROCESS_OWNER_MISMATCH:'+ $port)}
 $owners+=@{port=$port;pid=$proc.ProcessId;name=$proc.Name}
}
$supervisor=Get-CimInstance Win32_Process|Where-Object{$_.Name -eq 'python.exe' -and $_.CommandLine -match 'voice[\\/]adapters[\\/]start-studio.py'}
if(@($supervisor).Count -ne 1){throw 'VOICE_SUPERVISOR_AMBIGUOUS'}
$plan=[ordered]@{status='DRY_RUN';owners=$owners;supervisorPid=$supervisor.ProcessId;selectionHashBefore=$selectionHash;selectionChanged=$false;phoneTouched=$false;fullVoiceQualification=$false}
if(!$Apply){$plan|ConvertTo-Json -Depth 6;return}
Stop-Process -Id $supervisor.ProcessId
foreach($owner in $owners){Stop-Process -Id $owner.pid}
Start-Sleep -Milliseconds 500
$python=(Get-Command python).Source;$node=(Get-Command node).Source
$launcher=Join-Path $voice 'adapters/start-studio.py'
$vp=Start-Process $python -ArgumentList @('-u',('"'+$launcher+'"')) -WorkingDirectory $voice -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $evidence 'voice-live.stdout.log') -RedirectStandardError (Join-Path $evidence 'voice-live.stderr.log')
$runtime=Join-Path $BodyRoot 'runtime'
$cp=Start-Process $node -ArgumentList 'machine-consciousness/carrier-server.mjs' -WorkingDirectory $runtime -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $evidence 'carrier-live.stdout.log') -RedirectStandardError (Join-Path $evidence 'carrier-live.stderr.log')
$ready=$false
for($i=0;$i -lt 25;$i++){
 try{$h=Invoke-RestMethod 'http://127.0.0.1:8878/status' -TimeoutSec 2;if($h.ready){$ready=$true;break}}catch{}
 Start-Sleep -Milliseconds 600
}
if(!$ready -or $vp.HasExited -or $cp.HasExited){throw 'RESTART_NOT_READY_INSPECT_LOGS_AND_QUALIFIED_BACKUP'}
$settings=Invoke-RestMethod 'http://127.0.0.1:8890/settings' -TimeoutSec 10
if($settings.voiceBinding.authority -ne 'LEEWAY_VOICE_FABRIC' -or $settings.voiceBinding.deviceMayOverride -ne $false){throw 'CARRIER_NOT_BOUND_TO_VOICE_AUTHORITY'}
if((Get-FileHash $selection -Algorithm SHA256).Hash -ne $selectionHash){throw 'VOICE_SELECTION_CHANGED_UNEXPECTEDLY'}
$plan.status='LIVE_CARRIER_RESOLVES_VOICE_FABRIC_SELECTION';$plan['voiceSupervisorPid']=$vp.Id;$plan['carrierPid']=$cp.Id;$plan['binding']=$settings.voiceBinding;$plan['providerReady']=$settings.state.voice.ready
$plan|ConvertTo-Json -Depth 8|Set-Content (Join-Path $evidence 'live-restart.json') -Encoding UTF8
$plan|ConvertTo-Json -Depth 8
