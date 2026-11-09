import { describe, expect, it } from 'vitest';
import { accountBalance, accountReferenced, allocations, calculatePlan, capitalRemainder, cleanWorkValues, debtRemaining, emptyData, formatDuration, incomeCategories, incomeCategoryOptions, jobNetProfit, lastMonths, ledger, money, oddJobIncomes, parseMoney, people, productStatus, profitAllocation, resaleInventoryValue, statusDurations, suggestPlan, today, totals, shareKopecks, parsePercent, saleBreakdown, productCost, inventoryValue, earnedIncome, resaleEarnings, jobEarnings, products, validDate, workKindFields, workKinds, workPlans, workTitle, type Account, type Debt, type Income, type WorkPlan, type ResaleProduct } from '../src/core/model';
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
    expect(totals(d).incomeMonth).toBe(20000);expect(totals(d).incomeTotal).toBe(20000);
    expect(accountBalance(d,'a')).toBe(240000);expect(totals(d).onHand).toBe(223000);
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
    expect(accountBalance(d,'a')).toBe(120000);expect(totals(d).onHand).toBe(103000);expect(totals(d).incomeTotal).toBe(20000);
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
  it('includes «Из кармана» in cost/assets/profit but never deducts it from an account',()=>{
    const d={...emptyData(),accounts:[account],products:[product]};
    expect(productCost(product)).toBe(1000000);expect(accountBalance(d,'a')).toBe(-500000);expect(totals(d).onHand).toBe(-500000);expect(inventoryValue(d)).toBe(1000000);expect(totals(d).assets).toBe(1000000);expect(earnedIncome(d)).toBe(0);expect(accountReferenced(d,'a')).toBe(true);
    const pocketOnly={...product,funding:[{source:'pocket' as const,accountId:'',amountKopecks:400000}]};const pd={...emptyData(),accounts:[account],products:[pocketOnly]};
    expect(validateData(pd).products![0].funding[0].accountId).toBe('');expect(accountBalance(pd,'a')).toBe(100000);expect(productCost(pocketOnly)).toBe(400000);expect(accountReferenced(pd,'a')).toBe(false);
  });
  it('deducts investor share before profit allocation and returns only the purchase cost',()=>{
    const sold={...product,sale:{priceKopecks:1500000,date:today(),accountId:'a'}};const d={...emptyData(),accounts:[account],products:[sold]};
    expect(saleBreakdown(sold)).toMatchObject({profit:500000,investorKopecks:100000,personalProfit:400000,earnedKopecks:60000,returnedKopecks:1000000,remainderKopecks:340000});
    expect(accountBalance(d,'a')).toBe(500000);expect(totals(d).onHand).toBe(500000);expect(totals(d).assets).toBe(0);expect(totals(d).incomeMonth).toBe(400000);expect(resaleEarnings(d, today().slice(0,7))).toBe(400000);expect(ledger(d).map(i=>i.type)).toEqual(['product-sale','product-purchase']);
  });
  it('does not invent earnings at break-even and applies a full loss to cash',()=>{
    const even={...product,sale:{priceKopecks:1000000,date:today(),accountId:'a'}};expect(saleBreakdown(even).earnedKopecks).toBe(0);expect(totals({...emptyData(),accounts:[account],products:[even]}).onHand).toBe(500000);
    const loss={...product,sale:{priceKopecks:400000,date:today(),accountId:'a'}};expect(saleBreakdown(loss)).toMatchObject({profit:-600000,investorKopecks:0,earnedKopecks:0,returnedKopecks:400000});expect(totals({...emptyData(),accounts:[account],products:[loss]}).onHand).toBe(-100000);
  });
  it('uses exact kopeck rounding and excludes debt principals and non-cash accounts from on-hand',()=>{
    expect(shareKopecks(1,1500)).toBe(0);expect(shareKopecks(10,1500)).toBe(2);expect(shareKopecks(1000000000000,1500)).toBe(150000000000);expect(parsePercent('12,5')).toBe(1250);expect(parsePercent('100,01')).toBeNull();
    const d={...emptyData(),accounts:[account,{...account,id:'inv',kind:'investment' as const,openingKopecks:500000}],debts:[debt,{...debt,id:'d2',direction:'owed_to_me' as const}],incomes:[{...income,category:'Шабашки',date:today(),amountKopecks:100001}]};
    expect(totals(d).onHand).toBe(115000);expect(totals(d).assets).toBe(0);expect(jobEarnings(d,today().slice(0,7))).toBe(100001);expect(earnedIncome(d)).toBe(100001);
  });
  it('reverses edits, sale cancellation and deletion without duplicate movements',()=>{
    const sold={...product,sale:{priceKopecks:1500000,date:today(),accountId:'a'}};const d={...emptyData(),accounts:[account],products:[sold]};
    const {sale,...unsold}=sold;expect(totals({...d,products:[unsold]}).onHand).toBe(-500000);expect(inventoryValue({...d,products:[unsold]})).toBe(1000000);expect(totals({...d,products:[]}).onHand).toBe(100000);
    expect(totals({...d,products:[{...sold,sale:{...sold.sale!,priceKopecks:1600000}}]}).onHand).toBe(500000);
  });
  it('roundtrips products, photos, voice and investor in backups and accepts old backups without products',()=>{
    const rich={...product,photos:['data:image/png;base64,aGVsbG8='],voice:{mimeType:'audio/webm',dataUrl:'data:audio/webm;base64,aGVsbG8=',durationSeconds:2}};const d={...emptyData(),accounts:[account],products:[rich]};expect(parseBackup(serializeBackup(d))).toEqual(d);
    const old=emptyData() as Partial<ReturnType<typeof emptyData>>;delete old.products;expect(validateData(old).products).toBeUndefined();expect(products(validateData(old))).toEqual([]);
  });
  it('rejects invalid funding, investor percentage, duplicate goods, sale dates and unsafe media',()=>{
    const d={...emptyData(),accounts:[account],products:[product]};
    for(const bad of [{...product,funding:[{...product.funding[0],amountKopecks:0}]},{...product,funding:[product.funding[0],product.funding[0]]},{...product,funding:[{...product.funding[0],accountId:'missing'}]},{...product,investor:{...product.investor!,percentBasisPoints:10001}},{...product,sale:{priceKopecks:100,date:'2025-01-01',accountId:'a'}},{...product,photos:['data:image/svg+xml;base64,PHN2Zz4=']},{...product,voice:{mimeType:'audio/webm',dataUrl:'javascript:alert(1)',durationSeconds:1}}])expect(()=>validateData({...d,products:[bad]})).toThrow();
    expect(()=>validateData({...d,products:[product,product]})).toThrow();
  });
});

