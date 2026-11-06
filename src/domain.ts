export type EntryType = 'resale' | 'job' | 'consumerDebt' | 'investor' | 'category' | 'payment';
export type InvestorRule = 'profit' | 'capital' | 'sale' | 'manual';

export interface WorkLine {
  id: string;
  name: string;
  amountKopecks: number;
}

export interface Entry {
  id: string;
  type: EntryType;
  createdAt: string;
  updatedAt: string;
  data: Record<string, unknown>;
}

export const createId = () => crypto.randomUUID();
export const today = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

export function moneyToKopecks(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized || !/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const [rubles, kopecks = ''] = normalized.split('.');
  const amount = Number(rubles) * 100 + Number(kopecks.padEnd(2, '0'));
  return Number.isSafeInteger(amount) ? amount : null;
}

export function formatMoney(kopecks: number): string {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(kopecks / 100);
}

export function str(data: Record<string, unknown>, key: string, fallback = ''): string {
  const value = data[key];
  return typeof value === 'string' ? value : fallback;
}

export function num(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function resaleCosts(entry: Entry): number {
  return num(entry.data, 'purchaseKopecks') + num(entry.data, 'investmentKopecks');
}

export function resaleProfit(entry: Entry): number {
  if (!entry.data.sold) return 0;
  return num(entry.data, 'saleKopecks') - resaleCosts(entry);
}

export function investorPayout(entry: Entry): number {
  if (!entry.data.sold) return 0;
  const capital = num(entry.data, 'investmentKopecks');
  const percent = num(entry.data, 'investorPercent');
  const rule = str(entry.data, 'investorRule', 'profit') as InvestorRule;
  const profit = Math.max(0, resaleProfit(entry));
  if (rule === 'manual') return num(entry.data, 'manualPayoutKopecks');
  if (rule === 'capital') return Math.round(capital * percent / 100);
  if (rule === 'sale') return Math.round(num(entry.data, 'saleKopecks') * percent / 100);
  return Math.round(profit * percent / 100);
}

export function consumerDebtPaid(entry: Entry): number {
  if (!Array.isArray(entry.data.payments)) return 0;
  return (entry.data.payments as Array<{ amountKopecks?: unknown }>).reduce((sum, payment) => sum + (typeof payment.amountKopecks === 'number' && Number.isSafeInteger(payment.amountKopecks) ? payment.amountKopecks : 0), 0);
}

export function consumerDebtRemaining(entry: Entry): number {
  return Math.max(0, num(entry.data, 'amountKopecks') - consumerDebtPaid(entry));
}

export function investorOutstanding(entry: Entry): number {
  if (entry.type !== 'resale' || !str(entry.data, 'investorName') || entry.data.investorPaid) return 0;
  return num(entry.data, 'investmentKopecks') + investorPayout(entry);
}

export function entryAmount(entry: Entry): number {
  if (entry.type === 'job') return num(entry.data, 'amountKopecks');
  if (entry.type === 'resale' && entry.data.sold) return resaleProfit(entry);
  return 0;
}
