/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.STUDIO.DUPLEX.SPHERE.REGRESSION
TAG: SPEAKING_STATE_PERSISTS_ACROSS_MIC_LEVEL
WHO: LeeWay Industries; WHAT: browser-check voice state entering original sphere
WHY: Kokoro playout should visibly animate the original orb, not remain idle
WHERE: Voice Fabric browser test; WHEN: 2026-10-24
HOW: synthetic telemetry, real Studio DOM + renderer, no microphone or model.
AUTHORITY: visual test only; LICENSE: existing terms.
*/
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000},reducedMotion:'no-preference'});
 page.setDefaultTimeout(11000);
 await page.goto('http://127.0.0.1:8877/studio.html',{waitUntil:'domcontentloaded',timeout:11000});
 await page.waitForFunction(()=>document.querySelector('#enginePhase')?.dataset.phase,{timeout:11000});
 const begin=await page.locator('#enginePhase').getAttribute('data-phase');
 await page.evaluate(()=>{
  document.dispatchEvent(new CustomEvent('leeway:duplex-activity',{detail:{
   active:true,phase:'speaking',kind:'playout',inputRms:0
  }}));
 });
 await page.waitForFunction(()=>document.querySelector('#enginePhase')?.dataset.phase==='speaking',{timeout:5000});
 await page.evaluate(()=>{
  document.dispatchEvent(new CustomEvent('leeway:duplex-activity',{detail:{
   active:true,phase:'listening',kind:'mic-level',inputRms:0.16
  }}));
 });
 await page.waitForTimeout(500);
 const during=await page.locator('#enginePhase').getAttribute('data-phase');
 const mic=await page.locator('#micLevel').textContent();
 assert.equal(during,'speaking','mic-level must not overwrite Kokoro playout');
 assert.match(mic,/dBFS/);
 await page.evaluate(()=>{
  document.dispatchEvent(new CustomEvent('leeway:duplex-activity',{detail:{
   active:true,phase:'listening',kind:'playout',inputRms:0
  }}));
 });
 await page.waitForFunction(()=>document.querySelector('#enginePhase')?.dataset.phase==='streaming',{timeout:5000});
 const after=await page.locator('#enginePhase').getAttribute('data-phase');
 console.log(JSON.stringify({result:'PASS',begin,during,after,micLevel:mic,
  graphicsMode:await page.locator('#rendererState').textContent()}));
}finally{await browser.close()}
