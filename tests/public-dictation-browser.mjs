/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.FABRIC.PUBLIC.DICTATION.BROWSER.TEST
TAG: YOU_SAID_WITHOUT_LOOPBACK_BACKEND
WHO: LeeWay Industries; WHAT: browser verify transcript on public Studio
WHY: GitHub Pages must not silently load unavailable localhost iframe
WHERE: tests; WHEN: 2026-10-24
HOW: mocked browser ASR, real Studio DOM and event bridge.
AUTHORITY: fixture-only mic simulation; LICENSE: repository terms.
*/
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript',
 '.json':'application/json','.css':'text/css','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep))throw Error('unsafe');
  const content=await readFile(file);
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});
  res.end(content);
 }catch{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:[
 '--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'
]});
try{
 const page=await browser.newPage({viewport:{width:1450,height:920}});
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{
  class FakeSpeechRecognition{
   constructor(){window.__asr=this}
   start(){this.onstart?.()}
   stop(){this.onend?.()}
  }
  const module=await import('/src/studio-public-dictation.mjs');
  window.__voiceTest=module.mountPublicDictation(document,{
   hostname:'4citeb4u.github.io',Recognition:FakeSpeechRecognition
  });
 });
 assert.equal(await page.locator('#publicDictationStart').isVisible(),true);
 assert.equal(await page.locator('#duplexInlineLoad').isVisible(),false);
 await page.locator('#publicDictationStart').click();
 await page.evaluate(()=>{
  const r=[{0:{transcript:'Hello Agent Lee'},isFinal:true}];
  window.__asr.onresult?.({results:r,resultIndex:0});
 });
 await page.waitForFunction(()=>document.getElementById('publicDictationText')?.textContent==='Hello Agent Lee');
 assert.equal(await page.locator('#publicDictationText').textContent(),'Hello Agent Lee');
 assert.equal(await page.locator('#publicDictationStop').isEnabled(),true);
 await page.locator('#publicDictationStop').click();
 assert.equal(await page.locator('#publicDictationStart').isEnabled(),true);
 assert.equal(await page.locator('#duplexInlineFrame').isVisible(),false);
 console.log('PUBLIC_STUDIO_DICTATION_TRANSCRIPT_AND_STOP_PASS');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
