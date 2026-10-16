/*
LEEWAY HEADER
REGION: VOICE.FABRIC.KOKORO_BROWSER
TAG: VOICE.FABRIC.KOKORO.BROWSER
Kokoro-82M running in the visitor's browser (WebGPU when present, otherwise
WebAssembly). About 92 MB, 28 distinct English voices, no clone reference.

It extends LeeWayBrowserVoice so playback, the one-mouth rule, interruption,
streaming clause pipeline and metrics are the SAME code the Chatterbox engine
uses. Only model loading and the `generate` step differ.
*/
(function(root){
  'use strict';
  const Base=root.LeeWayBrowserVoice;
  if(!Base)throw new Error('Load browser-voice.js before kokoro-browser.js.');
  const KOKORO_JS_URL='https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
  const MODEL_ID='onnx-community/Kokoro-82M-v1.0-ONNX';
  const DEFAULT_VOICE='am_michael';
  const LOAD_TIMEOUT_MS=10*60_000;
  function aborted(){return new DOMException('Speech was stopped.','AbortError');}

  class LeeWayKokoroVoice extends Base{
    constructor(options={}){
      super(options);
      this.provider='kokoro';this.voiceId=DEFAULT_VOICE;this.tts=null;this.playbackRate=1;
      this.requestedDevice=options.device||null;
    }
    static get download(){return {model:MODEL_ID,approxBytes:92_000_000,module:KOKORO_JS_URL};}
    setVoice(voiceId){
      const id=String(voiceId||'').replace(/^kokoro-/,'');
      if(!/^[a-z]{2}_[a-z]+$/.test(id))throw new Error('Invalid Kokoro voice ID.');
      this.voiceId=id;
    }
    async setReference(){/* Kokoro voices are model voices; there is no clone reference. */}
    async load(onProgress=()=>{}){
      if(this.ready)return {device:this.device};
      if(this.loading)return this.loading;
      const lifecycle=this.lifecycle;
      const attempt=async device=>{
        const loader=this.options.loader||(url=>import(url));
        const module=await loader(this.options.moduleUrl||KOKORO_JS_URL);
        onProgress({status:'initiate',file:'Kokoro voice',total:LeeWayKokoroVoice.download.approxBytes,device});
        // WebGPU is fp32; WebAssembly runs the 8-bit quantised model (the ~92 MB one).
        return module.KokoroTTS.from_pretrained(MODEL_ID,{
          dtype:device==='webgpu'?'fp32':'q8',device,
          progress_callback:p=>{if(lifecycle===this.lifecycle)onProgress(p);}
        });
      };
      const order=this.requestedDevice?[this.requestedDevice]
        :(root.navigator?.gpu?['webgpu','wasm']:['wasm']);
      this.loading=(async()=>{
        let lastError;
        for(const device of order){
          let timer;
          try{
            const tts=await Promise.race([attempt(device),
              new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Kokoro preparation took too long.')),LOAD_TIMEOUT_MS);})])
              .finally(()=>clearTimeout(timer));
            if(lifecycle!==this.lifecycle){throw aborted();}
            this.tts=tts;this.device=device;this.ready=true;
            onProgress({status:'ready',device});
            return {device};
          }catch(error){
            if(error?.name==='AbortError')throw error;
            lastError=error;
            if(device!==order.at(-1))onProgress({status:'warning',message:`Kokoro on ${device} failed (${String(error?.message||error).slice(0,120)}). Trying ${order[order.indexOf(device)+1]}.`});
          }
        }
        throw lastError||new Error('Kokoro could not start.');
      })().finally(()=>{this.loading=null;});
      return this.loading;
    }
    /** Replaces the worker round-trip used by the shared streaming pipeline. */
    async request(type,data={}){
      if(type!=='generate')throw new Error(`Kokoro engine does not support "${type}".`);
      if(!this.tts)throw new Error('Load the Kokoro voice first.');
      const epoch=this.epoch,started=performance.now();
      const out=await this.tts.generate(String(data.text||''),{voice:this.voiceId,speed:1});
      if(epoch!==this.epoch)throw aborted();
      const samples=out.audio instanceof Float32Array?out.audio:new Float32Array(out.audio);
      // Copy: the pipeline owns and transfers this buffer.
      return {audio:samples.slice().buffer,sampleRate:out.sampling_rate||24000,timings:{synthMs:performance.now()-started}};
    }
    resetWorker(){this.tts=null;this.ready=false;this.device=null;for(const r of this.pending.values())clearTimeout(r.timer);this.pending.clear();}
  }
  root.LeeWayKokoroVoice=LeeWayKokoroVoice;
})(globalThis);
