/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.STUDIO.INLINE.DUPLEX.DEPLOY.TEST
TAG: RESTORABLE_SINGLE_CONVERSATION_WORKSPACE
WHO: LeeWay Industries; WHAT: one sphere plus conversation test
WHY: no duplicate panels and no replacement of original Voice Fabric controls
WHERE: tests/voice-duplex-deploy.test.cjs; WHEN: 2026-10-24
HOW: isolated temporary Studio source and idempotent installer
AUTHORITY: test fixtures only. LICENSE: existing terms.
*/
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
test('single inline conversation workspace installs without replacing Studio orb or wave controls',async()=>{
 const {deployStudio,extractInline}=await import('../scripts/voice-duplex-deploy-studio.mjs');
 const root=path.resolve(__dirname,'..');
 const source=await fs.readFile(path.join(root,'studio.html'),'utf8');
 const inline=extractInline(source);
 const script='<script type="module" src="src/studio-duplex-adapter.js"></script>';
 const css='<link rel="stylesheet" href="src/studio-duplex-workspace.css">';
 const baseline=source.replace(inline,'').replace(script,'').replace(css,'');
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'leeway-voice-inline-'));
 try{
  await fs.mkdir(path.join(tmp,'src'));
  await fs.writeFile(path.join(tmp,'studio.html'),baseline);
  const first=await deployStudio(tmp);
  assert.equal(first.status,'INTEGRATED');
  assert.equal(first.removedDuplicateTestPanels,true);
  const actual=await fs.readFile(path.join(tmp,'studio.html'),'utf8');
  for(const id of ['webglCanvas','micSpectrum','ttsSpectrum','tuningDock',
    'voiceLibrary','sharedVoice','duplexInline','duplexInlineLoad','duplexInlineFrame']){
   assert.ok(actual.includes('id="'+id+'"'),'missing '+id);
  }
  assert.ok(!actual.includes('id="duplexTestWorkspace"'));
  assert.ok(!actual.includes('id="duplexVoicePanel"'));
  assert.equal((actual.match(/id="duplexInlineFrame"/g)||[]).length,1);
  assert.equal(await fs.readFile(first.backup,'utf8'),baseline);
  assert.deepEqual(await fs.readFile(path.join(tmp,'src/studio-duplex-adapter.js')),
    await fs.readFile(path.join(root,'src/studio-duplex-adapter.js')));
  const again=await deployStudio(tmp);
  assert.equal(again.status,'ALREADY_INTEGRATED');
  assert.equal(again.modified,false);
 }finally{await fs.rm(tmp,{recursive:true,force:true})}
});
