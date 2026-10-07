const BASE=process.env.VOICE_FABRIC_URL||'https://4citeb4u.github.io/LeeWay-Voice-Fabric';
const checks=[
  ['/', ['LeeWay Voice Fabric · Spatial Audio Studio','Voice library','tuningDock','src/studio.js','src/studio-console.js','speakStream']],
  ['/src/studio-console.js', ['StudioMonitor','createStudioVisualizer','/api/agent-lee/selection']],
  ['/src/studio-monitor.js', ['createAnalyser','createMediaElementSource']],
  ['/src/studio-visualizer.js', ['three.module.min.js','createStudioVisualizer']],
  ['/lab.html', ['LeeWay Voice Fabric','Simulate streamed answer']],
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
  if(path==='/'&&text.includes('Prepare selected voice')){console.error('CONTENT_FAIL',url,'manual prepare control still present');failed=true;}
}
if(failed)process.exit(1);
console.log('LIVE_PAGES_CONTENT=PASS');
