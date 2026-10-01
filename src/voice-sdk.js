const DEFAULT_ORIGIN='https://4citeb4u.github.io/LeeWay-Voice-Fabric';
const randomToken=()=>crypto.getRandomValues(new Uint32Array(4)).join('-');

export class LeeWayVoiceClient {
  constructor({origin=DEFAULT_ORIGIN,timeoutMs=120000,prepareInactivityMs=15*60_000}={}){
    this.origin=origin.replace(/\/$/,'');this.timeoutMs=timeoutMs;this.token=randomToken();
    this.prepareInactivityMs=prepareInactivityMs;this._connectionTimer=null;this._rejectConnection=null;
    this.destroyed=false;this.seq=0;this.pending=new Map();this.listeners=new Map();this.frame=null;this.ready=null;
  }
  on(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);return()=>this.listeners.get(type)?.delete(fn);}
  emit(type,data){for(const fn of this.listeners.get(type)||[])try{fn(data)}catch{}}
  connect(){
    if(this.destroyed)return Promise.reject(new Error('Voice client destroyed.'));
    if(this.ready)return this.ready;
    this.ready=new Promise((resolve,reject)=>{
      const frame=document.createElement('iframe');this.frame=frame;frame.hidden=true;
      frame.setAttribute('aria-hidden','true');frame.src=`${this.origin}/bridge.html#token=${encodeURIComponent(this.token)}`;
      const timer=this._connectionTimer=setTimeout(()=>reject(new Error('LeeWay Voice Fabric bridge did not become ready.')),this.timeoutMs);this._rejectConnection=reject;
      const onMessage=e=>{
        if(e.origin!==new URL(this.origin).origin||e.source!==frame.contentWindow)return;
        const m=e.data||{};if(m.token!==this.token)return;
        if(m.type==='voice.ready'){clearTimeout(timer);this._connectionTimer=null;this._rejectConnection=null;resolve(this);this.emit('ready',m);return;}
        if(m.replyTo&&this.pending.has(m.replyTo)){const p=this.pending.get(m.replyTo);this.pending.delete(m.replyTo);clearTimeout(p.timer);m.ok===false?p.reject(new Error(m.error||'Voice request failed.')):p.resolve(m.data);return;}
        // Only authenticated preparation progress can extend a pending prepare.
        // Connection, selection, speech and unrelated events retain fixed deadlines.
        const progress=m.data;
        if(m.type==='voice.state'&&progress&&typeof progress==='object'&&
          (['initiate','download','done','ready'].includes(progress.status)||
           (progress.status==='progress'&&(Number.isFinite(progress.progress)||Number.isFinite(progress.loaded))))){
          for(const p of this.pending.values())if(p.command==='prepare'){
            clearTimeout(p.timer);p.timer=setTimeout(p.expire,this.prepareInactivityMs);
          }
        }
        this.emit(m.type,m.data);
      };
      window.addEventListener('message',onMessage);this._onMessage=onMessage;document.body.appendChild(frame);
    });return this.ready;
  }
  async call(command,data={},transfer=[]){
    await this.connect();if(this.destroyed)throw new Error('Voice client destroyed.');const id=++this.seq;
    return new Promise((resolve,reject)=>{
      const expire=()=>{this.pending.delete(id);reject(new Error(command==='prepare'?'Voice preparation stopped reporting progress for 15 minutes.':'Voice request timed out.'));};
      const timer=setTimeout(expire,command==='prepare'?this.prepareInactivityMs:this.timeoutMs);
      this.pending.set(id,{resolve,reject,timer,command,expire});
      this.frame.contentWindow.postMessage({scope:'leeway.voice.v1',token:this.token,id,command,data},new URL(this.origin).origin,transfer);
    });
  }
  listVoices(){return this.call('listVoices');}
  getVoice(voicePackageId){return this.call('getVoice',{voicePackageId:String(voicePackageId)});}
  selectVoice(voicePackageId){return this.call('selectVoice',{voicePackageId:String(voicePackageId)});}
  prepare(provider){return this.call('prepare',{provider});}
  configure(options){return this.call('configure',options);}
  speak(text){return this.call('speak',{text:String(text)});}
  streamStart(streamId=crypto.randomUUID()){return this.call('streamStart',{streamId}).then(()=>streamId);}
  streamChunk(streamId,text){return this.call('streamChunk',{streamId,text:String(text)});}
  streamEnd(streamId){return this.call('streamEnd',{streamId});}
  stop(){return this.call('stop');}
  metrics(){return this.call('metrics');}
  async setReference(file){
    const buffer=await file.arrayBuffer();return this.call('setReference',{name:file.name,type:file.type,audio:buffer},[buffer]);
  }
  destroy(){this.destroyed=true;clearTimeout(this._connectionTimer);this._connectionTimer=null;this._rejectConnection?.(new Error('Voice client destroyed.'));this._rejectConnection=null;window.removeEventListener('message',this._onMessage);this.frame?.remove();this.frame=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Voice client destroyed.'));}this.pending.clear();}
}
export const createLeeWayVoice=options=>new LeeWayVoiceClient(options);
