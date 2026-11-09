import { describe, expect, it } from 'vitest';
import { accountBalance, accountReferenced, calculatePlan, cleanWorkValues, debtRemaining, emptyData, incomeCategories, incomeCategoryOptions, lastMonths, ledger, money, oddJobIncomes, parseMoney, suggestPlan, today, totals, shareKopecks, parsePercent, saleBreakdown, productCost, inventoryValue, earnedIncome, resaleEarnings, jobEarnings, products, validDate, workKindFields, workKinds, workPlans, workTitle, type Account, type Debt, type Income, type WorkPlan, type ResaleProduct } from '../src/core/model';
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
  it('counts income exactly once in account and net capital',()=>{const d={...emptyData(),accounts:[account],incomes:[income]};expect(accountBalance(d,'a')).toBe(150000);expect(totals(d).onHand).toBe(150000);expect(totals(d).incomeTotal).toBe(0);});
  it('subtracts expenses and applies signed corrections',()=>{const d={...emptyData(),accounts:[account],movements:[{id:'m',kind:'expense' as const,title:'Покупка',amountKopecks:20000,date:'2026-11-01',accountId:'a',note:''},{id:'m2',kind:'adjustment' as const,title:'Курсовая разница',amountKopecks:-500,date:'2026-11-01',accountId:'a',note:''}]};expect(totals(d).onHand).toBe(79500);});
  it('shows borrowed cash on hand without adding the debt principal a second time',()=>{const d={...emptyData(),accounts:[account],debts:[{...debt,initialAccountId:'a'}]};expect(accountBalance(d,'a')).toBe(130000);expect(totals(d).onHand).toBe(130000);expect(totals(d).payable).toBe(30000);});
  it('does not subtract principal twice on repayment',()=>{const d={...emptyData(),accounts:[account],debts:[{...debt,initialAccountId:'a',payments:[{id:'p',amountKopecks:10000,date:'2026-11-02',accountId:'a',note:''}]}]};expect(accountBalance(d,'a')).toBe(120000);expect(debtRemaining(d.debts[0])).toBe(20000);expect(totals(d).onHand).toBe(120000);});
  it('excludes a pre-existing debt principal from on-hand money',()=>{const d={...emptyData(),accounts:[account],debts:[debt]};expect(totals(d).onHand).toBe(100000);expect(totals(d).payable).toBe(30000);expect(accountBalance(d,'a')).toBe(100000);});
  it('treats money owed to the user as receivable, not cash',()=>{const d={...emptyData(),accounts:[account],debts:[{...debt,direction:'owed_to_me' as const}]};expect(totals(d).onHand).toBe(100000);expect(totals(d).receivable).toBe(30000);expect(totals(d).assets).toBe(0);});
  it('does not count a returned receivable as new personal income',()=>{const d={...emptyData(),accounts:[account],debts:[{...debt,direction:'owed_to_me' as const,initialAccountId:'a',payments:[{id:'p',amountKopecks:10000,date:'2026-11-02',accountId:'a',note:''}]}]};expect(accountBalance(d,'a')).toBe(80000);expect(totals(d).onHand).toBe(80000);expect(totals(d).incomeTotal).toBe(0);});
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
    expect(totals(d).incomeMonth).toBe(3000);expect(totals(d).incomeTotal).toBe(3000);
    expect(accountBalance(d,'a')).toBe(240000);expect(totals(d).onHand).toBe(240000);
    expect(totals({...d,incomes:d.incomes.filter(i=>i.category!=='Шабашки')}).onHand).toBe(220000);
  });
});
function sumFor(data:ReturnType<typeof emptyData>,category:string){return data.incomes.filter(i=>i.category===category).reduce((n,i)=>n+i.amountKopecks,0);}
describe('odd jobs page model',()=>{
  const plan:WorkPlan={id:'p',kind:'Электрика',title:'Щиток',date:'',expectedKopecks:50000,note:'',createdAt:'2026-01-01'};
  it('provides work kinds and kind-dependent fields with a stable title helper',()=>{
    expect(workKinds[0]).toBe('Ремонт');expect(workKindFields['Электрика'].map(f=>f.key)).toEqual(['object','scope','points']);
    expect(cleanWorkValues('Электрика',{object:' Гараж ',scope:'',unknown:'x'})).toEqual({object:'Гараж'});
    expect(workTitle('Электрика',{object:'Гараж'})).toBe('Электрика: Гараж');expect(workTitle('Другое',{})).toBe('Другое');
  });
  it('counts completed odd jobs as income once and keeps plans out of capital',()=>{
    const job:Income={...income,id:'job',category:'Шабашки',amountKopecks:20000,date:today(),work:{kind:'Ремонт',values:{object:'Насос'}}};
    const d={...emptyData(),accounts:[account],incomes:[job],workPlans:[plan]};
    expect(oddJobIncomes(d).map(i=>i.id)).toEqual(['job']);expect(workPlans(d).length).toBe(1);
    expect(accountBalance(d,'a')).toBe(120000);expect(totals(d).onHand).toBe(120000);expect(totals(d).incomeTotal).toBe(3000);
  });
  it('roundtrips work details and plans in backups',()=>{
    const job:Income={...income,id:'job',category:'Шабашки',work:{kind:'Сантехника',values:{object:'Ванная'}}};
    const d={...emptyData(),accounts:[account],incomes:[job],workPlans:[plan]};
    expect(parseBackup(serializeBackup(d))).toEqual(d);
  });
  it('rejects invalid work details and plans',()=>{
    const d={...emptyData(),accounts:[account]};
    expect(()=>validateData({...d,incomes:[{...income,work:{kind:'Космос',values:{}}}]})).toThrow();
    expect(()=>validateData({...d,incomes:[{...income,work:{kind:'Ремонт',values:{object:1}}}]})).toThrow();
    expect(()=>validateData({...d,workPlans:[plan,plan]})).toThrow();
    expect(()=>validateData({...d,workPlans:[{...plan,expectedKopecks:-1}]})).toThrow();
    expect(()=>validateData({...d,workPlans:[{...plan,date:'2026-02-30'}]})).toThrow();
  });
});
describe('resale products and personal income',()=>{
  const product:ResaleProduct={id:'g1',kind:'Телефон',purchaseDate:'2026-01-01',funding:[{source:'capital',accountId:'a',amountKopecks:600000},{source:'pocket',accountId:'a',amountKopecks:400000}],description:'Проверен',photos:[],createdAt:'2026-01-01',investor:{name:'Алексей',amountKopecks:300000,percentBasisPoints:2000,terms:'20% прибыли'}};
  it('deducts both funding sources once and counts only unsold goods at actual purchase cost',()=>{
    const d={...emptyData(),accounts:[account],products:[product]};
    expect(productCost(product)).toBe(1000000);expect(accountBalance(d,'a')).toBe(-900000);expect(totals(d).onHand).toBe(-900000);expect(inventoryValue(d)).toBe(1000000);expect(totals(d).assets).toBe(1000000);expect(earnedIncome(d)).toBe(0);expect(accountReferenced(d,'a')).toBe(true);
  });
  it('deducts investor profit share before 15%, returns purchase cost plus earnings exactly once',()=>{
    const sold={...product,sale:{priceKopecks:1500000,date:today(),accountId:'a'}};const d={...emptyData(),accounts:[account],products:[sold]};
    expect(saleBreakdown(sold)).toMatchObject({profit:500000,investorKopecks:100000,personalProfit:400000,earnedKopecks:60000,returnedKopecks:1060000,remainderKopecks:340000});
    expect(accountBalance(d,'a')).toBe(160000);expect(totals(d).onHand).toBe(160000);expect(totals(d).assets).toBe(0);expect(totals(d).incomeMonth).toBe(60000);expect(resaleEarnings(d, today().slice(0,7))).toBe(60000);expect(ledger(d).map(i=>i.type)).toEqual(['product-sale','product-purchase']);
  });
  it('does not invent earnings at break-even and applies a full loss to cash',()=>{
    const even={...product,sale:{priceKopecks:1000000,date:today(),accountId:'a'}};expect(saleBreakdown(even).earnedKopecks).toBe(0);expect(totals({...emptyData(),accounts:[account],products:[even]}).onHand).toBe(100000);
    const loss={...product,sale:{priceKopecks:800000,date:today(),accountId:'a'}};expect(saleBreakdown(loss)).toMatchObject({profit:-200000,investorKopecks:0,earnedKopecks:0,returnedKopecks:800000});expect(totals({...emptyData(),accounts:[account],products:[loss]}).onHand).toBe(-100000);
  });
  it('uses exact kopeck rounding and excludes debt principals and non-cash accounts from on-hand',()=>{
    expect(shareKopecks(1,1500)).toBe(0);expect(shareKopecks(10,1500)).toBe(2);expect(shareKopecks(1000000000000,1500)).toBe(150000000000);expect(parsePercent('12,5')).toBe(1250);expect(parsePercent('100,01')).toBeNull();
    const d={...emptyData(),accounts:[account,{...account,id:'inv',kind:'investment' as const,openingKopecks:500000}],debts:[debt,{...debt,id:'d2',direction:'owed_to_me' as const}],incomes:[{...income,category:'Шабашки',date:today(),amountKopecks:100001}]};
    expect(totals(d).onHand).toBe(200001);expect(totals(d).assets).toBe(0);expect(jobEarnings(d,today().slice(0,7))).toBe(15000);expect(earnedIncome(d)).toBe(15000);
  });
  it('reverses edits, sale cancellation and deletion without duplicate movements',()=>{
    const sold={...product,sale:{priceKopecks:1500000,date:today(),accountId:'a'}};const d={...emptyData(),accounts:[account],products:[sold]};
    const {sale,...unsold}=sold;expect(totals({...d,products:[unsold]}).onHand).toBe(-900000);expect(inventoryValue({...d,products:[unsold]})).toBe(1000000);expect(totals({...d,products:[]}).onHand).toBe(100000);
    expect(totals({...d,products:[{...sold,sale:{...sold.sale!,priceKopecks:2000000}}]}).onHand).toBe(220000);
  });
  it('roundtrips products, photos, voice and investor in backups and accepts old backups without products',()=>{
    const rich={...product,photos:['data:image/png;base64,aGVsbG8='],voice:{mimeType:'audio/webm',dataUrl:'data:audio/webm;base64,aGVsbG8=',durationSeconds:2}};const d={...emptyData(),accounts:[account],products:[rich]};expect(parseBackup(serializeBackup(d))).toEqual(d);
    const old=emptyData() as Partial<ReturnType<typeof emptyData>>;delete old.products;expect(validateData(old).products).toBeUndefined();expect(products(validateData(old))).toEqual([]);
  });
  it('rejects invalid funding, investor percentage, duplicate goods, sale dates and unsafe media',()=>{
    const d={...emptyData(),accounts:[account],products:[product]};
    for(const bad of [{...product,funding:[]},{...product,funding:[product.funding[0],product.funding[0]]},{...product,funding:[{...product.funding[0],accountId:'missing'}]},{...product,investor:{...product.investor!,percentBasisPoints:10001}},{...product,sale:{priceKopecks:100,date:'2025-01-01',accountId:'a'}},{...product,photos:['data:image/svg+xml;base64,PHN2Zz4=']},{...product,voice:{mimeType:'audio/webm',dataUrl:'javascript:alert(1)',durationSeconds:1}}])expect(()=>validateData({...d,products:[bad]})).toThrow();
    expect(()=>validateData({...d,products:[product,product]})).toThrow();
  });
});

