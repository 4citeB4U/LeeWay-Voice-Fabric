# LeeWay Voice — Device-first SDK

This is the **existing LeeWay Voice Fabric**, not another voice provider.

## Browser, iPhone Safari, Android, tablet or laptop

Use an HTTPS-hosted ES module from a pinned Voice Fabric release or copy the package's `src/` dependencies into your application (the SDK imports its companion modules). For a repository consumer:

```js
import {createLeeWayDeviceVoice} from './src/device-voice-sdk.mjs';
const voice = createLeeWayDeviceVoice();
const voices = voice.listVoices(); // 28 Kokoro speaker profiles
voice.configure({voiceId:'kokoro-bm_lewis',rate:1.08,volume:0.9});
const result = await voice.speak('Welcome to LeeWay');
await result.completion;
```

An ES module consumer with a package loader can use the exported `./device-voice-sdk` entry point. Voice synthesis is local to the client **after downloading and loading Kokoro weights**. Browser first-use requires internet and enough device resources; WebGPU availability varies and WebAssembly is the fallback. The existing model loader uses pinned `kokoro-js@1.2.1` and `onnx-community/Kokoro-82M-v1.0-ONNX`. The code does not bundle weights or create an offline promise. iPhone Safari/PWA compatibility must be physically qualified; this is not an iOS Swift framework.

The SDK deliberately exposes the **Kokoro catalog** from the existing `voice-package-core.js`. It does not pretend Chatterbox, Resemble, or installed OS voices are the same Kokoro engine. `rate` is audio *playback speed* and `volume` controls playback gain; this does not change neural speaker identity or claim an independently verified GPU path.

Call `voice.speak(text,{play:false})` to obtain WAV bytes for app-owned playback. `voice.stop()` stops the active SDK audio element. Browser playback should be initiated through a user gesture to satisfy autoplay policies.

## When to use the authenticated API

The optional LeeWay Device Bridge HTTPS API is appropriate for **shared Agent Lee conversation**, permissioned applications, synced owner settings, or protected host tools. The device SDK performs simple Kokoro synthesis without a Device Bridge login or a laptop relay. A local voice selection is a device preference, not a new owner-authoritative shared binding.

The GitHub Pages frontend and versioned SDK source may be hosted through GitHub. GitHub does **not** run continuous Kokoro synthesis, Qwen inference or Runtime Fabric on its Pages/Actions infrastructure. Device computation occurs on the user's device. If you require an always-on central response service, deploy the authenticated Device Bridge/Runtime Fabric to a genuine independent host.

## Release boundary

Draft PR testing covers mock-engine local SDK behavior, WAV encoding and existing authentication regressions, **not real iPhone/Android Kokoro model downloads, latency, memory pressure, audible output, or cross-device owner setting synchronization**. Pin and audit remote model/runtime assets before a production SDK release.
