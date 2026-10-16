# Universal Contributor Guide: Operating, Repairing & Verifying LeeWay Voice Fabric

## 1. Core Architectural Principle
> **Agent Lee is a Sovereign Agentic Entity, NOT an LLM.**  
> LLMs (Gemini, Claude, GPT, local LiteRT-LM models in the Model Hub) produce reasoning tokens.  
> Voice Fabric delivers **Acoustic Identity, Cadence, and Presence**.  
> The reasoning engine can change dynamically at any millisecond without changing Agent Lee's voice or poise. Stopping speech **never** terminates Agent Lee's internal reasoning loop.

---

## 2. Canonical Voice Hierarchy & Model Hub Integration

### The 3-Tier Execution Hierarchy
1. **Primary Model Voice (Default)**: `kokoro-am_michael` (Male) / `kokoro-af_heart` (Female).
   - High-fidelity 82M Kokoro ONNX model running locally via WebAssembly / WebGPU.
   - 28 distinct model voices available immediately in the catalog.
   - ~92 MB model download, cached permanently in local browser/device storage.
2. **Resilient Fallback**: `device-speech` (Local System Speech).
   - Instant zero-download fallback utilizing the host operating system's native speech engine (Android TTS, Windows SAPI/OneCore, Apple Speech, Linux Speech Dispatcher).
   - Activated automatically if WebAssembly fails, offline restrictions apply, or network fails.
3. **Optional Clone Voice**: `agent-lee-voice-one`.
   - Requires explicit opt-in and a high-tier device.

### Universal Model Hub Pipe
Any LLM or local model in the LeeWay Model Hub (`docs/model-manifest.json`) connects directly to Voice Fabric via streaming tokens:
```javascript
// Universal LLM Stream to Voice Fabric Pipe:
const streamId = await voiceClient.streamStart();
for await (const chunk of llmInferenceStream) {
  const token = chunk.text || chunk.delta || '';
  await voiceClient.streamChunk(streamId, token);
}
await voiceClient.streamEnd(streamId);
```

---

## 3. Instant Global Voice Switch Rule
Changing Agent Lee's voice does **not** require rebuilding the application or re-downloading model assets.

- **To change the default voice globally**:
  Update `profiles/agent-lee-active-voice.v1.json`:
  ```json
  {
    "voicePackageId": "kokoro-am_michael" // or "kokoro-af_heart", "kokoro-bm_daniel", etc.
  }
  ```
- **Programmatically in real time**:
  ```javascript
  await voiceClient.selectVoice('kokoro-af_heart');
  ```
All future speech dispatches immediately adopt the new persona without restarting workers or breaking active conversations.

---

## 4. Multi-Platform Hardware Integration Guide

| Platform | Primary Runtime | Fallback Runtime | How to Connect |
|---|---|---|---|
| **Android (Samsung Galaxy / Pixel)** | Chromium / Samsung Internet / Android WebView | Android `TextToSpeech` (`com.google.android.tts`, `com.samsung.SMT`) | Load `bridge.html` in WebView or use `LeeWayPocketEnglish` host interface. |
| **Windows 11 / 10 (Lenovo Legion, Surface)** | Chromium / Edge / WebView2 (WASM SIMD or WebGPU) | Windows `SpeechSynthesis` | Direct import of `src/voice-sdk.js` with iframe bridge. |
| **macOS (MacBook, Mac Studio)** | Safari / Chrome / WKWebView | macOS Speech (`say` / Web Speech) | Point `LeeWayVoiceClient` origin to Voice Fabric bridge. |
| **iOS / iPadOS (iPhone, iPad)** | Safari / WKWebView | iOS `AVSpeechSynthesizer` via Web Speech | WASM Kokoro execution or native fallback. |
| **Linux (Ubuntu, Debian, Fedora)** | Chrome / Firefox / Headless Chromium | `speech-dispatcher` / Web Speech | Standard `npm run test:device` headless execution. |

---

## 5. Diagnostic & Repair Runbook

When voice is failing or audio is not playing on a device, follow this diagnostic loop:

### Step 1: Run the Measured Self-Test
From any agent or console:
```javascript
const test = await voiceClient.selfTest({ audible: true });
console.log(test.steps);
```
- **Probe Check**: Confirms device tier (low, mid, high) and available hardware capabilities.
- **Diagnostics Check**: Pulls battery, audio manager, volume, and mute states.
- **Synthesis Check**: Verifies non-zero PCM peak amplitude (> 0.01) from Kokoro.
- **Playback Check**: Ensures audio output device accepted the waveform.

### Step 2: Check Audio Hardware & Diagnostics Link
- **Android**: Ensure `AudioManager.STREAM_MUSIC` volume is > 0 and `muted == false`.
- **Windows / Mac**: Confirm browser tab has autoplay permission enabled or has received at least one user gesture.
- **Diagnostics Link**: If running alongside Device Bridge, ensure port `5323` is accessible and the owner bearer token is supplied for `/passport`.

### Step 3: Run the Test Suite
Always verify deterministic tests before committing changes:
```bash
npm run check              # Validates all JS modules syntax
npm test                   # Runs all 131 unit tests (probe, router, diagnostics, tools)
npm run test:device        # Runs the headless real-model browser gate in Chromium
```

---

## 6. Official Verification Evidence
Verified on October 16, 2026:
- **Receipt**: `receipts/RECEIPT-VOICE-FABRIC-PARITY-VERIFICATION-20261016.json`
- **PC Audio**: Lenovo Legion 5 16IAX10 laptop running Windows 11.
- **Mobile Audio**: Samsung Galaxy Z Fold 6 (`SM-F956U`) running Android 14.
- **Take 1 (Male)**: `kokoro-am_michael` - Hip Hop OG Poetic Secretary of State.
- **Take 2 (Female)**: `kokoro-af_heart` - Hip Hop OG Poetic Secretary of State.
