const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('a speech-control gesture during loading cannot trigger a late automatic greeting',async()=>{
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',scrollHeight:0});return nodes.get(id);};
 const listeners=[],spoken=[];let finishLoad;
 const loading=new Promise(resolve=>finishLoad=resolve);
 const pkg={id:'agent-lee-voice-one',name:'Agent Lee',owner:'Creator',source:'BUILTIN',provider:'chatterbox',exaggeration:.25,pace:1.22};
 class Voice{
  constructor(){this.ready=false;this.sources=new Set();}
  setPace(value){this.playbackRate=Number(value);}
  async audioContext(){return {state:'running'};}
  async load(){await loading;this.ready=true;}
  async setReference(){}
  async speak(text){spoken.push(text);}
  stop(){}
 }
 const scope={console,queueMicrotask,setTimeout,clearTimeout,LeeWayBrowserVoice:Voice,
  createRtcVoiceBinding:()=>({snapshot:()=>({voicePackageId:pkg.id}),handle:async()=>({}),dispose(){}}),
  voiceRegistry:{list:async()=>[pkg],get:async()=>pkg,audio:async()=>({})},
  document:{querySelector:node,querySelectorAll:()=>[]},
  addEventListener:(type,fn,options={})=>listeners.push({type,fn,capture:options.capture===true})};
 vm.createContext(scope);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/lab.js'),'utf8').replace(/^import .*?;\r?\n/gm,''),scope);
 await tick();
 const event={target:{closest:()=>node('#stop')}};
 for(const listener of listeners.filter(x=>x.type==='pointerdown').sort((a,b)=>Number(b.capture)-Number(a.capture)))await listener.fn(event);
 await node('#stop').onclick();finishLoad();await tick();await tick();
 assert.deepEqual(spoken,[]);assert.equal(node('#state').textContent,'Agent Lee Voice One ready.');
});
