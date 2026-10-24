/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.STUDIO.SINGLE_RESPONSE.BROWSER_TEST
TAG: ONE_EXISTING_RESPONSE_FIELD_WITH_REAL_STUDIO_EVIDENCE
WHO: LeeWay Industries; WHAT: prove embedded test shares Studio response;
WHY: no duplicate response panels and source-validated telemetry;
WHERE: isolated browser against local running Studio; WHEN: 2026-10-24.
HOW: synthetic parent messaging only, no microphone or synthesis invoked.
AUTHORITY: UI integration test only. LICENSE: existing repository terms.
*/
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1520,height:1000},reducedMotion:'reduce'});
 page.setDefaultTimeout(12000);
 await page.goto('http://127.0.0.1:8877/studio.html',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#voiceList .voice-card',{timeout:12000});
 await page.locator('#voiceList .voice-card').filter({hasText:'kokoro-bm_lewis'}).first().click();
 const original=await page.locator('#speechText').inputValue();
 await page.locator('#duplexInlineLoad').click();
 await page.waitForFunction(()=>document.body.classList.contains('leeway-duplex-open'));
 const framed=page.frameLocator('#duplexInlineFrame');
 await framed.locator('#start').waitFor({timeout:12000});
 assert.equal(await framed.locator('#response').isVisible(),false,'duplicate child response hidden');
 assert.equal(await framed.locator('#machine-result').isVisible(),false,'duplicate machine result hidden');
 assert.equal(await framed.locator('#llm-result').isVisible(),false,'duplicate model result hidden');
 assert.equal(await framed.locator('#evidence').isVisible(),false,'duplicate child evidence hidden');
 assert.equal(await framed.locator('#transcript').isVisible(),true,'You said remains in conversation');
 assert.equal(await page.locator('#speechText').isVisible(),true,'original Studio text field stays visible');
 assert.equal(await page.locator('#webglCanvas').isVisible(),true,'sphere stays visible');
 await framed.locator('body').evaluate(()=>{
  window.parent.postMessage({
   channel:'LEEWAY_DUPLEX_STUDIO_OUTPUT_V1',kind:'response',
   text:'Agent Lee speaking through the single Studio response field.'
  },new URL(document.referrer).origin);
  window.parent.postMessage({
   channel:'LEEWAY_DUPLEX_STUDIO_OUTPUT_V1',kind:'evidence',
   text:'GOVERNED VOICE PLAYOUT · SIMULATED TEST EVIDENCE'
  },new URL(document.referrer).origin);
 });
 await page.waitForFunction(()=>document.getElementById('speechText')?.value.includes('single Studio response'));
 await page.waitForFunction(()=>document.querySelector('#studioEvents')?.textContent.includes('SIMULATED TEST EVIDENCE'));
 const evidence=page.locator('#studioStage .audition-panel .evidence-panel');
 assert.equal(await evidence.count(),1,'reused original evidence panel in active Studio');
 assert.equal(await evidence.isVisible(),true,'existing evidence visible');
 assert.equal(await evidence.evaluate(el=>el.open),true,'Studio evidence expanded during conversation');
 assert.match(await page.locator('#studioEvents').textContent(),/SIMULATED TEST EVIDENCE/);
 await page.locator('#duplexInlineClose').click();
 await page.waitForFunction(()=>!document.body.classList.contains('leeway-duplex-open'));
 assert.equal(await page.locator('#speechText').inputValue(),original,'prior authored audition restored');
 assert.equal(await page.locator('.channel-rack .evidence-panel').count(),1,'evidence returned to original location');
 console.log(JSON.stringify({result:'PASS',singleResponse:true,existingSphere:true,
  existingEvidence:true,restoredAudition:true,duplicateChildPanelsHidden:true}));
}finally{await browser.close()}
