# Voice Studio: local speakers and hosted voices

Run `python adapters/start-studio.py --setup` from the repository (Python 3.10+ and Node.js), then open `http://127.0.0.1:8877/studio.html`. Later launches omit `--setup`. Both services bind only to loopback. Paths derive from the repository location. See [portable local runtime setup](local-studio-runtime.md).

## What is a voice?

Agent Lee Voice One and the Chatterbox default reference are two distinct reference speakers. Calm, Natural and Lively are delivery presets of that same default speaker. They are labeled accordingly and share a speaker ID and reference hash. They are not three additional people. Reference files are checked against pinned SHA-256 hashes.

Resemble AI makes Chatterbox, but its hosted prebuilt voice catalog is a separate authenticated service. The open model does not include that multi-speaker catalog. The studio discovers actual accessible UUIDs, names, preview URLs and gender metadata from the provider. It does not invent female voice IDs or repackage character demo recordings as stock voices.

## Local workflow

For immediate listening, select Agent Lee or any of the six Kokoro speakers. Their pre-generated, fixed-text previews load into the compact bottom tuning console; the console identifies the selected speaker. The three female and three male Kokoro speakers have distinct published embeddings. Press the large Play button, turn a dial, and audition or download the processed result. **Generate with local engine** uses your own text. The local engine does not need the large Chatterbox browser download. Agent Lee requires the separately configured clone service for new text, while its preview can be tuned without that service. Kokoro copies and exports carry model identity plus tuning, without reference audio; their target host needs the Kokoro adapter and weights.

For custom reference cloning through the optional browser engine:

1. Select a reference speaker, or expand **Add your own voice** and choose a clean recording between 1 and 30 seconds, at most 15 MB. Enter a name and owner. Audio is decoded and saved in this browser's IndexedDB without uploading it to a provider.
2. Press **Prepare browser model** once. The pinned ONNX model download is approximately 1.5 GB. WebGPU is preferred; a supported WASM fallback is slower. Browser and device memory matter.
3. Enter short audition text and generate. The selected reference is re-encoded before generation, so changing the profile actually changes speaker conditioning.
4. Acoustic controls re-render the current take in a separate worker. Downloaded WAVs contain those changes. Expression, temperature and top-k require another generation. Top-p is disabled because the pinned Transformers.js version ignores it. Expression is disabled when the graph does not support it.
5. Alternatively, **Tune an existing recording** loads up to 100 seconds of audio without a model download. It changes acoustic delivery only; it does not turn that recording into another speaker.
6. **Export portable package** downloads one JSON file with reference bytes, hash, settings and metadata. Import it on another origin/device. Built-in IDs receive an `-imported` suffix; existing IDs are never silently overwritten. **Download tuned WAV** exports the current performance separately.

Pace ranges from 0.6 to 1.6; pitch is independent, within six semitones. Four EQ controls, rumble filtering, de-essing, gentle low-level expansion, compression and gain are implemented. Expansion is not spectral restoration and cannot promise removal of every artifact. Extreme settings can damage consonants. Listen before approving a production voice.

## Resemble connection

Configure `RESEMBLE_API_KEY` in the server process environment using your local secret-management method, then restart the server and press **Connect / refresh account voices**. Never put a key in the HTML, portable package, repository or chat. Search the populated list for `female` or another returned tag. Available voices and synthesis depend on account access; generation uses account credits.

The browser sends only text and the selected UUID to the local adapter for hosted synthesis. The adapter authenticates using Bearer credentials and lets Resemble select the current hosted model for that voice. It does not upload your local clone references. Exported hosted profiles carry UUID metadata, not a locally runnable copy of the provider's voice, and require account access on the target host.

The optional server is a development adapter, not a public multi-tenant service. Remote deployment requires application authentication, access controls, budgets, rate limiting and HTTPS. For an explicitly trusted separate frontend, configure `LEEWAY_ALLOWED_ORIGINS` with exact origins. Same-origin serving is the default.

### Local HTTP contract

