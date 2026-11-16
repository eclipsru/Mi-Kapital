import { describe, expect, it } from 'vitest';
import { accountBalance, capitalRemainder, debtRemaining, emptyData, removeMovement, roleBalance, saveMovement, totals, type AppData, type Movement } from '../src/core/model';
import { parseBackup, serializeBackup, validateData } from '../src/core/storage';
import { mergeData, stampChanges } from '../src/core/sync';
const base=():AppData=>({...emptyData(),accounts:[{id:'c',name:'Капитал',kind:'cash',openingKopecks:100000,role:'capital',createdAt:'2026-11-10'},{id:'h',name:'Руки',kind:'bank',openingKopecks:50000,role:'hand',createdAt:'2026-11-10'}]});
const expense:Movement={id:'e',kind:'expense',accountId:'c',title:'Покупка',amountKopecks:20000,date:'2026-11-10',note:''};
const pay=(d:AppData,amount=5000)=>({...d,debts:d.debts.map(x=>({...x,payments:[...x.payments,{id:'p',amountKopecks:amount,accountId:'h',date:'2026-11-11',note:''}]}))});
describe('explicit capital expense and internal debt',()=>{
  it('reduces capital and its role once, restores each partial repayment, never credits Hands on creation',()=>{
    const initial=base(),d=validateData(saveMovement(initial,expense,true));
    expect(d.debts).toHaveLength(1);expect(d.debts[0]).toMatchObject({title:'Долг в капитал',capitalExpenseId:'e',initialAccountId:null});
    expect(capitalRemainder(d)).toBe(capitalRemainder(initial)-20000);expect(totals(d).totalCapital).toBe(totals(initial).totalCapital-20000);expect(roleBalance(d,'capital')).toBe(-20000);expect(roleBalance(d,'hand')).toBe(0);expect(accountBalance(d,'c')).toBe(80000);
    const part=validateData(pay(d));expect(capitalRemainder(part)).toBe(135000);expect(roleBalance(part,'capital')).toBe(-15000);expect(roleBalance(part,'hand')).toBe(-5000);expect(debtRemaining(part.debts[0])).toBe(15000);expect(accountBalance(part,'c')).toBe(85000);expect(accountBalance(part,'h')).toBe(45000);
    const full=validateData(pay(d,20000));expect(capitalRemainder(full)).toBe(150000);expect(roleBalance(full,'capital')).toBe(0);expect(debtRemaining(full.debts[0])).toBe(0);
    const undo={...part,debts:part.debts.map(x=>({...x,payments:[]}))};expect(capitalRemainder(undo)).toBe(130000);
  });
  it('does not retroactively turn legacy capital-account expenses into loans',()=>{
    const d=validateData({...base(),movements:[expense]});expect(capitalRemainder(d)).toBe(150000);expect(d.debts).toEqual([]);
    expect(saveMovement(d,{...expense,title:'Переименован'},false).debts).toEqual([]);
    const hand=saveMovement(base(),{...expense,accountId:'h'},false);expect(capitalRemainder(hand)).toBe(150000);expect(roleBalance(hand,'hand')).toBe(-20000);
  });
  it('edits linked amount without duplicate debts and atomically removes an unpaid pair',()=>{
    const d=saveMovement(base(),expense,true),edited=validateData(saveMovement(d,{...expense,amountKopecks:30000},true));expect(edited.debts).toHaveLength(1);expect(edited.debts[0].id).toBe(d.debts[0].id);expect(edited.debts[0].principalKopecks).toBe(30000);expect(capitalRemainder(edited)).toBe(120000);
    const removed=validateData(removeMovement(edited,'e'));expect(removed.debts).toEqual([]);expect(removed.movements).toEqual([]);expect(capitalRemainder(removed)).toBe(150000);
    const other=validateData(saveMovement(d,{...expense,accountId:'h'},false));expect(other.debts).toEqual([]);expect(capitalRemainder(other)).toBe(150000);
  });
  it('rejects self repayments, orphan pairs, overpayments, destructive edits and deletion with repayments',()=>{
    const d=saveMovement(base(),expense,true),paid=pay(d);
    expect(()=>removeMovement(paid,'e')).toThrow('Сначала');expect(()=>saveMovement(paid,{...expense,amountKopecks:4000},true)).toThrow('меньше');expect(()=>saveMovement(paid,{...expense,accountId:'h'},false)).toThrow('источник');
    for(const invalid of [{...d,debts:[]},{...d,movements:[]},pay(d,20001),{...paid,debts:paid.debts.map(x=>({...x,payments:x.payments.map(p=>({...p,accountId:'c'}))}))}])expect(()=>validateData(invalid)).toThrow();
  });
  it('keeps links and repayments across backup and bidirectional merge; independent records survive',()=>{
    const initial=base(),pc=stampChanges(initial,saveMovement(initial,expense,true),'pc',1000);
    const phone=stampChanges(pc,pay(pc),'phone',2000);
    const pcEdit=stampChanges(pc,saveMovement(pc,{...expense,id:'e2',accountId:'h'},false),'pc',3000);
    const merged=validateData(mergeData(pcEdit,phone));const other=validateData(mergeData(phone,pcEdit));
    expect(capitalRemainder(merged)).toBe(135000);expect(capitalRemainder(other)).toBe(135000);expect(merged.movements).toHaveLength(2);expect(merged.debts).toHaveLength(1);expect(parseBackup(serializeBackup(merged))).toEqual(merged);
    const removed=stampChanges(pc,removeMovement(pc,'e'),'pc',4000);expect(validateData(mergeData(pc,removed)).debts).toEqual([]);
  });
  it('stops a concurrent deletion from silently erasing a capital repayment',()=>{
    const initial=base(),created=stampChanges(initial,saveMovement(initial,expense,true),'pc',1000);
    const phone=stampChanges(created,pay(created),'phone',2000);
    const deleted=stampChanges(created,removeMovement(created,'e'),'pc',3000);
    expect(()=>mergeData(phone,deleted)).toThrow('Конфликт');expect(()=>mergeData(deleted,phone)).toThrow('Конфликт');
    const undone=stampChanges(phone,{...phone,debts:phone.debts.map(d=>({...d,payments:[]}))},'phone',4000);
    const removed=stampChanges(undone,removeMovement(undone,'e'),'phone',5000);
    expect(validateData(mergeData(phone,removed)).debts).toEqual([]);
  });
  it('does not change resale rules, ordinary debts or profit allocation',()=>{
    const d=saveMovement(base(),expense,true);const ordinary={id:'ordinary',title:'Обычный',direction:'i_owe' as const,counterparty:'Друг',principalKopecks:30000,date:'2026-11-10',dueDate:'',note:'',loanReceipt:'cash' as const,initialAccountId:'h',payments:[{id:'o',amountKopecks:10000,accountId:'h',date:'2026-11-11',note:''}]};
    const combined=validateData({...d,debts:[...d.debts,ordinary]});expect(capitalRemainder(combined)).toBe(capitalRemainder(d));expect(roleBalance(combined,'hand')).toBe(20000);
  });
});
