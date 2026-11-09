// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import App from '../src/App';
import { emptyData, totals, type AppData } from '../src/core/model';
import { defaultSyncConfig, mergeData, stampChanges } from '../src/core/sync';
const require=createRequire(import.meta.url);
const {createStore}=require('../electron/store.cjs');
const {createSyncServer}=require('../electron/sync-server.cjs');
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const cleanup:(()=>Promise<void>|void)[]=[];
afterEach(async()=>{for(const fn of cleanup.reverse().splice(0))await fn();(window as any).happyDOM?.setURL('http://localhost/');localStorage.clear();delete (window as any).desktop;window.location.hash='';});
const account=(id:string,amount:number)=>({id,name:id,kind:'cash' as const,openingKopecks:amount,createdAt:'2026-01-01'});
const flush=async()=>{await act(async()=>{await new Promise(r=>setTimeout(r,80));});};
async function until(fn:()=>boolean){for(let i=0;i<40;i++){await flush();if(fn())return;}throw new Error('Sync did not converge: '+(document.querySelector('.sync-pill')?.getAttribute('title')||'')+' '+document.body.textContent);}
describe('record-level sync',()=>{
  it('keeps newer phone edits, unions offline records and honors deletion tombstones',()=>{
    const base={...emptyData(),accounts:[account('a',100)]};
    const pc=stampChanges(base,{...base,accounts:[account('a',200)]},'pc',1000);
    const phone=stampChanges(base,{...base,accounts:[account('a',300),account('b',50)]},'phone',2000);
    const merged=mergeData(phone,pc,true);expect(merged.accounts).toEqual([account('a',300),account('b',50)]);
    const deleted=stampChanges(merged,{...merged,accounts:[account('a',300)]},'phone',3000);
    expect(mergeData(pc,deleted,true).accounts.map(a=>a.id)).toEqual(['a']);
    expect(mergeData(deleted,pc,true).accounts.map(a=>a.id)).toEqual(['a']);
  });
  it('uses the PC for legacy equal-clock conflicts instead of choosing stale phone amounts lexicographically',()=>{
    const phone={...emptyData(),accounts:[account('a',900)]};const pc={...emptyData(),accounts:[account('a',100)]};
    expect(mergeData(phone,pc,true).accounts[0].openingKopecks).toBe(100);
  });
});
describe('real HTTP PC ↔ Android synchronization',()=>{
  it('pulls the PC database, pushes phone edits, receives PC pushes and preserves data after reconnect',async()=>{
    (window as any).happyDOM.setURL('http://192.168.1.20/');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mi-kapital-sync-'));cleanup.push(()=>fs.rmSync(dir,{recursive:true,force:true}));
    const store=createStore(dir);const pcData={...emptyData(),accounts:[account('pc',12345)]};await store.save(pcData);
    let remote:AppData|null=null;const server=createSyncServer(dir,store,(data:AppData)=>{remote=data;});await server.start();cleanup.push(()=>server.close());
    const port=server.info().port;const base=`http://127.0.0.1:${port}`;const token=server.config().lanToken;
    const preflight=await new Promise<{status:number;headers:http.IncomingHttpHeaders}>((resolve,reject)=>{const req=http.request(`${base}/sync/push`,{method:'OPTIONS',headers:{Origin:'https://appassets.androidplatform.net','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}},res=>{res.resume();resolve({status:res.statusCode??0,headers:res.headers});});req.on('error',reject);req.end();});
    expect(preflight.status).toBe(204);expect(preflight.headers['access-control-allow-origin']).toBe('https://appassets.androidplatform.net');expect(preflight.headers['access-control-allow-headers']).toContain('Authorization');

    const config={...defaultSyncConfig(),lanUrl:base,lanToken:token};let phoneData:AppData|null=null;let root:Root|undefined;const container=document.createElement('div');document.body.append(container);
    (window as any).desktop={platform:'android',info:async()=>({version:'2.0.37',phase:'idle'}),checkUpdates:async()=>{},installUpdate:async()=>({ok:true}),openReleases:async()=>{},onUpdate:()=>()=>{},loadData:async()=>phoneData,saveData:async(data:AppData)=>{phoneData=data;},syncConfig:async()=>config,saveSyncConfig:async(next:typeof config)=>{config.lanUrl=next.lanUrl;config.lanToken=next.lanToken;},syncInfo:async()=>null,bootReady:()=>{},exportBackup:async()=>true,scanPairing:async()=>{}};
    root=createRoot(container);cleanup.push(()=>{act(()=>root!.unmount());container.remove();});await act(async()=>{root!.render(createElement(App));});
    await until(()=>container.querySelector('.balance-amount')?.textContent?.includes('123')??false);expect(totals(phoneData!).totalCapital).toBe(12345);expect(container.querySelector('.sync-pill')?.textContent).toBe('ПК');
    await act(async()=>{[...container.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Расход / корректировка')!.click();});
    const field=(label:string)=>[...container.querySelectorAll('label')].find(l=>l.querySelector('.field-label')?.textContent===label)!.querySelector('input') as HTMLInputElement;
    const set=async(label:string,value:string)=>{const el=field(label);await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});};
    await set('Название','Расход с телефона');await set('Сумма, ₽','23,45');await act(async()=>{(container.querySelector('.modal button[type="submit"]') as HTMLButtonElement).click();});
    await until(()=>store.load().movements.length===1);expect(totals(store.load()).totalCapital).toBe(10000);expect(remote).not.toBeNull();
    const response=await fetch(`${base}/sync/pull`,{headers:{Authorization:'Bearer '+token}});const envelope=await response.json();
    const next=stampChanges(envelope.data,{...envelope.data,accounts:[...envelope.data.accounts,account('pc-added',50000)]},'pc-http',Date.now());
    const push=await act(async()=>fetch(`${base}/sync/push`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({revision:envelope.revision,deviceId:'pc-http',data:next})}));expect(push.status).toBe(200);
    await until(()=>phoneData!.accounts.length===2);expect(totals(phoneData!).totalCapital).toBe(60000);expect(totals(store.load()).totalCapital).toBe(60000);
    const conflict=await act(async()=>fetch(`${base}/sync/push`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({revision:envelope.revision,deviceId:'stale',data:next})}));expect(conflict.status).toBe(409);
    const unauthorized=await act(async()=>fetch(`${base}/sync/pull`,{headers:{Authorization:'Bearer wrong'}}));expect(unauthorized.status).toBe(401);
    await act(async()=>{root!.unmount();});root=createRoot(container);await act(async()=>{root!.render(createElement(App));});await until(()=>container.querySelector('.balance-amount')?.textContent?.includes('600')??false);expect(phoneData!.movements).toHaveLength(1);expect(store.load().movements).toHaveLength(1);
  });
});
