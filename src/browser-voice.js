/* Chatterbox TTS entirely in the visitor's browser. No API keys or localhost. */
(function(root){
  'use strict';
  const REVISION='3cab09af388d3f02bba43443fce88c1f4525ac43';
  const sourceURL=typeof document!=='undefined'?document.currentScript?.src:null;
  const DEFAULT_REFERENCE='https://raw.githubusercontent.com/4citeB4U/RapidWebDev/main/brain/public/voices/agent-lee-reference.wav';
  const WORKER_URL=sourceURL?new URL('chatterbox.worker.js?v=20260929-arch1',sourceURL).href:'/src/chatterbox.worker.js?v=20260928-sampling1';
  function aborted(){return new DOMException('Speech was stopped.','AbortError');}
  // Keep syntactic context whenever possible, without exceeding the generation budget.
  function segmentCut(text,{closed=false,flush=false}={}){
    const limit=180;let clause=0;
    for(const match of text.matchAll(/[.!?;:,](?=\s|$)/g)){
      const cut=match.index+1;if(cut>limit)break;
      if(cut===text.length&&!closed)continue;
      const prefix=text.slice(0,cut);
      if(/\b(?:Mr|Mrs|Ms|Dr|Prof|Jr|Sr|vs|etc|e\.g|i\.e)\.$/i.test(prefix)||/\b(?:[A-Z]\.)+$/.test(prefix))continue;
      if(/[.!?]/.test(match[0])&&prefix.trim().length>=60)return cut;
      if(prefix.trim().length>=40)clause=cut;
    }
    if(text.length>limit){
      if(clause)return clause;
      const space=text.lastIndexOf(' ',limit);return space>0?space:limit;
    }
    if(closed)return text.length;
    if(flush){
      if(clause)return clause;
      const space=text.lastIndexOf(' ');return space>0?space:0;
    }
    return 0;
  }
  function chunks(text){
    let remaining=String(text).replace(/\s+/g,' ').trim();const result=[];
    while(remaining){const cut=segmentCut(remaining,{closed:true});result.push(remaining.slice(0,cut).trim());remaining=remaining.slice(cut).trimStart();}
    return result;
  }
  class LeeWayBrowserVoice {
    constructor(options={}){
      this.options=options;this.ready=false;this.loading=null;this.epoch=0;this.id=0;
      this.pending=new Map();this.sources=new Set();this.finishPlayback=new Set();this.device=null;this.lifecycle=0;
      this.exaggeration=.25;
      this.playbackRate=1.22;
    }
    static get download(){return {model:'onnx-community/chatterbox-ONNX',revision:REVISION,webgpuBytes:1499401538,wasmBytes:1548283901,referenceBytes:720078};}
    static chunks(text){return chunks(text);}
    static segmentCut(text,options){return segmentCut(text,options);}
    createWorker(){
      if(this.worker)return;
      const worker=this.worker=new Worker(this.options.workerURL||WORKER_URL,{type:'module'});
      worker.onmessage=({data:message})=>{
        const request=this.pending.get(message.id);if(!request)return;
        if(message.type==='progress'){if(request.type==='load'){clearTimeout(request.timer);request.timer=setTimeout(request.timeout,15*60_000);}request.progress?.(message.data);return;}
        this.pending.delete(message.id);clearTimeout(request.timer);
        if(message.type==='error')request.reject(new Error(message.data.message));else request.resolve(message.data);
      };
      worker.onerror=event=>{
        for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(new Error(event.message||'Browser voice worker failed. Reload voice to retry.'));}
        this.pending.clear();this.ready=false;worker.terminate();if(this.worker===worker)this.worker=null;
      };
    }
    request(type,data={},progress,transfer=[]){
      this.createWorker();const id=++this.id;
      return new Promise((resolve,reject)=>{
        const timeout=()=>{
          this.pending.delete(id);reject(new Error('Browser voice took too long. Stop and reload voice, or try a shorter reply.'));
          // A stalled session is not left consuming GPU/CPU in the background.
          this.worker?.terminate();this.worker=null;this.ready=false;
          for(const other of this.pending.values()){clearTimeout(other.timer);other.reject(new Error('Voice worker was restarted.'));}
          this.pending.clear();
        };
        const timer=setTimeout(timeout,type==='load'?15*60_000:5*60_000);
        this.pending.set(id,{resolve,reject,progress,timer,type,timeout});
        this.worker.postMessage({id,type,data,epoch:this.epoch},transfer);
      });
    }
    async audioContext(){
      if(!this.audio||this.audio.state==='closed')this.audio=new (root.AudioContext||root.webkitAudioContext)();
      // Decoding does not require running the audio device. Awaiting resume here
      // blocks automatic preparation until a gesture under autoplay policy.
      return this.audio;
    }
    // Preparation can run before a gesture; actual speech still follows user action.
    async load(onProgress=()=>{}){
      if(this.ready)return {device:this.device};if(this.loading)return this.loading;
      const lifecycle=this.lifecycle;
      this.loading=(async()=>{
        // Prepare decoding without requesting microphone or audible playback.
        await this.audioContext();if(lifecycle!==this.lifecycle)throw aborted();
        onProgress({status:'initiate',file:'Chatterbox voice',total:LeeWayBrowserVoice.download.webgpuBytes});
        const result=await this.request('load',{device:this.options.device},onProgress);if(lifecycle!==this.lifecycle)throw aborted();this.device=result.device;
        onProgress({message:"Preparing Agent Lee's voice reference..."});
        const response=await fetch(DEFAULT_REFERENCE);if(!response.ok)throw new Error('Default voice reference could not be downloaded.');
        const blob=await response.blob();if(lifecycle!==this.lifecycle)throw aborted();
        await this.setReference(blob);if(lifecycle!==this.lifecycle)throw aborted();this.ready=true;
        onProgress({status:'ready',device:this.device});return result;
      })();
      try{return await this.loading;}finally{this.loading=null;}
    }
    // Use an owned/licensed reference. Audio is decoded locally; it is not uploaded.
    async setReference(blob){
      const lifecycle=this.lifecycle;this.stop();
      if(!blob||blob.size>15_000_000)throw new Error('Choose a voice clip smaller than 15 MB.');
      const context=await this.audioContext(),decoded=await context.decodeAudioData(await blob.arrayBuffer());
      if(decoded.duration>30||decoded.duration<1)throw new Error('Choose a clear voice reference between 1 and 30 seconds.');
      const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*24000),24000),source=offline.createBufferSource();
      source.buffer=decoded;source.connect(offline.destination);source.start();const mono=await offline.startRendering();
      if(lifecycle!==this.lifecycle)throw aborted();
      const data=mono.getChannelData(0).slice();await this.request('speaker',{audio:data.buffer},null,[data.buffer]);
    }
    async speak(text,{signal,onState=()=>{}}={}){
      if(this.speakStream&&root.LeeWaySpeechStream){
        const stream=new root.LeeWaySpeechStream(signal);stream.push(String(text));stream.end();
        try{return await this.speakStream(stream,{signal,onState});}finally{stream.dispose();}
      }
      if(!this.ready)throw new Error('Load the browser voice first.');
      if(signal?.aborted)throw aborted();
      this.stop();const epoch=this.epoch;
      const stop=()=>{if(this.epoch===epoch)this.stop();};signal?.addEventListener('abort',stop,{once:true});
      try{
        const parts=chunks(text);if(parts.length>60)throw new Error('This reply is too long for one spoken turn.');
        for(let i=0;i<parts.length;i++){
          if(epoch!==this.epoch||signal?.aborted)throw aborted();
          onState(`Preparing browser voice (${i+1}/${parts.length})...`);
          const result=await this.request('generate',{text:parts[i],exaggeration:this.exaggeration},progress=>{if(epoch===this.epoch&&progress.message)onState(progress.message)});
          if(epoch!==this.epoch||signal?.aborted)throw aborted();
          onState('Speaking. The microphone can interrupt.');
          await this.play(result,epoch);
        }
        if(epoch!==this.epoch)throw aborted();onState('Ready.');
      }finally{signal?.removeEventListener('abort',stop);}
    }
    async play({audio,sampleRate},epoch){
      if(epoch!==this.epoch)throw aborted();
      const samples=new Float32Array(audio),wav=new ArrayBuffer(44+samples.length*2),view=new DataView(wav);
      const write=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i))};
      write(0,'RIFF');view.setUint32(4,wav.byteLength-8,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,samples.length*2,true);
      for(let i=0;i<samples.length;i++){const sample=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,Math.round(sample*(sample<0?32768:32767)),true);}
      const url=URL.createObjectURL(new Blob([wav],{type:'audio/wav'}));
      return new Promise((resolve,reject)=>{
        const media=new root.Audio(url);media.playbackRate=this.playbackRate;media.preservesPitch=true;
        const source={media,stop:()=>media.pause()};this.sources.add(source);
        let finished=false;
        const finish=error=>{if(finished)return;finished=true;media.onended=null;media.onerror=null;media.onplaying=null;media.pause();media.removeAttribute('src');media.load();URL.revokeObjectURL(url);this.sources.delete(source);this.finishPlayback.delete(finish);if(epoch!==this.epoch)reject(aborted());else if(error)reject(error);else resolve();};
        this.finishPlayback.add(finish);media.onplaying=()=>root.LeeWayVoiceMetrics?.record('playback-start');media.onended=()=>finish();media.onerror=()=>finish(new Error('Browser audio playback failed.'));media.play().catch(finish);
      });
    }
    setPace(value){this.playbackRate=Math.max(.85,Math.min(1.3,Number(value)||1.22));for(const source of this.sources)if(source.media)source.media.playbackRate=this.playbackRate;}
    stop(){
      ++this.epoch;this.worker?.postMessage({type:'stop',epoch:this.epoch});
      for(const source of this.sources){try{source.stop()}catch{}}
      for(const finish of [...this.finishPlayback])finish();this.sources.clear();
      for(const [id,request] of this.pending)if(request.type==='generate'){
        clearTimeout(request.timer);request.reject(aborted());this.pending.delete(id);
      }
    }
    async dispose(){
      ++this.lifecycle;this.stop();this.ready=false;
      // Terminating the worker also releases outstanding inference/model resources.
      this.worker?.terminate();this.worker=null;
      for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(aborted());}this.pending.clear();
      if(this.audio){await this.audio.close().catch(()=>{});this.audio=null;}
    }
  }
  root.LeeWayBrowserVoice=LeeWayBrowserVoice;
})(globalThis);
