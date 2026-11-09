import { describe, expect, it } from 'vitest';
import { accountBalance, accountReferenced, calculatePlan, debtRemaining, emptyData, incomeCategories, incomeCategoryOptions, lastMonths, ledger, money, parseMoney, suggestPlan, today, totals, validDate, type Account, type Debt, type Income } from '../src/core/model';
import { parseBackup, serializeBackup, validateData } from '../src/core/storage';
const account:Account={id:'a',name:'Карта',kind:'bank',openingKopecks:100000,createdAt:'2026-01-01'};
const income:Income={id:'i',title:'Зарплата',category:'Зарплата',amountKopecks:50000,accountId:'a',date:'2026-11-01',note:''};
const debt:Debt={id:'d',title:'Заём',counterparty:'Банк',direction:'i_owe',principalKopecks:30000,date:'2026-11-01',dueDate:'',note:'',initialAccountId:null,payments:[]};
describe('integer money and dates',()=>{
  it('parses Russian decimal notation without floating-point drift',()=>{expect(parseMoney('1 234,56')).toBe(123456);expect(parseMoney('0,01')).toBe(1);expect(parseMoney('0.1')).toBe(10);expect(parseMoney('-12,30',true)).toBe(-1230);expect(money(100001)).toContain('1');});
  it('rejects invalid, negative, excessive precision and overflowing amounts',()=>{for(const x of ['','NaN','Infinity','1e3','-1','1,001','1.2.3','9999999999999'])expect(parseMoney(x)).toBeNull();expect(parseMoney('-1')).toBeNull();});
  it('validates actual calendar dates',()=>{expect(validDate('2028-02-29')).toBe(true);expect(validDate('2026-02-29')).toBe(false);expect(validDate('2026-13-01')).toBe(false);expect(validDate('2026-00-01')).toBe(false);});
  it('builds month series across year boundaries',()=>{expect(lastMonths(3,'2026-01-08')).toEqual(['2025-11','2025-12','2026-01']);});
});
describe('coherent capital accounting',()=>{
  it('counts income exactly once in account and net capital',()=>{const d={...emptyData(),accounts:[account],incomes:[income]};expect(accountBalance(d,'a')).toBe(150000);expect(totals(d).net).toBe(150000);expect(totals(d).incomeTotal).toBe(50000);});
  it('subtracts expenses and applies signed corrections',()=>{const d={...emptyData(),accounts:[account],movements:[{id:'m',kind:'expense' as const,title:'Покупка',amountKopecks:20000,date:'2026-11-01',accountId:'a',note:''},{id:'m2',kind:'adjustment' as const,title:'Курсовая разница',amountKopecks:-500,date:'2026-11-01',accountId:'a',note:''}]};expect(totals(d).net).toBe(79500);});
  it('keeps net worth unchanged when receiving a loan into an account',()=>{const d={...emptyData(),accounts:[account],debts:[{...debt,initialAccountId:'a'}]};expect(accountBalance(d,'a')).toBe(130000);expect(totals(d).net).toBe(100000);});
  it('does not subtract principal twice on repayment',()=>{const d={...emptyData(),accounts:[account],debts:[{...debt,initialAccountId:'a',payments:[{id:'p',amountKopecks:10000,date:'2026-11-02',accountId:'a',note:''}]}]};expect(accountBalance(d,'a')).toBe(120000);expect(debtRemaining(d.debts[0])).toBe(20000);expect(totals(d).net).toBe(100000);});
  it('handles pre-existing debt without changing account balance',()=>{const d={...emptyData(),accounts:[account],debts:[debt]};expect(totals(d).net).toBe(70000);expect(accountBalance(d,'a')).toBe(100000);});
  it('treats money owed to the user as receivable, not cash',()=>{const d={...emptyData(),accounts:[account],debts:[{...debt,direction:'owed_to_me' as const}]};expect(totals(d).net).toBe(130000);expect(totals(d).assets).toBe(100000);});
  it('does not change net worth when a receivable is returned to cash',()=>{const d={...emptyData(),accounts:[account],debts:[{...debt,direction:'owed_to_me' as const,initialAccountId:'a',payments:[{id:'p',amountKopecks:10000,date:'2026-11-02',accountId:'a',note:''}]}]};expect(accountBalance(d,'a')).toBe(80000);expect(totals(d).net).toBe(100000);});
  it('reverses deleted operations through derivation',()=>{const d={...emptyData(),accounts:[account],incomes:[income]};expect(accountReferenced(d,'a')).toBe(true);expect(accountBalance({...d,incomes:[]},'a')).toBe(100000);});
  it('includes initial loan movements and repayments in the activity feed',()=>{const d={...emptyData(),accounts:[account],debts:[{...debt,initialAccountId:'a',payments:[{id:'p',amountKopecks:10000,date:'2026-11-02',accountId:'a',note:''}]}]};expect(ledger(d).map(i=>i.type)).toEqual(['payment','debt']);});
});
describe('income directions',()=>{
  it('offers resale first and odd jobs second, preserving legacy editing options',()=>{
    expect(incomeCategories).toEqual(['Перепродажи','Шабашки']);
    expect(incomeCategoryOptions()).toEqual(['Перепродажи','Шабашки']);
    expect(incomeCategoryOptions('Подарок')).toEqual(['Подарок','Перепродажи','Шабашки']);
    expect(incomeCategoryOptions('Шабашки')).toEqual(['Перепродажи','Шабашки']);
  });
  it('separates receipts by direction without changing account or capital totals',()=>{
    const resale={...income,id:'resale',category:'Перепродажи',amountKopecks:30000,date:today()};
    const jobs={...income,id:'jobs',category:'Шабашки',amountKopecks:20000,date:today()};
    const previous={...resale,id:'previous',amountKopecks:40000,date:`${lastMonths(2)[0]}-05`};
    const d={...emptyData(),accounts:[account],incomes:[income,resale,jobs,previous]};
    expect(sumFor(d,'Перепродажи')).toBe(70000);expect(sumFor(d,'Шабашки')).toBe(20000);
    expect(totals(d).incomeMonth).toBe(100000);expect(totals(d).incomeTotal).toBe(140000);
    expect(accountBalance(d,'a')).toBe(240000);expect(totals(d).net).toBe(240000);
    expect(totals({...d,incomes:d.incomes.filter(i=>i.category!=='Шабашки')}).net).toBe(220000);
  });
});
function sumFor(data:ReturnType<typeof emptyData>,category:string){return data.incomes.filter(i=>i.category===category).reduce((n,i)=>n+i.amountKopecks,0);}
describe('forecast',()=>{
  it('does not deduct principal repayment from net capital twice',()=>{const d={...emptyData(),accounts:[account],debts:[debt]};const plan={income:50000,expenses:20000,debtPayment:10000,months:3,goal:200000};const r=calculatePlan(d,plan);expect(r.free).toBe(30000);expect(r.afterDebt).toBe(20000);expect(r.projected).toBe(160000);expect(r.debtMonths).toBe(3);expect(r.goalMonths).toBe(5);});
  it('handles zero income, achieved goals and negative cash flow',()=>{const d=emptyData();const r=calculatePlan(d,{income:0,expenses:1000,debtPayment:0,months:2,goal:0});expect(r.projected).toBe(-2000);expect(r.goalMonths).toBeNull();expect(r.debtMonths).toBe(0);expect(calculatePlan({...d,accounts:[account]},{income:1000,expenses:0,debtPayment:0,months:2,goal:50000}).goalMonths).toBe(0);});
  it('averages three calendar months including empty months',()=>{const d={...emptyData(),incomes:[{...income,date:new Date().toISOString().slice(0,10)}]};expect(suggestPlan(d).income).toBe(Math.round(50000/3));});
});
describe('validated backups',()=>{
  it('roundtrips a backup',()=>{const d={...emptyData(),accounts:[account],incomes:[income],debts:[debt]};expect(parseBackup(serializeBackup(d))).toEqual(d);});
  it('roundtrips new directions and legacy categories without migration or reassignment',()=>{const d={...emptyData(),accounts:[account],incomes:[income,{...income,id:'r',category:'Перепродажи'},{...income,id:'j',category:'Шабашки'}]};const restored=parseBackup(serializeBackup(d));expect(restored).toEqual(d);expect(restored.incomes.map(i=>i.category)).toEqual(['Зарплата','Перепродажи','Шабашки']);});
  it('rejects broken references, duplicate IDs, overpayment and invalid schemas',()=>{const d=emptyData();expect(()=>validateData({...d,incomes:[income]})).toThrow();expect(()=>validateData({...d,accounts:[account,account]})).toThrow();expect(()=>validateData({...d,accounts:[account],debts:[{...debt,payments:[{id:'p',amountKopecks:40000,date:'2026-11-01',accountId:'a',note:''}]}]})).toThrow();expect(()=>validateData({...d,schemaVersion:2})).toThrow();expect(()=>parseBackup('{bad')).toThrow();});
  it('rejects prototype-like account kinds and fractional kopecks',()=>{expect(()=>validateData({...emptyData(),accounts:[{...account,kind:'__proto__'}]})).toThrow();expect(()=>validateData({...emptyData(),accounts:[{...account,openingKopecks:1.5}]})).toThrow();});
});
