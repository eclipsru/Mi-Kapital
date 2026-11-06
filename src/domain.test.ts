import { describe, expect, it } from 'vitest';
import { consumerDebtRemaining, formatMoney, investorOutstanding, investorPayout, moneyToKopecks, resaleCosts, resaleProfit, type Entry } from './domain';

const resale = (data: Record<string, unknown>): Entry => ({
  id: 'test', type: 'resale', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', data,
});

describe('money helpers', () => {
  it('parses decimal rubles to integer kopecks', () => {
    expect(moneyToKopecks('1 250,50')).toBe(125050);
    expect(moneyToKopecks('0')).toBe(0);
    expect(moneyToKopecks('42.5')).toBe(4250);
  });
  it('rejects malformed or negative values', () => {
    expect(moneyToKopecks('-1')).toBeNull();
    expect(moneyToKopecks('1.001')).toBeNull();
    expect(moneyToKopecks('1,2,3')).toBeNull();
  });
  it('formats kopecks as Russian rubles', () => {
    expect(formatMoney(123450)).toContain('1 234,50');
  });
});

describe('consumer debt accounting', () => {
  it('subtracts partial payments and never returns a negative balance', () => {
    expect(consumerDebtRemaining(resale({ amountKopecks: 10000, payments: [{ amountKopecks: 2500 }] }))).toBe(7500);
    expect(consumerDebtRemaining(resale({ amountKopecks: 10000, payments: [{ amountKopecks: 12000 }] }))).toBe(0);
  });
});

describe('resale accounting', () => {
  it('separates purchase cost and additional investment', () => {
    expect(resaleCosts(resale({ purchaseKopecks: 100000, investmentKopecks: 25000 }))).toBe(125000);
  });
  it('calculates realized profit only after a sale', () => {
    expect(resaleProfit(resale({ sold: false, purchaseKopecks: 10000, investmentKopecks: 2000, saleKopecks: 20000 }))).toBe(0);
    expect(resaleProfit(resale({ sold: true, purchaseKopecks: 10000, investmentKopecks: 2000, saleKopecks: 20000 }))).toBe(8000);
    expect(resaleProfit(resale({ sold: true, purchaseKopecks: 10000, investmentKopecks: 2000, saleKopecks: 9000 }))).toBe(-3000);
  });
  it('uses the per-investment payout rule', () => {
    const item = resale({ sold: true, purchaseKopecks: 10000, investmentKopecks: 5000, saleKopecks: 25000, investorName: 'Инвестор', investorPercent: 20, investorRule: 'profit', manualPayoutKopecks: 0 });
    expect(investorPayout(item)).toBe(2000);
    expect(investorPayout(resale({ ...item.data, investorRule: 'capital' }))).toBe(1000);
    expect(investorPayout(resale({ ...item.data, investorRule: 'sale' }))).toBe(5000);
    expect(investorPayout(resale({ ...item.data, investorRule: 'manual', manualPayoutKopecks: 777 }))).toBe(777);
    expect(investorOutstanding(item)).toBe(7000);
    expect(investorOutstanding(resale({ ...item.data, investorPaid: true }))).toBe(0);
  });
});
