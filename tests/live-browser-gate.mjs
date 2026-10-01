import {chromium} from 'playwright';

const BASE=process.env.VOICE_FABRIC_URL||'https://4citeb4u.github.io/LeeWay-Voice-Fabric/';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const failures=[];
const must=(ok,msg)=>{if(!ok){failures.push(msg);console.error('FAIL',msg)}else console.log('PASS',msg)};

try{
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:120000});
  must((await page.title())==='LeeWay Voice Studio','root URL opens full studio');
  await page.waitForSelector('#voiceList button',{timeout:30000});
  const labels=await page.locator('#voiceList button').allTextContents();
  must(labels.some(x=>/Agent Lee.*Voice One/.test(x)),'Agent Lee Voice One rendered');
  must(labels.filter(x=>x.includes('Kokoro')).length===28,'all 28 Kokoro profiles rendered');
  await page.getByRole('button',{name:/^Agent Lee.*Voice One/}).click();
  await page.waitForFunction(()=>!document.querySelector('#playPause')?.disabled,null,{timeout:30000});
  must((await page.locator('#selectedTitle').textContent())?.includes('Voice One'),'UI selects Agent Lee Voice One');
  must(await page.locator('#tuningDock').isVisible(),'tuning dock is visible');
  await page.locator('#playPause').click();
  await page.waitForFunction(()=>!document.querySelector('#outputPlayer')?.paused,null,{timeout:10000});
  must(true,'Agent Lee preview starts playback');
  await page.locator('#playPause').click();

  const sdk=await page.evaluate(async base=>{
    const {LeeWayVoiceClient}=await import(base+'src/voice-sdk.js');
    const client=new LeeWayVoiceClient({origin:base.replace(/\/$/,'')});
    const list=await client.listVoices();
    const selected=await client.selectVoice('chatterbox-default-natural');
    const ping=await client.call('ping');
    client.destroy();
    return {count:list.voices?.length||0,ids:(list.voices||[]).map(v=>v.id),selected:selected.selectedVoiceId,ping};
  },BASE);

  console.log('SDK_RESULT',JSON.stringify(sdk));
  must(sdk.count>=4,'SDK lists at least four built-in packages');
  must(sdk.ids.includes('agent-lee-voice-one'),'SDK catalog includes Agent Lee Voice One');
  must(sdk.ids.includes('chatterbox-default-natural'),'SDK catalog includes Chatterbox Natural');
  must(sdk.selected==='chatterbox-default-natural','SDK selects Chatterbox Natural through bridge');
  must(sdk.ping?.version==='2.0.0','bridge reports Voice Fabric v2');

  if(failures.length)process.exitCode=1;
  else console.log('LIVE_BROWSER_CATALOG_GATE=PASS');
}finally{
  await browser.close();
}
