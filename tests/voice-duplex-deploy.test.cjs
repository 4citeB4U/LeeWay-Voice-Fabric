/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.FABRIC.STUDIO.DEPLOY.TEST
TAG: ADDITIVE_UI_ONLY_ACCEPTANCE
WHO: LeeWay Industries; WHAT: validate reproducible live Studio patch
WHY: prevent replacement of original user voice library and tuning controls
WHERE: tests; WHEN: 2026-10-24; HOW: isolated temporary Studio directory
AUTHORITY: local file fixture only, never production Studio.
LICENSE: existing repository terms.
*/
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
test('deploying full-duplex engine only adds the panel and is idempotent',async()=>{
 const {deployStudio,extractDuplexPanel}=await import('../scripts/voice-duplex-deploy-studio.mjs');
 const root=path.resolve(__dirname,'..');
 const source=await fs.readFile(path.join(root,'studio.html'),'utf8');
 const panel=extractDuplexPanel(source);
 const script='<script type="module" src="src/studio-duplex-adapter.js"></script>';
 const baseline=source.replace(panel,'').replace(script,'');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'leeway-voice-ui-'));
 try{
   await fs.mkdir(path.join(temp,'src'));
   await fs.writeFile(path.join(temp,'studio.html'),baseline);
   const first=await deployStudio(temp);
   assert.equal(first.status,'INTEGRATED');
   assert.equal(first.unrelatedUiReplaced,false);
   assert.equal(await fs.readFile(path.join(temp,'studio.html'),'utf8'),source);
   assert.equal(await fs.readFile(first.backup,'utf8'),baseline);
   assert.deepEqual(await fs.readFile(path.join(temp,'src/studio-duplex-adapter.js')),
     await fs.readFile(path.join(root,'src/studio-duplex-adapter.js')));
   const second=await deployStudio(temp);
   assert.equal(second.status,'ALREADY_INTEGRATED');
   assert.equal(second.modified,false);
 }finally{await fs.rm(temp,{recursive:true,force:true})}
});
