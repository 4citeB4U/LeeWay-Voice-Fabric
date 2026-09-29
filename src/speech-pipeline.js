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
        const text=this.buffer;let cut=0;
        const boundaries=/[.!?;:]\s+/g;let match;
        while((match=boundaries.exec(text))){
          const prefix=text.slice(0,match.index+1);
          // Do not mistake abbreviations, initials, decimals or URLs for sentence ends.
          if(/\b(?:Mr|Mrs|Ms|Dr|Prof|Jr|Sr|vs|etc)\.$/i.test(prefix)||/\b(?:[A-Z]\.)+$/.test(prefix))continue;
          if(prefix.trim().split(/\s+/).length>=10){cut=match.index+1;break;}
        }
        const words=[...text.matchAll(/\S+\s+/g)];
        if(!cut&&this.flush&&words.length>=10)cut=words[Math.min(words.length,18)-1].index+words[Math.min(words.length,18)-1][0].length;
        if(words.length>=18){const limit=words[17].index+words[17][0].length;if(!cut||cut>limit)cut=limit;}
        if(cut>180)cut=text.lastIndexOf(' ',180);
        if(!cut&&text.length>180){cut=text.lastIndexOf(' ',180);if(cut<1)cut=180;}
        if(!cut&&this.closed)cut=text.length;
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
    if(!this.ready)throw new Error('Load the browser voice first.');
    if(signal?.aborted)throw aborted();
    this.stop();const epoch=this.epoch,iterator=stream[Symbol.asyncIterator]();let number=0;
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
})(globalThis);
