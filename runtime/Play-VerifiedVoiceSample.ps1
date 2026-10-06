<# REGION: LEEWAY.VOICE.OUTPUT_QUALIFICATION; TAG: WAV_PLAYBACK_NOT_NATIVE_TTS
WHO: Creator-authorized audio test. WHAT: Play only the already verified Voice Fabric waveform.
WHEN: Live authority repair. WHERE: Windows output adapter; no speaker or persona selection here.
WHY: The OS is the audio device, not the speech authority. HOW: Exact hash, PCM player, no TTS/volume changes.
LICENSE: MIT #>
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$evidence=Join-Path $root 'receipts/voice-authority-repair-20261006'
$live=Get-Content (Join-Path $evidence 'live-voice-ownership.json') -Raw|ConvertFrom-Json
if($live.status -ne 'LIVE_SELECTION_AND_SYNTHESIS_VERIFIED_NOT_AUDIBILITY'){throw 'VOICE_SYNTHESIS_NOT_VERIFIED'}
$sample=@($live.checks|Where-Object{$_.PSObject.Properties.Name -contains 'audioSha256'})
if($sample.Count -ne 1){throw 'VERIFIED_SAMPLE_AMBIGUOUS'}
$wav=Join-Path $evidence 'voice-authority-test.wav'
if((Get-FileHash $wav -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sample[0].audioSha256){throw 'VOICE_SAMPLE_CHANGED'}
$player=New-Object System.Media.SoundPlayer($wav)
$started=[Diagnostics.Stopwatch]::StartNew()
try{$player.Load();$player.PlaySync()}finally{$player.Dispose();$started.Stop()}
[ordered]@{schemaVersion='leeway.voice-playback-call.v1';status='NATIVE_PCM_PLAYBACK_CALL_RETURNED';voiceAuthority='LEEWAY_VOICE_FABRIC';voicePackageId=$sample[0].voicePackageId;audioSha256=$sample[0].audioSha256;elapsedMs=$started.ElapsedMilliseconds;nativeTtsUsed=$false;voiceSelectionChanged=$false;volumeChanged=$false;humanAudibilityConfirmed=$false;scope='OUTPUT_API_COMPLETION_NOT_HUMAN_HEARING_OR_ACOUSTIC_IDENTITY_QUALIFICATION'}|ConvertTo-Json|Set-Content (Join-Path $evidence 'playback-call.json') -Encoding UTF8
Get-Content (Join-Path $evidence 'playback-call.json')
