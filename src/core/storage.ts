import { accountKinds, emptyData, MAX_MONEY, MAX_PRODUCT_PHOTOS, MAX_PHOTO_CHARS, MAX_VOICE_CHARS, MAX_VOICE_SECONDS, MAX_SAVE_BYTES, validDate, debtPaid, productCost, workKinds, type AppData, type Account, type Income, type Debt, type Movement, type Payment, type WorkDetails, type WorkKind, type WorkPlan, type ResaleProduct, type Person } from './model';
const KEY = 'mi-kapital.v2.local';
const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, max = 200): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
const note = (x: unknown): x is string => typeof x === 'string' && x.length <= 2000;
const amount = (x: unknown, signed = false): x is number => typeof x === 'number' && Number.isSafeInteger(x) && Math.abs(x) <= MAX_MONEY && (signed || x >= 0);
const date = (x: unknown): x is string => typeof x === 'string' && validDate(x);
const timestamp = (x: unknown): x is string => typeof x === 'string' && x.length <= 40 && Number.isFinite(Date.parse(x));
const workKind = (x: unknown): x is WorkKind => typeof x === 'string' && (workKinds as readonly string[]).includes(x);
const workValues = (x: unknown): x is Record<string, string> => isObject(x) && Object.keys(x).length <= 20 && Object.entries(x).every(([key, value]) => key.length <= 40 && typeof value === 'string' && value.length <= 500);
const workDetails = (x: unknown): x is WorkDetails => isObject(x) && workKind(x.kind) && workValues(x.values);
const base64 = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max && /^[A-Za-z0-9+/]*={0,2}$/.test(x) && x.length % 4 === 0;
const photo = (x: unknown): x is string => {
  if (typeof x !== 'string' || x.length > MAX_PHOTO_CHARS) return false;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(x);
  return !!match && base64(match[2], MAX_PHOTO_CHARS);
};
const voiceMimes = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg'];
const voice = (x: unknown): boolean => {
  if (!isObject(x) || typeof x.mimeType !== 'string' || !voiceMimes.includes(x.mimeType) || typeof x.dataUrl !== 'string' || x.dataUrl.length > MAX_VOICE_CHARS || typeof x.durationSeconds !== 'number' || !Number.isFinite(x.durationSeconds) || x.durationSeconds <= 0 || x.durationSeconds > MAX_VOICE_SECONDS + 1) return false;
  const prefix = `data:${x.mimeType};base64,`;
  return x.dataUrl.startsWith(prefix) && base64(x.dataUrl.slice(prefix.length), MAX_VOICE_CHARS);
};
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
  if (!accounts.every(a => isObject(a) && text(a.id) && text(a.name, 80) && typeof a.kind === 'string' && Object.prototype.hasOwnProperty.call(accountKinds, a.kind) && amount(a.openingKopecks, true) && text(a.createdAt, 40) && (a.role === undefined || ['capital','debt','hand'].includes(String(a.role))))) return fail();
  const ids = new Set((accounts as Account[]).map(a => a.id));
  const liquidIds = new Set((accounts as Account[]).filter(a => a.kind === 'cash' || a.kind === 'bank').map(a => a.id));
  if (!unique(accounts as Account[]) || !unique(incomes as Income[]) || !unique(debts as Debt[]) || !unique(movements as Movement[])) return fail();
  const roles = (accounts as Account[]).map(a => a.role).filter(Boolean);
  if (new Set(roles).size !== roles.length) return fail();
  if (!incomes.every(i => isObject(i) && text(i.id) && text(i.title, 120) && text(i.category, 60) && amount(i.amountKopecks) && i.amountKopecks > 0 && date(i.date) && typeof i.accountId === 'string' && ids.has(i.accountId) && note(i.note) && (i.voice === undefined || voice(i.voice)) && (i.work === undefined || workDetails(i.work)) && (i.costKopecks === undefined || amount(i.costKopecks)))) return fail();
  if (!movements.every(m => isObject(m) && text(m.id) && text(m.title, 120) && ['expense', 'adjustment'].includes(String(m.kind)) && amount(m.amountKopecks, m.kind === 'adjustment') && (m.kind === 'adjustment' || m.amountKopecks > 0) && date(m.date) && typeof m.accountId === 'string' && ids.has(m.accountId) && note(m.note) && (m.voice === undefined || voice(m.voice)))) return fail();
  if (!debts.every(d => {
    if (!isObject(d) || !text(d.id) || !text(d.title, 120) || !text(d.counterparty, 100) || !['i_owe', 'owed_to_me'].includes(String(d.direction)) || !amount(d.principalKopecks) || d.principalKopecks <= 0 || !date(d.date) || !(d.dueDate === '' || date(d.dueDate)) || !note(d.note) || (d.voice !== undefined && !voice(d.voice)) || (d.kind !== undefined && !['business','consumer'].includes(String(d.kind))) || !(d.initialAccountId === null || typeof d.initialAccountId === 'string' && ids.has(d.initialAccountId)) || !Array.isArray(d.payments) || d.payments.length > 20000) return false;
    if (!d.payments.every((p: unknown) => isObject(p) && text(p.id) && amount(p.amountKopecks) && p.amountKopecks > 0 && date(p.date) && typeof p.accountId === 'string' && ids.has(p.accountId) && note(p.note) && (p.voice === undefined || voice(p.voice)))) return false;
    if (!unique(d.payments as Payment[]) || debtPaid(d as unknown as Debt) > d.principalKopecks) return false;
    return true;
  })) return fail();
  const plans = value.workPlans;
  if (plans !== undefined) {
    if (!Array.isArray(plans) || plans.length > 20000) return fail();
    if (!plans.every(p => isObject(p) && text(p.id) && workKind(p.kind) && text(p.title, 120) && (p.date === '' || date(p.date)) && amount(p.expectedKopecks) && note(p.note) && (p.voice === undefined || voice(p.voice)) && text(p.createdAt, 40) && (p.values === undefined || workValues(p.values)))) return fail();
    if (!unique(plans as WorkPlan[])) return fail();
  }
  const persons = value.people;
  if (persons !== undefined) {
    if (!Array.isArray(persons) || persons.length > 20000 || !unique(persons as Person[])) return fail();
    if (!persons.every(p => isObject(p) && text(p.id) && text(p.name, 100) && text(p.createdAt, 40))) return fail();
    if (new Set((persons as Person[]).map(p => p.name.trim().toLowerCase())).size !== persons.length) return fail();
  }
  const goods = value.products;
  if (goods !== undefined) {
    if (!Array.isArray(goods) || goods.length > 20000 || !unique(goods as ResaleProduct[])) return fail();
    if (!goods.every(p => {
      if (!isObject(p) || !text(p.id) || !text(p.kind, 120) || !date(p.purchaseDate) || !note(p.description) || !text(p.createdAt, 40) || (p.status !== undefined && !['preparing','listed'].includes(String(p.status))) || (p.statusChangedAt !== undefined && !timestamp(p.statusChangedAt)) || (p.preparingStartedAt !== undefined && !timestamp(p.preparingStartedAt)) || (p.listedAt !== undefined && !timestamp(p.listedAt)) || !Array.isArray(p.photos) || p.photos.length > MAX_PRODUCT_PHOTOS || !p.photos.every(photo)) return false;
      if (p.voice !== undefined && !voice(p.voice)) return false;
      if (!Array.isArray(p.funding) || p.funding.length > 2 || !p.funding.every(f => isObject(f) && ['capital', 'pocket'].includes(String(f.source)) && amount(f.amountKopecks) && f.amountKopecks > 0 && typeof f.accountId === 'string' && (f.source === 'pocket' ? f.accountId.length <= 100 : liquidIds.has(f.accountId))) || new Set(p.funding.map(f => f.source)).size !== p.funding.length || productCost(p as unknown as ResaleProduct) > MAX_MONEY) return false;
      if (p.investor !== undefined && (!isObject(p.investor) || !text(p.investor.name, 100) || !amount(p.investor.amountKopecks) || !Number.isInteger(p.investor.percentBasisPoints) || Number(p.investor.percentBasisPoints) < 0 || Number(p.investor.percentBasisPoints) > 10000 || !note(p.investor.terms))) return false;
      if (p.sale !== undefined && (!isObject(p.sale) || !amount(p.sale.priceKopecks) || !date(p.sale.date) || p.sale.date < p.purchaseDate || typeof p.sale.accountId !== 'string' || !liquidIds.has(p.sale.accountId))) return false;
      return true;
    })) return fail();
  }
  if (value.sync !== undefined) {
    const sync = value.sync;
    if (!isObject(sync) || !(sync.device === '' || text(sync.device, 100)) || !isObject(sync.clocks) || !isObject(sync.deleted)) return fail();
    for (const map of [sync.clocks, sync.deleted]) if (Object.keys(map).length > 100000 || !Object.entries(map).every(([key, clock]) => key.length <= 240 && typeof clock === 'string' && /^\d{13}-\d{6}-.{1,100}$/.test(clock))) return fail();
  }
  if (!amount(plan.income) || !amount(plan.expenses) || !amount(plan.debtPayment) || !amount(plan.goal) || !Number.isInteger(plan.months) || Number(plan.months) < 1 || Number(plan.months) > 60) return fail();
  const totalRecords = accounts.length + incomes.length + debts.length + movements.length + (debts as Debt[]).reduce((n, d) => n + d.payments.length, 0) + (Array.isArray(plans) ? plans.length : 0) + (Array.isArray(goods) ? goods.length : 0) + (Array.isArray(persons) ? persons.length : 0);
  if (totalRecords > 50000) return fail();
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_SAVE_BYTES) throw new Error('Данные с фото и аудио занимают больше 14 МБ. Экспортируйте копию и удалите ненужные вложения.');
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
