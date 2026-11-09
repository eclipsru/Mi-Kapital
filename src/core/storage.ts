import { accountKinds, emptyData, MAX_MONEY, validDate, debtPaid, type AppData, type Account, type Income, type Debt, type Movement, type Payment } from './model';
const KEY = 'mi-kapital.v2.local';
const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, max = 200): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
const note = (x: unknown): x is string => typeof x === 'string' && x.length <= 2000;
const amount = (x: unknown, signed = false): x is number => typeof x === 'number' && Number.isSafeInteger(x) && Math.abs(x) <= MAX_MONEY && (signed || x >= 0);
const date = (x: unknown): x is string => typeof x === 'string' && validDate(x);
function unique<T extends { id: string }>(items: T[]): boolean { return new Set(items.map(i => i.id)).size === items.length; }
export function validateData(value: unknown): AppData {
  const fail = () => { throw new Error('Файл повреждён или имеет неподдерживаемый формат. Нужна резервная копия «Мой капитал» версии 2.'); };
  if (!isObject(value) || value.schemaVersion !== 1) return fail();
  if (![value.accounts, value.incomes, value.debts, value.movements].every(a => Array.isArray(a) && a.length <= 20000) || !isObject(value.plan)) return fail();
  const accounts = value.accounts as unknown[];
  const incomes = value.incomes as unknown[];
  const debts = value.debts as unknown[];
  const movements = value.movements as unknown[];
  const plan = value.plan;
  if (!accounts.every(a => isObject(a) && text(a.id) && text(a.name, 80) && typeof a.kind === 'string' && Object.prototype.hasOwnProperty.call(accountKinds, a.kind) && amount(a.openingKopecks, true) && text(a.createdAt, 40))) return fail();
  const ids = new Set((accounts as Account[]).map(a => a.id));
  if (!unique(accounts as Account[]) || !unique(incomes as Income[]) || !unique(debts as Debt[]) || !unique(movements as Movement[])) return fail();
  if (!incomes.every(i => isObject(i) && text(i.id) && text(i.title, 120) && text(i.category, 60) && amount(i.amountKopecks) && i.amountKopecks > 0 && date(i.date) && typeof i.accountId === 'string' && ids.has(i.accountId) && note(i.note))) return fail();
  if (!movements.every(m => isObject(m) && text(m.id) && text(m.title, 120) && ['expense', 'adjustment'].includes(String(m.kind)) && amount(m.amountKopecks, m.kind === 'adjustment') && (m.kind === 'adjustment' || m.amountKopecks > 0) && date(m.date) && typeof m.accountId === 'string' && ids.has(m.accountId) && note(m.note))) return fail();
  if (!debts.every(d => {
    if (!isObject(d) || !text(d.id) || !text(d.title, 120) || !text(d.counterparty, 100) || !['i_owe', 'owed_to_me'].includes(String(d.direction)) || !amount(d.principalKopecks) || d.principalKopecks <= 0 || !date(d.date) || !(d.dueDate === '' || date(d.dueDate)) || !note(d.note) || !(d.initialAccountId === null || typeof d.initialAccountId === 'string' && ids.has(d.initialAccountId)) || !Array.isArray(d.payments) || d.payments.length > 20000) return false;
    if (!d.payments.every((p: unknown) => isObject(p) && text(p.id) && amount(p.amountKopecks) && p.amountKopecks > 0 && date(p.date) && typeof p.accountId === 'string' && ids.has(p.accountId) && note(p.note))) return false;
    if (!unique(d.payments as Payment[]) || debtPaid(d as unknown as Debt) > d.principalKopecks) return false;
    return true;
  })) return fail();
  if (!amount(plan.income) || !amount(plan.expenses) || !amount(plan.debtPayment) || !amount(plan.goal) || !Number.isInteger(plan.months) || Number(plan.months) < 1 || Number(plan.months) > 60) return fail();
  const totalRecords = accounts.length + incomes.length + debts.length + movements.length + (debts as Debt[]).reduce((n, d) => n + d.payments.length, 0);
  if (totalRecords > 50000) return fail();
  return JSON.parse(JSON.stringify(value)) as AppData;
}
export function parseBackup(raw: string): AppData {
  if (raw.length > 15_000_000) throw new Error('Файл слишком большой. Максимум — 15 МБ.');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Не удалось прочитать JSON. Выберите резервную копию приложения.'); }
  if (isObject(parsed) && parsed.format === 'mi-kapital-backup') return validateData(parsed.data);
  return validateData(parsed);
}
export function serializeBackup(data: AppData): string { return JSON.stringify({ format: 'mi-kapital-backup', exportedAt: new Date().toISOString(), data }, null, 2); }
export function loadLocal(): AppData {
  const raw = localStorage.getItem(KEY);
  if (!raw) return emptyData();
  try { return validateData(JSON.parse(raw)); } catch { throw new Error('Локальные данные повреждены. Импорт резервной копии доступен в настройках.'); }
}
export function saveLocal(data: AppData) { localStorage.setItem(KEY, JSON.stringify(data)); }
export function downloadBackup(data: AppData) {
  const url = URL.createObjectURL(new Blob([serializeBackup(data)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `Мой-капитал-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
