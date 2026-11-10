export type AccountKind = 'cash' | 'bank' | 'investment' | 'other';
export type DebtDirection = 'i_owe' | 'owed_to_me';
export type DebtKind = 'business' | 'consumer';
export const debtKindLabels: Record<DebtKind, string> = { business: 'На дело', consumer: 'Потребительские' };
export type MovementKind = 'expense' | 'adjustment';
export type AccountRole = 'capital' | 'debt' | 'hand';
export interface Account { id: string; name: string; kind: AccountKind; openingKopecks: number; createdAt: string; role?: AccountRole }
export interface Person { id: string; name: string; createdAt: string }
export interface Income { id: string; title: string; category: string; amountKopecks: number; date: string; accountId: string; note: string; voice?: VoiceNote; work?: WorkDetails; costKopecks?: number }
export interface Payment { id: string; amountKopecks: number; date: string; accountId: string; note: string; voice?: VoiceNote }
export interface Debt { id: string; title: string; counterparty: string; direction: DebtDirection; principalKopecks: number; date: string; dueDate: string; note: string; voice?: VoiceNote; kind?: DebtKind; initialAccountId: string | null; payments: Payment[] }
export interface Movement { id: string; kind: MovementKind; title: string; amountKopecks: number; date: string; accountId: string; note: string; voice?: VoiceNote }
export interface Plan { income: number; expenses: number; debtPayment: number; months: number; goal: number }
export interface WorkPlan { id: string; kind: WorkKind; title: string; date: string; expectedKopecks: number; note: string; voice?: VoiceNote; createdAt: string; values?: Record<string, string> }
export type FundingSource = 'capital' | 'pocket';
export interface ProductFunding { source: FundingSource; accountId: string; amountKopecks: number }
export interface Investor { name: string; amountKopecks: number; percentBasisPoints: number; terms: string }
export interface VoiceNote { mimeType: string; dataUrl: string; durationSeconds: number }
export interface ProductSale { priceKopecks: number; date: string; accountId: string }
export type ProductStatus = 'preparing' | 'listed';
export interface ResaleProduct { id: string; kind: string; purchaseDate: string; funding: ProductFunding[]; description: string; photos: string[]; voice?: VoiceNote; investor?: Investor; sale?: ProductSale; createdAt: string; status?: ProductStatus; statusChangedAt?: string; preparingStartedAt?: string; listedAt?: string }
export interface AppData { schemaVersion: 1; accounts: Account[]; incomes: Income[]; debts: Debt[]; movements: Movement[]; plan: Plan; updatedAt: string; sync?: import('./sync').SyncMetadata; workPlans?: WorkPlan[]; products?: ResaleProduct[]; people?: Person[] }
export interface LedgerItem { id: string; type: 'income' | 'expense' | 'adjustment' | 'debt' | 'payment' | 'product-purchase' | 'product-sale'; title: string; subtitle: string; date: string; amount: number; accountId: string | null; debtId?: string; positive: boolean }
export const MAX_MONEY = 100_000_000_000_00; // 100 billion rubles, in kopecks
export const PERSONAL_SHARE_BPS = 1500;
export const MAX_PRODUCT_PHOTOS = 4;
export const MAX_PHOTO_CHARS = 350_000;
export const MAX_VOICE_CHARS = 1_500_000;
export const MAX_VOICE_SECONDS = 90;
export const MAX_SAVE_BYTES = 14_000_000;
export const productKinds = ['Телефон', 'Ноутбук', 'Комплектующие', 'Инструмент', 'Автозапчасти', 'Мебель', 'Одежда', 'Другое'];
export const fundingLabels: Record<FundingSource, string> = { capital: 'Капитал', pocket: 'Из кармана' };
export const products = (data: AppData): ResaleProduct[] => data.products ?? [];
export const people = (data: AppData): Person[] => data.people ?? [];
export const accountRoles: Record<AccountRole, string> = { capital: 'Капитал · 15%', hand: 'На руки · 70%', debt: 'На долги · 15%' };
export const accountRoleOrder: AccountRole[] = ['capital', 'hand', 'debt'];
export const productStatusLabels: Record<ProductStatus | 'sold', string> = { preparing: 'На подготовке', listed: 'На продаже', sold: 'Продан' };
export const roleAccount = (data: AppData, role: AccountRole) => data.accounts.find(a => a.role === role);
export const productStatus = (p: ResaleProduct): ProductStatus | 'sold' => p.sale ? 'sold' : p.status ?? 'preparing';
// «Из кармана» входит в цену покупки, активы и прибыль, но не списывается ни с одного счёта.
// Со счетов списывается только часть «Капитал»; при продаже вся цена покупки возвращается на выбранный счёт.
export const deductedFunding = (product: ResaleProduct) => product.funding.filter(f => f.source === 'capital');
export const productCost = (product: ResaleProduct) => sum(product.funding.map(f => f.amountKopecks));
export const capitalFundingAvailable = (data: AppData, editing?: ResaleProduct) => capitalRemainder(data) + (editing ? sum(deductedFunding(editing).map(f => f.amountKopecks)) : 0);
// Exact integer rounding: percentages are basis points (15% = 1500, 12.5% = 1250).
export function shareKopecks(amountKopecks: number, basisPoints: number): number {
  if (!Number.isSafeInteger(amountKopecks) || amountKopecks < 0 || !Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) throw new Error('Некорректная сумма или процент');
  return Number((BigInt(amountKopecks) * BigInt(basisPoints) + 5000n) / 10000n);
}
export function parsePercent(value: string): number | null {
  const clean = value.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ''] = clean.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return result <= 10000 ? result : null;
}
export function saleBreakdown(product: ResaleProduct) {
  const cost = productCost(product);
  const revenue = product.sale?.priceKopecks ?? 0;
  const profit = revenue - cost;
  const investorKopecks = product.sale ? shareKopecks(Math.max(0, profit), product.investor?.percentBasisPoints ?? 0) : 0;
  const personalProfit = profit - investorKopecks;
  const earnedKopecks = shareKopecks(Math.max(0, personalProfit), PERSONAL_SHARE_BPS);
  // A loss reduces available money by the full loss, not merely by 15% of it.
  const returnedKopecks = !product.sale ? 0 : profit < 0 ? revenue : cost + earnedKopecks;
  const remainderKopecks = Math.max(0, personalProfit) - earnedKopecks;
  return { cost, revenue, profit, investorKopecks, personalProfit, earnedKopecks, returnedKopecks, remainderKopecks };
}
export const inventoryProducts = (data: AppData) => products(data).filter(p => !p.sale);
export const soldProducts = (data: AppData, month = '') => products(data).filter(p => p.sale && (!month || monthKey(p.sale.date) === month));
export const inventoryValue = (data: AppData) => sum(inventoryProducts(data).map(productCost));
// На странице перепродаж показываем все вложения в непроданные товары, включая справочную сумму инвестора.
export const resaleInventoryValue = (data: AppData) => sum(inventoryProducts(data).map(p => productCost(p) + (p.investor?.amountKopecks ?? 0)));
export const jobNetProfit = (i: Income) => i.amountKopecks - (i.costKopecks ?? 0);
export const resaleNetProfit = (data: AppData, month = '') => sum(soldProducts(data, month).map(p => saleBreakdown(p).personalProfit));
export function jobEarnings(data: AppData, month = ''): number { return sum(oddJobIncomes(data).filter(i => !month || monthKey(i.date) === month).map(jobNetProfit)); }
export const resaleEarnings = resaleNetProfit;
export function earnedIncome(data: AppData, month = ''): number { return resaleNetProfit(data, month) + jobEarnings(data, month); }
export interface ProfitAllocation { capital: number; debt: number; hand: number; total: number }
export function profitAllocation(profit: number): ProfitAllocation {
  const positive = Math.max(0, profit);
  const capital = shareKopecks(positive, PERSONAL_SHARE_BPS);
  const debt = shareKopecks(positive, PERSONAL_SHARE_BPS);
  return { capital, debt, hand: positive - capital - debt, total: positive };
}
export function allocations(data: AppData, month = ''): ProfitAllocation {
  const events = [
    ...soldProducts(data, month).map(p => saleBreakdown(p).personalProfit),
    ...oddJobIncomes(data).filter(i => !month || monthKey(i.date) === month).map(jobNetProfit),
  ];
  return events.reduce((total, profit) => { const a = profitAllocation(profit); return { capital: total.capital + a.capital, debt: total.debt + a.debt, hand: total.hand + a.hand, total: total.total + a.total }; }, { capital: 0, debt: 0, hand: 0, total: 0 });
}
export function returnedPrincipal(product: ResaleProduct): number {
  if (!product.sale) return 0;
  const cost = productCost(product);
  return product.sale.priceKopecks < cost ? product.sale.priceKopecks : cost;
}
// Остаток капитала: денежные счета без полной выручки шабашек, но с 15% их чистой прибыли.
// Покупки товаров уже уменьшают денежные счета, продажа возвращает тело покупки и 15% прибыли.
// Обычные расходы, корректировки и прежние поступления остаются в расчёте; долги не вычитаются повторно.
export function capitalRemainder(data: AppData, ignoreDebts = false): number {
  const liquidIds = new Set(liquidAccounts(data).map(a => a.id));
  const liquid = sum(liquidAccounts(data).map(a => accountBalance(data, a.id, ignoreDebts)));
  const jobs = oddJobIncomes(data).filter(i => liquidIds.has(i.accountId));
  const jobReceipts = sum(jobs.map(i => i.amountKopecks));
  const jobCapital = sum(jobs.map(i => profitAllocation(jobNetProfit(i)).capital));
  return liquid - jobReceipts + jobCapital;
}
export interface StatusDurations { preparingMs: number; listedMs: number; soldMs: number }
export function statusDurations(product: ResaleProduct, now = Date.now()): StatusDurations {
  const created = Date.parse(product.preparingStartedAt ?? product.createdAt) || Date.parse(`${product.purchaseDate}T12:00:00`) || now;
  const listed = product.listedAt ? Date.parse(product.listedAt) : product.status === 'listed' && product.statusChangedAt ? Date.parse(product.statusChangedAt) : NaN;
  const sold = product.sale ? Date.parse(`${product.sale.date}T12:00:00`) : NaN;
  const endPrep = Number.isFinite(listed) ? listed : Number.isFinite(sold) ? sold : now;
  const endListed = Number.isFinite(sold) ? sold : now;
  return {
    preparingMs: Math.max(0, endPrep - created),
    listedMs: Number.isFinite(listed) ? Math.max(0, endListed - listed) : 0,
    soldMs: Number.isFinite(sold) ? Math.max(0, now - sold) : 0,
  };
}
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'меньше минуты';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} д ${hours} ч` : `${days} д`;
  if (hours > 0) return mins > 0 ? `${hours} ч ${mins} мин` : `${hours} ч`;
  return `${mins} мин`;
}
export const liquidAccounts = (data: AppData) => data.accounts.filter(a => a.kind === 'cash' || a.kind === 'bank');
export const incomeCategories = ['Перепродажи', 'Шабашки'] as const;
export type IncomeCategory = typeof incomeCategories[number];
// Income.category stays a string so older records and backups remain readable.
// Preserve a legacy category as an editing option without silently reclassifying it.
export function incomeCategoryOptions(existing?: string): string[] {
  return existing && !incomeCategories.includes(existing as IncomeCategory) ? [existing, ...incomeCategories] : [...incomeCategories];
}
export const workKinds = ['Ремонт', 'Отделка', 'Электрика', 'Сантехника', 'Сборка мебели', 'Другое'] as const;
export type WorkKind = typeof workKinds[number];
export interface WorkFieldConfig { key: string; label: string; placeholder?: string; required?: boolean }
export interface WorkDetails { kind: WorkKind; values: Record<string, string> }
// Базовые виды шабашек. Набор полей можно расширить позже без смены формата данных.
export const workKindFields: Record<WorkKind, WorkFieldConfig[]> = {
  'Ремонт': [
    { key: 'object', label: 'Что ремонтировали', placeholder: 'Например, стиральная машина', required: true },
    { key: 'scope', label: 'Что сделано', placeholder: 'Замена подшипников, диагностика…' },
    { key: 'materials', label: 'Материалы / запчасти', placeholder: 'Что куплено для работы' },
  ],
  'Отделка': [
    { key: 'object', label: 'Объект', placeholder: 'Квартира, комната, фасад…', required: true },
    { key: 'scope', label: 'Вид отделки', placeholder: 'Покраска, плитка, штукатурка…' },
    { key: 'volume', label: 'Объём', placeholder: 'Например, 18 м²' },
  ],
  'Электрика': [
    { key: 'object', label: 'Объект', placeholder: 'Дом, гараж, щиток…', required: true },
    { key: 'scope', label: 'Что сделано', placeholder: 'Проводка, розетки, свет…' },
    { key: 'points', label: 'Точек / приборов', placeholder: 'Например, 6 розеток' },
  ],
  'Сантехника': [
    { key: 'object', label: 'Объект', placeholder: 'Ванная, кухня, стояк…', required: true },
    { key: 'scope', label: 'Что сделано', placeholder: 'Установка смесителя, труб…' },
    { key: 'points', label: 'Приборов / точек', placeholder: 'Например, 2 прибора' },
  ],
  'Сборка мебели': [
    { key: 'object', label: 'Что собрали', placeholder: 'Шкаф, кухня, стол…', required: true },
    { key: 'quantity', label: 'Количество', placeholder: 'Например, 1 шкаф' },
    { key: 'scope', label: 'Особенности', placeholder: 'Подгонка, фурнитура, вырезы…' },
  ],
  'Другое': [
    { key: 'description', label: 'Описание работы', placeholder: 'Что именно было сделано', required: true },
  ],
};
export function cleanWorkValues(kind: WorkKind, values: Record<string, string>): Record<string, string> {
  const allowed = new Set(workKindFields[kind].map(f => f.key));
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => allowed.has(key) && value.trim()).map(([key, value]) => [key, value.trim().slice(0, 500)]));
}
export function workTitle(kind: WorkKind, values: Record<string, string>): string {
  const first = workKindFields[kind].map(f => values[f.key]?.trim()).find(Boolean);
  return (first ? `${kind}: ${first}` : kind).slice(0, 120);
}
export const workPlans = (data: AppData): WorkPlan[] => data.workPlans ?? [];
export const oddJobIncomes = (data: AppData): Income[] => data.incomes.filter(i => i.category === 'Шабашки');
export const accountKinds: Record<AccountKind, string> = { cash: 'Наличные', bank: 'Банковский счёт', investment: 'Инвестиции', other: 'Другой актив' };
export const uid = () => crypto.randomUUID();
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const emptyData = (): AppData => ({ schemaVersion: 1, accounts: [], incomes: [], debts: [], movements: [], workPlans: [], products: [], people: [], plan: { income: 0, expenses: 0, debtPayment: 0, months: 12, goal: 0 }, updatedAt: new Date().toISOString() });
export const money = (value: number, decimals = false) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: decimals || value % 100 !== 0 ? 2 : 0, maximumFractionDigits: 2 }).format(value / 100);
export const purchasePriceLabel = (value: number) => value === 0 ? 'Бесплатно' : money(value);
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
export function accountBalance(data: AppData, accountId: string, ignoreDebts = false): number {
  const account = data.accounts.find(a => a.id === accountId);
  if (!account) return 0;
  let balance = account.openingKopecks;
  for (const item of data.incomes) if (item.accountId === accountId) balance += item.amountKopecks;
  for (const item of data.movements) if (item.accountId === accountId) balance += item.kind === 'expense' ? -item.amountKopecks : item.amountKopecks;
  for (const product of products(data)) {
    for (const funding of deductedFunding(product)) if (funding.accountId === accountId) balance -= funding.amountKopecks;
    if (product.sale?.accountId === accountId) balance += saleBreakdown(product).returnedKopecks;
  }
  if (!ignoreDebts) for (const debt of data.debts) {
    if (debt.initialAccountId === accountId) balance += debt.direction === 'i_owe' ? debt.principalKopecks : -debt.principalKopecks;
    for (const payment of debt.payments) if (payment.accountId === accountId) balance += debt.direction === 'i_owe' ? -payment.amountKopecks : payment.amountKopecks;
  }
  return balance;
}
export function totals(data: AppData) {
  const assets = inventoryValue(data);
  const remainder = capitalRemainder(data);
  const payable = sum(data.debts.filter(d => d.direction === 'i_owe').map(debtRemaining));
  // Total capital ignores debts completely: neither new, old, added nor repaid debts
  // touch it. Debt cash flows (initial principal and payments) are stripped out, so
  // borrowing or repaying never changes total capital. The 15% capital share of each
  // net profit is already inside the debt-free remainder: a sale returns cost + 15%
  // to the account, and odd-job receipts are replaced by their 15% share.
  const totalCapital = assets + capitalRemainder(data, true);
  const receivable = sum(data.debts.filter(d => d.direction === 'owed_to_me').map(debtRemaining));
  const month = monthKey(today());
  const incomeMonth = earnedIncome(data, month);
  const expenseMonth = sum(data.movements.filter(m => m.kind === 'expense' && monthKey(m.date) === month).map(m => m.amountKopecks));
  return { onHand: remainder, remainder, totalCapital, assets, liquidBalance: sum(liquidAccounts(data).map(a => accountBalance(data, a.id))), payable, receivable, incomeMonth, expenseMonth, incomeTotal: earnedIncome(data), resaleIncomeMonth: resaleEarnings(data, month), jobIncomeMonth: jobEarnings(data, month), allocations: allocations(data) };
}
export function accountReferenced(data: AppData, id: string): boolean {
  return data.incomes.some(i => i.accountId === id) || data.movements.some(m => m.accountId === id) || data.debts.some(d => d.initialAccountId === id || d.payments.some(p => p.accountId === id)) || products(data).some(p => deductedFunding(p).some(f => f.accountId === id) || p.sale?.accountId === id);
}
export function ledger(data: AppData): LedgerItem[] {
  const accountName = (id: string | null) => data.accounts.find(a => a.id === id)?.name ?? 'Уже учтён в капитале';
  const items: LedgerItem[] = data.incomes.map(i => ({ id: i.id, type: 'income', title: i.title, subtitle: `${i.category} · ${accountName(i.accountId)}`, date: i.date, amount: i.amountKopecks, accountId: i.accountId, positive: true }));
  for (const product of products(data)) {
    const cost = productCost(product);
    items.push({ id: `purchase-${product.id}`, type: 'product-purchase', title: `Покупка: ${product.kind}`, subtitle: product.funding.length ? product.funding.map(f => f.source === 'pocket' ? `${fundingLabels.pocket} · без списания` : `${fundingLabels.capital} · ${accountName(f.accountId)}`).join(' + ') : 'Бесплатно · без списания', date: product.purchaseDate, amount: cost, accountId: deductedFunding(product)[0]?.accountId ?? null, positive: false });
    if (product.sale) items.push({ id: `sale-${product.id}`, type: 'product-sale', title: `Продажа: ${product.kind}`, subtitle: `Возврат покупки + распределение прибыли · ${accountName(product.sale.accountId)}`, date: product.sale.date, amount: saleBreakdown(product).returnedKopecks, accountId: product.sale.accountId, positive: true });
  }
  for (const m of data.movements) items.push({ id: m.id, type: m.kind, title: m.title, subtitle: `${m.kind === 'expense' ? 'Расход' : 'Корректировка'} · ${accountName(m.accountId)}`, date: m.date, amount: m.amountKopecks, accountId: m.accountId, positive: m.kind === 'adjustment' && m.amountKopecks >= 0 });
  for (const d of data.debts) {
    if (d.initialAccountId) items.push({ id: `initial-${d.id}`, type: 'debt', title: d.direction === 'i_owe' ? `Получен заём: ${d.title}` : `Выдан заём: ${d.title}`, subtitle: `${d.counterparty} · ${accountName(d.initialAccountId)}`, date: d.date, amount: d.principalKopecks, accountId: d.initialAccountId, debtId: d.id, positive: d.direction === 'i_owe' });
    for (const p of d.payments) items.push({ id: p.id, type: 'payment', title: `${d.direction === 'i_owe' ? 'Погашение' : 'Возврат'}: ${d.title}`, subtitle: `${d.counterparty} · ${accountName(p.accountId)}`, date: p.date, amount: p.amountKopecks, accountId: p.accountId, debtId: d.id, positive: d.direction === 'owed_to_me' });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
export function monthlySeries(data: AppData, count = 6) {
  return lastMonths(count).map(key => ({ key, income: earnedIncome(data, key), expense: sum(data.movements.filter(m => m.kind === 'expense' && monthKey(m.date) === key).map(m => m.amountKopecks)) }));
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
  const goalMonths = free > 0 && plan.goal > t.onHand ? Math.ceil((plan.goal - t.onHand) / free) : plan.goal > 0 && plan.goal <= t.onHand ? 0 : null;
  const forecast = Array.from({ length: plan.months + 1 }, (_, month) => ({ month, value: t.onHand + free * month }));
  return { ...t, free, afterDebt, savingsRate, debtMonths, goalMonths, forecast, projected: t.onHand + free * plan.months };
}
