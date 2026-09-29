import {chromium} from 'playwright';

const BASE=process.env.VOICE_FABRIC_URL||'https://4citeb4u.github.io/LeeWay-Voice-Fabric/';
const browser=await chromium.launch({headless:true,acceptDownloads:true});
const context=await browser.newContext({acceptDownloads:true});
const page=await context.newPage();
const failures=[];
const must=(ok,msg)=>{if(!ok){failures.push(msg);console.error('FAIL',msg)}else console.log('PASS',msg)};

function wavBuffer(){
  const sampleRate=8000,duration=.15,samples=Math.floor(sampleRate*duration),dataSize=samples*2;
  const b=Buffer.alloc(44+dataSize);
  b.write('RIFF',0);b.writeUInt32LE(36+dataSize,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sampleRate,24);b.writeUInt32LE(sampleRate*2,28);
  b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(dataSize,40);
  for(let i=0;i<samples;i++)b.writeInt16LE(0,44+i*2);
  return b;
}

const id='p13-local-voice-'+Date.now();
const name='P1.3 Local Voice';
try{
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#saveVoice',{timeout:30000});
  await page.fill('#newId',id);
  await page.fill('#newName',name);
  await page.fill('#newOwner','P1.3 Browser Gate');
  await page.setInputFiles('#newReference',{name:'reference.wav',mimeType:'audio/wav',buffer:wavBuffer()});
  await page.click('#saveVoice');
  await page.waitForFunction(expected=>document.querySelector('#selectedTitle')?.textContent===expected,name,{timeout:15000});
  must((await page.locator('#selectedTitle').textContent())===name,'UI saves and selects local voice package');

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('.voice-item',{timeout:30000});
  await page.waitForSelector('.voice-item',{timeout:30000});
  const labels=await page.locator('.voice-item').allTextContents();
  must(labels.some(x=>x.includes(name)&&x.includes(id)),'Reload rediscovers saved local package');

  await page.locator('.voice-item',{hasText:name}).click();
  await page.waitForFunction(expected=>document.querySelector('#selectedTitle')?.textContent===expected,name,{timeout:10000});
  must((await page.locator('#selectedTitle').textContent())===name,'Reloaded package is selectable');

  const downloads=[];
  page.on('download',d=>downloads.push(d.suggestedFilename()));
  await page.click('#exportVoice');
  await page.waitForTimeout(1000);
  must(downloads.some(x=>x.includes(id)&&x.endsWith('.voice-package.json')),'Export emits metadata package');
  must(downloads.some(x=>x.includes(id)&&x.includes('reference')),'Export emits reference audio');

  // Re-enter the production UI after browser download handling and prove persistence survived export.
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('.voice-item',{timeout:30000});
  let postExportLabels=await page.locator('.voice-item').allTextContents();
  must(postExportLabels.some(x=>x.includes(name)&&x.includes(id)),'Export preserves saved package across re-entry');

  await page.locator('.voice-item',{hasText:name}).click();
  await page.waitForFunction(expected=>document.querySelector('#selectedTitle')?.textContent===expected,name,{timeout:10000});
  must((await page.locator('#deleteVoice').count())===1,'Delete control is present for local package management');

  await page.locator('#deleteVoice').evaluate(el=>el.click());
  await page.waitForFunction(expected=>![...document.querySelectorAll('.voice-item')].some(el=>el.textContent.includes(expected)),id,{timeout:10000});
  must(!(await page.locator('.voice-item').allTextContents()).some(x=>x.includes(id)),'Delete removes local package');

  if(failures.length)process.exitCode=1;
  else console.log('VOICE_P13_LOCAL_PACKAGE_LIFECYCLE=PASS');
}finally{
  await browser.close();
}
