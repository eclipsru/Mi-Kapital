// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import App from '../src/App';
import { emptyData, lastMonths, money, today, totals, type ResaleProduct } from '../src/core/model';
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
async function check(label:string){const el=[...container!.querySelectorAll<HTMLLabelElement>('.checkbox-label')].find(l=>l.textContent?.trim()===label)?.querySelector('input');if(!el)throw new Error(`Checkbox not found: ${label}`);await act(async()=>el.click());}
const hasInput=(label:string)=>!![...container!.querySelectorAll('label')].find(l=>l.querySelector('.field-label')?.textContent===label);
const saved=()=>JSON.parse(localStorage.getItem('mi-kapital.v2.local')!);
const tabs=()=>[...container!.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
async function clickTab(index:number){await act(async()=>tabs()[index].click());}
const directions=()=>[...container!.querySelectorAll<HTMLButtonElement>('.income-direction')];
const totalText=()=>container!.querySelector('.income-total>strong')?.textContent;
const ledgerText=()=>container!.querySelector('.income-table')?.textContent??'';
const jobsSummary=()=>container!.querySelector('.jobs-summary')?.textContent??'';
const cashText=()=>container!.querySelector('.balance-amount')?.textContent;
async function openJobs(){await clickSelector('[aria-label="Шабашки — открыть отдельную страницу"]');expect(window.location.hash).toBe('#odd-jobs');expect(container!.querySelector('h1')?.textContent).toBe('Шабашки');}
async function openResales(){await clickSelector('[aria-label="Перепродажи — открыть отдельную страницу"]');expect(window.location.hash).toBe('#resales');expect(container!.querySelector('h1')?.textContent).toBe('Перепродажи');}
function seedIncome(){const previous=`${lastMonths(2)[0]}-05`;const data={...emptyData(),accounts:[{id:'a',name:'Карта',kind:'cash' as const,openingKopecks:100050,createdAt:'2026-01-01'}],incomes:[{id:'r',title:'Продажа инструмента',category:'Перепродажи',amountKopecks:120000,date:today(),accountId:'a',note:''},{id:'j',title:'Ремонт на выходных',category:'Шабашки',amountKopecks:75025,date:today(),accountId:'a',note:''},{id:'legacy',title:'Подарок',category:'Подарок',amountKopecks:30000,date:today(),accountId:'a',note:''},{id:'old',title:'Старая перепродажа',category:'Перепродажи',amountKopecks:40000,date:previous,accountId:'a',note:''}],workPlans:[{id:'p1',kind:'Электрика',title:'Щиток в гараже',date:'',expectedKopecks:500000,note:'',createdAt:'2026-01-01'}]};localStorage.setItem('mi-kapital.v2.local',JSON.stringify(data));window.location.hash='income';return data;}
const product:ResaleProduct={id:'g1',kind:'Телефон',purchaseDate:today(),funding:[{source:'capital',accountId:'a',amountKopecks:60000},{source:'pocket',accountId:'a',amountKopecks:40000}],description:'Проверен, полный комплект',photos:[],investor:{name:'Алексей',amountKopecks:300000,percentBasisPoints:2000,terms:'20% прибыли'},createdAt:new Date().toISOString()};

describe('real React UI flows',()=>{
  it('creates account, buys from both sources, sells after investor share, and keeps debt out of on-hand money',async()=>{
    await mount();await click('Добавить счёт');await input('Название счёта','Основная карта');await input('Начальный остаток, ₽','1000,50');await click('Добавить');expect(saved().accounts[0].openingKopecks).toBe(100050);
    await click('Товар');expect(window.location.hash).toBe('#resales');await click('Добавить товар');await input('Вид товара','Телефон');await input('Сумма из капитала, ₽','600');await check('Карман');await input('Сумма из кармана, ₽','400');await check('Есть инвестор');await input('Инвестор','Алексей');await input('Сумма инвестора, ₽','300');await input('Процент инвестора, %','20');await input('Условия','20% прибыли');await input('Описание','Проверен');await submitModal();
    expect(saved().products[0]).toMatchObject({kind:'Телефон',funding:[{source:'capital',amountKopecks:60000},{source:'pocket',amountKopecks:40000}],investor:{name:'Алексей',percentBasisPoints:2000}});
    await click('Мой капитал');expect(cashText()).toBe(money(50));expect(container!.querySelector('.inventory-summary')?.textContent).toContain(money(100000));
    await click('Долги');await click('Добавить долг');await input('Название','Заём');await input('Кому вы должны','Друг');await input('Изначальная сумма, ₽','300');await input('Движение денег при создании','');await click('Добавить');await click('Мой капитал');expect(cashText()).toBe(money(50));expect(container!.querySelector('.debt-strip')?.textContent).toContain(money(30000));
    await click('Доходы');await openResales();await click('Продать');await input('Цена продажи, ₽','1500');expect(container!.querySelector('.sale-preview')?.textContent).toContain(money(6000));await submitModal();expect(saved().products[0].sale.priceKopecks).toBe(150000);
    await click('Мой капитал');expect(cashText()).toBe(money(106050));expect(container!.querySelector('.inventory-summary')?.textContent).toContain(money(0));expect(container!.querySelector('.summary-stack')?.textContent).toContain(money(6000));
    await click('Расход / корректировка');await input('Название','Покупка');await input('Сумма, ₽','200');await click('Добавить');expect(cashText()).toBe(money(86050));
    await click('Долги');await click('Внести погашение');await input('Сумма, ₽','100');await click('Добавить');await click('Мой капитал');expect(cashText()).toBe(money(76050));expect(container!.textContent).toContain('Погашение: Заём');
  });
  it('opens both income directions as separate pages and keeps legacy receipts out of the new 15% metric',async()=>{
    const previous=`${lastMonths(2)[0]}-05`.slice(0,7);seedIncome();await mount();
    expect(directions().map(d=>d.querySelector('.direction-copy strong')?.textContent)).toEqual(['Перепродажи','Шабашки']);expect(totalText()).toBe(money(11254));expect(ledgerText()).toContain('Ремонт на выходных');expect(ledgerText()).not.toContain('Продажа инструмента');
    await openResales();expect(container!.textContent).toContain('Пока нет товаров');await click('К доходам');await openJobs();expect(jobsSummary()).toContain(money(75025));expect(jobsSummary()).toContain(money(500000));expect(tabs().map(t=>t.textContent)).toEqual(['Выполнено','Запланировать']);
    await clickTab(1);expect(ledgerText()).toContain('Щиток в гараже');await click('К доходам');await input('Месяц доходов',previous);expect(totalText()).toBe(money(0));await input('Месяц доходов','');expect(totalText()).toBe(money(11254));
    await click('Показать всю историю');expect(container!.querySelector('.income-history-total')?.textContent).toContain(money(265025));expect(ledgerText()).toContain('Подарок');await input('Категория дохода','Подарок');expect(container!.querySelector('.income-history-total')?.textContent).toContain(money(30000));expect(container!.querySelectorAll('.income-table tbody tr').length).toBe(1);
    await click('Вернуться к доходам');expect(totalText()).toBe(money(11254));expect(container!.querySelector('[aria-label="Категория дохода"]')).toBeNull();
  });
  it('keeps legacy receipts editable without changing category or account balance',async()=>{
    const original=seedIncome();await mount();expect(saved().incomes).toEqual(original.incomes);await click('Показать всю историю');await input('Категория дохода','Подарок');await click('Подарок');const select=container!.querySelector('label select') as HTMLSelectElement;expect(select.value).toBe('Подарок');expect([...select.options].map(o=>o.value)).toEqual(['Подарок','Перепродажи','Шабашки']);
    await input('Название','Подарок на праздник');await click('Сохранить');expect(saved().incomes.find((i:{id:string})=>i.id==='legacy')).toMatchObject({title:'Подарок на праздник',category:'Подарок',amountKopecks:30000});await click('Вернуться к доходам');await click('Мой капитал');expect(cashText()).toBe(money(365075));expect(totals(saved()).incomeTotal).toBe(11254);
  });
  it('completed odd-job form starts with work kind, changes fields and counts 15% once',async()=>{
    seedIncome();await mount();await openJobs();await click('Добавить выполненную');expect(container!.querySelector('.modal label .field-label')?.textContent).toBe('Вид работы');
    await input('Вид работы','Электрика');expect(hasInput('Объект')).toBe(true);expect(hasInput('Точек / приборов')).toBe(true);expect(hasInput('Что ремонтировали')).toBe(false);
    await input('Объект','Гараж');await input('Что сделано','Собрал щиток');await input('Сумма, ₽','1000,50');await submitModal();expect(saved().incomes.at(-1)).toMatchObject({title:'Электрика: Гараж',category:'Шабашки',amountKopecks:100050,work:{kind:'Электрика',values:{object:'Гараж',scope:'Собрал щиток'}}});expect(totals(saved()).onHand).toBe(465125);expect(jobsSummary()).toContain(money(175075));expect(jobsSummary()).toContain(money(26261));
  });
  it('planned odd-job form starts with work kind and does not change money',async()=>{
    seedIncome();await mount();await openJobs();await clickTab(1);await click('Запланировать работу');expect(container!.querySelector('.modal label .field-label')?.textContent).toBe('Вид работы');
    await input('Вид работы','Сборка мебели');await input('Что нужно сделать','Кухня');await input('Ожидаемая сумма, ₽','2000');await submitModal();expect(saved().workPlans.length).toBe(2);expect(saved().workPlans.at(-1)).toMatchObject({kind:'Сборка мебели',title:'Кухня',expectedKopecks:200000});expect(totals(saved()).onHand).toBe(365075);expect(jobsSummary()).toContain(money(700000));
  });
  it('validates combined funding and reverses sale edits, cancellation and product deletion',async()=>{
    localStorage.setItem('mi-kapital.v2.local',JSON.stringify({...emptyData(),accounts:[{id:'a',name:'Карта',kind:'cash',openingKopecks:100000,createdAt:'2026-01-01'}],products:[product]}));window.location.hash='resales';await mount();
    await click('Изменить');await input('Сумма из кармана, ₽','0');await submitModal();expect(container!.querySelector('[role="alert"]')?.textContent).toContain('положительную сумму');expect(saved().products[0]).toEqual(product);await input('Сумма из кармана, ₽','400');await submitModal();
    await click('Продать');await input('Цена продажи, ₽','1500');await submitModal();expect(totals(saved()).onHand).toBe(106000);await clickTab(1);await click('Изменить продажу');await input('Цена продажи, ₽','2000');await submitModal();expect(totals(saved()).onHand).toBe(112000);expect(saved().incomes.length).toBe(0);
    await click('Изменить продажу');await click('Отменить продажу');expect(saved().products[0].sale).toBeUndefined();expect(totals(saved()).onHand).toBe(0);expect(totals(saved()).assets).toBe(100000);await clickTab(0);
    await click('Изменить');await click('Удалить');await click('Да, удалить');expect(saved().products.length).toBe(0);expect(totals(saved()).onHand).toBe(100000);expect(totals(saved()).assets).toBe(0);
  });
  it('shows a loss explicitly and returns only the sale price',async()=>{
    localStorage.setItem('mi-kapital.v2.local',JSON.stringify({...emptyData(),accounts:[{id:'a',name:'Карта',kind:'cash',openingKopecks:100000,createdAt:'2026-01-01'}],products:[product]}));window.location.hash='resales';await mount();await click('Продать');await input('Цена продажи, ₽','800');expect(container!.querySelector('.sale-preview')?.textContent).toContain('убыток полностью');await submitModal();expect(totals(saved()).onHand).toBe(80000);expect(totals(saved()).incomeMonth).toBe(0);
  });
  it('protects accounts referenced by product funding from deletion and non-cash reclassification',async()=>{
    localStorage.setItem('mi-kapital.v2.local',JSON.stringify({...emptyData(),accounts:[{id:'a',name:'Карта',kind:'cash' as const,openingKopecks:100000,createdAt:'2026-01-01'}],products:[product]}));window.location.hash='capital';await mount();await clickSelector('.account-card');await input('Тип счёта','investment');await click('Сохранить');expect(container!.querySelector('[role="alert"]')?.textContent).toContain('используется в товарах');expect(saved().accounts[0].kind).toBe('cash');await click('Удалить');await click('Да, удалить');expect(container!.querySelector('[role="alert"]')?.textContent).toContain('ссылаются операции');expect(saved().accounts.length).toBe(1);
  });
  it('rejects overpayment and preserves valid data',async()=>{
    localStorage.setItem('mi-kapital.v2.local',JSON.stringify({...emptyData(),accounts:[{id:'a',name:'Счёт',kind:'cash',openingKopecks:100000,createdAt:'2026-01-01'}],debts:[{id:'d',title:'Долг',counterparty:'Друг',direction:'i_owe',principalKopecks:10000,date:'2026-01-01',dueDate:'',note:'',initialAccountId:null,payments:[]}]}));window.location.hash='debts';await mount();await click('Внести погашение');await input('Сумма, ₽','200');await click('Добавить');expect(container!.querySelector('[role="alert"]')?.textContent).toContain('больше остатка');expect(saved().debts[0].payments.length).toBe(0);
  });
  it('allows decimal plan editing, saves it and keeps it after remount',async()=>{
    await mount();await click('Расчёт');await input('Ожидаемый доход, ₽','95000,50');await input('Плановые расходы, ₽','35000,25');await click('Сохранить план');expect(saved().plan.income).toBe(9500050);expect(saved().plan.expenses).toBe(3500025);await act(async()=>root!.unmount());root=undefined;await mount();await click('Расчёт');expect((container!.querySelector('input[inputmode="decimal"]') as HTMLInputElement).value).toBe('95000,50');
  });
  it('imports a validated backup with products only after explicit confirmation',async()=>{
    await mount();await click('Данные и настройки');const data={...emptyData(),accounts:[{id:'a',name:'Из копии',kind:'cash' as const,openingKopecks:12345,createdAt:'2026-01-01'}],products:[product]};const file=new File([serializeBackup(data)],'backup.json',{type:'application/json'});const el=container!.querySelector('input[type="file"]') as HTMLInputElement;Object.defineProperty(el,'files',{value:[file]});await act(async()=>el.dispatchEvent(new Event('change',{bubbles:true})));expect(container!.textContent).toContain('Заменить текущие данные');expect(container!.textContent).toContain('1 товаров');await click('Импортировать');expect(saved().accounts[0].name).toBe('Из копии');expect(saved().products[0].kind).toBe('Телефон');
  });
});
