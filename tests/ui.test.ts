// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import App from '../src/App';
import { emptyData, lastMonths, money, today, totals } from '../src/core/model';
import { serializeBackup } from '../src/core/storage';
let root:Root|undefined;let container:HTMLElement|undefined;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{if(root)act(()=>root!.unmount());container?.remove();root=undefined;container=undefined;localStorage.clear();window.location.hash='';delete (window as any).desktop;});
async function mount(){container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>{root!.render(createElement(App));});await act(async()=>{await new Promise(r=>setTimeout(r,10));});}
const button=(text:string)=>[...container!.querySelectorAll('button')].find(b=>b.textContent?.trim()===text) as HTMLButtonElement;
async function click(text:string){const b=button(text);if(!b)throw new Error(`Button not found: ${text}`);await act(async()=>b.click());}
async function clickSelector(selector:string){const el=container!.querySelector(selector) as HTMLElement;if(!el)throw new Error(`Element not found: ${selector}`);await act(async()=>el.click());}
async function submitModal(){const b=container!.querySelector('.modal button[type="submit"]') as HTMLButtonElement;if(!b)throw new Error('Modal submit not found');await act(async()=>b.click());}
async function input(label:string,value:string){const el=(container!.querySelector(`[aria-label="${label}"]`) ?? [...container!.querySelectorAll('label')].find(l=>l.querySelector('.field-label')?.textContent===label)?.querySelector('input,select,textarea')) as HTMLInputElement|HTMLSelectElement;if(!el)throw new Error(`Input not found: ${label}`);await act(async()=>{const setter=Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!;setter.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
const hasInput=(label:string)=>!![...container!.querySelectorAll('label')].find(l=>l.querySelector('.field-label')?.textContent===label);
const saved=()=>JSON.parse(localStorage.getItem('mi-kapital.v2.local')!);
const tabs=()=>[...container!.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
async function clickTab(index:number){await act(async()=>tabs()[index].click());}
const directions=()=>[...container!.querySelectorAll<HTMLButtonElement>('.income-direction')];
const totalText=()=>container!.querySelector('.income-total>strong')?.textContent;
const ledgerText=()=>container!.querySelector('.income-table')?.textContent??'';
const jobsSummary=()=>container!.querySelector('.jobs-summary')?.textContent??'';
async function openJobs(){await clickSelector('.income-direction-link');expect(window.location.hash).toBe('#odd-jobs');expect(container!.querySelector('h1')?.textContent).toBe('Шабашки');}
function seedIncome(){const previous=`${lastMonths(2)[0]}-05`;const data={...emptyData(),accounts:[{id:'a',name:'Карта',kind:'cash' as const,openingKopecks:100050,createdAt:'2026-01-01'}],incomes:[{id:'r',title:'Продажа инструмента',category:'Перепродажи',amountKopecks:120000,date:today(),accountId:'a',note:''},{id:'j',title:'Ремонт на выходных',category:'Шабашки',amountKopecks:75025,date:today(),accountId:'a',note:''},{id:'legacy',title:'Подарок',category:'Подарок',amountKopecks:30000,date:today(),accountId:'a',note:''},{id:'old',title:'Старая перепродажа',category:'Перепродажи',amountKopecks:40000,date:previous,accountId:'a',note:''}],workPlans:[{id:'p1',kind:'Электрика',title:'Щиток в гараже',date:'',expectedKopecks:500000,note:'',createdAt:'2026-01-01'}]};localStorage.setItem('mi-kapital.v2.local',JSON.stringify(data));window.location.hash='income';return data;}

describe('real React UI flows',()=>{
  it('creates account, income, expense and debt payment with coherent persisted balances',async()=>{
    await mount();await click('Добавить счёт');await input('Название счёта','Основная карта');await input('Начальный остаток, ₽','1000,50');await click('Добавить');expect(saved().accounts[0].openingKopecks).toBe(100050);
    await click('Доход');await input('Название','Продажа телефона');await input('Сумма, ₽','500,25');await click('Добавить');expect(saved().incomes[0].amountKopecks).toBe(50025);expect(saved().incomes[0].category).toBe('Перепродажи');expect(container!.querySelector('.balance-amount')?.textContent).toContain('500');
    await click('Расход / корректировка');await input('Название','Покупка');await input('Сумма, ₽','200');await click('Добавить');expect(saved().movements[0].amountKopecks).toBe(20000);
    await click('Долги');await click('Добавить долг');await input('Название','Заём');await input('Кому вы должны','Друг');await input('Изначальная сумма, ₽','300');await click('Добавить');expect(saved().debts[0].principalKopecks).toBe(30000);
    await click('Внести погашение');await input('Сумма, ₽','100');await click('Добавить');expect(saved().debts[0].payments[0].amountKopecks).toBe(10000);
    await click('Мой капитал');expect(saved().accounts.length).toBe(1);expect(container!.querySelector('.balance-amount')?.textContent).toContain('000,75');expect(container!.textContent).toContain('Погашение: Заём');
  });
  it('opens odd jobs as a separate page with summary, done and plan tabs, while resale stays in income',async()=>{
    const previous=`${lastMonths(2)[0]}-05`.slice(0,7);seedIncome();await mount();
    expect(directions().map(d=>d.querySelector('.direction-copy strong')?.textContent)).toEqual(['Перепродажи','Шабашки']);
    expect(directions()[0].getAttribute('aria-pressed')).toBe('true');expect(directions()[1].getAttribute('aria-label')).toContain('отдельную страницу');
    expect(totalText()).toBe(money(120000));expect(ledgerText()).toContain('Продажа инструмента');expect(ledgerText()).not.toContain('Ремонт на выходных');expect(ledgerText()).not.toContain('Подарок');
    await input('Поиск доходов','нет такой записи');expect(container!.textContent).toContain('Ничего не найдено');
    await openJobs();expect(jobsSummary()).toContain(money(75025));expect(jobsSummary()).toContain(money(500000));expect(tabs().map(t=>t.textContent)).toEqual(['Выполнено','Запланировать']);expect(ledgerText()).toContain('Ремонт на выходных');expect(ledgerText()).not.toContain('Продажа инструмента');
    await clickTab(1);expect(ledgerText()).toContain('Щиток в гараже');expect(ledgerText()).toContain('Электрика');
    await click('К доходам');expect(window.location.hash).toBe('#income');expect(totalText()).toBe(money(120000));
    await input('Месяц доходов',previous);expect(totalText()).toBe(money(40000));expect(directions()[0].textContent).toContain(money(40000));expect(directions()[1].textContent).toContain(money(0));
    await input('Месяц доходов','');expect(totalText()).toBe(money(160000));expect(container!.querySelector('.legacy-income-note')?.textContent).toContain('1 поступление');
    await click('Показать всю историю');expect(totalText()).toBe(money(265025));expect(ledgerText()).toContain('Подарок');await input('Категория дохода','Подарок');expect(totalText()).toBe(money(30000));expect(container!.querySelectorAll('.income-table tbody tr').length).toBe(1);
    await click('Вернуться к перепродажам');expect(totalText()).toBe(money(160000));expect(container!.querySelector('[aria-label="Категория дохода"]')).toBeNull();
  });
  it('defaults general income to resale and can move it to odd jobs without double counting',async()=>{
    seedIncome();await mount();await click('Добавить доход');expect((container!.querySelector('label select') as HTMLSelectElement).value).toBe('Перепродажи');
    await input('Название','Продажа гаража');await input('Сумма, ₽','250,50');await click('Добавить');expect(saved().incomes.at(-1)).toMatchObject({title:'Продажа гаража',category:'Перепродажи',amountKopecks:25050});expect(totalText()).toBe(money(145050));expect(totals(saved()).net).toBe(390125);
    await click('Продажа гаража');await input('Направление дохода','Шабашки');await click('Сохранить');expect(saved().incomes.length).toBe(5);expect(saved().incomes.at(-1).category).toBe('Шабашки');expect(totalText()).toBe(money(120000));expect(totals(saved()).net).toBe(390125);
    await openJobs();expect(jobsSummary()).toContain(money(100075));expect(ledgerText()).toContain('Продажа гаража');await click('Продажа гаража');await click('Удалить');await click('Да, удалить');expect(saved().incomes.length).toBe(4);expect(jobsSummary()).toContain(money(75025));expect(totals(saved()).net).toBe(365075);
  });
  it('keeps legacy receipts accessible and editable without silently changing their category',async()=>{
    const original=seedIncome();await mount();expect(saved().incomes).toEqual(original.incomes);expect(ledgerText()).not.toContain('Подарок');
    await click('Показать всю историю');await input('Категория дохода','Подарок');await click('Подарок');const select=container!.querySelector('label select') as HTMLSelectElement;expect(select.value).toBe('Подарок');expect([...select.options].map(o=>o.value)).toEqual(['Подарок','Перепродажи','Шабашки']);
    await input('Название','Подарок на праздник');await click('Сохранить');expect(saved().incomes.find((i:{id:string})=>i.id==='legacy')).toMatchObject({title:'Подарок на праздник',category:'Подарок',amountKopecks:30000});expect(totalText()).toBe(money(30000));
    await click('Вернуться к перепродажам');expect(totalText()).toBe(money(120000));await click('Мой капитал');expect(container!.querySelector('.balance-amount')?.textContent).toBe(money(365075));expect(totals(saved()).incomeTotal).toBe(265025);
  });
  it('completed odd-job form starts with work kind and changes fields by kind',async()=>{
    seedIncome();await mount();await openJobs();await click('Добавить выполненную');
    expect(container!.querySelector('.modal label .field-label')?.textContent).toBe('Вид работы');
    await input('Вид работы','Электрика');expect(hasInput('Объект')).toBe(true);expect(hasInput('Точек / приборов')).toBe(true);expect(hasInput('Что ремонтировали')).toBe(false);
    await input('Объект','Гараж');await input('Что сделано','Собрал щиток');await input('Сумма, ₽','1000,50');await submitModal();
    expect(saved().incomes.at(-1)).toMatchObject({title:'Электрика: Гараж',category:'Шабашки',amountKopecks:100050,work:{kind:'Электрика',values:{object:'Гараж',scope:'Собрал щиток'}}});expect(totals(saved()).net).toBe(465125);expect(jobsSummary()).toContain(money(175075));expect(ledgerText()).toContain('Электрика: Гараж');
  });
  it('planned odd-job form starts with work kind and does not change capital',async()=>{
    seedIncome();await mount();await openJobs();await clickTab(1);await click('Запланировать работу');
    expect(container!.querySelector('.modal label .field-label')?.textContent).toBe('Вид работы');
    await input('Вид работы','Сборка мебели');await input('Что нужно сделать','Кухня');await input('Ожидаемая сумма, ₽','2000');await submitModal();
    expect(saved().workPlans.length).toBe(2);expect(saved().workPlans.at(-1)).toMatchObject({kind:'Сборка мебели',title:'Кухня',expectedKopecks:200000});expect(totals(saved()).net).toBe(365075);expect(jobsSummary()).toContain(money(700000));expect(ledgerText()).toContain('Кухня');
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
