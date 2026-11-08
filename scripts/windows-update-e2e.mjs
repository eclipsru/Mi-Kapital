// Runs on a real Windows installation in CI. No mock Electron APIs.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const mode=process.argv[2];
if(!['files','native'].includes(mode))throw new Error('Usage: windows-update-e2e.mjs files|native');
const release=path.resolve('release');const manifest=JSON.parse(fs.readFileSync(path.join(release,'update-manifest.json'),'utf8'));
const exe=process.env.INSTALLED_EXE||'C:\\MiKapitalTest\\Mi-Kapital.exe';
if(!fs.existsSync(exe))throw new Error(`Installed app not found: ${exe}`);
const requests=[];
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);requests.push({name,range:req.headers.range||null});
  const file=path.resolve(release,name);
  if(!file.startsWith(release+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  const buf=fs.readFileSync(file);const range=req.headers.range?.match(/^bytes=(\d+)-(\d+)$/);
  if(range){const start=Number(range[1]),end=Math.min(Number(range[2]),buf.length-1);res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${buf.length}`,'Accept-Ranges':'bytes','Content-Length':end-start+1,'Content-Type':'application/octet-stream'});res.end(buf.subarray(start,end+1));}
  else{res.writeHead(200,{'Content-Length':buf.length,'Accept-Ranges':'bytes','Content-Type':'application/octet-stream'});res.end(buf);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
let child;let browser;let currentPage;const consoleLines=[];
const wait=async(fn,timeout=120000)=>{const end=Date.now()+timeout;let last;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(e){last=e;}await new Promise(r=>setTimeout(r,350));}throw new Error(`Timeout. ${last?.message||''}`);};
async function launch(){try{execFileSync('taskkill',['/F','/IM','Mi-Kapital.exe'],{stdio:'ignore'});}catch{}child=spawn(exe,['--remote-debugging-port=9333'],{env:{...process.env,MIKAPITAL_TEST_SERVER:`http://127.0.0.1:${port}`,MIKAPITAL_TEST_NO_AUTO:'1',ELECTRON_ENABLE_LOGGING:'1'},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>process.stdout.write(d));child.stderr.on('data',d=>process.stderr.write(d));await wait(async()=>{const r=await fetch('http://127.0.0.1:9333/json/version');return r.ok;});browser=await chromium.connectOverCDP(`http://127.0.0.1:9333`);const page=await wait(async()=>browser.contexts()[0]?.pages().find(p=>p.url().startsWith('app://')));currentPage=page;page.on('console',msg=>consoleLines.push(`${msg.type()}: ${msg.text()}`));page.on('pageerror',error=>consoleLines.push(`pageerror: ${error.message}`));await page.waitForFunction(()=>!!window.desktop,null,{timeout:30000});return page;}
try{
  let page=await launch();const before=await page.evaluate(()=>window.desktop.info());console.log('Installed before:',before);
  if(before.version===manifest.version)throw new Error('E2E requires an older installed build');
  await page.evaluate(()=>window.desktop.saveData({schemaVersion:1,accounts:[{id:'e2e-account',name:'Сохранить при обновлении',kind:'cash',openingKopecks:123456,createdAt:new Date().toISOString()}],incomes:[],debts:[],movements:[],plan:{income:0,expenses:0,debtPayment:0,months:12,goal:0},updatedAt:new Date().toISOString()}));
  await page.evaluate(()=>window.desktop.checkUpdates());
  await page.waitForFunction(()=>window.desktop && document.querySelector('.update-banner'),null,{timeout:180000});
  const ready=await page.evaluate(()=>window.desktop.info());if(ready.phase!=='ready'||ready.mode!==mode)throw new Error(`Unexpected updater state: ${JSON.stringify(ready)}`);
  if(mode==='files'){
    const changed=requests.filter(r=>r.name.startsWith('update-'));if(!changed.length)throw new Error('No changed file downloaded');
    if(changed.some(r=>r.name.includes('manrope')||r.name.includes('react-pNCWXP0n')))throw new Error('Unchanged vendor/font downloaded');
    await Promise.all([page.waitForEvent('framenavigated'),page.evaluate(()=>window.desktop.installUpdate())]);await page.waitForFunction(v=>document.querySelector('.sidebar-footer')?.textContent?.includes(`v${v}`),manifest.version,null,{timeout:45000});const data=await page.evaluate(()=>window.desktop.loadData());if(data.accounts[0].openingKopecks!==123456)throw new Error('Data lost during file update');
    await page.screenshot({path:path.join(release,'windows-file-update.png')});
  }else{
    if(!requests.some(r=>r.range))throw new Error('Native updater did not request differential byte ranges');
    const exited=new Promise(r=>child.once('exit',r));await page.evaluate(()=>window.desktop.installUpdate());await exited;await browser.close();browser=undefined;
    await new Promise(r=>setTimeout(r,5000));page=await launch();const info=await page.evaluate(()=>window.desktop.info());if(info.shellVersion!==manifest.version)throw new Error(`Native shell not updated: ${JSON.stringify(info)}`);const data=await page.evaluate(()=>window.desktop.loadData());if(data.accounts[0].openingKopecks!==123456)throw new Error('Data lost during native update');await page.screenshot({path:path.join(release,'windows-native-update.png')});
  }
  fs.writeFileSync(path.join(release,`windows-${mode}-e2e.json`),JSON.stringify({ok:true,version:manifest.version,mode,requests,dataPreserved:true},null,2));console.log(`PASS: real Windows ${mode} update; user data preserved; requests=${requests.length}`);
}catch(error){
  let currentState=null;let markup='';
  try{currentState=await currentPage?.evaluate(()=>window.desktop?.info());}catch{}
  try{markup=(await currentPage?.evaluate(()=>document.body.innerText))?.slice(0,3000)||'';}catch{}
  try{await currentPage?.screenshot({path:path.join(release,`windows-${mode}-failure.png`)});}catch{}
  const report={ok:false,mode,error:error.stack||String(error),url:currentPage?.url(),currentState,requests,console:consoleLines.slice(-40),markup};
  fs.writeFileSync(path.join(release,`windows-${mode}-e2e.json`),JSON.stringify(report,null,2));
  console.error('E2E diagnostic:',JSON.stringify(report));throw error;
}finally{if(browser)await browser.close().catch(()=>{});if(child&&!child.killed)child.kill();server.close();}
