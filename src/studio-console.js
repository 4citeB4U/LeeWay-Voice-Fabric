/* REGION: LEEWAY.VOICE.STUDIO; TAG: SPATIAL_UI_CANONICAL_BINDING
5WH: WHO=Creator-authorized Studio user; WHAT=real control/view bindings;
WHY=operate existing Voice Fabric through the supplied spatial interface;
WHERE=canonical Studio; WHEN=user action; HOW=existing controller/owner HTTP API.
AUTHORIZED ROLES: Studio operator; shared publication requires explicit Creator Apply.
LICENSE: Existing repository terms. */
import {StudioMonitor} from './studio-monitor.js';

const $ = id => document.getElementById(id);
const events = [];
let initialized = false;

function startConsole() {
  if (initialized || !globalThis.LeeWayStudioControls) return;
  initialized = true;
  const controller = globalThis.LeeWayStudioControls;
  let visual = null, disposed = false, ownerSession = null, ownerPending = false;
  let sharedMessage = '', sharedSignature = '', lastPhase = '', lastDraft = '';
  let micPending = false, micRequest = 0, aboveThresholdSince = null;
  let lighting = true, activityTimer, ownerTimer;
  const monitor = new StudioMonitor({onMicrophone(active, settings) {
    $('toggleMic').setAttribute('aria-pressed', String(active));
    $('toggleMic').textContent = active ? 'Disable microphone' : 'Enable microphone';
    $('microphoneDevice').disabled = active || micPending;
    $('microphoneState').textContent = active
      ? `Input monitoring active${settings.sampleRate ? ' · ' + settings.sampleRate.toLocaleString() + ' Hz' : ''}. Capture stays in this Studio.`
      : 'Off. Enable to see real input levels; audio stays in this Studio.';
  }});
  globalThis.LeeWayStudioMonitor = monitor;
  controller.setBeforePlay(async media => { await monitor.activate(media); updateMetrics(); });
  const report = error => controller.reportError(error);
  const listen = (id, handler) => $(id).addEventListener('click', () => Promise.resolve().then(handler).catch(report));

  function record(type, details = {}) {
    const entry = {at: new Date().toISOString(), type, ...details};
    events.push(entry);
    if (events.length > 100) events.shift();
    const item = document.createElement('li');
    item.textContent = `${entry.at.slice(11,19)} · ${type}`;
    $('studioEvents').prepend(item);
    while ($('studioEvents').children.length > 20) $('studioEvents').lastElementChild.remove();
  }

  function updateMetrics() {
    const metrics = monitor.metrics();
    $('sampleRateValue').textContent = metrics.sampleRate ? `${metrics.sampleRate.toLocaleString()} Hz` : '— Hz';
    $('latencyValue').textContent = metrics.outputLatencyMs === null ? 'Unmeasured' : `${metrics.outputLatencyMs.toFixed(1)} ms`;
    $('latencyValue').title = 'Browser-reported output-device latency. This is not model or network latency.';
    $('audioContextState').textContent = `Audio ${metrics.state}`;
    const opened = !!monitor.context;
    $('monitorSampleRate').disabled = $('latencyPreference').disabled = opened;
    if (opened) $('deviceSettingsState').textContent = `Monitor device open · ${metrics.sampleRate.toLocaleString()} Hz. Reload to change its rate/buffer preference. Synthesis retains the provider sample rate.`;
    if (opened && !metrics.stereoPan) {
      $('micOrbit').disabled = true;
      $('micOrbit').title = 'Stereo panning is unavailable in this browser.';
    }
  }

  function updateAppearance() {
    const values = {gain: Number($('masterGain').value), reverb: Number($('spatialReverb').value), orbit: Number($('micOrbit').value)};
    monitor.setMix(values);
    $('masterGainValue').textContent = `${Math.round(values.gain * 100)}%`;
    $('spatialReverbValue').textContent = `${Math.round(values.reverb * 100)}%`;
    $('micOrbitValue').textContent = `${values.orbit}°`;
    const pan = Math.sin(values.orbit * Math.PI / 180);
    $('orbitValue').textContent = `${values.orbit}° / ${Math.abs(pan) < .01 ? 'center' : pan < 0 ? 'left' : 'right'}`;
    const theme = $('environmentPreset').value, deform = Number($('meshDeform').value);
    $('meshDeformValue').textContent = `${deform.toFixed(1)}×`;
    document.body.dataset.theme = theme;
    visual?.setAppearance({deform, theme, lighting, orbit: values.orbit});
  }
  for (const id of ['masterGain','spatialReverb','micOrbit','meshDeform']) $(id).addEventListener('input', updateAppearance);
  $('environmentPreset').addEventListener('change', updateAppearance);
  listen('toggleLight', () => { lighting = !lighting; $('toggleLight').setAttribute('aria-pressed', String(lighting)); updateAppearance(); });
  function configureDevice() { monitor.configure({sampleRate: Number($('monitorSampleRate').value), latencyHint: $('latencyPreference').value}); }
  for (const id of ['monitorSampleRate','latencyPreference']) $(id).addEventListener('change', () => {try {configureDevice();} catch (error) {report(error);}});
  listen('speakStream', async () => {
    const requestEpoch = controller.snapshot().epoch;
    configureDeviceIfClosed();
    await monitor.ensure();
    if (requestEpoch !== controller.snapshot().epoch) return;
    updateMetrics();
    record('stream-requested', {voicePackageId: controller.snapshot().selected?.id});
    await controller.stream();
  });
  function configureDeviceIfClosed() { if (!monitor.context) configureDevice(); }
  // Interrupt in the existing controller cancels both synthesis epochs and this mix.
  $('stop').addEventListener('click', () => {monitor.cut(); aboveThresholdSince = null;});
  $('referencePlayer').addEventListener('play', async () => {
    try {configureDeviceIfClosed();await monitor.activate($('referencePlayer')); updateMetrics(); record('reference-playback');}
    catch (error) {$('referencePlayer').pause(); report(error);}
  });

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) throw new Error('Audio device discovery is unavailable in this browser context.');
    const selected = $('microphoneDevice').value;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const select = $('microphoneDevice');
    select.replaceChildren(new Option('System default input', ''));
    for (const device of devices.filter(device => device.kind === 'audioinput' && device.deviceId && device.deviceId !== 'default')) {
      select.add(new Option(device.label || `Microphone ${select.options.length}`, device.deviceId));
    }
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
  }
  listen('refreshDevices', refreshDevices);
  listen('toggleMic', async () => {
    if (micPending || monitor.stream) {
      ++micRequest; micPending = false; monitor.stopMicrophone();
      $('toggleMic').textContent = 'Enable microphone';
      $('microphoneDevice').disabled = false; record('microphone-stopped');return;
    }
    const request = ++micRequest;
    micPending = true; $('toggleMic').textContent = 'Cancel microphone request'; $('microphoneDevice').disabled = true;
    try {
      configureDeviceIfClosed();
      if (await monitor.startMicrophone($('microphoneDevice').value)) {
        record('microphone-capture-started'); await refreshDevices();
      }
    } catch (error) {
      if (request === micRequest) {$('microphoneState').textContent = `Microphone unavailable: ${error.message}`; throw error;}
    } finally {
      if (request === micRequest) {
        micPending = false; $('toggleMic').textContent = monitor.stream ? 'Disable microphone' : 'Enable microphone';
        $('microphoneDevice').disabled = !!monitor.stream; updateMetrics();
      }
    }
  });

  function updateOwnerButton() {
    const draft = controller.snapshot();
    const admitted = !!ownerSession?.sharedVoicePackageIds?.includes(draft.selected?.id);
    $('applyAgentLeeVoice').disabled = !ownerSession || ownerPending || !admitted || draft.busy || draft.preparing;
    $('loadSharedVoice').disabled = !ownerSession || ownerPending || draft.busy;
    $('sharedCapabilities').textContent = ownerSession
      ? (!admitted ? 'This profile is audition-only until admitted to the shared catalog. ' : '') + 'Apply includes acoustic tuning. Synthesis sampling and the local listening mix are not published. Runtime DSP consumption and device listening require separate verification.'
      : 'An existing owner binding and an authorized local Studio session are required to publish.';
  }

  function showOwner(state) {
    $('sharedVoice').dataset.connected = 'true';
    $('sharedSpeaker').textContent = state.binding?.voicePackageId || 'Unverified';
    $('sharedRevision').textContent = state.recordRevision?.slice(0, 16) || '—';
    $('sharedRevision').title = state.recordRevision || '';
    $('sharedDelivery').textContent = state.deliveryState === 'DEVICE_ACKNOWLEDGEMENTS_NOT_YET_RECORDED' ? 'Awaiting device acknowledgement' : state.deliveryState || 'Unverified';
  }
  async function ownerApi(path, options = {}) {
    const timeout = new AbortController(), timer = setTimeout(() => timeout.abort(), 15000);
    try {
      const response = await fetch(path, {...options, signal: timeout.signal, credentials: 'same-origin', cache: 'no-store'});
      let state; try {state = await response.json();} catch {throw new Error('Owner publisher is unavailable on this host.');}
      if (!response.ok) {
        const error = new Error(state.error || `Owner request failed (${response.status})`);
        error.publicationMayHaveChanged = state.publicationMayHaveChanged;
        throw error;
      }
      return state;
    } finally { clearTimeout(timer); }
  }
  async function refreshOwner({quiet = false} = {}) {
    if (ownerPending || disposed) return;
    ownerPending = true; updateOwnerButton();
    try {
      const state = await ownerApi('/api/agent-lee/selection/session');
      if (state.authority !== 'LEEWAY_VOICE_FABRIC' || !state.csrf || !/^[a-f0-9]{64}$/.test(state.recordRevision || '') || !state.binding?.voicePackageId) throw new Error('Incomplete owner binding response.');
      const changed = sharedSignature && sharedSignature !== state.recordRevision;
      if (changed) {
        controller.stop('Shared voice revision changed. Old speech was invalidated; your audition draft is preserved.');
        record('shared-revision-changed', {revision: state.recordRevision});
      }
      ownerSession = state; sharedSignature = state.recordRevision; showOwner(state);
      if (!quiet || changed || !sharedMessage) {
        sharedMessage = changed ? 'Shared revision changed. Load it into your audition when ready.' : 'Connected to the existing Voice Fabric owner. Preview freely; Apply publishes your selected speaker and acoustic tuning.';
        $('sharedVoiceState').textContent = sharedMessage;
      }
    } catch (error) {
      ownerSession = null;
      $('sharedVoice').dataset.connected = 'false';
      $('sharedVoiceState').textContent = `Publication unavailable. Your draft is pending locally. ${error.message}`;
    } finally {ownerPending = false; updateOwnerButton();}
  }
  listen('refreshAgentLeeVoice', () => refreshOwner());
  listen('loadSharedVoice', async () => {
    if (!ownerSession) return;
    await controller.loadShared(ownerSession.binding.voicePackageId, ownerSession.tuning);
    record('shared-selection-loaded-into-audition', {revision: ownerSession.recordRevision});
  });
  listen('applyAgentLeeVoice', async () => {
    if (!ownerSession || ownerPending) return;
    const draft = controller.snapshot();
    const payload = {expectedRevision: ownerSession.recordRevision, voicePackageId: draft.selected.id, tuning: draft.tuning, approve: true};
    ownerPending = true; updateOwnerButton();
    try {
      const result = await ownerApi('/api/agent-lee/selection', {method:'POST', headers:{'Content-Type':'application/json','X-LeeWay-Owner-CSRF':ownerSession.csrf}, body:JSON.stringify(payload)});
      controller.stop('Shared voice published. Old audio was invalidated before using the new revision.');
      const readback = await ownerApi('/api/agent-lee/selection/session');
      if (readback.authority !== 'LEEWAY_VOICE_FABRIC' || readback.recordRevision !== result.recordRevision || readback.binding?.voicePackageId !== payload.voicePackageId || Object.entries(payload.tuning).some(([key,value])=>readback.tuning?.[key]!==value)) {
        throw new Error('Publication occurred, but its revision changed before readback. Refresh to inspect the current shared selection.');
      }
      ownerSession = readback; sharedSignature = readback.recordRevision; showOwner(readback);
      sharedMessage = 'Published and read back from the Voice Fabric binding. Paired-device delivery and listening are awaiting acknowledgement.';
      $('sharedVoiceState').textContent = sharedMessage;
      record('shared-publication-readback', {revision: result.recordRevision, voicePackageId: payload.voicePackageId, publicationReceipt: result.publicationReceipt});
    } catch (error) {
      ownerSession = null;
      $('sharedVoice').dataset.connected = 'false';
      $('sharedVoiceState').textContent = `${error.publicationMayHaveChanged ? 'Publication may have changed the binding; inspect readback before retrying.' : 'Apply was not verified.'} ${error.message} Your local audition remains available.`;
      record('shared-publication-unverified', {message:error.message});
    } finally {ownerPending = false; updateOwnerButton();}
  });

  document.addEventListener('leeway:studio', onStudioEvent);
  function onStudioEvent(event) {
    const detail = event.detail || {};
    if (!['draft-change','phase'].includes(detail.type)) record(detail.type || 'studio-event', detail);
    if (detail.type === 'first-audio-ready') $('generationTiming').textContent = `First segment ready · ${detail.latencyMs} ms`;
    if (detail.type === 'generation-complete') $('generationTiming').textContent = `Generated · ${(detail.generationMs / 1000).toFixed(2)} s`;
    updateActivity();
  }
  function updateActivity() {
    if (disposed) return;
    const snapshot = controller.snapshot();
    $('speakStream').disabled = !snapshot.ready;
    $('speakStream').textContent = snapshot.selected?.voiceUuid ? '▶ Stream · account credits' : '▶ Speak / Stream';
    let phase = snapshot.phase;
    if (!$('referencePlayer').paused && phase !== 'streaming') phase = 'speaking';
    if (phase !== lastPhase) {
      const labels = {idle:'Standby',preparing:'Preparing',generating:'Generating',streaming:'Streaming',speaking:'Speaking',paused:'Paused',interrupted:'Interrupted',error:'Error'};
      $('enginePhase').textContent = labels[phase] || 'Standby'; $('enginePhase').dataset.phase = phase;
      visual?.setState(phase); lastPhase = phase;
    }
    const playing = !$('outputPlayer').paused || !$('referencePlayer').paused;
    $('signalSource').textContent = !$('referencePlayer').paused ? 'Original reference' : playing ? (snapshot.phase === 'streaming' ? 'Synthesized voice' : snapshot.source) : 'No audio playing';
    $('meshState').textContent = playing ? 'Following voice output' : monitor.stream ? 'Following microphone' : 'Awaiting audio';
    const sampled = monitor.sample();
    $('micLevel').textContent = monitor.stream ? `${sampled.inputRms > 0 ? Math.max(-90,20*Math.log10(sampled.inputRms)).toFixed(0) : '−∞'} dBFS` : 'Off';
    $('outputLevel').textContent = sampled.output.some(value => value > 0) ? 'Signal detected' : 'Silent';
    // Level-triggered interruption is opt-in; these are local detection settings,
    // not claimed Formula calibration or a speech-recognition result.
    if ($('bargeIn').checked && playing && sampled.inputRms > .035) {
      if (aboveThresholdSince === null) aboveThresholdSince = performance.now();
      else if (performance.now() - aboveThresholdSince >= 200) {controller.stop('Interrupted by sustained microphone input.');record('microphone-interrupt');aboveThresholdSince = null;}
    } else aboveThresholdSince = null;
    const signature = JSON.stringify([snapshot.selected?.id,snapshot.tuning,snapshot.synthesis]);
    if (signature !== lastDraft) {lastDraft = signature; updateOwnerButton();}
    updateMetrics();
  }

  listen('exportSession', () => {
    const snapshot = controller.snapshot();
    const payload = {schemaVersion:'leeway.voice-studio-observation.v1', createdAt:new Date().toISOString(), evidenceClass:'BROWSER_OBSERVATIONS', voicePackageId:snapshot.selected?.id, runtime:snapshot.runtime, monitor:monitor.metrics(), sharedRevision:sharedSignature||null, formulaExecution:'NOT_EXECUTED', speakerAudibility:'NOT_MEASURED', learningLedger:'NOT_UPDATED', events:[...events]};
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const link = document.createElement('a'); link.href=url;link.download='leeway-voice-studio-observations.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  updateAppearance(); updateActivity(); refreshOwner();
  activityTimer = setInterval(updateActivity, 150);
  ownerTimer = setInterval(() => {if (!document.hidden) refreshOwner({quiet:true});},15000);
  import('./studio-visualizer.js').then(module => module.createStudioVisualizer({
    canvas:$('webglCanvas'),inputCanvas:$('micSpectrum'),outputCanvas:$('ttsSpectrum'),sample:()=>monitor.sample(),
    onOrbit:degrees=>{$('micOrbit').value=degrees;updateAppearance();},onMode:mode=>{$('rendererState').textContent=mode;},
  })).then(instance=>{if(disposed){instance.dispose();return;}visual=instance;updateAppearance();visual.setState(controller.snapshot().phase);})
    .catch(error=>{$('rendererState').textContent='Visualizer unavailable · voice controls active';record('visualizer-unavailable',{message:error.message});});
  function dispose() {
    if (disposed) return;
    disposed=true;clearInterval(activityTimer);clearInterval(ownerTimer);document.removeEventListener('leeway:studio',onStudioEvent);
    ++micRequest;controller.stop('Studio closed.');visual?.dispose();monitor.dispose().catch(()=>{});
  }
  addEventListener('pagehide', event => {if (!event.persisted) dispose();else {controller.stop('Studio suspended.');monitor.stopMicrophone();}});
}
startConsole();
document.addEventListener('leeway:studio', event => {if(event.detail?.type==='controller-ready')startConsole();});