describe('forecast',()=>{
  it('does not deduct principal repayment from net capital twice',()=>{const d={...emptyData(),accounts:[account],debts:[debt]};const plan={income:50000,expenses:20000,debtPayment:10000,months:3,goal:200000};const r=calculatePlan(d,plan);expect(r.free).toBe(30000);expect(r.afterDebt).toBe(20000);expect(r.projected).toBe(190000);expect(r.debtMonths).toBe(3);expect(r.goalMonths).toBe(4);});
  it('handles zero income, achieved goals and negative cash flow',()=>{const d=emptyData();const r=calculatePlan(d,{income:0,expenses:1000,debtPayment:0,months:2,goal:0});expect(r.projected).toBe(-2000);expect(r.goalMonths).toBeNull();expect(r.debtMonths).toBe(0);expect(calculatePlan({...d,accounts:[account]},{income:1000,expenses:0,debtPayment:0,months:2,goal:50000}).goalMonths).toBe(0);});
  it('averages three calendar months including empty months',()=>{const d={...emptyData(),incomes:[{...income,date:new Date().toISOString().slice(0,10)}]};expect(suggestPlan(d).income).toBe(0);});
});
describe('validated backups',()=>{
  it('roundtrips a backup',()=>{const d={...emptyData(),accounts:[account],incomes:[income],debts:[debt]};expect(parseBackup(serializeBackup(d))).toEqual(d);});
  it('roundtrips new directions and legacy categories without migration or reassignment',()=>{const d={...emptyData(),accounts:[account],incomes:[income,{...income,id:'r',category:'Перепродажи'},{...income,id:'j',category:'Шабашки'}]};const restored=parseBackup(serializeBackup(d));expect(restored).toEqual(d);expect(restored.incomes.map(i=>i.category)).toEqual(['Зарплата','Перепродажи','Шабашки']);});
  it('rejects broken references, duplicate IDs, overpayment and invalid schemas',()=>{const d=emptyData();expect(()=>validateData({...d,incomes:[income]})).toThrow();expect(()=>validateData({...d,accounts:[account,account]})).toThrow();expect(()=>validateData({...d,accounts:[account],debts:[{...debt,payments:[{id:'p',amountKopecks:40000,date:'2026-11-01',accountId:'a',note:''}]}]})).toThrow();expect(()=>validateData({...d,schemaVersion:2})).toThrow();expect(()=>parseBackup('{bad')).toThrow();});
  it('rejects prototype-like account kinds and fractional kopecks',()=>{expect(()=>validateData({...emptyData(),accounts:[{...account,kind:'__proto__'}]})).toThrow();expect(()=>validateData({...emptyData(),accounts:[{...account,openingKopecks:1.5}]})).toThrow();});
});