describe('net-profit allocation and capital example',()=>{
  it('splits positive net profit 15/15/70 and gives rounding remainder to hand',()=>{
    expect(profitAllocation(100001)).toEqual({capital:15000,debt:15000,hand:70001,total:100001});
    expect(profitAllocation(-500)).toEqual({capital:0,debt:0,hand:0,total:0});
  });
  it('matches the chainsaw and odd-job example: 395 capital, 195/910/195 role cards',()=>{
    const start={...account,openingKopecks:20000,role:'capital' as const};
    const chainsaw:ResaleProduct={id:'saw',kind:'Бензопила',purchaseDate:today(),funding:[{source:'capital',accountId:'a',amountKopecks:20000}],description:'',photos:[],createdAt:new Date().toISOString()};
    const job:Income={...income,id:'job',category:'Шабашки',amountKopecks:100000,date:today()};
    const bought={...emptyData(),accounts:[start],products:[chainsaw]};
    expect(capitalRemainder(bought)).toBe(0);expect(totals(bought).assets).toBe(20000);expect(totals(bought).totalCapital).toBe(20000);
    const sold={...chainsaw,sale:{priceKopecks:50000,date:today(),accountId:'a'}};
    const d={...emptyData(),accounts:[start],products:[sold],incomes:[job]};
    expect(totals(d).remainder).toBe(35000);expect(totals(d).totalCapital).toBe(35000);expect(totals(d).assets).toBe(0);
    expect(allocations(d)).toEqual({capital:19500,debt:19500,hand:91000,total:130000});
    expect(resaleInventoryValue({...bought,products:[{...chainsaw,investor:{name:'Игорь',amountKopecks:5000,percentBasisPoints:0,terms:''}}]})).toBe(25000);
  });
  it('keeps role accruals untouched by expenses and debt payments',()=>{
    const job:Income={...income,id:'job',category:'Шабашки',amountKopecks:100000,date:today()};
    const d={...emptyData(),accounts:[account],incomes:[job],movements:[{id:'m',kind:'expense' as const,title:'Расход',amountKopecks:5000,date:today(),accountId:'a',note:''}],debts:[{...debt,initialAccountId:'a',payments:[{id:'p',amountKopecks:1000,date:today(),accountId:'a',note:''}]}]};
    expect(allocations(d)).toEqual({capital:15000,debt:15000,hand:70000,total:100000});
    expect(totals(d).remainder).toBe(139000);
  });
  it('computes job net profit after costs',()=>{
    expect(jobNetProfit({...income,category:'Шабашки',amountKopecks:100000,costKopecks:25000})).toBe(75000);
    expect(jobNetProfit({...income,category:'Шабашки',amountKopecks:100000})).toBe(100000);
  });
});
describe('people, roles and product status',()=>{
  it('roundtrips people and rejects duplicate names or duplicate account roles',()=>{
    const person={id:'p1',name:'Алексей',createdAt:new Date().toISOString()};
    const d={...emptyData(),accounts:[{...account,role:'capital' as const}],people:[person]};
    expect(parseBackup(serializeBackup(d))).toEqual(d);expect(people(d)).toEqual([person]);
    expect(()=>validateData({...d,people:[person,{...person,id:'p2',name:'алексей'}]})).toThrow();
    expect(()=>validateData({...d,accounts:[...d.accounts,{...account,id:'a2',role:'capital' as const}]})).toThrow();
  });
  it('derives product status and cumulative state durations',()=>{
    const created='2026-11-01T10:00:00.000Z';const listed='2026-11-02T10:00:00.000Z';const now=Date.parse('2026-11-04T12:00:00.000Z');
    const p:ResaleProduct={id:'g',kind:'Телефон',purchaseDate:'2026-11-01',funding:[{source:'capital',accountId:'a',amountKopecks:100}],description:'',photos:[],createdAt:created,preparingStartedAt:created,status:'listed',listedAt:listed,statusChangedAt:listed,sale:{priceKopecks:200,date:'2026-11-03',accountId:'a'}};
    expect(productStatus(p)).toBe('sold');
    expect(statusDurations(p,now)).toEqual({preparingMs:86400000,listedMs:93600000,soldMs:86400000});
    expect(formatDuration(86400000)).toBe('1 д');expect(formatDuration(3600000)).toBe('1 ч');expect(formatDuration(1000)).toBe('меньше минуты');
    expect(()=>validateData({...emptyData(),accounts:[account],products:[{...p,status:'unknown'}]})).toThrow();
    expect(()=>validateData({...emptyData(),accounts:[account],products:[{...p,listedAt:'not-a-date'}]})).toThrow();
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

describe('net capital and free purchases',()=>{
  it('subtracts only outstanding borrowing once and keeps role accruals and remainder unchanged',()=>{
    const borrowed:Debt={...debt,initialAccountId:'a',payments:[{id:'p',amountKopecks:10000,date:'2026-11-02',accountId:'a',note:''}]};
    const data={...emptyData(),accounts:[account],debts:[borrowed,{...debt,id:'receivable',direction:'owed_to_me' as const}],incomes:[{...income,category:'Шабашки'}]};
    const t=totals(data);expect(t.remainder).toBe(127500);expect(t.payable).toBe(20000);expect(t.totalCapital).toBe(107500);expect(allocations(data)).toEqual({capital:7500,debt:7500,hand:35000,total:50000});
    expect(totals({...data,debts:[{...borrowed,payments:[{...borrowed.payments[0],amountKopecks:30000}]},data.debts[1]]}).totalCapital).toBe(107500);
  });
  it('accepts a zero-cost product without funding, changes its label when funded, and sells it normally',()=>{
    const free:ResaleProduct={id:'free',kind:'Подарок',purchaseDate:'2026-11-01',funding:[],description:'',photos:[],createdAt:'2026-11-01'};const data={...emptyData(),accounts:[account],products:[free]};
    expect(validateData(data).products![0].funding).toEqual([]);expect(productCost(free)).toBe(0);expect(totals(data).assets).toBe(0);expect(accountBalance(data,'a')).toBe(100000);expect(ledger(data).find(i=>i.type==='product-purchase')?.subtitle).toContain('Бесплатно');
    const funded={...free,funding:[{source:'pocket' as const,accountId:'',amountKopecks:100}]};expect(productCost(funded)).toBe(100);expect(accountBalance(data,'a')).toBe(100000);
    const sold={...free,sale:{priceKopecks:10000,date:'2026-11-02',accountId:'a'}};expect(saleBreakdown(sold).returnedKopecks).toBe(0);expect(totals({...data,products:[sold]}).incomeTotal).toBe(10000);
  });
});
