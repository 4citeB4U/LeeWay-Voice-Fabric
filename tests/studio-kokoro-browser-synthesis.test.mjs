/* LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.FABRIC.BROWSER_KOKORO.TEST
TAG: NO_LAPTOP_SYNTHESIS_CONTRACT
WHO: LeeWay Industries. WHAT: Browser PCM/WAV and mock engine regression.
WHY: Ensure the GitHub Pages Kokoro route does not require owner-local HTTP.
WHERE: tests. WHEN: 2026-10-24. HOW: Node fixture without network or credentials.
AUTHORITY: TEST_ONLY. LICENSE: Existing LeeWay repository terms. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {pcm16Wav,synthesizeKokoroInBrowser} from '../src/studio-kokoro-browser-synthesis.mjs';
test('browser Kokoro makes mono RIFF WAV at 24 kHz',()=>{
 const b=pcm16Wav(new Float32Array([0,0.5,-0.5]),24000);
 assert.equal(new TextDecoder().decode(b.slice(0,4)),'RIFF');
 assert.equal(new TextDecoder().decode(b.slice(8,12)),'WAVE');
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 assert.equal(v.getUint32(24,true),24000);
 assert.equal(v.getUint16(22,true),1);
 assert.equal(v.getUint32(40,true),6);
});
test('Kokoro playback calls existing in-browser engine without HTTP service',async()=>{
 let textSeen='',voiceSeen='';
 class MockEngine{
  setVoice(id){voiceSeen=id;}
  async load(){return {device:'wasm'};}
  async request(kind,{text}){assert.equal(kind,'generate');textSeen=text;
   return {audio:new Float32Array([0,0.25,-0.25]).buffer,sampleRate:24000};}
 }
 const out=await synthesizeKokoroInBrowser('Agent Lee speaking','kokoro-bm_lewis',{Engine:MockEngine});
 assert.equal(textSeen,'Agent Lee speaking');
 assert.equal(voiceSeen,'kokoro-bm_lewis');
 assert.equal(out.execution,'BROWSER_WASM_OR_WEBGPU');
 assert.equal(out.productionVeritasVerified,false);
 assert.equal(out.gpuInferenceVerified,false);
 assert.equal(out.wav.length,50);
});
test('invalid text, voice and samples fail closed',async()=>{
 await assert.rejects(synthesizeKokoroInBrowser('say hi','../other'),/KOKORO_BROWSER_VOICE_INVALID/);
 await assert.rejects(synthesizeKokoroInBrowser('','kokoro-bm_lewis'),/KOKORO_BROWSER_TEXT_INVALID/);
 assert.throws(()=>pcm16Wav(new Float32Array([NaN])),/KOKORO_BROWSER_AUDIO_NONFINITE/);
});
