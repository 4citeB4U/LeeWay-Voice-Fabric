# Device-aware voice

Voice Fabric now probes the device it runs on, picks a provider that device can run, and reports every change of provider. No clone voice is needed.

## Provider order

| Order | Provider | Needs | Notes |
|---|---|---|---|
| 1 | `kokoro` | WebAssembly (WebGPU used when present) | About 92 MB, 28 distinct English voices. Default: `kokoro-am_michael`. |
| 2 | `device-speech` | Installed system or Android speech voice | No download. Last resort. Reported as `device-speech`, never as a LeeWay voice package. |
| 3 | `chatterbox` | High-tier device **and** the clone voice explicitly selected | Optional. About 1.5 GB. Off by default. |

A failed provider is recorded in `attempts`; the next one is tried; the result carries a `fallback` object (`requested`, `actual`, `provider`, `reason`) and a `voice.fallback` event. A user stop is never treated as a provider fault.

## Commands (SDK, `postMessage`, and MCP-style tools)

| SDK | Tool | Purpose |
|---|---|---|
| `probeDevice()` | `voice_device_profile` | Evidence-classed device profile and provider plan |
| `diagnostics(opts)` | `voice_diagnostics` | Native host snapshot, plus Device Bridge when a URL and owner token are supplied |
| `selfTest({audible})` | `voice_self_test` | Measured: probe, diagnostics, prepare, synthesis (peak and RMS of real samples) |
| `status()` | `voice_status` | Active provider, plan, fallback, last error |
| `speak`, `stop`, `listVoices`, `selectVoice` | `voice_speak`, `voice_stop`, `voice_list_voices`, `voice_select_voice` | Core |

`createVoiceTools(client)` in `src/voice-tools.js` returns `{name, description, inputSchema, handler}` objects. They plug into any MCP server or function-calling runtime. `contracts/voice-tools.v1.json` is the manifest and a test keeps it identical to the code.

## Diagnostics sources

1. **Native host.** An Android WebView can expose `LeeWayDeviceDiagnostics.snapshot()` returning JSON. An `audio` section is read when present: outputs, music volume, muted, sample rate, frames per buffer, TTS engines.
2. **LeeWay Device Bridge** on `http://127.0.0.1:5323`. `/health` is open. `/passport` needs the **owner-issued bearer token supplied by the caller**, and the owner must have enabled agent access. This code never discovers, guesses or stores a token. Only loopback `http` URLs are read.

All diagnostics are untrusted: fields are allow-listed, type-checked and bounded.

### Known limits (not hidden)

- The Device Bridge loopback server sends no CORS headers, and browsers may block a hosted page from reaching loopback. Reads work from a native host, from Node/MCP hosts, or once the bridge adds CORS.
- The Device Bridge Android `Diagnostics.snapshot()` has no `audio` section yet; it must add one (from `AudioManager`) for audio diagnostics to flow.
- The Device Bridge `VoiceRuntime.kt` currently reports voice as unavailable and forbids system TTS fallback; that policy conflicts with this design and needs its own change in that repository.
- The first Kokoro run downloads about 92 MB (cached afterwards). `kokoro-js` is pinned to 1.2.1; the model files are not revision-pinned by that library.
- `selfTest` proves synthesis produced non-silent samples. Whether sound is audible on the speaker must be confirmed by the listener.
