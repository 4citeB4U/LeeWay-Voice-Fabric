import {voiceRegistry} from './voice-registry.js';
const token=new URLSearchParams(location.hash.slice(1)).get('token')||'';
const voice=new globalThis.LeeWayBrowserVoice();
let activeStream=null,activeStreamId=null,selectedVoiceId='agent-lee-voice-one';
const reply=(source,origin,id,ok,data,error)=>source.postMessage({token,replyTo:id,ok,data,error},origin);
const event=(source,origin,type,data)=>source.postMessage({token,type,data},origin);
const requireStream=id=>{if(!activeStream||activeStreamId!==id)throw new Error('Unknown voice stream.');return activeStream;};
async function applyVoicePackage(id,{ensureEngine=false}={}){
  const pkg=await voiceRegistry.get(id);if(!pkg)throw new Error('Voice package not found.');
  if(ensureEngine&&!voice.ready)await voice.load(()=>{});
  if(voice.ready){const blob=await voiceRegistry.audio(pkg.id);if(!blob)throw new Error('Voice reference unavailable.');await voice.setReference(blob);}
  voice.exaggeration=Number(pkg.exaggeration);voice.setPace(pkg.pace);selectedVoiceId=pkg.id;return pkg;
}
addEventListener('message',async e=>{
  const m=e.data||{};if(m.scope!=='leeway.voice.v1'||m.token!==token||!m.id)return;
  try{
    switch(m.command){
      case 'ping': reply(e.source,e.origin,m.id,true,{version:'2.0.0',selectedVoiceId});break;
      case 'listVoices': reply(e.source,e.origin,m.id,true,{voices:await voiceRegistry.list(),selectedVoiceId});break;
      case 'getVoice': reply(e.source,e.origin,m.id,true,{voice:await voiceRegistry.get(String(m.data?.voicePackageId||''))});break;
      case 'selectVoice':{
        const pkg=await applyVoicePackage(String(m.data?.voicePackageId||''),{ensureEngine:false});
        reply(e.source,e.origin,m.id,true,{selectedVoiceId:pkg.id,voice:pkg});break;
      }
      case 'prepare':{
        await voice.load(p=>event(e.source,e.origin,'voice.state',p));
        const pkg=await applyVoicePackage(selectedVoiceId,{ensureEngine:false});
        const blob=await voiceRegistry.audio(pkg.id);if(!blob)throw new Error('Voice reference unavailable.');await voice.setReference(blob);
        reply(e.source,e.origin,m.id,true,{ready:true,device:voice.device,selectedVoiceId:pkg.id,voice:pkg});break;
      }
      case 'configure':
        if(Number.isFinite(Number(m.data?.pace)))voice.setPace(Number(m.data.pace));
        if(Number.isFinite(Number(m.data?.exaggeration)))voice.exaggeration=Math.max(0,Math.min(1,Number(m.data.exaggeration)));
        reply(e.source,e.origin,m.id,true,{pace:voice.playbackRate,exaggeration:voice.exaggeration,selectedVoiceId});break;
      case 'setReference':{
        const bytes=m.data?.audio;if(!(bytes instanceof ArrayBuffer))throw new Error('Reference audio ArrayBuffer required.');
        await voice.setReference(new Blob([bytes],{type:m.data.type||'audio/wav'}));
        reply(e.source,e.origin,m.id,true,{name:m.data.name||'custom-reference'});break;
      }
      case 'speak':
        await voice.speak(String(m.data?.text||''),{onState:s=>event(e.source,e.origin,'voice.state',{message:s,selectedVoiceId})});
        reply(e.source,e.origin,m.id,true,{completed:true,selectedVoiceId});break;
      case 'streamStart':
        voice.stop();activeStreamId=String(m.data?.streamId||'');if(!activeStreamId)throw new Error('streamId required.');
        activeStream=new globalThis.LeeWaySpeechStream();
        activeStream.task=voice.speakStream(activeStream,{onState:s=>event(e.source,e.origin,'voice.state',{message:s,selectedVoiceId}),onRendered:text=>event(e.source,e.origin,'voice.rendered',{streamId:activeStreamId,text,selectedVoiceId})})
          .catch(error=>event(e.source,e.origin,'voice.error',{message:error.message,selectedVoiceId}));
        reply(e.source,e.origin,m.id,true,{streamId:activeStreamId,selectedVoiceId});break;
      case 'streamChunk':
        requireStream(String(m.data?.streamId)).push(String(m.data?.text||''));reply(e.source,e.origin,m.id,true,{accepted:true});break;
      case 'streamEnd':{
        const stream=requireStream(String(m.data?.streamId));stream.end();await stream.task;activeStream=null;activeStreamId=null;
        reply(e.source,e.origin,m.id,true,{completed:true,selectedVoiceId});break;
      }
      case 'stop':
        voice.stop();activeStream?.fail(new DOMException('Speech was stopped.','AbortError'));activeStream=null;activeStreamId=null;
        reply(e.source,e.origin,m.id,true,{stopped:true,selectedVoiceId});break;
      case 'metrics':
        reply(e.source,e.origin,m.id,true,{events:globalThis.LeeWayVoiceMetrics?.snapshot?.()||[],selectedVoiceId});break;
      case 'dispose':
        await voice.dispose();activeStream=null;activeStreamId=null;reply(e.source,e.origin,m.id,true,{disposed:true});break;
      default: throw new Error('Unknown Voice Fabric command.');
    }
  }catch(error){reply(e.source,e.origin,m.id,false,null,error.message||String(error));}
});
parent.postMessage({token,type:'voice.ready',data:{version:'2.0.0'}},'*');