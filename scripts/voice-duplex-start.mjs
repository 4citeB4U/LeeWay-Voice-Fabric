/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.DUPLEX.LOCAL_START
TAG: EXISTING_STUDIO_AND_STANDALONE_APP
WHO: LeeWay Industries; WHAT: launch reproducible local voice UI
WHY: avoid forgotten manual server steps and provide separate browser app
WHERE: scripts/voice-duplex-start.mjs; WHEN: 2026-10-24
HOW: loopback-only static source + pinned Edge RTC Vite when absent
AUTHORITY: explicit operator startup, no mic, device execution, or consent bypass.
LICENSE: existing LeeWay Voice Fabric repository terms.
*/
import {createServer} from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const edge=path.join(root,'work/edge-rtc-publish');
const studioUrl='http://127.0.0.1:8897/studio.html';
const duplexUrl='http://127.0.0.1:5173/LeeWay-Edge-RTC/conversation-gate.html';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
 '.json':'application/json','.wasm':'application/wasm','.wav':'audio/wav',
 '.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg'};
const alive=async url=>{try{const r=await fetch(url,{signal:AbortSignal.timeout(1500)});return r.ok}
 catch{return false}};
async function staticServer(){
 const canonical=await realpath(root);
 const server=createServer(async(req,res)=>{
  try {
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
   const parsed=new URL(req.url,'http://127.0.0.1');
   const target=path.resolve(root,'.'+decodeURIComponent(parsed.pathname));
   const relative=path.relative(canonical,await realpath(target));
   if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('PATH_NOT_ALLOWED');
   const s=await stat(target);
   if(!s.isFile())throw Error('NOT_A_FILE');
   const bytes=await readFile(target);
   res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream',
     'cache-control':'no-store','x-content-type-options':'nosniff'});
   res.end(req.method==='HEAD'?null:bytes);
  }catch{res.writeHead(404,{'content-type':'text/plain'});res.end('Not found')}
 });
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(8897,'127.0.0.1',resolve);
 });
 return server;
}
const children=[];
let server;
if(!await alive(studioUrl)){server=await staticServer();console.log('LEEWAY_VOICE_SOURCE_READY',studioUrl)}
else console.log('LEEWAY_VOICE_SOURCE_ALREADY_RUNNING',studioUrl);
if(!await alive(duplexUrl)){
 const vite=path.join(edge,'node_modules/vite/bin/vite.js');
 if(!await stat(vite).then(s=>s.isFile(),()=>false))
   throw Error('EDGE_RTC_DEPENDENCIES_MISSING: run node scripts/voice-duplex-restore.mjs restore-install');
 const child=spawn(process.execPath,[vite,'--port','5173','--host','127.0.0.1'],{
  cwd:edge,shell:false,stdio:'inherit',env:{...process.env,
   LEEWAY_ENABLE_DICTATION_FIXTURE:'1',LEEWAY_ENABLE_CONVERSATION_FIXTURE:'1',
   LEEWAY_VOICE_FABRIC_DEV_ORIGIN:'http://127.0.0.1:8897'}});
 children.push(child);
}
let duplexReady=false;
for(let tries=0;tries<30;tries++){
 if(await alive(duplexUrl)){duplexReady=true;break}
 await new Promise(resolve=>setTimeout(resolve,300));
}
console.log(JSON.stringify({studio:studioUrl,standalone:duplexUrl,duplexReady,
 providerStatus:'CHECK_SEPARATELY',physicalAcoustics:'NOT_VERIFIED'}));
if(!duplexReady)process.exitCode=2;
if(server||children.length){
 const close=()=>{for(const c of children)c.kill();server?.close()};
 process.once('SIGINT',close);process.once('SIGTERM',close);
}
