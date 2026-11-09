import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const core=require('../electron/update-core.cjs');
const electronVersion=require('../node_modules/electron/package.json').version;
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const version=pkg.version;
const shellHash=core.shellHash(process.cwd(),electronVersion);
const files=core.describeDist('dist').map(file=>({...file,asset:`update-${file.sha256}.gz`}));
fs.mkdirSync('release',{recursive:true});
for(const file of files){const asset=path.join('release',file.asset);if(!fs.existsSync(asset))fs.writeFileSync(asset,zlib.gzipSync(fs.readFileSync(path.join('dist',file.path)),{level:9}));}
const manifest={format:'mi-kapital-update-2',version,tag:process.env.RELEASE_TAG||`v${version}`,shellHash,shellVersion:version,electronVersion,androidShellVersion:1,files,createdAt:new Date().toISOString()};
core.validateManifest(manifest,shellHash);
fs.writeFileSync('release/update-manifest.json',JSON.stringify(manifest,null,2)+'\n');
const total=files.reduce((n,f)=>n+fs.statSync(path.join('release',f.asset)).size,0);
fs.writeFileSync('release/build-info.json',JSON.stringify({version,shellHash,electronVersion,fileCount:files.length,compressedBytes:total},null,2)+'\n');
console.log(`Update ready: ${files.length} content-addressed files, ${(total/1024).toFixed(1)} KiB total; clients download only missing hashes.`);
