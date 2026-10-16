/*
LEEWAY HEADER
REGION: VOICE.FABRIC.DEVICE_SPEECH
TAG: VOICE.FABRIC.DEVICE.SPEECH
The device's own speech voices through the Web Speech API. This is the last
resort that makes speech work on nearly any browser or phone with no download.
It is always reported as "device-speech", never as a LeeWay voice package, so a
caller can tell which voice actually spoke.
*/
(function(root){
  'use strict';
  function aborted(){return new DOMException('Speech was stopped.','AbortError');}
  const BENIGN=new Set(['canceled','interrupted']);

  class LeeWayDeviceSpeechVoice{
    constructor(options={}){
      this.options=options;this.provider='device-speech';this.ready=false;this.device='system';
      this.epoch=0;this.exaggeration=.25;this.playbackRate=1;this.activeStream=null;this.voice=null;this.current=null;
    }
    get synth(){return this.options.speechSynthesis||root.speechSynthesis;}
    voices(){return this.synth?.getVoices?.()||[];}
    pickVoice(){
      const list=this.voices();
      const english=list.filter(v=>/^en([-_]|$)/i.test(String(v.lang||'')));
      const pool=english.length?english:list;
      return pool.find(v=>/^en[-_]US$/i.test(v.lang)&&v.localService)||pool.find(v=>v.localService)||pool[0]||null;
    }
    async load(onProgress=()=>{}){
      const synth=this.synth;
      if(!synth||typeof synth.speak!=='function')throw new Error('This device exposes no speech synthesis.');
      let voice=this.pickVoice();
      if(!voice&&typeof synth.addEventListener==='function'){
        await new Promise(resolve=>{const done=()=>resolve();synth.addEventListener('voiceschanged',done,{once:true});setTimeout(done,1500);});
        voice=this.pickVoice();
      }
      if(!voice)throw new Error('This device has no installed speech voices.');
      this.voice=voice;this.ready=true;
      onProgress({status:'ready',device:this.device,voice:{name:voice.name,lang:voice.lang,localService:!!voice.localService}});
      return {device:this.device,voice:{name:voice.name,lang:voice.lang}};
    }
    async setReference(){/* Device voices are not cloneable. */}
    setPace(value){this.playbackRate=Math.max(.6,Math.min(1.6,Number(value)||1));}
    utter(text,epoch){
      return new Promise((resolve,reject)=>{
        const Utterance=this.options.Utterance||root.SpeechSynthesisUtterance;
        const u=new Utterance(text);u.voice=this.voice;if(this.voice?.lang)u.lang=this.voice.lang;u.rate=this.playbackRate;
        this.current=u;
        u.onend=()=>{if(epoch!==this.epoch)reject(aborted());else resolve();};
        u.onerror=e=>{if(epoch!==this.epoch||BENIGN.has(e?.error))reject(aborted());else reject(new Error(`Device speech failed: ${e?.error||'unknown'}`));};
        this.synth.speak(u);
      });
    }
    async speakStream(stream,{signal,onState=()=>{},onRendered=()=>{}}={}){
      if(!this.ready)throw new Error('Load the device voice first.');
      if(signal?.aborted)throw aborted();
      this.stop();const epoch=this.epoch;this.activeStream=stream;
      const stop=()=>{stream.fail(aborted());if(epoch===this.epoch)this.stop();};
      signal?.addEventListener('abort',stop,{once:true});
      try{
        const iterator=stream[Symbol.asyncIterator]();let number=0;
        for(;;){
          const item=await iterator.next();if(epoch!==this.epoch)throw aborted();
          if(item.done)break;
          if(++number>60)throw new Error('This reply is too long for one spoken turn.');
          onState('Speaking with the device voice.');
          await this.utter(item.value,epoch);onRendered(item.value);
        }
        onState('Ready.');
      }catch(error){stream.fail(error);if(epoch===this.epoch)this.stop();throw error;}
      finally{signal?.removeEventListener('abort',stop);stream.dispose?.();if(this.activeStream===stream)this.activeStream=null;}
    }
    async speak(text,{signal,onState=()=>{}}={}){
      const Stream=root.LeeWaySpeechStream;
      if(!Stream){
        if(!this.ready)throw new Error('Load the device voice first.');
        this.stop();const epoch=this.epoch;onState('Speaking with the device voice.');
        await this.utter(String(text),epoch);onState('Ready.');return;
      }
      const stream=new Stream(signal);stream.push(String(text));stream.end();
      try{return await this.speakStream(stream,{signal,onState});}finally{stream.dispose?.();}
    }
    stop(){
      ++this.epoch;this.activeStream?.fail(aborted());this.activeStream=null;
      try{this.synth?.cancel?.();}catch{}
      this.current=null;
    }
    cancelLoad(){return this.dispose();}
    async dispose(){this.stop();this.ready=false;this.voice=null;}
  }
  root.LeeWayDeviceSpeechVoice=LeeWayDeviceSpeechVoice;
})(globalThis);
