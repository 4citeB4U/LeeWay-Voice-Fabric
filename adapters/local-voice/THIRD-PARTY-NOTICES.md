# Kokoro attribution and redistribution notices

Kokoro model: trained by the author identified as `@rzvzn`; published by hexgrad.
Architecture credits: StyleTTS 2 (Li et al.; yl4579) and ISTFTNet.
Kokoro JavaScript runtime: the upstream hexgrad/kokoro project and its contributors.
ONNX conversion: the onnx-community distribution, derived from hexgrad/Kokoro-82M.

- Model source and provenance: https://huggingface.co/hexgrad/Kokoro-82M
- Voice catalog: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
- JavaScript runtime/license: https://github.com/hexgrad/kokoro
- Pinned ONNX distribution: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/1939ad2a8e416c0acfeecc08a694d14ef25f2231

These upstream model/runtime distributions declare Apache License 2.0. The accompanying `LICENSE-KOKORO.txt` is the upstream license text. Retain this attribution and license when distributing this adapter with Kokoro assets. The model architecture, trained parameters and voice embeddings are third-party material; LeeWay's integration code does not imply ownership of them.

The model author also credits these training datasets; retain this documented attribution:

- Koniwa `tnc`, CC BY 3.0: https://github.com/koniwa/koniwa ; https://creativecommons.org/licenses/by/3.0/
- SIWIS, CC BY 4.0: https://datashare.ed.ac.uk/handle/10283/2353 ; https://creativecommons.org/licenses/by/4.0/

The six selected English voice embeddings are Heart (`af_heart`), Bella (`af_bella`), Nicole (`af_nicole`), Fenrir (`am_fenrir`), Michael (`am_michael`) and Puck (`am_puck`). They are used as supplied voice styles; they are not represented as Resemble/Chatterbox voices or verified identities of real people. The integration uses the q8 ONNX conversion and transforms generated floating-point waveform output to PCM16 WAV for playback; it does not retrain the model.

Runtime dependencies installed by npm have their own licenses. Preserve their individual package license/notice files when redistributing dependencies; this document is not a replacement for those files. Model/license declarations are source evidence, not an independent audit of every training recording.
