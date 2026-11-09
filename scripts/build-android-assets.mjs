import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const core=require('../electron/update-core.cjs');
const files=core.describeDist('dist');
const target='android/app/src/main/assets/web';
fs.rmSync(target,{recursive:true,force:true});
fs.mkdirSync(target,{recursive:true});
for(const file of files){const dest=path.join(target,file.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join('dist',file.path),dest);}
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const androidShellVersion=JSON.parse(fs.readFileSync(new URL('../android/shell-version.json',import.meta.url),'utf8')).version;
fs.writeFileSync('android/app/src/main/assets/builtin.json',JSON.stringify({version:pkg.version,androidShellVersion,files},null,2)+'\n');
console.log(`Android assets: ${files.length} verified web files, shell ${androidShellVersion}.`);
