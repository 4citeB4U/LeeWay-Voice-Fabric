/*
LEEWAY HEADER — DO NOT REMOVE
REGION: VOICE.DUPLEX.RECONSTRUCTION
TAG: PINNED_EDGE_RTC_RESTORE
WHO: LeeWay Industries; WHAT: restore a verified complete source checkout;
WHY: exact repeatability independent of prior local developer working tree;
WHERE: scripts/voice-duplex-restore.mjs; WHEN: 2026-10-24;
HOW: pinned Git SHA, no shell, refuse unrecognized existing folders,
    SHA-256 verify before any optional installation.
AUTHORITY: explicit local operator, no auto execution of voice/system commands.
LICENSE: existing LeeWay Voice Fabric repository terms.
*/
import {readFile,stat,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await readFile(path.join(root,'docs/voice-duplex-lock-v1.json'),'utf8'));
const target=path.join(root,'work/edge-rtc-publish');
const action=process.argv[2]||'verify';
const hash=/^[a-f0-9]{40}$/;
if(!hash.test(manifest.edgeRtcCommit||''))throw Error('PINNED_EDGE_COMMIT_MISSING');
if(!['verify','restore','restore-install'].includes(action))throw Error('UNKNOWN_RESTORE_ACTION');
function run(executable,args,cwd=root) {
 return new Promise((resolve,reject)=>{
  const proc=spawn(executable,args,{cwd,shell:false,stdio:'inherit'});
  proc.on('error',reject);
  proc.on('exit',code=>code===0?resolve():reject(Error('COMMAND_FAILED_'+code)));
 });
}
const available=await stat(target).then(s=>s.isDirectory(),e=>e?.code==='ENOENT'?false:Promise.reject(e));
if(!available&&action!=='verify'){
 await mkdir(path.dirname(target),{recursive:true});
 await run('git',['clone','--no-checkout',manifest.sourceRepository,target]);
}
if(!available&&action==='verify'){
 throw Error('EDGE_RTC_NOT_CHECKED_OUT: run node scripts/voice-duplex-restore.mjs restore');
}
const gitDir=await stat(path.join(target,'.git')).then(()=>true,()=>false);
if(!gitDir)throw Error('EDGE_RTC_EXISTS_BUT_IS_NOT_A_GIT_CHECKOUT');
if(!available){
 await run('git',['checkout','--detach',manifest.edgeRtcCommit],target);
}
if(action==='restore-install'){
 // Node 24 on Windows cannot spawn npm.cmd with shell:false. Use a fixed
 // cmd invocation with no user-supplied shell fragments or arguments.
 if(process.platform==='win32') await run(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm ci'],target);
 else await run('npm',['ci'],target);
}
await run(process.execPath,[path.join(root,'scripts/voice-duplex-lock.mjs'),'verify']);
console.log(JSON.stringify({status:'PINNED_DUPLEX_SOURCE_VERIFIED',edgeRtcCommit:manifest.edgeRtcCommit,
 acousticAcceptance:'NOT_VERIFIED',ownerAuthorization:'UNCHANGED'}));
