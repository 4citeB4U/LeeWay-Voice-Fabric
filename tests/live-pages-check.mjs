const BASE=process.env.VOICE_FABRIC_URL||'https://4citeb4u.github.io/LeeWay-Voice-Fabric';
const checks=[
  ['/', ['LeeWay Voice Fabric','Voice packages','Create voice package','Prepare selected voice','Simulate streamed answer']],
  ['/src/voice-sdk.js', ['listVoices()','selectVoice(voicePackageId)','streamStart']],
  ['/src/voice-registry.js', ['LeeWayVoiceRegistry','indexedDB','BUILTIN_VOICE_PACKAGES']],
  ['/voices/catalog.v1.json', ['agent-lee-voice-one','chatterbox-default-natural','DEFAULT_FOR_NEW_AGENT_OR_WORKER']]
];
let failed=false;
for(const [path,needles] of checks){
  const url=BASE.replace(/\/$/,'')+path;
  const response=await fetch(url,{redirect:'error',cache:'no-store'});
  const text=await response.text();
  console.log(JSON.stringify({url,status:response.status,bytes:text.length}));
  if(!response.ok){console.error('HTTP_FAIL',url,response.status);failed=true;continue;}
  for(const needle of needles){
    if(!text.includes(needle)){console.error('CONTENT_FAIL',url,needle);failed=true;}
    else console.log('CONTENT_PASS',url,needle);
  }
}
if(failed)process.exit(1);
console.log('LIVE_PAGES_CONTENT=PASS');
