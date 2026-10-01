import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {KokoroTTS} from 'kokoro-js';
import {env,StyleTextToSpeech2Model,AutoTokenizer} from '@huggingface/transformers';
import {Worker,isMainThread,parentPort} from 'node:worker_threads';

const here=path.dirname(fileURLToPath(import.meta.url));
const modelDir=path.join(here,'models','kokoro');
const previewDir=path.resolve(here,'../../voices/kokoro-previews');
const port=Number(process.env.LEEWAY_KOKORO_PORT||8878);
const voices=["af_alloy","af_aoede","af_bella","af_heart","af_jessica","af_kore","af_nicole","af_nova","af_river","af_sarah","af_sky","am_adam","am_echo","am_eric","am_fenrir","am_liam","am_michael","am_onyx","am_puck","am_santa","bf_alice","bf_emma","bf_isabella","bf_lily","bm_daniel","bm_fable","bm_george","bm_lewis"];
const modelHash='fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478';
env.allowRemoteModels=false;
env.cacheDir=path.join(here,'models','cache');
let tts,state='loading',message='Loading the local 92 MB Kokoro model.',busy=false;
const json=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
function wav(audio){const out=Buffer.alloc(44+audio.length*2);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(24000,24);out.writeUInt32LE(48000,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(audio.length*2,40);for(let i=0;i<audio.length;i++){const x=Math.max(-1,Math.min(1,Number.isFinite(audio[i])?audio[i]:0));out.writeInt16LE(Math.round(x*(x<0?32768:32767)),44+i*2);}return out;}
function chunks(text){const parts=[];let part='';for(const word of text.trim().split(/\s+/)){if(part.length+word.length>300){parts.push(part);part='';}part+=(part?' ':'')+word;if(/[.!?]$/.test(word)&&part.length>60){parts.push(part);part='';}}if(part)parts.push(part);return parts;}
async function generateSamples(text,voice){const started=performance.now(),segments=[];for(const segment of chunks(text)){const result=await tts.generate(segment,{voice,speed:1});segments.push(result.audio);}const total=segments.reduce((n,a)=>n+a.length,0)+Math.max(0,segments.length-1)*1920;if(total>24000*120)throw new Error('Generated take is too long');const audio=new Float32Array(total);let offset=0;for(const part of segments){audio.set(part,offset);offset+=part.length+1920;}return {wav:wav(audio),metrics:{generationMs:performance.now()-started,audioSeconds:audio.length/24000}};}
if(isMainThread)http.createServer(async(req,res)=>{
 try{
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)||req.headers.origin){return json(res,403,{error:'Local server-to-server access only.'});}
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/status')return json(res,200,{ready:state==='ready',state,message,busy,voices});
  if(req.method==='GET'&&url.pathname.startsWith('/preview/')){const id=url.pathname.split('/').pop();if(!voices.includes(id))return json(res,404,{error:'Unknown voice'});try{const bytes=await fs.readFile(path.join(previewDir,id+'.wav'));res.writeHead(200,{'Content-Type':'audio/wav','Content-Length':bytes.length});return res.end(bytes);}catch{return json(res,404,{error:'Preview not generated yet'});}}
  if(req.method!=='POST'||url.pathname!=='/synthesize')return json(res,404,{error:'Unknown endpoint'});
  if(state!=='ready')return json(res,503,{error:message});if(busy)return json(res,429,{error:'A local audition is already running. Try again when it finishes.'});
  if(req.headers['content-type']!=='application/json')return json(res,415,{error:'JSON required'});
  let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>16000)return json(res,413,{error:'Request too large'});body+=chunk;}
  let data;try{data=JSON.parse(body);}catch{return json(res,400,{error:'Invalid JSON'});}
  if(!data||!voices.includes(data.voiceId)||typeof data.text!=='string'||!data.text.trim()||data.text.length>1500)return json(res,400,{error:'Select a supported voice and 1–1500 characters.'});
  if(busy)return json(res,429,{error:'A local audition is already running. Try again when it finishes.'});
  busy=true;try{const result=await synthesize(data.text,data.voiceId);return json(res,200,{audioContent:result.wav.toString('base64'),sampleRate:24000,format:'wav',engine:'kokoro-82m-q8-cpu',metrics:result.metrics});}finally{busy=false;}
 }catch(error){json(res,500,{error:'Local synthesis failed. Inspect the adapter log.'});console.error(error.message);}
}).listen(port,'127.0.0.1',()=>console.log(`Local Kokoro adapter: http://127.0.0.1:${port}`));

let engine,sequence=0;const pending=new Map();
function synthesize(text,voice){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);state='failed';message='Local engine timed out. Restart the adapter.';engine.terminate();reject(new Error(message));},180000);pending.set(id,{resolve,reject,timer});engine.postMessage({id,text,voice});});}
async function buildPreviews(){
 busy=true;await fs.mkdir(previewDir,{recursive:true});const receipt=[];
 try{for(const voice of voices){const text='Good morning. Let us take a clear look at what matters, make a thoughtful decision, and move forward with confidence.';const result=await synthesize(text,voice);await fs.writeFile(path.join(previewDir,voice+'.wav'),result.wav);receipt.push({voiceId:voice,text,modelHash,audioHash:createHash('sha256').update(result.wav).digest('hex'),...result.metrics});console.log(JSON.stringify(receipt.at(-1)));}await fs.writeFile(path.join(previewDir,'generation.json'),JSON.stringify(receipt,null,2));}finally{busy=false;}
}
if(isMainThread){
 engine=new Worker(fileURLToPath(import.meta.url));
 engine.on('message',data=>{
  if(data.ready){state='ready';message='28 local Kokoro voices ready.';console.log(message);if(process.env.LEEWAY_BUILD_PREVIEWS==='1')buildPreviews().catch(console.error);return;}
  if(data.failed){state='failed';message='Local model could not load. Check the adapter log.';console.error(data.error);return;}
  const job=pending.get(data.id);if(!job)return;pending.delete(data.id);clearTimeout(job.timer);data.error?job.reject(new Error(data.error)):job.resolve({wav:Buffer.from(data.wav),metrics:data.metrics});
 });
 engine.on('error',error=>{state='failed';message='Local voice worker stopped. Restart the adapter.';console.error(error);for(const job of pending.values()){clearTimeout(job.timer);job.reject(new Error(message));}pending.clear();});
 engine.on('exit',()=>{state='failed';message='Local voice worker exited. Restart the adapter.';for(const job of pending.values()){clearTimeout(job.timer);job.reject(new Error(message));}pending.clear();});
}else{
 try{
  const hash=createHash('sha256').update(await fs.readFile(path.join(modelDir,'onnx/model_quantized.onnx'))).digest('hex');if(hash!==modelHash)throw new Error('Pinned model hash mismatch');
  const id=modelDir.replaceAll('\\','/')+'/';
  const [model,tokenizer]=await Promise.all([StyleTextToSpeech2Model.from_pretrained(id,{dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:4,interOpNumThreads:1}}),AutoTokenizer.from_pretrained(id)]);
  tts=new KokoroTTS(model,tokenizer);parentPort.postMessage({ready:true});
  parentPort.on('message',async({id,text,voice})=>{try{const result=await generateSamples(text,voice);parentPort.postMessage({id,...result});}catch(error){parentPort.postMessage({id,error:error.message});}});
 }catch(error){parentPort.postMessage({failed:true,error:error.message});}
}
