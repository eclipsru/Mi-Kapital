// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import App from '../src/App';
import { emptyData } from '../src/core/model';
import { serializeBackup } from '../src/core/storage';
let root:Root|undefined;let container:HTMLElement|undefined;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{if(root)act(()=>root!.unmount());container?.remove();root=undefined;container=undefined;localStorage.clear();window.location.hash='';delete (window as any).desktop;});
async function mount(){container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>{root!.render(createElement(App));});await act(async()=>{await new Promise(r=>setTimeout(r,10));});}
const button=(text:string)=>[...container!.querySelectorAll('button')].find(b=>b.textContent?.trim()===text) as HTMLButtonElement;
async function click(text:string){const b=button(text);if(!b)throw new Error(`Button not found: ${text}`);await act(async()=>b.click());}
async function input(label:string,value:string){const el=[...container!.querySelectorAll('label')].find(l=>l.querySelector('.field-label')?.textContent===label)?.querySelector('input,select,textarea') as HTMLInputElement|HTMLSelectElement;if(!el)throw new Error(`Input not found: ${label}`);await act(async()=>{const setter=Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!;setter.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
const saved=()=>JSON.parse(localStorage.getItem('mi-kapital.v2.local')!);
describe('real React UI flows',()=>{
  it('creates account, income, expense and debt payment with coherent persisted balances',async()=>{
    await mount();await click('Добавить счёт');await input('Название счёта','Основная карта');await input('Начальный остаток, ₽','1000,50');await click('Добавить');expect(saved().accounts[0].openingKopecks).toBe(100050);
    await click('Доход');await input('Название','Зарплата');await input('Сумма, ₽','500,25');await click('Добавить');expect(saved().incomes[0].amountKopecks).toBe(50025);expect(container!.querySelector('.balance-amount')?.textContent).toContain('500');
    await click('Расход / корректировка');await input('Название','Покупка');await input('Сумма, ₽','200');await click('Добавить');expect(saved().movements[0].amountKopecks).toBe(20000);
    await click('Долги');await click('Добавить долг');await input('Название','Заём');await input('Кому вы должны','Друг');await input('Изначальная сумма, ₽','300');await click('Добавить');expect(saved().debts[0].principalKopecks).toBe(30000);
    await click('Внести погашение');await input('Сумма, ₽','100');await click('Добавить');expect(saved().debts[0].payments[0].amountKopecks).toBe(10000);
    await click('Мой капитал');expect(saved().accounts.length).toBe(1);expect(container!.querySelector('.balance-amount')?.textContent).toContain('000,75');expect(container!.textContent).toContain('Погашение: Заём');
  });
  it('rejects overpayment and preserves valid data',async()=>{
    localStorage.setItem('mi-kapital.v2.local',JSON.stringify({...emptyData(),accounts:[{id:'a',name:'Счёт',kind:'cash',openingKopecks:100000,createdAt:'2026-01-01'}],debts:[{id:'d',title:'Долг',counterparty:'Друг',direction:'i_owe',principalKopecks:10000,date:'2026-01-01',dueDate:'',note:'',initialAccountId:null,payments:[]}]}));window.location.hash='debts';await mount();await click('Внести погашение');await input('Сумма, ₽','200');await click('Добавить');expect(container!.querySelector('[role="alert"]')?.textContent).toContain('больше остатка');expect(saved().debts[0].payments.length).toBe(0);
  });
  it('allows decimal plan editing, saves it and keeps it after remount',async()=>{
    await mount();await click('Расчёт');await input('Ожидаемый доход, ₽','95000,50');await input('Плановые расходы, ₽','35000,25');await click('Сохранить план');expect(saved().plan.income).toBe(9500050);expect(saved().plan.expenses).toBe(3500025);await act(async()=>root!.unmount());root=undefined;await mount();await click('Расчёт');expect((container!.querySelector('input[inputmode="decimal"]') as HTMLInputElement).value).toBe('95000,50');
  });
  it('imports a validated backup only after explicit confirmation',async()=>{
    await mount();await click('Данные и настройки');const data={...emptyData(),accounts:[{id:'a',name:'Из копии',kind:'cash' as const,openingKopecks:12345,createdAt:'2026-01-01'}]};const file=new File([serializeBackup(data)],'backup.json',{type:'application/json'});const el=container!.querySelector('input[type="file"]') as HTMLInputElement;Object.defineProperty(el,'files',{value:[file]});await act(async()=>el.dispatchEvent(new Event('change',{bubbles:true})));expect(container!.textContent).toContain('Заменить текущие данные');await click('Импортировать');expect(saved().accounts[0].name).toBe('Из копии');
  });
});