| Request | Result |
| --- | --- |
| `GET /api/provider/status` | `{ "resemble": { "configured": false } }` until the server has a key |
| `GET /api/resemble/voices?page=1&gender=female` | `voices`, `page`, `numPages`; metadata includes the actual `voiceUuid` |
| `POST /api/resemble/synthesize` with JSON `{ "voiceUuid": "...", "text": "..." }` | `audioContent` (base64 WAV), `format`, `sampleRate` |

The adapter bounds request size, rejects unknown origins/hosts, hides provider error bodies and never returns its key. Tests mock provider calls; a live authenticated account check remains separate from those tests.

## Embed in another application

Keep the runtime, speaker package and processing settings separate. Serve the `src` modules over HTTP(S), load `src/browser-voice.js`, then use these public building blocks:

```js
import {voiceRegistry} from './src/voice-registry.js';
import {renderAudio} from './src/studio-audio.js';

const profile = await voiceRegistry.importPortable(packageJSON);
const engine = new LeeWayBrowserVoice({skipDefaultReference: true});
await engine.load();
await engine.setReference(await voiceRegistry.audio(profile.id));
// A short single chunk; use LeeWayBrowserVoice.chunks(text) for longer text.
const result = await engine.request('generate', {
  text: 'A clear voice starts with a clear reference.',
  ...profile.synthesis,
});
const take = await renderAudio({
  audio: new Float32Array(result.audio), sampleRate: result.sampleRate,
}, {pace: profile.pace, ...profile.tuning});
// take.blob is the tuned WAV. Run DSP in a worker for responsive interfaces.
```

This local example is for Chatterbox profiles. For `provider: "resemble"`, call the hosted server contract instead and decode its WAV before applying `renderAudio`. For `provider: "kokoro"`, POST `/api/local/synthesize` with `{voicePackageId: 'kokoro-' + profile.voiceId, text}`. The local API returns base64 WAV in `audioContent`, `sampleRate`, `engine`, and generation metrics. GET `/api/local/status` checks readiness; GET `/api/local/voices` provides the six supported identities. Agent Lee uses `voicePackageId: 'agent-lee-voice-one'` and its configured clone adapter. Revoke object URLs after playback/download, stop the engine on cancellation, and discard late results. `studio.js` demonstrates those lifecycle guards.

The existing iframe speech SDK remains available for streaming applications. Full studio EQ is not automatically installed into that bridge by exporting a package: consuming applications must apply its tuning through the DSP module. Browser storage is origin-specific; portability comes from the exported package, not from sharing a local database. Windows browser validation does not establish that all phones, operating systems or embedded WebViews work.

## Sources

- [Chatterbox source and license](https://github.com/resemble-ai/chatterbox)
- [Pinned ONNX reference distribution](https://huggingface.co/onnx-community/chatterbox-ONNX)
- [Resemble voice discovery](https://docs.resemble.ai/voice-creation/voices/list)
- [Resemble synthesis API](https://docs.resemble.ai/api-reference/text-to-speech/synthesize)
- [Current hosted models](https://docs.resemble.ai/getting-started/model-versions)

## Verification

Run `npm test`, `npm run check`, and `python -m unittest discover -s tests -p 'test_studio_server.py'`. The audio tests measure pitch, duration, spectrum, dynamics and WAV frames; package tests verify recording integrity and reject tampering. Provider tests use mocked responses and real loopback HTTP. Listening acceptance, actual hosted access and target-device qualification are additional checks.

### Profile preview readiness

Every bundled profile has an adjustable sample without model preparation. Agent Lee loads a separate generated preview independently of the clone reference. Kokoro loads bundled generated previews; Chatterbox reference profiles and imported clones load their original recording as an explicitly labeled tuning preview. Hosted profiles can use a provider preview URL; if the account supplies none, generating an audition is required. Editing future text or synthesis settings preserves the current sample. Offline decoding at24kHz avoids audio-device permission dependencies; preview fetches and DSP rendering have bounded deadlines. The original Agent Lee and provider default references are bundled with their existing pinned SHA-256 checks and retain the provenance documented in the catalog.
