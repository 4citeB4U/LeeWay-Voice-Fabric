/* Local-only speech queue and timing. No audio, prompts or transcripts are logged. */
(function(root){
  'use strict';
  const aborted=()=>new DOMException('Speech was stopped.','AbortError');
  const events=[];
  const metrics=root.LeeWayVoiceMetrics={
    record(stage,detail={}){events.push({stage,atMs:Math.round(performance.now()),...detail});if(events.length>500)events.shift();root.dispatchEvent?.(new Event('leeway-voice-metric'));},
    snapshot(){return events.map(event=>({...event}));},
    clear(){events.length=0;}
  };
  class SpeechStream {
    constructor(signal){this.buffer='';this.closed=false;this.signal=signal;this.wake=null;this.error=null;this.timer=null;this.flush=false;this.abort=()=>this.fail(aborted());signal?.addEventListener('abort',this.abort,{once:true});if(signal?.aborted)this.abort();}
    push(text){if(this.closed)return;this.buffer+=text;if(this.buffer.length>12000){this.fail(new Error('Speech queue is full. Please ask for a shorter answer.'));return;}this.wake?.();}
    end(){this.closed=true;this.wake?.();}
    fail(error){this.error=error;this.closed=true;this.wake?.();}
    dispose(){clearTimeout(this.timer);this.signal?.removeEventListener('abort',this.abort);}
    [Symbol.asyncIterator](){return this;}
    async next(){
      for(;;){
        if(this.error){this.dispose();throw this.error;}
        const text=this.buffer;
        const words=[...text.matchAll(/\S+\s+/g)];
        const cut=root.LeeWayBrowserVoice.segmentCut(text,{closed:this.closed,flush:this.flush&&words.length>=10});
        if(cut){this.buffer=text.slice(cut).trimStart();clearTimeout(this.timer);this.timer=null;this.flush=false;return {value:text.slice(0,cut).trim(),done:false};}
        if(this.closed){this.dispose();return {done:true};}
        await new Promise(resolve=>{this.wake=resolve;if(words.length>=10&&!this.timer)this.timer=setTimeout(()=>{this.flush=true;this.wake?.();},1200);});this.wake=null;
      }
    }
  }
  root.LeeWaySpeechStream=SpeechStream;
  const Voice=root.LeeWayBrowserVoice;
  const originalStop=Voice.prototype.stop;
  Voice.prototype.stop=function(){
    const started=performance.now();this.activeStream?.fail(aborted());this.activeStream=null;
    originalStop.call(this);metrics.record('local-stop',{durationMs:performance.now()-started});
  };
  Voice.prototype.speakStream=async function(stream,{signal,onState=()=>{},onRendered=()=>{}}={}){
    if(signal?.aborted)throw aborted();
    this.stop();const epoch=this.epoch;
    if(this.boundTransport)await this.prepareBound(epoch);
    if(epoch!==this.epoch||signal?.aborted)throw aborted();
    if(!this.ready)throw new Error('Load the browser voice first.');
    const iterator=stream[Symbol.asyncIterator]();let number=0;
    const stop=()=>{stream.fail(aborted());if(epoch===this.epoch)this.stop();};
    signal?.addEventListener('abort',stop,{once:true});this.activeStream=stream;
    const valid=()=>{if(epoch!==this.epoch||signal?.aborted)throw aborted();};
    const prepare=async()=>{
      const item=await iterator.next();valid();if(item.done)return null;
      if(++number>60)throw new Error('This reply is too long for one spoken turn.');
      const segment=number,start=performance.now();metrics.record('tts-start',{segment});if(!this.sources.size)onState('Preparing the next spoken sentence...');
      const result=await this.request('generate',{text:item.value,exaggeration:this.exaggeration},p=>{if(epoch===this.epoch&&p.message&&!this.sources.size)onState(p.message)});
      valid();metrics.record('tts-ready',{segment,durationMs:performance.now()-start,...result.timings});
      return {result,text:item.value,segment};
    };
    // Speculative work always settles: interruptions cannot leave unhandled rejections.
    const settled=()=>prepare().then(value=>({value}),error=>({error}));
    let pending=settled();
    try{
      for(;;){
        const item=await pending;if(item.error)throw item.error;valid();if(!item.value)break;
        // At most one following waveform is prepared during current playback.
        pending=settled();onState('Speaking. The microphone can interrupt.');
        metrics.record('playback-request',{segment:item.value.segment});
        await this.play(item.value.result,epoch);valid();onRendered(item.value.text);metrics.record('segment-rendered',{segment:item.value.segment});
      }
      onState('Ready.');
    }catch(error){stream.fail(error);if(epoch===this.epoch)this.stop();throw error;}
    finally{signal?.removeEventListener('abort',stop);stream.dispose();if(this.activeStream===stream)this.activeStream=null;}
  };

  /* REGION: LEEWAY.VOICE.NATIVE_BINDING; TAG: SAME_STREAM_SAME_EPOCH
  WHO: Voice Fabric. WHAT: Bind an identity-verified renderer to the existing speech pipeline.
  WHEN: Prepared text/stream. WHERE: portable JS with supplied native transport.
  WHY: The UI owns no segmentation, queue, default speaker or native-TTS fallback.
  HOW: Explicit selection, serial native inference, stop epochs and live revision checks. LICENSE: MIT */
  function selection(value){
    const fields=['agentId','personaFamily','personaArchetypeId','voicePackageId','provider','selectionRevision'];
    if(value?.authority!=='LEEWAY_VOICE_FABRIC'||value.deviceMayOverride!==false||value.systemVoiceFallback!==false||
       fields.some(k=>typeof value[k]!=='string'||!value[k])||!(/^[a-f0-9]{64}$/).test(value.selectionRevision)||
       !['kokoro','chatterbox'].includes(value.provider))throw Error('VOICE_BOUND_SELECTION_INVALID');
    if(value.provider==='kokoro'&&(typeof value.voiceId!=='string'||!value.voiceId))throw Error('VOICE_BOUND_SPEAKER_REQUIRED');
    return Object.freeze({...value});
  }
  function decodeBoundWave(result,selected){
    if(result?.voiceAuthority!==selected.authority||result.selectionRevision!==selected.selectionRevision||
       ['agentId','personaFamily','personaArchetypeId','voicePackageId','provider'].some(k=>result[k]!==selected[k])||
       (selected.voiceId&&result.voiceId!==selected.voiceId))throw Error('VOICE_BOUND_RESULT_IDENTITY_MISMATCH');
    if(result.format!=='wav'||typeof result.audioContent!=='string'||result.audioContent.length>16000000)throw Error('VOICE_BOUND_WAVE_REQUIRED');
    const raw=atob(result.audioContent),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    if(bytes.length<44)throw Error('VOICE_BOUND_WAVE_TRUNCATED');
    const view=new DataView(bytes.buffer),tag=at=>String.fromCharCode(...bytes.subarray(at,at+4));
    if(tag(0)!=='RIFF'||tag(8)!=='WAVE'||view.getUint32(4,true)+8!==bytes.length)throw Error('VOICE_BOUND_WAVE_CONTAINER_INVALID');
    let rate=0,data=null,format=false;
    for(let at=12;at+8<=bytes.length;){const name=tag(at),size=view.getUint32(at+4,true),begin=at+8,end=begin+size;
      if(end>bytes.length)throw Error('VOICE_BOUND_WAVE_CHUNK_INVALID');
      if(name==='fmt '){if(format||size<16||view.getUint16(begin,true)!==1||view.getUint16(begin+2,true)!==1||view.getUint16(begin+14,true)!==16)throw Error('VOICE_BOUND_PCM_FORMAT_UNSUPPORTED');
        rate=view.getUint32(begin+4,true);if(rate<8000||rate>192000||view.getUint16(begin+12,true)!==2||view.getUint32(begin+8,true)!==rate*2)throw Error('VOICE_BOUND_PCM_RATE_INVALID');format=true;}
      if(name==='data'){if(data)throw Error('VOICE_BOUND_MULTIPLE_DATA_CHUNKS');data={begin,size};}
      at=end+(size%2);
    }
    if(!format||!data||data.size===0||data.size%2||data.size>rate*120*2)throw Error('VOICE_BOUND_PCM_LENGTH_INVALID');
    const samples=new Float32Array(data.size/2);for(let i=0;i<samples.length;i++){const n=view.getInt16(data.begin+2*i,true);samples[i]=n/(n<0?32768:32767);}
    return {audio:samples.buffer,sampleRate:rate,selectionRevision:selected.selectionRevision,voicePackageId:selected.voicePackageId};
  }
  Voice.decodeBoundWave=decodeBoundWave;
  Voice.prototype.bindProvider=function(transport){
    if(this.boundTransport||this.worker||this.ready)throw Error('VOICE_PROVIDER_ALREADY_BOUND');
    if(typeof transport?.resolveSelection!=='function'||typeof transport?.render!=='function')throw Error('VOICE_PROVIDER_TRANSPORT_REQUIRED');
    this.boundTransport=transport;this.boundTail=Promise.resolve();this.boundSelection=null;this.playbackRate=1;return this;
  };
  Voice.prototype.prepareBound=async function(epoch=this.epoch){
    const selected=selection(await this.boundTransport.resolveSelection());
    if(epoch!==this.epoch)throw aborted();this.boundSelection=selected;this.ready=true;this.device='VOICE_FABRIC_BOUND_PROVIDER';
    this.playbackRate=1;return selected;
  };
  const originalLoad=Voice.prototype.load,originalRequest=Voice.prototype.request,originalPlay=Voice.prototype.play;
  const originalReference=Voice.prototype.setReference,originalPace=Voice.prototype.setPace;
  Voice.prototype.load=function(...args){return this.boundTransport?this.prepareBound():originalLoad.apply(this,args);};
  Voice.prototype.setReference=function(...args){if(this.boundTransport)throw Error('SHARED_VOICE_SELECTION_REQUIRED');return originalReference.apply(this,args);};
  Voice.prototype.setPace=function(...args){if(this.boundTransport)throw Error('VOICE_PACKAGE_DELIVERY_POLICY_OWNS_PACE');return originalPace.apply(this,args);};
  Voice.prototype.request=function(type,data={},...rest){
    if(!this.boundTransport)return originalRequest.call(this,type,data,...rest);
    if(type!=='generate'||!this.boundSelection)throw Error('VOICE_BOUND_REQUEST_NOT_ALLOWED');
    const epoch=this.epoch,selected=this.boundSelection,id=++this.id;
    return new Promise((resolve,reject)=>{
      const record={type:'generate',resolve,reject,timer:null};this.pending.set(id,record);
      const task=this.boundTail.then(async()=>{
        if(epoch!==this.epoch||!this.pending.has(id))throw aborted();
        const controller=new AbortController();const nativeDeadline=setTimeout(()=>controller.abort(),120000);
        try{
          const before=selection(await this.boundTransport.resolveSelection());
          if(before.selectionRevision!==selected.selectionRevision)throw Error('STALE_VOICE_SELECTION_AUDIO_REJECTED');
          const result=await this.boundTransport.render({text:data.text,signal:controller.signal});
          if(epoch!==this.epoch||!this.pending.has(id))throw aborted();
          const after=selection(await this.boundTransport.resolveSelection());
          if(after.selectionRevision!==selected.selectionRevision)throw Error('STALE_VOICE_SELECTION_AUDIO_REJECTED');
          const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data.text)));
          const textHash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
          if(result.textHash!==textHash)throw Error('VOICE_PREPARED_TEXT_MISMATCH');
          if(epoch!==this.epoch||!this.pending.has(id))throw aborted();
          return decodeBoundWave(result,selected);
        }finally{clearTimeout(nativeDeadline);}
      });
      this.boundTail=task.catch(()=>{});
      task.then(value=>{if(this.pending.delete(id))resolve(value)},error=>{if(this.pending.delete(id))reject(error)});
    });
  };
  Voice.prototype.play=async function(result,epoch){
    if(!this.boundTransport)return originalPlay.call(this,result,epoch);
    const expected=this.boundSelection;
    const valid=async()=>{const current=selection(await this.boundTransport.resolveSelection());
      if(epoch!==this.epoch)throw aborted();
      if(!expected||result.selectionRevision!==expected.selectionRevision||current.selectionRevision!==expected.selectionRevision)throw Error('STALE_VOICE_SELECTION_AUDIO_REJECTED');};
    await valid();if(epoch!==this.epoch)throw aborted();
    let active=true,timer=null;const watch=async()=>{
      if(!active||epoch!==this.epoch)return;
      try{await valid();}catch(error){if(active&&epoch===this.epoch){this.stop();try{this.options.onUnavailable?.(error)}catch{}}return;}
      if(active&&epoch===this.epoch)timer=setTimeout(watch,500);
    };
    timer=setTimeout(watch,500);
    try{return await originalPlay.call(this,result,epoch);}finally{active=false;clearTimeout(timer);}
  };
})(globalThis);
