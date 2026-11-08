export type AccountKind = 'cash' | 'bank' | 'investment' | 'other';
export type DebtDirection = 'i_owe' | 'owed_to_me';
export type MovementKind = 'expense' | 'adjustment';
export interface Account { id: string; name: string; kind: AccountKind; openingKopecks: number; createdAt: string }
export interface Income { id: string; title: string; category: string; amountKopecks: number; date: string; accountId: string; note: string }
export interface Payment { id: string; amountKopecks: number; date: string; accountId: string; note: string }
export interface Debt { id: string; title: string; counterparty: string; direction: DebtDirection; principalKopecks: number; date: string; dueDate: string; note: string; initialAccountId: string | null; payments: Payment[] }
export interface Movement { id: string; kind: MovementKind; title: string; amountKopecks: number; date: string; accountId: string; note: string }
export interface Plan { income: number; expenses: number; debtPayment: number; months: number; goal: number }
export interface AppData { schemaVersion: 1; accounts: Account[]; incomes: Income[]; debts: Debt[]; movements: Movement[]; plan: Plan; updatedAt: string }
export interface LedgerItem { id: string; type: 'income' | 'expense' | 'adjustment' | 'debt' | 'payment'; title: string; subtitle: string; date: string; amount: number; accountId: string | null; debtId?: string; positive: boolean }
export const MAX_MONEY = 100_000_000_000_00; // 100 billion rubles, in kopecks
export const categories = ['Зарплата', 'Подработка', 'Бизнес', 'Инвестиции', 'Подарок', 'Другое'];
export const accountKinds: Record<AccountKind, string> = { cash: 'Наличные', bank: 'Банковский счёт', investment: 'Инвестиции', other: 'Другой актив' };
export const uid = () => crypto.randomUUID();
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const emptyData = (): AppData => ({ schemaVersion: 1, accounts: [], incomes: [], debts: [], movements: [], plan: { income: 0, expenses: 0, debtPayment: 0, months: 12, goal: 0 }, updatedAt: new Date().toISOString() });
export const money = (value: number, decimals = false) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: decimals || value % 100 !== 0 ? 2 : 0, maximumFractionDigits: 2 }).format(value / 100);
export const number = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
export const inputMoney = (value: number) => (value / 100).toFixed(2).replace('.', ',');
export function parseMoney(text: string, signed = false): number | null {
  const clean = text.trim().replace(/\s|\u00a0/g, '').replace(',', '.');
  if (!(signed ? /^-?\d{1,12}(\.\d{1,2})?$/ : /^\d{1,12}(\.\d{1,2})?$/).test(clean)) return null;
  const negative = clean.startsWith('-');
  const [whole, fraction = ''] = clean.replace('-', '').split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) && result <= MAX_MONEY ? (negative ? -result : result) : null;
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= '2200-12-31';
}
export const formatDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
export const monthKey = (date: string) => date.slice(0, 7);
export const monthLabel = (key: string) => new Date(`${key}-01T12:00:00`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
export function lastMonths(count: number, end = today()): string[] {
  const [year, month] = end.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => { const d = new Date(year, month - count + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
}
export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
export const debtPaid = (debt: Debt) => sum(debt.payments.map(p => p.amountKopecks));
export const debtRemaining = (debt: Debt) => debt.principalKopecks - debtPaid(debt);
export function accountBalance(data: AppData, accountId: string): number {
  const account = data.accounts.find(a => a.id === accountId);
  if (!account) return 0;
  let balance = account.openingKopecks;
  for (const item of data.incomes) if (item.accountId === accountId) balance += item.amountKopecks;
  for (const item of data.movements) if (item.accountId === accountId) balance += item.kind === 'expense' ? -item.amountKopecks : item.amountKopecks;
  for (const debt of data.debts) {
    if (debt.initialAccountId === accountId) balance += debt.direction === 'i_owe' ? debt.principalKopecks : -debt.principalKopecks;
    for (const payment of debt.payments) if (payment.accountId === accountId) balance += debt.direction === 'i_owe' ? -payment.amountKopecks : payment.amountKopecks;
  }
  return balance;
}
export function totals(data: AppData) {
  const assets = sum(data.accounts.map(a => accountBalance(data, a.id)));
  const payable = sum(data.debts.filter(d => d.direction === 'i_owe').map(debtRemaining));
  const receivable = sum(data.debts.filter(d => d.direction === 'owed_to_me').map(debtRemaining));
  const month = monthKey(today());
  const incomeMonth = sum(data.incomes.filter(i => monthKey(i.date) === month).map(i => i.amountKopecks));
  const expenseMonth = sum(data.movements.filter(m => m.kind === 'expense' && monthKey(m.date) === month).map(m => m.amountKopecks));
  return { assets, payable, receivable, net: assets + receivable - payable, incomeMonth, expenseMonth, incomeTotal: sum(data.incomes.map(i => i.amountKopecks)) };
}
export function accountReferenced(data: AppData, id: string): boolean {
  return data.incomes.some(i => i.accountId === id) || data.movements.some(m => m.accountId === id) || data.debts.some(d => d.initialAccountId === id || d.payments.some(p => p.accountId === id));
}
export function ledger(data: AppData): LedgerItem[] {
  const accountName = (id: string | null) => data.accounts.find(a => a.id === id)?.name ?? 'Уже учтён в капитале';
  const items: LedgerItem[] = data.incomes.map(i => ({ id: i.id, type: 'income', title: i.title, subtitle: `${i.category} · ${accountName(i.accountId)}`, date: i.date, amount: i.amountKopecks, accountId: i.accountId, positive: true }));
  for (const m of data.movements) items.push({ id: m.id, type: m.kind, title: m.title, subtitle: `${m.kind === 'expense' ? 'Расход' : 'Корректировка'} · ${accountName(m.accountId)}`, date: m.date, amount: m.amountKopecks, accountId: m.accountId, positive: m.kind === 'adjustment' && m.amountKopecks >= 0 });
  for (const d of data.debts) {
    if (d.initialAccountId) items.push({ id: `initial-${d.id}`, type: 'debt', title: d.direction === 'i_owe' ? `Получен заём: ${d.title}` : `Выдан заём: ${d.title}`, subtitle: `${d.counterparty} · ${accountName(d.initialAccountId)}`, date: d.date, amount: d.principalKopecks, accountId: d.initialAccountId, debtId: d.id, positive: d.direction === 'i_owe' });
    for (const p of d.payments) items.push({ id: p.id, type: 'payment', title: `${d.direction === 'i_owe' ? 'Погашение' : 'Возврат'}: ${d.title}`, subtitle: `${d.counterparty} · ${accountName(p.accountId)}`, date: p.date, amount: p.amountKopecks, accountId: p.accountId, debtId: d.id, positive: d.direction === 'owed_to_me' });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
export function monthlySeries(data: AppData, count = 6) {
  return lastMonths(count).map(key => ({ key, income: sum(data.incomes.filter(i => monthKey(i.date) === key).map(i => i.amountKopecks)), expense: sum(data.movements.filter(m => m.kind === 'expense' && monthKey(m.date) === key).map(m => m.amountKopecks)) }));
}
export function suggestPlan(data: AppData): Plan {
  const months = monthlySeries(data, 3);
  return { ...data.plan, income: Math.round(sum(months.map(m => m.income)) / 3), expenses: Math.round(sum(months.map(m => m.expense)) / 3) };
}
export function calculatePlan(data: AppData, plan: Plan) {
  const t = totals(data);
  const free = plan.income - plan.expenses;
  const afterDebt = free - plan.debtPayment;
  const savingsRate = plan.income > 0 ? free / plan.income * 100 : 0;
  const debtMonths = plan.debtPayment > 0 && t.payable > 0 ? Math.ceil(t.payable / plan.debtPayment) : t.payable === 0 ? 0 : null;
  const goalMonths = free > 0 && plan.goal > t.net ? Math.ceil((plan.goal - t.net) / free) : plan.goal > 0 && plan.goal <= t.net ? 0 : null;
  const forecast = Array.from({ length: plan.months + 1 }, (_, month) => ({ month, value: t.net + free * month }));
  return { ...t, free, afterDebt, savingsRate, debtMonths, goalMonths, forecast, projected: t.net + free * plan.months };
}
