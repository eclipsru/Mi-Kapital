// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QuickEntry } from '../src/components/QuickEntry';
import { emptyData, totals, type AppData } from '../src/core/model';
import { validateData } from '../src/core/storage';
let root:Root,host:HTMLElement,saved:AppData,fail=false,closed=0,opened=0;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const seed=():AppData=>({...emptyData(),accounts:[{id:'c',name:'Капитал',role:'capital',kind:'cash',openingKopecks:100000,createdAt:'2026-01-01'},{id:'h',name:'Руки',role:'hand',kind:'bank',openingKopecks:0,createdAt:'2026-01-01'}]});
async function mount(data=seed(),route='expense'){
  saved=data;fail=false;closed=0;opened=0;window.location.hash=`add?type=${route}`;
  function Harness(){const [value,setValue]=useState(data);return <QuickEntry data={value} onSave={async next=>{saved=validateData(next);setValue(saved);if(fail)throw new Error('Диск недоступен');}} onClose={async()=>{closed++;}} onOpenApp={async()=>{opened++;}}/>;}
  host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<Harness/>));
}
afterEach(()=>{act(()=>root?.unmount());host?.remove();window.location.hash='';});
const panel=()=>host.querySelector<HTMLElement>('[role=tabpanel]:not([hidden])')!;
async function change(label:string,value:string){const input=[...panel().querySelectorAll('label')].find(l=>l.querySelector('.field-label')?.textContent===label)?.querySelector('input,select,textarea') as HTMLInputElement;expect(input).toBeTruthy();await act(async()=>{Object.getOwnPropertyDescriptor(input.tagName==='SELECT'?HTMLSelectElement.prototype:input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
async function tab(label:string){await act(async()=>[...host.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(b=>b.textContent===label)!.click());}
async function submit(){await act(async()=>{panel().querySelector<HTMLButtonElement>('button[type=submit]')!.click();await new Promise(r=>setTimeout(r,5));});}
it('opens a selected tab and saves a capital expense and debt as one operation',async()=>{
  await mount();expect(host.querySelector('[aria-selected=true]')?.textContent).toBe('Расход');await change('Название','Быстрая покупка');await change('Сумма, ₽','250');await change('Счёт','c');await submit();expect(saved.movements).toHaveLength(1);expect(saved.debts).toHaveLength(1);expect(totals(saved).remainder).toBe(75000);expect(host.textContent).toContain('Сохранено на телефоне');
});
it('keeps other tab drafts after save and records each supported type',async()=>{
  await mount();await change('Название','Черновик');await tab('Товар');await change('Товар','Подарок');await submit();expect(saved.products?.[0].funding).toEqual([]);await tab('Расход');expect(panel().querySelector<HTMLInputElement>('input')!.value).toBe('Черновик');
  await tab('Доход');await change('Название','Подработка');await change('Сумма, ₽','100');await submit();expect(saved.incomes[0]).toMatchObject({category:'Шабашки',amountKopecks:10000});
  await tab('Работа');await change('Название','Ремонт');await change('Сумма, ₽','200');await change('Расходы на работу, ₽','50');await submit();expect(saved.incomes[1]).toMatchObject({costKopecks:5000,work:{kind:'Ремонт',values:{object:'Ремонт'}}});
  await tab('Долг');await change('Название','Заём');await change('Сумма, ₽','300');await change('Человек','Друг');await submit();expect(saved.debts[0]).toMatchObject({loanReceipt:'cash',principalKopecks:30000});expect(saved.products).toHaveLength(1);expect(saved.incomes).toHaveLength(2);
});
it('retains inputs on disk failure and retries with the same record id',async()=>{
  await mount();await change('Название','Повтор');await change('Сумма, ₽','100');await change('Счёт','c');fail=true;await submit();expect(host.textContent).toContain('Диск недоступен');expect(panel().querySelector<HTMLInputElement>('input')!.value).toBe('Повтор');const id=saved.movements[0].id;fail=false;await submit();expect(saved.movements).toHaveLength(1);expect(saved.debts).toHaveLength(1);expect(saved.movements[0].id).toBe(id);
});
it('requires accounts for receipts but permits a free product without accounts',async()=>{
  await mount(emptyData(),'income');await change('Название','Доход');await change('Сумма, ₽','100');await act(async()=>panel().querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(host.textContent).toContain('Сначала создайте счёт');expect(saved.incomes).toEqual([]);await tab('Товар');await change('Товар','Подарок');await submit();expect(saved.products).toHaveLength(1);
});
it('opens another widget selection without dropping existing drafts',async()=>{
  await mount();await change('Название','Черновик');await act(async()=>{window.location.hash='add?type=debt';await new Promise(r=>setTimeout(r,10));});expect(host.querySelector('[aria-selected=true]')?.textContent).toBe('Долг');await tab('Расход');expect(panel().querySelector<HTMLInputElement>('input')!.value).toBe('Черновик');
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Закрыть быстрое добавление"]')!.click());expect(closed).toBe(1);await act(async()=>host.querySelector<HTMLButtonElement>('.text-link')!.click());expect(opened).toBe(1);
});
