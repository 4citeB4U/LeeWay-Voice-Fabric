/*
Real-browser gate for the device-aware voice path. Serves this checkout over
http://127.0.0.1, loads the real bridge in Chromium, and measures:
  1. probeDevice reports an honest profile and a provider plan
  2. selfTest prepares the real Kokoro model and synthesises non-silent audio
  3. speak() completes through the chosen provider
  4. with the Kokoro model host blocked, the bridge fails over visibly
     (or reports a clear error when the device has no other voice)
Needs network access to cdn.jsdelivr.net and huggingface.co on the first run.
*/
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.wav':'audio/wav','.css':'text/css'};
const server=http.createServer(async(req,res)=>{
  try{
    const file=path.join(root,decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/^\/+/,'')||'index.html');
    if(!file.startsWith(root))throw new Error('outside root');
    const body=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const failures=[];
const must=(ok,message,detail)=>{if(!ok){failures.push(message);console.error('FAIL',message,detail===undefined?'':JSON.stringify(detail));}else console.log('PASS',message);};
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});

async function session(context,work){
  const page=await context.newPage();
  page.on('pageerror',e=>console.error('pageerror',e.message));
  await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
  return page.evaluate(work,origin);
}
const clientSource=`
  const {LeeWayVoiceClient}=await import(origin+'/src/voice-sdk.js');
  const client=new LeeWayVoiceClient({origin,timeoutMs:900000});
  await client.connect();
  const events=[];for(const t of ['voice.fallback','voice.error'])client.on?.(t,d=>events.push([t,d]));
`;
try{
  const context=await browser.newContext();
  const first=await session(context,new Function('origin',`return (async()=>{${clientSource}
    const profile=await client.probeDevice();
    const test=await client.selfTest({});
    const status=await client.status();
    let spoke=null,speakError=null;try{spoke=await client.speak('Voice check. One, two, three.');}catch(e){speakError=e.message;}
    client.destroy();return {profile,test,status,spoke,speakError};})()`));
  console.log('PROFILE tier=%s can=%s',first.profile.profile.tier,JSON.stringify(first.profile.profile.can));
  console.log('PLAN',JSON.stringify(first.profile.plan.providers));
  console.log('SELFTEST',JSON.stringify(first.test.steps.map(s=>({check:s.check,ok:s.ok,provider:s.provider,device:s.device,peak:s.peak,error:s.error}))));
  must(first.profile.profile.schema==='leeway.voice.device-profile/v1','device profile schema is reported');
  must(first.profile.plan.providers.some(p=>p.provider==='kokoro'),'plan includes the Kokoro engine on this device');
  must(first.test.ok===true,'self-test passes every check',first.test.steps.filter(s=>!s.ok));
  must(first.test.provider==='kokoro'&&first.test.fallback===null,'self-test ran on Kokoro with no fallback',first.test.fallback);
  const synth=first.test.steps.find(s=>s.check==='synthesis');
  must(synth?.ok&&synth.peak>0.01&&synth.seconds>0.3,'Kokoro synthesised measurable, non-silent audio',synth);
  must(first.spoke?.completed===true&&first.spoke.provider==='kokoro',`speak() completed on Kokoro`,first.speakError);
  must(first.status.provider==='kokoro'&&first.status.ready===true&&first.status.lastError===null,'status reports a ready Kokoro engine');
  await context.close();

  // Block the model sources: the bridge must fail over or fail loudly, never hang or stay silent.
  const blocked=await browser.newContext();
  await blocked.route(/(huggingface\.co|jsdelivr\.net)/,route=>route.abort());
  const second=await session(blocked,new Function('origin',`return (async()=>{${clientSource}
    const profile=await client.probeDevice();let result=null,error=null;
    try{result=await client.prepare();}catch(e){error=e.message;}
    const status=await client.status();client.destroy();return {profile,result,error,status};})()`));
  const hasDeviceVoice=second.profile.plan.providers.some(p=>p.provider==='device-speech');
  if(hasDeviceVoice){
    must(second.result?.provider==='device-speech'&&second.result.fallback?.reason?.includes('kokoro'),'blocked Kokoro fails over visibly to the device voice',second);
  }else{
    must(second.error&&/kokoro/i.test(second.error),'blocked Kokoro with no device voice reports a clear error naming Kokoro',second);
    must(second.status.lastError?.message,'status exposes the last error');
  }
  await blocked.close();
}catch(error){must(false,'browser gate ran to completion',error.message);}
finally{await browser.close();server.close();}
if(failures.length){console.error(`\n${failures.length} check(s) failed`);process.exit(1);}
console.log('\nDevice-aware voice browser gate passed.');
