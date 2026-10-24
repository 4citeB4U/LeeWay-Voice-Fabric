/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.STUDIO.INLINE.DUPLEX.DEPLOY
TAG: SINGLE_WORKSPACE_PRESERVING_EXISTING_SPHERE
WHO: LeeWay Industries; WHAT: install exact inline Edge RTC test alongside orb
WHY: replace redundant launcher overlays without altering owner tuning controls
WHERE: existing Voice Fabric Studio; WHEN: 2026-10-24
HOW: source-owned fragment, exact anchors, backups, atomic HTML mutation
AUTHORITY: explicit target local files, no microphone or computer command.
LICENSE: existing LeeWay repository terms.
*/
import {readFile,writeFile,mkdir,copyFile,stat,rename,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const liveMarker='id="duplexInline"';
const script='<script type="module" src="src/studio-duplex-adapter.js"></script>';
const css='<link rel="stylesheet" href="src/studio-duplex-workspace.css">';
const scriptAnchor='<script type="module" src="src/studio-console.js"></script>';
const cssAnchor='<link rel="stylesheet" href="src/studio.css">';
const placement='        <div class="stage-actions">';
const supported=new Set(['studio.html','src/studio-duplex-adapter.js','src/studio-duplex-workspace.css']);
const isFile=p=>stat(p).then(s=>s.isFile(),()=>false);
const once=(s,v)=>{if(s.split(v).length!==2)throw Error('STUDIO_TEMPLATE_ANCHOR_MISMATCH: '+v)};
export function extractInline(source){
 const mark='        <!-- LEEWAY HEADER — DO NOT REMOVE | REGION: VOICE.STUDIO.INLINE.DUPLEX';
 const i=source.indexOf(mark),j=source.indexOf(placement,i);
 if(i<0||j<=i)throw Error('CANONICAL_INLINE_MODULE_NOT_FOUND');
 return source.slice(i,j);
}
const stripOld=(input,regex)=>{
 const all=input.match(regex);
 if(all && all.length>1)throw Error('MULTIPLE_LEGACY_VOICE_TEST_REGIONS');
 return input.replace(regex,'');
};
export async function deployStudio(destination){
 if(!destination)throw Error('EXPLICIT_STUDIO_DIRECTORY_REQUIRED');
 const target=path.resolve(destination);
 const targetHtml=path.join(target,'studio.html');
 const targetJs=path.join(target,'src/studio-duplex-adapter.js');
 const targetCss=path.join(target,'src/studio-duplex-workspace.css');
 const [canonical,old,adapter,style]=await Promise.all([
  readFile(path.join(root,'studio.html'),'utf8'),
  readFile(targetHtml,'utf8'),
  readFile(path.join(root,'src/studio-duplex-adapter.js')),
  readFile(path.join(root,'src/studio-duplex-workspace.css')),
 ]);
 const module=extractInline(canonical);
 const already=old.includes(liveMarker);
 if(already){
  if(!old.includes('id="duplexInlineLoad"')||!old.includes('id="duplexInlineFrame"')||
     !old.includes(script)||!old.includes(css))throw Error('PARTIAL_INLINE_INSTALL_REVIEW_REQUIRED');
  if(!await isFile(targetJs)||!await isFile(targetCss))throw Error('MISSING_INLINE_ASSETS_REVIEW_REQUIRED');
  const [installedAdapter,installedCss]=await Promise.all([readFile(targetJs),readFile(targetCss)]);
  if(!installedAdapter.equals(adapter)||!installedCss.equals(style))
    throw Error('INLINE_ASSET_DRIFT_REVIEW_REQUIRED');
  return {status:'ALREADY_INTEGRATED',target:targetHtml,modified:false};
 }
 let result=old;
 result=stripOld(result,/\s*<button id="duplexTestHeader"[\s\S]*?<\/button>/g);
 result=stripOld(result,/\s*<section class="leeway-duplex-launch-card"[\s\S]*?<\/section>/g);
 result=stripOld(result,/\s*<!-- LEEWAY HEADER[^\n]*DUPLEX_ADAPTER[\s\S]*?<\/details>/g);
 result=stripOld(result,/\s*<!-- LEEWAY HEADER[^\n]*VOICE\.STUDIO\.LIVE_TEST[\s\S]*?<\/section>/g);
 for(const anchor of [placement,scriptAnchor,cssAnchor])once(result,anchor);
 result=result.replace(placement,module+placement);
 if(!result.includes(script))result=result.replace(scriptAnchor,scriptAnchor+script);
 if(!result.includes(css))result=result.replace(cssAnchor,cssAnchor+'\n  '+css);
 if(!result.includes(liveMarker))throw Error('INLINE_INSERTION_FAILED');
 const oldJs=await isFile(targetJs)?await readFile(targetJs):null;
 const oldCss=await isFile(targetCss)?await readFile(targetCss):null;
 // Only known prior LeeWay adapters are replaceable. Otherwise fail closed.
 if(oldJs&&!oldJs.equals(adapter)&&
    !oldJs.toString().includes('REGION: VOICE.STUDIO.DUPLEX_ADAPTER'))
    throw Error('UNKNOWN_EXISTING_STUDIO_ADAPTER_REVIEW_REQUIRED');
 if(oldCss&&!oldCss.equals(style)&&
    !oldCss.toString().includes('REGION: VOICE.STUDIO'))
    throw Error('UNKNOWN_EXISTING_STUDIO_CSS_REVIEW_REQUIRED');
 const archive=path.join(target,'.leeway-voice-backups');
 await mkdir(archive,{recursive:true});
 const name=Date.now()+'-'+randomUUID();
 const backup=path.join(archive,'studio-before-inline-'+name+'.html');
 await copyFile(targetHtml,backup,constants.COPYFILE_EXCL);
 if(oldJs)await writeFile(path.join(archive,'studio-duplex-adapter-'+name+'.js'),oldJs,{flag:'wx'});
 if(oldCss)await writeFile(path.join(archive,'studio-duplex-workspace-'+name+'.css'),oldCss,{flag:'wx'});
 const staged=targetHtml+'.inline-staged-'+randomUUID();
 try{
  await writeFile(staged,result,{flag:'wx',encoding:'utf8'});
  await writeFile(targetJs,adapter);
  await writeFile(targetCss,style);
  await rename(staged,targetHtml);
 }catch(error){await rm(staged,{force:true}).catch(()=>{});throw error}
 return {status:'INTEGRATED',target:targetHtml,backup,
  preservedExistingSphere:true,removedDuplicateTestPanels:true,modified:true,
  physicalAudioVerified:false};
}
const direct=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(direct)deployStudio(process.argv[2]).then(v=>console.log(JSON.stringify(v,null,2)))
 .catch(error=>{console.error('VOICE_INLINE_DEPLOY_FAILED',error.message);process.exitCode=2});
