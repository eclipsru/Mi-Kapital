import { emptyData, people, products, workPlans, type AppData } from './model';
import { SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config';

export interface SyncMetadata { device: string; clocks: Record<string, string>; deleted: Record<string, string> }
export interface SyncEnvelope { data: AppData; revision: number; deviceId: string }
export type SyncTransport = 'pc' | 'cloud' | 'offline';
export interface SyncStatus { transport: SyncTransport; state: 'idle' | 'syncing' | 'synced' | 'error'; message: string; lastSyncedAt?: string; pending: boolean }
export interface SyncConfig { lanEnabled: boolean; lanPort: number; lanToken: string; lanUrl: string; cloudEnabled: boolean; supabaseUrl: string; supabaseKey: string; email: string }
export function deviceId(): string { const key='mi-kapital.device-id'; let id=localStorage.getItem(key); if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);} return id; }
export const defaultSyncConfig = (): SyncConfig => ({ lanEnabled: true, lanPort: 47653, lanToken: '', lanUrl: '', cloudEnabled: false, supabaseUrl: SUPABASE_PROJECT_URL, supabaseKey: SUPABASE_PUBLISHABLE_KEY, email: '' });
const collections = ['accounts', 'incomes', 'debts', 'movements', 'products', 'people', 'workPlans'] as const;
type Collection = typeof collections[number];
type RecordWithId = { id: string };
const rows = (data: AppData, key: Collection): RecordWithId[] => key === 'products' ? products(data) : key === 'people' ? people(data) : key === 'workPlans' ? workPlans(data) : data[key];
const clockKey = (collection: string, id: string) => `${collection}/${id}`;
const maxClock = (a = '', b = '') => a > b ? a : b;
let sequence = 0;
let sequenceTimestamp = 0;
export function nextClock(device: string, previous: SyncMetadata | undefined, now = Date.now()): string {
  let last = now;
  for (const map of [previous?.clocks ?? {}, previous?.deleted ?? {}]) for (const value of Object.values(map)) last = Math.max(last, Number(value.slice(0, 13)) || 0);
  sequence = last === sequenceTimestamp ? sequence + 1 : 0;
  sequenceTimestamp = last;
  return `${String(last).padStart(13, '0')}-${String(sequence).padStart(6, '0')}-${device}`;
}
const comparable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(comparable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([k]) => k !== 'sync').sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${comparable(v)}`).join(',')}}`;
  return JSON.stringify(value);
};
export const sameData = (a: AppData, b: AppData) => comparable({ ...a, updatedAt: '' }) === comparable({ ...b, updatedAt: '' });
// Record-level last-writer-wins, with deletion tombstones. Offline edits on different
// records survive; a whole-file timestamp comparison would silently erase one of them.
export function stampChanges(before: AppData, after: AppData, device: string, now = Date.now()): AppData {
  const previous = before.sync ?? { device, clocks: {}, deleted: {} };
  const metadata: SyncMetadata = { device, clocks: { ...previous.clocks }, deleted: { ...previous.deleted } };
  const stamp = () => nextClock(device, metadata, now);
  for (const collection of collections) {
    const old = new Map(rows(before, collection).map(r => [r.id, r]));
    const next = new Map(rows(after, collection).map(r => [r.id, r]));
    for (const [id, record] of next) if (!old.has(id) || comparable(old.get(id)) !== comparable(record)) metadata.clocks[clockKey(collection, id)] = stamp();
    for (const id of old.keys()) if (!next.has(id)) metadata.deleted[clockKey(collection, id)] = stamp();
    if (collection === 'debts') {
      const oldPayments = new Map((before.debts ?? []).flatMap(d => d.payments.map(p => [`${d.id}/${p.id}`, p] as const)));
      const newPayments = new Map(after.debts.flatMap(d => d.payments.map(p => [`${d.id}/${p.id}`, p] as const)));
      for (const [id, p] of newPayments) if (!oldPayments.has(id) || comparable(oldPayments.get(id)) !== comparable(p)) metadata.clocks[`payments/${id}`] = stamp();
      for (const id of oldPayments.keys()) if (!newPayments.has(id)) metadata.deleted[`payments/${id}`] = stamp();
    }
  }
  if (comparable(before.plan) !== comparable(after.plan)) metadata.clocks.plan = stamp();
  return { ...after, sync: metadata };
}
function mergeRows(a: AppData, b: AppData, collection: Collection, ma: SyncMetadata, mb: SyncMetadata, metadata: SyncMetadata, preferRemote: boolean): RecordWithId[] {
  const leftRows = rows(a, collection), rightRows = rows(b, collection);
  const all = new Map([...leftRows, ...rightRows].map(r => [r.id, r]));
  return [...all.entries()].flatMap(([id, record]) => {
    const key = clockKey(collection, id);
    const lc = ma.clocks[key] ?? '', rc = mb.clocks[key] ?? '';
    const clock = maxClock(lc, rc);
    if (metadata.deleted[key] && metadata.deleted[key] >= clock) return [];
    const left = leftRows.find(r => r.id === id), right = rightRows.find(r => r.id === id);
    const winner: RecordWithId = lc !== rc ? (lc > rc ? left ?? right : right ?? left) ?? record : left && right ? (preferRemote ? right : comparable(left) >= comparable(right) ? left : right) : record;
    return [winner];
  }).sort((x, y) => x.id.localeCompare(y.id));
}
// The paired PC is authoritative only for equal-clock/legacy ties; newer phone edits still win.
export function mergeData(a: AppData, b: AppData, preferRemote = false): AppData {
  const ma = a.sync ?? { device: '', clocks: {}, deleted: {} };
  const mb = b.sync ?? { device: '', clocks: {}, deleted: {} };
  const metadata: SyncMetadata = { device: ma.device || mb.device, clocks: { ...ma.clocks }, deleted: { ...ma.deleted } };
  for (const [key, value] of Object.entries(mb.clocks)) metadata.clocks[key] = maxClock(metadata.clocks[key], value);
  for (const [key, value] of Object.entries(mb.deleted)) metadata.deleted[key] = maxClock(metadata.deleted[key], value);
  const result: AppData = { ...emptyData(), updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt, sync: metadata, plan: (ma.clocks.plan ?? '') !== (mb.clocks.plan ?? '') ? (ma.clocks.plan ?? '') > (mb.clocks.plan ?? '') ? a.plan : b.plan : preferRemote || comparable(a.plan) < comparable(b.plan) ? b.plan : a.plan };
  for (const collection of collections) (result as unknown as Record<string, unknown>)[collection] = mergeRows(a, b, collection, ma, mb, metadata, preferRemote);
  result.debts = result.debts.map(debt => {
    const da = a.debts.find(d => d.id === debt.id), db = b.debts.find(d => d.id === debt.id);
    const payments = new Map([...(da?.payments ?? []), ...(db?.payments ?? [])].map(p => [p.id, p]));
    return { ...debt, payments: [...payments.entries()].flatMap(([id, payment]) => {
      const key = `payments/${debt.id}/${id}`;
      const lc = ma.clocks[key] ?? '', rc = mb.clocks[key] ?? '';
      if (metadata.deleted[key] && metadata.deleted[key] >= maxClock(lc, rc)) return [];
      const pa = da?.payments.find(p => p.id === id), pb = db?.payments.find(p => p.id === id);
      const winner: typeof payment = lc !== rc ? (lc > rc ? pa ?? pb : pb ?? pa) ?? payment : pa && pb ? (preferRemote ? pb : comparable(pa) >= comparable(pb) ? pa : pb) : payment;
    return [winner];
    }).sort((x, y) => x.id.localeCompare(y.id)) };
  });
  if (!metadata.device && Object.keys(metadata.clocks).length === 0 && Object.keys(metadata.deleted).length === 0) delete result.sync;
  return result;
}
export function conflictMessage(error: unknown): string {
  return `Автоматическое объединение остановлено: ${(error as Error).message}. Локальная копия сохранена. Экспортируйте резервную копию и проверьте конфликтующие платежи; данные на другом устройстве не перезаписаны.`;
}
