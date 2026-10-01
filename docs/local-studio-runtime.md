# Portable local Voice Studio runtime

Run from any checkout location with Python 3.10+ and a current Node.js LTS runtime available on PATH. The launcher derives files from its own location. Windows is the tested platform for this implementation; portability of the contract is not proof of Linux/macOS testing.

```sh
python adapters/start-studio.py --setup
```

Setup runs `npm ci` inside `adapters/local-voice` and downloads the pinned approximately 92 MB Kokoro q8 ONNX model plus small config/tokenizer files. npm also installs runtime dependencies and packaged voice embeddings. Subsequent launches need no setup:

```sh
python adapters/start-studio.py
python adapters/start-studio.py --check --port 8879 --voice-port 8880
```

Open the printed studio URL. Default studio port is 8877; the server-to-server Kokoro adapter uses 8878. Both bind to loopback. The studio remains responsive while the voice model warms up. `--check` checks presence and free ports, not model inference; the worker verifies the ONNX SHA-256 during load. Ctrl+C stops the direct processes created by this launcher. It attempts termination, waits, then kills an unresponsive child. On Windows process termination is not a guarantee of graceful application cleanup; separately managed Docker containers/services are not stopped.

## 28 supplied English speaker profiles

| Profile ID | Name | Gender | Accent |
| --- | --- | --- | --- |
| kokoro-af_alloy | Alloy | female | American |
| kokoro-af_aoede | Aoede | female | American |
| kokoro-af_bella | Bella | female | American |
| kokoro-af_heart | Heart | female | American |
| kokoro-af_jessica | Jessica | female | American |
| kokoro-af_kore | Kore | female | American |
| kokoro-af_nicole | Nicole | female | American |
| kokoro-af_nova | Nova | female | American |
| kokoro-af_river | River | female | American |
| kokoro-af_sarah | Sarah | female | American |
| kokoro-af_sky | Sky | female | American |
| kokoro-am_adam | Adam | male | American |
| kokoro-am_echo | Echo | male | American |
| kokoro-am_eric | Eric | male | American |
| kokoro-am_fenrir | Fenrir | male | American |
| kokoro-am_liam | Liam | male | American |
| kokoro-am_michael | Michael | male | American |
| kokoro-am_onyx | Onyx | male | American |
| kokoro-am_puck | Puck | male | American |
| kokoro-am_santa | Santa | male | American |
| kokoro-bf_alice | Alice | female | British |
| kokoro-bf_emma | Emma | female | British |
| kokoro-bf_isabella | Isabella | female | British |
| kokoro-bf_lily | Lily | female | British |
| kokoro-bm_daniel | Daniel | male | British |
| kokoro-bm_fable | Fable | male | British |
| kokoro-bm_george | George | male | British |
| kokoro-bm_lewis | Lewis | male | British |

These are distinct official Kokoro voice embeddings, not pitch-shifted Agent Lee presets and not Resemble stock voices. The catalog includes20American and8British English voices. The local ONNX engine produces 24 kHz PCM audio without a provider API key. Naturalness remains an audition criterion, not a guarantee from the published model grades or passing software tests. [Author's voice catalog](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md).

Kokoro model and JavaScript runtime are Apache-2.0. Preserve the bundled attribution/license notices in `adapters/local-voice` when redistributing these adapters. Model revision is `1939ad2a8e416c0acfeecc08a694d14ef25f2231`; q8 SHA-256 is `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478`. [Original model](https://huggingface.co/hexgrad/Kokoro-82M), [pinned ONNX files](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/1939ad2a8e416c0acfeecc08a694d14ef25f2231), [official JavaScript implementation](https://github.com/hexgrad/kokoro/tree/main/kokoro.js).

## Optional services and configuration

Set `RESEMBLE_API_KEY` in the server environment to enable the actual Resemble hosted library; do not put it in a profile, browser script or committed file. Without it, the local 28 voices still work. Hosted voices use returned provider UUIDs and account permissions; no fixed catalog IDs are invented. [Resemble voice listing](https://docs.resemble.ai/voice-creation/voices/list).

The launcher inherits explicit clone settings unchanged: `LEEWAY_XTTS_CONTAINER`, `LEEWAY_XTTS_REFERENCE`, `LEEWAY_XTTS_REFERENCE_SHA256`, and `LEEWAY_XTTS_URL`. It does not create a Docker image, acquire another person's voice or select an alternate clone. A configured container must already have a compatible XTTS runtime and reference available at the configured container path. With no configured container, the studio can connect to an existing compatible clone service via `LEEWAY_XTTS_URL` (adapter default: loopback port 8092).

`--voice-port` controls the launched Kokoro service and its studio routing. The launcher intentionally sets the child `LEEWAY_KOKORO_URL` to that local service. To use an independently managed Kokoro endpoint instead, run `studio-server.py` directly with explicit `LEEWAY_KOKORO_URL`.

Keep the UI and APIs on the same studio origin. If deliberately serving a separate frontend, `LEEWAY_ALLOWED_ORIGINS` accepts comma-separated explicit origins; wildcard CORS is not enabled. Keys remain on the Python server.

CPU Kokoro generation and the optional CPU clone adapter return completed audition audio; they do not establish low-latency GPU streaming or conversational interruption timing. The browser Chatterbox path and any GPU/container path are separate capabilities, each requiring their own hardware, runtime and latency verification. Audio measurement/Formula inputs summarize measured signal properties; they do not certify naturalness or architecture.
