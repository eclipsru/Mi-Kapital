import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);const core=require('../electron/update-core.cjs');
const repo=process.env.GITHUB_REPOSITORY||'eclipsru/Mi-Kapital';const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const manifest=JSON.parse(fs.readFileSync('release/update-manifest.json','utf8'));
let previous=null;
try{previous=JSON.parse(execFileSync('gh',['api',`repos/${repo}/releases/latest`],{encoding:'utf8'}));}catch{console.log('No previous release; first-install fallback is available.');}
if(previous){
  const tag=previous.tag_name;const oldVersion=tag.replace(/^v/,'');let old=null;
  if(previous.assets?.some(a=>a.name==='update-manifest.json')){
    execFileSync('gh',['release','download',tag,'--repo',repo,'--pattern','update-manifest.json','--dir','release/previous','--clobber'],{stdio:'inherit'});
    old=JSON.parse(fs.readFileSync('release/previous/update-manifest.json','utf8'));
  }
  const sameShell=old?.shellHash===manifest.shellHash;
  const previousShellVersion=sameShell?(old.shellVersion||old.version):oldVersion;
  const sourceTag=old?.shellReleaseTag||tag;
  manifest.previousShellTag=sourceTag;
  manifest.shellVersion=sameShell?previousShellVersion:version;
  manifest.shellReleaseTag=sameShell?sourceTag:`v${version}`;
  // electron-updater asks for the old APP version's filename inside the NEW release.
  // Carry that exact blockmap forward, even across any number of file-only releases.
  const wanted=`Mi-Kapital-Setup-${previousShellVersion}.exe.blockmap`;
  try{
    execFileSync('gh',['release','download',sourceTag,'--repo',repo,'--pattern',wanted,'--dir','release/blockmaps','--clobber'],{stdio:'inherit'});
    fs.copyFileSync(`release/blockmaps/${wanted}`,`release/${wanted}`);
    console.log(`Included previous shell blockmap: ${wanted}`);
  }catch{console.log(`Previous blockmap unavailable; electron-updater will safely fall back to the full installer.`);}
  core.atomicWrite('release/update-manifest.json',JSON.stringify(manifest,null,2)+'\n');
}
console.log(`Release prepared for ${version}; shell ${manifest.shellVersion}.`);
