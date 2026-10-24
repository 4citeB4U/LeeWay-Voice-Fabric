/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.FABRIC.STUDIO.DEPLOYMENT
TAG: NONDESTRUCTIVE_DUPLEX_UI_INSTALL
WHO: LeeWay Industries; WHAT: add live duplex into an existing Studio
WHY: preserve user voice/tuning UI and recreate the same backend integration
WHERE: scripts/voice-duplex-deploy-studio.mjs; WHEN: 2026-10-24
HOW: exact additive anchors, immutable backup, atomic HTML replacement
AUTHORITY: explicit target path only, no device action, audio or credentials.
LICENSE: existing LeeWay Voice Fabric repository terms.
*/
import {readFile,writeFile,mkdir,copyFile,stat,rename,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const marker='      <!-- LEEWAY HEADER';
const panelId='duplexVoicePanel';
const endAnchor='      <details class="panel evidence-panel"><summary>Runtime evidence & integration</summary>';
const scriptAnchor='<script type="module" src="src/studio-console.js"></script>';
const scriptTag='<script type="module" src="src/studio-duplex-adapter.js"></script>';
export function extractDuplexPanel(html){
 const insertion=html.indexOf(endAnchor);
 const id=html.indexOf('id="'+panelId+'"');
 if(insertion<0||id<0||id>=insertion)throw Error('VOICE_DUPLEX_CANONICAL_PANEL_MISSING');
 const start=html.lastIndexOf(marker,id);
 if(start<0||start>=id)throw Error('VOICE_DUPLEX_CANONICAL_HEADER_MISSING');
 return html.slice(start,insertion);
}
export async function deployStudio(targetDirectory){
 if(!targetDirectory)throw Error('EXPLICIT_STUDIO_DIRECTORY_REQUIRED');
 const targetRoot=path.resolve(targetDirectory);
 const targetStudio=path.join(targetRoot,'studio.html');
 const targetAdapter=path.join(targetRoot,'src/studio-duplex-adapter.js');
 const source=await readFile(path.join(sourceRoot,'studio.html'),'utf8');
 const original=await readFile(targetStudio,'utf8');
 const panel=extractDuplexPanel(source);
 const adapter=await readFile(path.join(sourceRoot,'src/studio-duplex-adapter.js'));
 if(original.includes('id="'+panelId+'"')){
   const existing=await readFile(targetAdapter);
   if(!existing.equals(adapter)||!original.includes(scriptTag))
      throw Error('EXISTING_DUPLEX_INTEGRATION_DIFFERS_REVIEW_REQUIRED');
   return {status:'ALREADY_INTEGRATED',target:targetStudio,modified:false};
 }
 if(original.split(endAnchor).length!==2||original.split(scriptAnchor).length!==2)
   throw Error('ACTIVE_STUDIO_ANCHORS_DIFFER_REVIEW_REQUIRED');
 if(await stat(targetAdapter).then(()=>true,()=>false))
   throw Error('ADAPTER_EXISTS_UNEXPECTED_REVIEW_REQUIRED');
 const patched=original.replace(endAnchor,panel+endAnchor)
   .replace(scriptAnchor,scriptAnchor+scriptTag);
 const archive=path.join(targetRoot,'.leeway-voice-backups');
 await mkdir(archive,{recursive:true});
 const backup=path.join(archive,'studio-before-duplex-'+Date.now()+'-'+randomUUID()+'.html');
 await copyFile(targetStudio,backup,constants.COPYFILE_EXCL);
 const staging=targetStudio+'.duplex-staged-'+randomUUID();
 try {
   await writeFile(staging,patched,{flag:'wx',encoding:'utf8'});
   await copyFile(path.join(sourceRoot,'src/studio-duplex-adapter.js'),targetAdapter,constants.COPYFILE_EXCL);
   await rename(staging,targetStudio);
 }catch(error){
   await rm(staging,{force:true}).catch(()=>{});
   throw error;
 }
 return {status:'INTEGRATED',target:targetStudio,backup,modified:true,
   unrelatedUiReplaced:false,acousticQualification:'NOT_VERIFIED'};
}
const entry=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(entry)deployStudio(process.argv[2]).then(result=>
 console.log(JSON.stringify(result,null,2))).catch(error=>{
 console.error('LEEWAY_VOICE_DEPLOY_ERROR',error.message);process.exitCode=2;
});
