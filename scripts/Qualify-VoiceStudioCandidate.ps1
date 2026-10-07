#region LEEWAY.VOICE.QUALIFICATION
<#
TAG: LEEWAY-VOICE-STUDIO-ISOLATED-LIVE-QUALIFICATION-v1
5WH: WHO=Creator-authorized qualifier; WHAT=qualify an exact Studio candidate;
WHY=prove real controls before promotion; WHERE=an explicit isolated artifact root;
WHEN=after script/hash/candidate review; HOW=existing Git, Python, Chrome, Puppeteer and Kokoro.
AUTHORIZED ROLES: QUALIFICATION_ONLY. No live binding publication or phone installation.
LICENSE: Existing repository terms.

EXPECTED: Existing canonical Voice Fabric checkout and its Studio/Kokoro processes.
MUTATION: A new owned bare repository, detached worktree, temporary Studio/profile, evidence.
ROLLBACK: Stop only owned candidate/browser processes; remove only the owned browser profile.
The dirty live checkout and its employee binding are read/hash-checked, never written.
No npm install, browser/model download, new Kokoro worker, clone container, or LLM is started.

FLOW: Create/review this script -> Parse -> Hash -> inspect authority -> isolated execution
-> actual UI synthesis/graph/dry-run tests -> validate live read-back -> rehash -> scoped receipt.
PASS here covers the declared qualification only; it is not full C3 or physical playback PASS.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{40}$')][string]$CandidateSha,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ExpectedTreeSha,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedScriptSha256,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ExpectedRunnerSha256,
    [Parameter(Mandatory = $true)][string]$LiveVoiceRoot,
    [Parameter(Mandatory = $true)][string]$ArtifactRoot,
    [Parameter(Mandatory = $true)][string]$ChromeExecutable,
    [Parameter(Mandatory = $true)][string]$PuppeteerModule,
    [Parameter(Mandatory = $true)][ValidatePattern('^kokoro-[a-z0-9_]+$')][string]$VoicePackageId,
    [string]$RunnerPath = (Join-Path $PSScriptRoot '../tests/studio-live-windows-gate.mjs'),
    [string]$GitExecutable = 'git',
    [string]$PythonExecutable = 'python',
    [string]$NodeExecutable = 'node',
    [ValidateRange(60, 600)][int]$GateTimeoutSeconds = 300,
    [switch]$InspectOnly
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$RepositoryUrl = 'https://github.com/4citeB4U/LeeWay-Voice-Fabric.git'
$CandidateProcess = $null
$BrowserRunnerProcess = $null
$RunRoot = $null
$ProfileRoot = $null
$BrowserEvidenceRoot = $null
$Receipt = $null
$ActivationManifest = $null
$ActivationManifestPath = $null
$Failure = $null
$ExitCode = 1
$ActivationPaths = @('index.html', 'studio.html', 'src/studio.js', 'src/studio.css',
    'src/studio-console.js', 'src/studio-monitor.js', 'src/studio-visualizer.js',
    'src/vendor/three-0.160.1/three.module.min.js', 'src/vendor/three-0.160.1/LICENSE',
    'src/vendor/three-0.160.1/provenance.json', 'adapters/studio-server.py', 'adapters/voice_selection_owner.py')

function Get-Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Resolve-Executable([string]$Value) {
    $command = Get-Command -Name $Value -CommandType Application -ErrorAction Stop | Select-Object -First 1
    return $command.Source
}

function Get-FullPath([string]$Value) {
    return [IO.Path]::GetFullPath($Value).TrimEnd([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar))
}

function Test-Inside([string]$Child, [string]$Parent) {
    $childFull = Get-FullPath $Child
    $parentFull = Get-FullPath $Parent
    return $childFull.Equals($parentFull, [StringComparison]::OrdinalIgnoreCase) -or
        $childFull.StartsWith($parentFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function ConvertTo-NativeArguments([string[]]$Values) {
    # ProcessStartInfo has no ArgumentList on Windows PowerShell 5.1. These are
    # Windows argv quoting rules, not shell interpolation or JSON escaping.
    $quoted = foreach ($value in $Values) {
        $escaped = [regex]::Replace([string]$value, '(\\*)"', '$1$1\"')
        $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
        '"' + $escaped + '"'
    }
    return $quoted -join ' '
}

function Start-OwnedProcess([string]$File, [string[]]$Arguments, [string]$WorkingDirectory, [hashtable]$Environment = @{}) {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $File
    $info.Arguments = ConvertTo-NativeArguments $Arguments
    $info.WorkingDirectory = $WorkingDirectory
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($key in $Environment.Keys) { $info.EnvironmentVariables[$key] = [string]$Environment[$key] }
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    if (-not $process.Start()) { throw 'QUALIFICATION_CHILD_START_FAILED' }
    return [pscustomobject]@{ Process = $process; Stdout = $process.StandardOutput.ReadToEndAsync(); Stderr = $process.StandardError.ReadToEndAsync() }
}

function Stop-OwnedProcess($Child) {
    if ($null -eq $Child) { return }
    if (-not $Child.Process.HasExited) {
        $Child.Process.Kill()
        if (-not $Child.Process.WaitForExit(10000)) { throw 'OWNED_QUALIFICATION_PROCESS_DID_NOT_EXIT' }
    }
}

function Read-OwnedOutput($Child, [int]$TimeoutSeconds = 10) {
    # An exited parent can leave a descendant holding a redirected pipe. Never
    # let that turn a bounded qualification into an unbounded GetResult wait.
    $tasks = [Threading.Tasks.Task[]]@($Child.Stdout, $Child.Stderr)
    if (-not [Threading.Tasks.Task]::WaitAll($tasks, [int]($TimeoutSeconds * 1000))) {
        throw 'OWNED_PROCESS_OUTPUT_COLLECTION_TIMEOUT_CLEANUP_UNVERIFIED'
    }
    return [pscustomobject]@{ Stdout = $Child.Stdout.GetAwaiter().GetResult(); Stderr = $Child.Stderr.GetAwaiter().GetResult() }
}

function Invoke-Checked([string]$File, [string[]]$Arguments, [string]$WorkingDirectory, [int]$TimeoutSeconds = 60, [hashtable]$Environment = @{}) {
    $child = Start-OwnedProcess $File $Arguments $WorkingDirectory $Environment
    try {
        $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
        while (-not $child.Process.WaitForExit(500)) {
            if ([DateTime]::UtcNow -ge $deadline) { throw 'QUALIFICATION_COMMAND_TIMEOUT' }
        }
        $completedOutput = Read-OwnedOutput $child
        $output = $completedOutput.Stdout
        $errorOutput = $completedOutput.Stderr
        if ($child.Process.ExitCode -ne 0) {
            $safeError = ($errorOutput -replace '(https?://)[^/@\s]+@', '$1[REDACTED]@')
            throw ('QUALIFICATION_COMMAND_FAILED: ' + $safeError.Substring(0, [Math]::Min(2000, $safeError.Length)))
        }
        return [pscustomobject]@{ Output = $output.Trim(); ExitCode = $child.Process.ExitCode }
    } finally { Stop-OwnedProcess $child }
}

function Get-LiveSnapshot([string]$Root) {
    $dirtyResult = Invoke-Checked $GitPath @('--no-optional-locks', '-c', 'core.quotePath=false', '-C', $Root, 'diff', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--') $Root
    $statusResult = Invoke-Checked $GitPath @('--no-optional-locks', '-c', 'core.quotePath=false', '-C', $Root, 'status', '--porcelain', '--untracked-files=no') $Root
    $required = @('studio.html', 'index.html', 'src/studio.js', 'src/studio.css', 'src/browser-voice.js',
        'src/studio-audio.js', 'src/studio-render.worker.js', 'src/voice-registry.js', 'src/voice-sdk.js',
        'src/speech-pipeline.js', 'src/voice-package-core.js', 'adapters/studio-server.py', 'adapters/start-studio.py',
        'adapters/voice_selection_owner.py', 'adapters/local-voice/server.mjs',
        'runtime/persona-voice-gate.mjs', 'runtime/studio-runtime-dsp.mjs', 'runtime/employee-voice-bindings.v1.json')
    $dirtyPaths = if ($dirtyResult.Output) { $dirtyResult.Output -split '\r?\n' } else { @() }
    $files = foreach ($relative in @($required + $ActivationPaths + $dirtyPaths | Sort-Object -Unique)) {
        $full = Get-FullPath (Join-Path $Root $relative)
        if (-not (Test-Inside $full $Root)) { throw 'LIVE_SNAPSHOT_PATH_OUTSIDE_AUTHORITY' }
        if (Test-Path -LiteralPath $full -PathType Leaf) {
            [pscustomobject]@{ Path = $relative; Sha256 = Get-Sha256 $full; Bytes = (Get-Item -LiteralPath $full).Length }
        } else { [pscustomobject]@{ Path = $relative; State = 'ABSENT' } }
    }
    return [pscustomobject]@{ TrackedStatus = $statusResult.Output; Files = @($files) }
}

function Assert-SameSnapshot($Before, $After) {
    if (($Before | ConvertTo-Json -Depth 8 -Compress) -cne ($After | ConvertTo-Json -Depth 8 -Compress)) {
        throw 'LIVE_SOURCE_OR_BINDING_CHANGED_DURING_QUALIFICATION_REVIEW_REQUIRED'
    }
}

function Get-OwnedLoopbackListener($Process) {
    $listeners = @(Get-NetTCPConnection -State Listen -OwningProcess $Process.ProcessId -ErrorAction Stop |
        Where-Object { $_.LocalAddress -eq '127.0.0.1' })
    if ($listeners.Count -ne 1) { throw 'CANONICAL_PROCESS_LOOPBACK_LISTENER_AMBIGUOUS' }
    return $listeners[0]
}

try {
    if (-not $PSCommandPath) { throw 'SAVED_AUTHORITY_SCRIPT_REQUIRED' }
    $ScriptPath = (Resolve-Path -LiteralPath $PSCommandPath).Path
    $tokens = $null; $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($ScriptPath, [ref]$tokens, [ref]$parseErrors)
    if (@($parseErrors).Count -ne 0) { throw 'POWERSHELL_AUTHORITY_SCRIPT_PARSE_FAILED' }
    if ((Get-Sha256 $ScriptPath) -cne $ExpectedScriptSha256) { throw 'AUTHORITY_SCRIPT_HASH_MISMATCH' }
    $RunnerPath = (Resolve-Path -LiteralPath $RunnerPath).Path
    if ((Get-Sha256 $RunnerPath) -cne $ExpectedRunnerSha256) { throw 'QUALIFICATION_RUNNER_HASH_MISMATCH' }
    $LiveVoiceRoot = (Resolve-Path -LiteralPath $LiveVoiceRoot).Path
    $ArtifactRoot = Get-FullPath $ArtifactRoot
    $GitPath = Resolve-Executable $GitExecutable
    $PythonPath = Resolve-Executable $PythonExecutable
    $NodePath = Resolve-Executable $NodeExecutable
    $ChromeExecutable = Resolve-Executable $ChromeExecutable
    $PuppeteerModule = (Resolve-Path -LiteralPath $PuppeteerModule).Path

    $origin = (Invoke-Checked $GitPath @('-C', $LiveVoiceRoot, 'remote', 'get-url', 'origin') $LiveVoiceRoot).Output
    if ($origin.TrimEnd('/') -ine $RepositoryUrl) { throw 'CANONICAL_VOICE_REPOSITORY_ORIGIN_MISMATCH' }
    $liveTop = (Invoke-Checked $GitPath @('-C', $LiveVoiceRoot, 'rev-parse', '--show-toplevel') $LiveVoiceRoot).Output
    if ((Get-FullPath $liveTop) -ine (Get-FullPath $LiveVoiceRoot)) { throw 'LIVE_VOICE_ROOT_IS_NOT_REPOSITORY_ROOT' }
    $liveHead = (Invoke-Checked $GitPath @('-C', $LiveVoiceRoot, 'rev-parse', 'HEAD') $LiveVoiceRoot).Output
    $studioSource = Join-Path $LiveVoiceRoot 'adapters/studio-server.py'
    $kokoroSource = Join-Path $LiveVoiceRoot 'adapters/local-voice/server.mjs'
    $launcherSource = Join-Path $LiveVoiceRoot 'adapters/start-studio.py'
    $processes = @(Get-CimInstance Win32_Process)
    $liveStudios = @($processes | Where-Object { $_.CommandLine -and $_.CommandLine.Replace('/', '\').IndexOf($studioSource.Replace('/', '\'), [StringComparison]::OrdinalIgnoreCase) -ge 0 })
    $kokoroProcesses = @($processes | Where-Object { $_.CommandLine -and $_.CommandLine.Replace('/', '\').IndexOf($kokoroSource.Replace('/', '\'), [StringComparison]::OrdinalIgnoreCase) -ge 0 })
    if ($liveStudios.Count -ne 1 -or $kokoroProcesses.Count -ne 1) { throw 'LIVE_SOURCE_PROCESS_RELATIONSHIP_NOT_UNIQUE' }
    $launchers = @($processes | Where-Object { $_.ProcessId -eq $liveStudios[0].ParentProcessId -and $_.CommandLine -and $_.CommandLine.Replace('/', '\').IndexOf($launcherSource.Replace('/', '\'), [StringComparison]::OrdinalIgnoreCase) -ge 0 })
    if ($launchers.Count -ne 1 -or $kokoroProcesses[0].ParentProcessId -ne $launchers[0].ProcessId) { throw 'EXISTING_STUDIO_KOKORO_LAUNCHER_OWNERSHIP_NOT_PROVEN' }
    $liveStudioListener = Get-OwnedLoopbackListener $liveStudios[0]
    $kokoroListener = Get-OwnedLoopbackListener $kokoroProcesses[0]
    $KokoroUrl = 'http://127.0.0.1:' + $kokoroListener.LocalPort
    $kokoro = Invoke-RestMethod -Uri ($KokoroUrl + '/status') -TimeoutSec 10
    if ($kokoro.ready -ne $true -or $kokoro.busy -eq $true) { throw 'EXISTING_KOKORO_NOT_READY_OR_BUSY' }
    if ($VoicePackageId.Substring(7) -notin @($kokoro.voices)) { throw 'REQUESTED_KOKORO_VOICE_NOT_READY' }
    $bindingFile = Join-Path $LiveVoiceRoot 'runtime/employee-voice-bindings.v1.json'
    if (-not (Test-Path -LiteralPath $bindingFile -PathType Leaf)) { throw 'EXISTING_VOICE_AUTHORITY_RECORD_REQUIRED' }
    if ((Get-Item -LiteralPath $bindingFile).Length -gt 1048576) { throw 'VOICE_AUTHORITY_RECORD_SIZE_LIMIT' }
    $binding = Get-Content -LiteralPath $bindingFile -Raw | ConvertFrom-Json
    if ($binding.authority -ne 'LEEWAY_VOICE_FABRIC' -or $binding.bindings.'agent-lee'.agentId -ne 'agent-lee') { throw 'EXISTING_VOICE_AUTHORITY_MISMATCH' }
    $LiveBefore = Get-LiveSnapshot $LiveVoiceRoot
    $recordBeforeHash = Get-Sha256 $bindingFile
    $authority = [ordered]@{ Origin = $RepositoryUrl; LiveRoot = $LiveVoiceRoot; LiveHead = $liveHead;
        LiveStudioPid = $liveStudios[0].ProcessId; LiveStudioPort = $liveStudioListener.LocalPort;
        LauncherPid = $launchers[0].ProcessId; LauncherSource = $launcherSource; LauncherSourceSha256 = Get-Sha256 $launcherSource;
        KokoroPid = $kokoroProcesses[0].ProcessId; KokoroUrl = $KokoroUrl; KokoroReady = $true;
        VoicePackageId = $VoicePackageId; OwnerRecordSha256 = $recordBeforeHash;
        ChromeExecutable = $ChromeExecutable; PuppeteerModule = $PuppeteerModule }
    if ($InspectOnly) {
        [pscustomobject]@{ State = 'INSPECTED_NOT_STAGED'; Authority = $authority; CandidateSha = $CandidateSha;
            ScriptSha256 = $ExpectedScriptSha256; RunnerSha256 = $ExpectedRunnerSha256;
            ReceiptCreated = $false; LearningLedgerUpdated = $false } | ConvertTo-Json -Depth 8
        $ExitCode = 0
    } else {
        $runName = 'voice-studio-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
        $plannedRoot = Join-Path $ArtifactRoot $runName
        if (Test-Inside $plannedRoot $LiveVoiceRoot) { throw 'QUALIFICATION_ARTIFACTS_MUST_BE_OUTSIDE_LIVE_CHECKOUT' }
        if (Test-Path -LiteralPath $plannedRoot) { throw 'QUALIFICATION_RUN_DIRECTORY_ALREADY_EXISTS' }
        [void][IO.Directory]::CreateDirectory($plannedRoot)
        $RunRoot = $plannedRoot
        $ProfileRoot = Join-Path $RunRoot 'browser-profile'
        $BrowserEvidenceRoot = Join-Path $RunRoot 'browser-evidence'
        $Receipt = [ordered]@{ SchemaVersion = 'leeway.voice-studio-live-qualification.v1'; State = 'RUNNING';
            Scope = 'EXISTING_KOKORO_AND_ISOLATED_STUDIO_BROWSER_GRAPH'; Phase = 'C3_UI_QUALIFICATION_ONLY';
            StartedAt = [DateTime]::UtcNow.ToString('o'); CandidateSha = $CandidateSha; ExpectedTreeSha = $ExpectedTreeSha;
            Authority = $authority; LiveBefore = $LiveBefore; ScriptSha256Before = $ExpectedScriptSha256;
            RunnerSha256Before = $ExpectedRunnerSha256; FormulaExecution = 'NOT_EXECUTED';
            PhysicalSpeakerAudibility = 'NOT_TESTED'; PhoneDeployment = 'NOT_PERFORMED';
            SharedPublication = 'DRY_RUN_ONLY'; LearningLedger = 'NOT_UPDATED'; Cleanup = @() }
        [void][IO.Directory]::CreateDirectory($BrowserEvidenceRoot)
        [IO.File]::WriteAllText((Join-Path $RunRoot 'owner-marker.json'), (@{ RunId = $runName; Scope = 'VOICE_STUDIO_QUALIFICATION_ONLY' } | ConvertTo-Json), [Text.UTF8Encoding]::new($false))

        Write-Output 'Authority and source relationship verified. Fetching the reviewed candidate into an isolated repository.'
        $bare = Join-Path $RunRoot 'candidate.git'
        $worktree = Join-Path $RunRoot 'candidate'
        $gitEnv = @{ GIT_TERMINAL_PROMPT = '0'; GIT_LFS_SKIP_SMUDGE = '1' }
        [void](Invoke-Checked $GitPath @('init', '--bare', $bare) $RunRoot 30 $gitEnv)
        [void](Invoke-Checked $GitPath @('--git-dir', $bare, 'config', 'core.autocrlf', 'false') $RunRoot)
        [void](Invoke-Checked $GitPath @('--git-dir', $bare, 'remote', 'add', 'origin', $RepositoryUrl) $RunRoot)
        [void](Invoke-Checked $GitPath @('--git-dir', $bare, '-c', 'credential.interactive=never', 'fetch', '--depth=1', 'origin', $CandidateSha) $RunRoot 120 $gitEnv)
        $fetched = (Invoke-Checked $GitPath @('--git-dir', $bare, 'rev-parse', 'FETCH_HEAD') $RunRoot).Output
        if ($fetched -cne $CandidateSha) { throw 'FETCHED_CANDIDATE_COMMIT_MISMATCH' }
        $tree = (Invoke-Checked $GitPath @('--git-dir', $bare, 'rev-parse', ($CandidateSha + '^{tree}')) $RunRoot).Output
        if ($tree -cne $ExpectedTreeSha) { throw 'CANDIDATE_SOURCE_TREE_MISMATCH' }
        [void](Invoke-Checked $GitPath @('--git-dir', $bare, '-c', 'core.autocrlf=false', 'worktree', 'add', '--detach', $worktree, $CandidateSha) $RunRoot 60 $gitEnv)
        $head = (Invoke-Checked $GitPath @('-C', $worktree, 'rev-parse', 'HEAD') $RunRoot).Output
        $branch = (Invoke-Checked $GitPath @('-C', $worktree, 'branch', '--show-current') $RunRoot).Output
        if ($head -cne $CandidateSha -or $branch) { throw 'CANDIDATE_WORKTREE_IS_NOT_EXACT_DETACHED_COMMIT' }
        $tracked = (Invoke-Checked $GitPath @('-C', $worktree, 'ls-files') $RunRoot).Output -split '\r?\n'
        $artifacts = foreach ($relative in $tracked) {
            if ($relative -notmatch '^(src/|voices/|adapters/(studio-server\.py|voice_selection_owner\.py|local_clone\.py)$|studio\.html$|index\.html$)') { continue }
            $file = Get-FullPath (Join-Path $worktree $relative)
            if (-not (Test-Inside $file $worktree) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'CANDIDATE_ASSET_NOT_A_CONTAINED_FILE' }
            if ((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'CANDIDATE_ASSET_LINK_NOT_ADMITTED' }
            $http = $relative -match '^(src/.+\.(js|mjs|css|json)|voices/.+\.(wav|json)|studio\.html|index\.html)$'
            [pscustomobject]@{ path = $relative; sha256 = Get-Sha256 $file; bytes = (Get-Item -LiteralPath $file).Length; http = [bool]$http }
        }
        foreach ($required in @('studio.html', 'src/studio-console.js', 'src/studio-monitor.js', 'src/studio-visualizer.js', 'adapters/voice_selection_owner.py')) {
            if ($required -notin @($artifacts.path)) { throw ('CANDIDATE_REQUIRED_ASSET_MISSING: ' + $required) }
        }
        $manifestFile = Join-Path $RunRoot 'artifact-sha256.json'
        [IO.File]::WriteAllText($manifestFile, (@{ candidateSha = $CandidateSha; treeSha = $tree; worktree = $worktree;
            liveAuthority = @{ kokoroUrl = $KokoroUrl; kokoroPid = $kokoroProcesses[0].ProcessId;
                kokoroSource = $kokoroSource; kokoroSourceSha256 = Get-Sha256 $kokoroSource };
            files = @($artifacts) } | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
        $Receipt['ArtifactManifestSha256'] = Get-Sha256 $manifestFile
        $Receipt['Worktree'] = $worktree
        [void](Invoke-Checked $NodePath @('--check', $RunnerPath) $RunRoot)
        [void](Invoke-Checked $NodePath @($RunnerPath, '--self-test') $RunRoot)
        [void](Invoke-Checked $NodePath @('--check', (Join-Path $worktree 'src/studio.js')) $RunRoot)
        [void](Invoke-Checked $NodePath @('--check', (Join-Path $worktree 'src/studio-console.js')) $RunRoot)

        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
        try { $listener.Start(); $port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
        $baseUrl = 'http://127.0.0.1:' + $port + '/'
        $childEnvironment = @{ LEEWAY_VOICE_RUNTIME_ROOT = $LiveVoiceRoot; LEEWAY_KOKORO_URL = $KokoroUrl;
            LEEWAY_XTTS_CONTAINER = ''; LEEWAY_ALLOWED_ORIGINS = ''; RESEMBLE_API_KEY = ''; PYTHONDONTWRITEBYTECODE = '1' }
        $CandidateProcess = Start-OwnedProcess $PythonPath @('-u', (Join-Path $worktree 'adapters/studio-server.py'), '--port', [string]$port, '--directory', $worktree) $worktree $childEnvironment
        $deadline = [DateTime]::UtcNow.AddSeconds(20)
        do {
            if ($CandidateProcess.Process.HasExited) { throw 'CANDIDATE_STUDIO_EXITED_BEFORE_READY' }
            try { $null = Invoke-RestMethod -Uri ($baseUrl + 'api/provider/status') -TimeoutSec 2; $ready = $true } catch { $ready = $false }
            if (-not $ready) { Start-Sleep -Milliseconds 200 }
        } while (-not $ready -and [DateTime]::UtcNow -lt $deadline)
        if (-not $ready) { throw 'CANDIDATE_STUDIO_START_TIMEOUT' }
        $actualListener = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop | Where-Object { $_.LocalAddress -eq '127.0.0.1' })
        if ($actualListener.Count -ne 1 -or $actualListener[0].OwningProcess -ne $CandidateProcess.Process.Id) { throw 'CANDIDATE_PORT_PROCESS_OWNERSHIP_NOT_PROVEN' }
        $Receipt['CandidateStudio'] = @{ Pid = $CandidateProcess.Process.Id; BaseUrl = $baseUrl; CloneContainer = 'DISABLED'; Kokoro = 'EXISTING_PROCESS_REUSED' }
        Write-Output 'Candidate Studio is serving the verified worktree. Testing real Kokoro generation, output graph and owner dry-run.'
        $arguments = @($RunnerPath, '--base-url', $baseUrl, '--chrome', $ChromeExecutable,
            '--puppeteer-module', $PuppeteerModule, '--evidence-dir', $BrowserEvidenceRoot,
            '--profile-dir', $ProfileRoot, '--manifest', $manifestFile, '--candidate-sha', $CandidateSha,
            '--voice-package-id', $VoicePackageId, '--live-record-sha256', $recordBeforeHash)
        $BrowserRunnerProcess = Start-OwnedProcess $NodePath $arguments $worktree
        $gateDeadline = [DateTime]::UtcNow.AddSeconds($GateTimeoutSeconds)
        $nextUpdate = [DateTime]::UtcNow.AddSeconds(25)
        while (-not $BrowserRunnerProcess.Process.WaitForExit(500)) {
            if ([DateTime]::UtcNow -ge $gateDeadline) { throw 'BROWSER_QUALIFICATION_DEADLINE_EXCEEDED' }
            if ([DateTime]::UtcNow -ge $nextUpdate) { Write-Output 'Live qualification is still running within its bounded deadline.'; $nextUpdate = [DateTime]::UtcNow.AddSeconds(25) }
        }
        if ($BrowserRunnerProcess.Process.ExitCode -ne 0) { throw 'BROWSER_QUALIFICATION_FAILED_SEE_SCOPED_BROWSER_EVIDENCE' }
        $browserReceiptPath = Join-Path $BrowserEvidenceRoot 'browser-qualification.json'
        $browserResult = Get-Content -LiteralPath $browserReceiptPath -Raw | ConvertFrom-Json
        if ($browserResult.status -ne 'PASS' -or $browserResult.candidateSha -cne $CandidateSha) { throw 'BROWSER_QUALIFICATION_RECEIPT_NOT_ACCEPTED' }
        $Receipt['BrowserReceipt'] = @{ Path = $browserReceiptPath; Sha256 = Get-Sha256 $browserReceiptPath }
        foreach ($artifact in $artifacts) {
            if ((Get-Sha256 (Join-Path $worktree $artifact.path)) -cne $artifact.sha256) { throw ('CANDIDATE_ASSET_CHANGED_DURING_GATE: ' + $artifact.path) }
        }
        [void](Invoke-Checked $GitPath @('-C', $worktree, 'diff', '--exit-code', 'HEAD', '--') $RunRoot)
        # A reviewable twelve-file payload and preimage backups are retained only
        # after actual browser qualification. This does not write to the live root.
        $activationFiles = foreach ($relative in $ActivationPaths) {
            $candidateFile = Join-Path $worktree $relative
            $candidateArtifact = @($artifacts | Where-Object { $_.path -ceq $relative })
            if ($candidateArtifact.Count -ne 1 -or (Get-Sha256 $candidateFile) -cne $candidateArtifact[0].sha256) { throw 'ACTIVATION_PAYLOAD_HASH_NOT_VERIFIED' }
            $liveFile = Join-Path $LiveVoiceRoot $relative
            $before = @($LiveBefore.Files | Where-Object { $_.Path -ceq $relative })
            if ($before.Count -ne 1) { throw 'ACTIVATION_PREIMAGE_NOT_RECORDED' }
            $preimage = [ordered]@{ State = 'ABSENT' }
            if (Test-Path -LiteralPath $liveFile -PathType Leaf) {
                if (-not $before[0].PSObject.Properties['Sha256'] -or (Get-Sha256 $liveFile) -cne $before[0].Sha256) { throw 'ACTIVATION_PREIMAGE_CHANGED' }
                if ((Get-Item -LiteralPath $liveFile).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'ACTIVATION_PREIMAGE_LINK_NOT_ADMITTED' }
                $backupFile = Join-Path (Join-Path $RunRoot 'activation-preimages') $relative
                [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($backupFile))
                [IO.File]::Copy($liveFile, $backupFile, $false)
                if ((Get-Sha256 $backupFile) -cne $before[0].Sha256 -or (Get-Sha256 $liveFile) -cne $before[0].Sha256) { throw 'ACTIVATION_BACKUP_HASH_MISMATCH' }
                $preimage = [ordered]@{ State = 'PRESENT'; Sha256 = $before[0].Sha256; Bytes = $before[0].Bytes; BackupPath = $backupFile }
            } elseif (-not $before[0].PSObject.Properties['State'] -or $before[0].State -ne 'ABSENT') { throw 'ACTIVATION_PREIMAGE_DISAPPEARED' }
            [pscustomobject]@{ Path = $relative; CandidatePath = $candidateFile; CandidateSha256 = $candidateArtifact[0].sha256;
                CandidateBytes = $candidateArtifact[0].bytes; LivePath = $liveFile; Preimage = $preimage }
        }
        $ActivationManifest = [ordered]@{ SchemaVersion = 'leeway.voice-studio-activation-payload.v1';
            State = 'PREPARED_PENDING_FINAL_READBACK'; CandidateSha = $CandidateSha; TreeSha = $tree;
            Origin = $RepositoryUrl; QualifiedWorktree = $worktree; LiveRoot = $LiveVoiceRoot;
            Scope = 'TWELVE_STUDIO_FILES_ONLY'; Files = @($activationFiles); LiveWrites = 'NONE';
            BindingIncluded = $false; PhoneIncluded = $false; ApplyAuthorization = 'NOT_RECORDED';
            ExistingLifecycle = @{ LauncherPid = $launchers[0].ProcessId; StudioPid = $liveStudios[0].ProcessId;
                KokoroPid = $kokoroProcesses[0].ProcessId; LauncherSource = $launcherSource;
                Constraint = 'The existing start-studio launcher owns both children and stops both when either exits. Never stop or restart the Studio child alone.' };
            RequiredBeforeApply = 'Record human apply authorization; recheck every live preimage and candidate hash; prepare a coordinated lifecycle for the existing launcher and both Studio/Kokoro children, preserving existing configuration and one runtime owner; verify both services and the active UI after restart.';
            Rollback = 'Restore only PRESENT target files from their verified preimages; remove only newly created ABSENT target files if their installed bytes match the payload. Coordinate the existing launcher and both owned Studio/Kokoro children, preserving configuration; never restart a single child or start a parallel voice runtime.' }
        $ActivationManifestPath = Join-Path $RunRoot 'activation-manifest.json'
        $Receipt['State'] = 'PASS'
        $ExitCode = 0
    }
} catch {
    $Failure = $_.Exception.Message
    if ($null -ne $Receipt) { $Receipt['State'] = 'FAIL'; $Receipt['Failure'] = $Failure }
    Write-Error -Message $Failure -ErrorAction Continue
} finally {
    if ($null -ne $RunRoot) {
        foreach ($entry in @(@{ Child = $BrowserRunnerProcess; Name = 'browser-runner' }, @{ Child = $CandidateProcess; Name = 'candidate-studio' })) {
            if ($null -eq $entry.Child) { continue }
            try {
                Stop-OwnedProcess $entry.Child
                $completedOutput = Read-OwnedOutput $entry.Child
                [IO.File]::WriteAllText((Join-Path $RunRoot ($entry.Name + '.stdout.log')), $completedOutput.Stdout, [Text.UTF8Encoding]::new($false))
                [IO.File]::WriteAllText((Join-Path $RunRoot ($entry.Name + '.stderr.log')), $completedOutput.Stderr, [Text.UTF8Encoding]::new($false))
                $Receipt['Cleanup'] += ($entry.Name + ': OWNED_PROCESS_EXITED')
            } catch { $Receipt['State'] = 'FAIL'; $Receipt['Cleanup'] += ($entry.Name + ': CLEANUP_UNVERIFIED'); $ExitCode = 1 }
        }
        try {
            $browserMarker = Join-Path $BrowserEvidenceRoot 'browser-process.json'
            if (Test-Path -LiteralPath $browserMarker -PathType Leaf) {
                $marker = Get-Content -LiteralPath $browserMarker -Raw | ConvertFrom-Json
                if ((Get-FullPath $marker.profileDir) -ine (Get-FullPath $ProfileRoot)) { throw 'BROWSER_CLEANUP_PROFILE_MISMATCH' }
                $ownedChrome = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$marker.pid) -ErrorAction Stop
                if ($null -ne $ownedChrome) {
                    if (-not $ownedChrome.CommandLine -or $ownedChrome.CommandLine.IndexOf($ProfileRoot, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or $ownedChrome.CommandLine -notmatch '--headless') { throw 'BROWSER_PROCESS_CLEANUP_OWNERSHIP_NOT_PROVEN' }
                    [void](Invoke-Checked (Resolve-Executable 'taskkill.exe') @('/PID', [string]$marker.pid, '/T', '/F') $RunRoot 20)
                }
            }
            if (Test-Path -LiteralPath $ProfileRoot) {
                if (-not (Test-Inside $ProfileRoot $RunRoot) -or -not (Test-Path -LiteralPath (Join-Path $RunRoot 'owner-marker.json'))) { throw 'PROFILE_CLEANUP_OWNERSHIP_NOT_PROVEN' }
                Remove-Item -LiteralPath $ProfileRoot -Recurse -Force
            }
            $Receipt['Cleanup'] += 'FRESH_BROWSER_PROFILE_REMOVED'
        } catch { $Receipt['State'] = 'FAIL'; $Receipt['Cleanup'] += 'BROWSER_PROFILE_CLEANUP_UNVERIFIED'; $ExitCode = 1 }
        try {
            $LiveAfter = Get-LiveSnapshot $LiveVoiceRoot
            $Receipt['LiveAfter'] = $LiveAfter
            Assert-SameSnapshot $LiveBefore $LiveAfter
            $Receipt['LiveCodeAndBindingReadback'] = 'UNCHANGED_FOR_ALL_RECORDED_PATHS'
            $stillLive = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in @($launchers[0].ProcessId, $liveStudios[0].ProcessId, $kokoroProcesses[0].ProcessId) })
            if ($stillLive.Count -ne 3) { throw 'ORIGINAL_LIVE_SERVICE_PROCESS_NO_LONGER_OBSERVED' }
            $Receipt['OriginalLiveServices'] = 'ORIGINAL_PIDS_STILL_PRESENT'
            $Receipt['ScriptSha256After'] = Get-Sha256 $ScriptPath
            $Receipt['RunnerSha256After'] = Get-Sha256 $RunnerPath
            if ($Receipt.ScriptSha256After -cne $ExpectedScriptSha256 -or $Receipt.RunnerSha256After -cne $ExpectedRunnerSha256) { throw 'QUALIFICATION_AUTHORITY_FILES_CHANGED' }
        } catch { $Receipt['State'] = 'FAIL'; $Receipt['PostGateFailure'] = $_.Exception.Message; $ExitCode = 1 }
        $Receipt['CompletedAt'] = [DateTime]::UtcNow.ToString('o')
        $Receipt['NextGate'] = 'OWNER_REVIEW_OF_ISOLATED_UI_EVIDENCE_BEFORE_LIVE_PROMOTION'
        if ($null -ne $ActivationManifest) {
            $ActivationManifest['State'] = if ($Receipt.State -eq 'PASS' -and $ExitCode -eq 0) { 'READY_FOR_APPROVAL' } else { 'BLOCKED' }
            $ActivationManifest['QualificationState'] = $Receipt.State
            $ActivationManifest['CompletedAt'] = $Receipt.CompletedAt
            [IO.File]::WriteAllText($ActivationManifestPath, ($ActivationManifest | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
            $Receipt['ActivationManifest'] = @{ Path = $ActivationManifestPath; Sha256 = Get-Sha256 $ActivationManifestPath; State = $ActivationManifest.State }
        }
        $receiptPath = Join-Path $RunRoot 'qualification-receipt.json'
        [IO.File]::WriteAllText($receiptPath, ($Receipt | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
        [pscustomobject]@{ State = $Receipt.State; Receipt = $receiptPath; ReceiptSha256 = Get-Sha256 $receiptPath;
            LivePublication = 'NOT_PERFORMED'; LearningLedger = 'NOT_UPDATED' } | ConvertTo-Json -Compress
    } elseif (-not $InspectOnly -or $ExitCode -ne 0) {
        Write-Output 'BLOCKED before staging. RECEIPT NOT CREATED; LEARNING LEDGER NOT UPDATED.'
    }
}
exit $ExitCode
#endregion
