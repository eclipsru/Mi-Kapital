import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import {
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CreditCard,
  Download,
  Home,
  Landmark,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sprout,
  TrendingUp,
  Wrench,
  X,
} from 'lucide-react';
import { EntryModal, type ModalType } from './EntryModal';
import {
  consumerDebtPaid,
  consumerDebtRemaining,
  createId,
  formatMoney,
  investorOutstanding,
  investorPayout,
  num,
  resaleCosts,
  resaleProfit,
  str,
  type Entry,
  type WorkLine,
} from './domain';
import type { DesktopUpdateEvent } from './vite-env';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const cloudEnabled = Boolean(supabaseUrl && supabaseKey);
const supabase = cloudEnabled ? createClient(supabaseUrl!, supabaseKey!) : null;

type PageKey = 'home' | 'resale' | 'part-time' | 'tree' | 'auto' | 'custom' | 'investors' | 'consumer';
const defaultCategories = ['Спил деревьев', 'Ремонт авто'];

type PendingOperation =
  | { action: 'upsert'; entry: Entry }
  | { action: 'delete'; id: string; voicePath?: string };

const queueKey = (userId: string) => `mi-kapital.pending.${userId}`;
const cacheKey = (userId: string) => `mi-kapital.cache.${userId}`;
const syncStampKey = (userId: string) => `mi-kapital.sync.${userId}`;

function readPending(userId: string): PendingOperation[] {
  try {
    return JSON.parse(localStorage.getItem(queueKey(userId)) || '[]') as PendingOperation[];
  } catch {
    return [];
  }
}

function writePending(userId: string, queue: PendingOperation[]) {
  localStorage.setItem(queueKey(userId), JSON.stringify(queue));
}

function replacePending(userId: string, operation: PendingOperation) {
  const id = operation.action === 'upsert' ? operation.entry.id : operation.id;
  writePending(userId, [
    ...readPending(userId).filter(
      (item) => (item.action === 'upsert' ? item.entry.id : item.id) !== id,
    ),
    operation,
  ]);
}

function clearPending(userId: string, id: string) {
  writePending(
    userId,
    readPending(userId).filter(
      (item) => (item.action === 'upsert' ? item.entry.id : item.id) !== id,
    ),
  );
}

type LedgerRow = {
  id: string;
  kind: string;
  payload: unknown;
  created_at: string;
  updated_at: string;
};

function toEntry(row: LedgerRow): Entry {
  return {
    id: row.id,
    type: row.kind as Entry['type'],
    data: (row.payload || {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function applyChanges(
  current: Entry[],
  incoming: Entry[],
  removed: string[],
): { next: Entry[]; changed: number } {
  const removedIds = new Set(removed.filter((id) => current.some((item) => item.id === id)));
  const map = new Map(
    current.filter((item) => !removedIds.has(item.id)).map((item) => [item.id, item]),
  );
  let changed = removedIds.size;
  for (const entry of incoming) {
    const existing = map.get(entry.id);
    if (!existing || existing.updatedAt !== entry.updatedAt) changed += 1;
    map.set(entry.id, entry);
  }
  return {
    next: [...map.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    changed,
  };
}

async function syncUpsert(client: SupabaseClient, userId: string, entry: Entry): Promise<Entry> {
  const updated: Entry = { ...entry, data: { ...entry.data } };
  const voice = updated.data.voiceNote;
  if (typeof voice === 'string' && voice.startsWith('data:')) {
    const blob = await (await fetch(voice)).blob();
    const mimeType = blob.type.split(';')[0] || 'audio/webm';
    const extension = mimeType.split('/')[1] || 'webm';
    const storagePath = `${userId}/${updated.id}.${extension}`;
    const { error: uploadError } = await client.storage
      .from('voice-notes')
      .upload(storagePath, blob, { contentType: mimeType, upsert: true });
    if (uploadError) throw uploadError;
    delete updated.data.voiceNote;
    updated.data.voicePath = storagePath;
  }
  const { error } = await client.from('ledger_entries').upsert({
    id: updated.id,
    owner_id: userId,
    kind: updated.type,
    payload: updated.data,
    created_at: updated.createdAt,
    updated_at: updated.updatedAt,
  });
  if (error) throw error;
  return updated;
}

async function syncDelete(client: SupabaseClient, id: string, voicePath?: string) {
  const { error } = await client.from('ledger_entries').delete().eq('id', id);
  if (error) throw error;
  if (voicePath) {
    const { error: storageError } = await client.storage.from('voice-notes').remove([voicePath]);
    if (storageError) throw storageError;
  }
}

function plural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 102.4) / 10)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDateRu(isoOrDate: string): string {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatShortDate(isoOrDate: string): string {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

interface UpdaterState {
  supported: boolean;
  version: string;
  deliveryMode: 'builtin' | 'live-bundle';
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';
  nextVersion: string;
  mode: 'bundle' | 'installer' | 'manual';
  percent: number;
  transferred: number;
  totalBytes: number;
  message: string;
}

function useDesktopUpdater(notify: (msg: string) => void) {
  const [state, setState] = useState<UpdaterState>({
    supported: typeof window !== 'undefined' && Boolean(window.desktopUpdater),
    version: '1.0.0',
    deliveryMode: 'builtin',
    status: 'idle',
    nextVersion: '',
    mode: 'bundle',
    percent: 0,
    transferred: 0,
    totalBytes: 0,
    message: '',
  });

  useEffect(() => {
    const bridge = window.desktopUpdater;
    if (!bridge) return;
    void bridge.info().then((info) => {
      setState((prev) => ({
        ...prev,
        supported: Boolean(info.supported),
        version: info.version || prev.version,
        deliveryMode: info.deliveryMode || 'builtin',
      }));
    });

    const unsubscribe = bridge.onEvent((event: DesktopUpdateEvent) => {
      if (event.type === 'checking') {
        setState((prev) => ({ ...prev, status: 'checking', message: '' }));
      } else if (event.type === 'available') {
        setState((prev) => ({
          ...prev,
          status: 'available',
          nextVersion: event.version || prev.nextVersion,
          mode: event.mode || 'bundle',
          totalBytes: event.totalBytes || 0,
          message: '',
        }));
      } else if (event.type === 'progress') {
        setState((prev) => ({
          ...prev,
          status: 'downloading',
          mode: event.mode || prev.mode,
          percent: event.percent,
          transferred: event.transferred,
          totalBytes: event.total || prev.totalBytes,
        }));
      } else if (event.type === 'downloaded') {
        setState((prev) => ({
          ...prev,
          status: 'ready',
          nextVersion: event.version || prev.nextVersion,
          mode: event.mode || prev.mode,
          percent: 100,
          totalBytes: event.totalBytes || prev.totalBytes,
          message: '',
        }));
      } else if (event.type === 'applied') {
        setState((prev) => ({
          ...prev,
          status: 'idle',
          version: event.version || prev.version,
          nextVersion: '',
          percent: 0,
        }));
        notify(`Обновление до v${event.version || ''} применено`);
      } else if (event.type === 'none') {
        setState((prev) => ({
          ...prev,
          status: 'idle',
          version: event.version || prev.version,
          nextVersion: '',
          message: '',
        }));
      } else if (event.type === 'error') {
        setState((prev) => ({
          ...prev,
          status: 'error',
          message: event.message,
        }));
      }
    });

    return unsubscribe;
  }, [notify]);

  const checkUpdates = useCallback(async () => {
    const bridge = window.desktopUpdater;
    if (!bridge) {
      notify('В браузере обновления применяются автоматически; кнопка предназначена для ПК-приложения.');
      return;
    }
    const res = await bridge.check();
    if (res.ok && res.available === false) {
      notify(`Установлена актуальная версия v${res.version || state.version}`);
    } else if (!res.ok && res.reason) {
      notify(`Проверка обновлений: ${res.reason}`);
    }
  }, [notify, state.version]);

  const applyUpdate = useCallback(async () => {
    const bridge = window.desktopUpdater;
    if (!bridge) return;
    if (state.status === 'available' && state.mode === 'manual') {
      await bridge.openRelease();
      return;
    }
    if (state.status === 'available') {
      await bridge.download();
      return;
    }
    const res = await bridge.install();
    if (!res.ok && res.reason) {
      notify(res.reason);
    }
  }, [notify, state.mode, state.status]);

  return { updater: state, checkUpdates, applyUpdate };
}

export default function App() {
  const [entries, setEntries] = useState<Entry[]>(() => {
    if (cloudEnabled) return [];
    try {
      return JSON.parse(localStorage.getItem('mi-kapital.entries') || '[]') as Entry[];
    } catch {
      return [];
    }
  });
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!cloudEnabled);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [page, setPage] = useState<PageKey>('home');
  const [customPageName, setCustomPageName] = useState('');
  const [modal, setModal] = useState<ModalType>(null);
  const [target, setTarget] = useState<Entry | null>(null);
  const [cabinetOpen, setCabinetOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((current) => (current === message ? '' : current));
    }, 3800);
  }, []);

  const { updater, checkUpdates, applyUpdate } = useDesktopUpdater(notify);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const entriesRef = useRef<Entry[]>(entries);
  entriesRef.current = entries;

  const syncFromCloud = useCallback(
    async (mode: 'full' | 'incremental' = 'full', silentWhenUnchanged = false) => {
      if (!supabase || !session?.user) return;
      const client = supabase;
      const userId = session.user.id;
      const stamp = mode === 'incremental' ? localStorage.getItem(syncStampKey(userId)) : null;
      const startedAt = new Date().toISOString();
      setSyncing(true);

      const pullFull = async () => {
        const { data, error } = await client
          .from('ledger_entries')
          .select('id,kind,payload,created_at,updated_at')
          .order('created_at', { ascending: false });
        if (error) {
          let cache: Entry[] = [];
          try {
            cache = JSON.parse(localStorage.getItem(cacheKey(userId)) || '[]') as Entry[];
          } catch {
            cache = [];
          }
          setEntries(cache);
          setLoadedUserId(userId);
          setSyncing(false);
          notify(`Нет связи с облаком. Показаны сохранённые записи: ${error.message}`);
          return;
        }
        const synced = new Map((data || []).map((row) => toEntry(row)).map((e) => [e.id, e]));
        const pending = readPending(userId);
        const retry: PendingOperation[] = [];
        for (const operation of pending) {
          try {
            if (operation.action === 'upsert') {
              synced.set(operation.entry.id, await syncUpsert(client, userId, operation.entry));
            } else {
              const existing = synced.get(operation.id);
              await syncDelete(
                client,
                operation.id,
                operation.voicePath || str(existing?.data || {}, 'voicePath'),
              );
              synced.delete(operation.id);
            }
          } catch {
            retry.push(operation);
          }
        }
        writePending(userId, retry);
        const merged = [...synced.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setEntries(merged);
        setLoadedUserId(userId);
        setSyncing(false);
        localStorage.setItem(cacheKey(userId), JSON.stringify(merged));
        localStorage.setItem(syncStampKey(userId), startedAt);
        if (retry.length) {
          notify(
            `В очереди синхронизации ${retry.length} ${plural(retry.length, 'запись', 'записи', 'записей')}`,
          );
        }
      };

      const pullIncremental = async (since: string) => {
        const [entriesResponse, deletionsResponse] = await Promise.all([
          client
            .from('ledger_entries')
            .select('id,kind,payload,created_at,updated_at')
            .gt('updated_at', since),
          client.from('ledger_deletions').select('entry_id').gt('deleted_at', since),
        ]);
        const failure = entriesResponse.error || deletionsResponse.error;
        if (failure) throw failure;
        const incoming = (entriesResponse.data || []).map(toEntry);
        const removed = (deletionsResponse.data || []).map((row) => String(row.entry_id));
        const { next, changed } = applyChanges(entriesRef.current, incoming, removed);
        setEntries(next);
        setLoadedUserId(userId);
        setSyncing(false);
        localStorage.setItem(cacheKey(userId), JSON.stringify(next));
        localStorage.setItem(syncStampKey(userId), startedAt);
        if (changed > 0) {
          notify(`Обновлено ${changed} ${plural(changed, 'запись', 'записи', 'записей')}`);
        } else if (!silentWhenUnchanged) {
          notify('Все данные актуальны');
        }
      };

      if (!stamp) {
        await pullFull();
        return;
      }
      try {
        await pullIncremental(stamp);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String((error as { message?: string } | null)?.message || error);
        if (/ledger_deletions|does not exist|42P01/i.test(message)) {
          await pullFull();
          return;
        }
        setSyncing(false);
        notify(`Ошибка синхронизации: ${message}`);
      }
    },
    [session, notify],
  );

  useEffect(() => {
    if (cloudEnabled && session) void syncFromCloud('full', true);
  }, [session?.user.id, syncFromCloud]);

  useEffect(() => {
    if (!supabase || !session?.user.id) return;
    const channel = supabase
      .channel(`ledger-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ledger_entries',
          filter: `owner_id=eq.${session.user.id}`,
        },
        () => {
          void syncFromCloud('incremental', true);
        },
      )
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [session?.user.id, syncFromCloud]);

  useEffect(() => {
    if (!cloudEnabled) {
      localStorage.setItem('mi-kapital.entries', JSON.stringify(entries));
    }
  }, [entries]);

  const persist = useCallback(
    async (entry: Entry) => {
      let updated: Entry = {
        ...entry,
        updatedAt: new Date().toISOString(),
        data: { ...entry.data },
      };
      if (supabase && session) {
        try {
          updated = await syncUpsert(supabase, session.user.id, updated);
          clearPending(session.user.id, updated.id);
        } catch (error) {
          replacePending(session.user.id, { action: 'upsert', entry: updated });
          const optimistic = [updated, ...entries.filter((item) => item.id !== entry.id)];
          setEntries(optimistic);
          localStorage.setItem(cacheKey(session.user.id), JSON.stringify(optimistic));
          notify(
            `Сохранено на устройстве, отправится при связи: ${error instanceof Error ? error.message : 'офлайн'}`,
          );
          return;
        }
        const cache = [updated, ...entries.filter((item) => item.id !== entry.id)];
        localStorage.setItem(cacheKey(session.user.id), JSON.stringify(cache));
      }
      setEntries((current) => [updated, ...current.filter((item) => item.id !== entry.id)]);
    },
    [session, entries, notify],
  );

  const removeEntry = async (entry: Entry) => {
    const remaining = entries.filter((item) => item.id !== entry.id);
    setEntries(remaining);
    notify('Запись удалена');
    if (supabase && session) {
      localStorage.setItem(cacheKey(session.user.id), JSON.stringify(remaining));
      try {
        await syncDelete(supabase, entry.id, str(entry.data, 'voicePath'));
        clearPending(session.user.id, entry.id);
      } catch (error) {
        replacePending(session.user.id, {
          action: 'delete',
          id: entry.id,
          voicePath: str(entry.data, 'voicePath') || undefined,
        });
        notify(
          `Удаление сохранено локально: ${error instanceof Error ? error.message : 'офлайн'}`,
        );
      }
    }
  };

  const openModal = (type: ModalType, entry: Entry | null = null) => {
    setTarget(entry);
    setModal(type);
  };
  const closeModal = () => {
    setTarget(null);
    setModal(null);
  };

  const categories = useMemo(
    () => [
      ...new Set([
        ...defaultCategories,
        ...entries
          .filter((item) => item.type === 'category')
          .map((item) => str(item.data, 'name'))
          .filter(Boolean),
      ]),
    ],
    [entries],
  );

  const investors = useMemo(() => entries.filter((item) => item.type === 'investor'), [entries]);
  const jobs = useMemo(() => entries.filter((item) => item.type === 'job'), [entries]);
  const resaleItems = useMemo(() => entries.filter((item) => item.type === 'resale'), [entries]);
  const debts = useMemo(() => entries.filter((item) => item.type === 'consumerDebt'), [entries]);
  const ledgerRecords = useMemo(
    () => entries.filter((item) => item.type !== 'category'),
    [entries],
  );

  const activeResale = useMemo(
    () => resaleItems.filter((item) => !item.data.sold),
    [resaleItems],
  );
  const soldResale = useMemo(
    () => resaleItems.filter((item) => Boolean(item.data.sold)),
    [resaleItems],
  );
  const unsettledInvestorItems = useMemo(
    () => resaleItems.filter((item) => investorOutstanding(item) > 0),
    [resaleItems],
  );
  const openDebts = useMemo(
    () => debts.filter((item) => consumerDebtRemaining(item) > 0),
    [debts],
  );

  const jobsIncome = jobs.reduce((sum, item) => sum + num(item.data, 'amountKopecks'), 0);
  const saleRevenue = soldResale.reduce((sum, item) => sum + num(item.data, 'saleKopecks'), 0);
  const resaleNet = soldResale.reduce((sum, item) => sum + resaleProfit(item), 0);
  const resaleSpent = resaleItems.reduce((sum, item) => sum + resaleCosts(item), 0);
  const activeStockValue = activeResale.reduce((sum, item) => sum + resaleCosts(item), 0);
  const consumerBalance = debts.reduce((sum, item) => sum + consumerDebtRemaining(item), 0);
  const consumerPaidTotal = debts.reduce((sum, item) => sum + consumerDebtPaid(item), 0);
  const investorBalance = resaleItems.reduce((sum, item) => sum + investorOutstanding(item), 0);
  const totalIncome = jobsIncome + resaleNet;

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError('');
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });
    if (error) setAuthError(error.message);
  };

  if (cloudEnabled && !authReady) {
    return (
      <div className="loading-screen">
        <div className="logo-mark">
          <TrendingUp size={22} />
        </div>
        <p className="muted">Подключаем защищённый профиль…</p>
      </div>
    );
  }

  if (cloudEnabled && session && loadedUserId !== session.user.id) {
    return (
      <div className="loading-screen">
        <div className="logo-mark">
          <TrendingUp size={22} />
        </div>
        <p className="muted">Загружаем ваши финансовые записи…</p>
      </div>
    );
  }

  if (cloudEnabled && !session) {
    return (
      <main className="auth-screen">
        <div className="auth-box">
          <div className="logo-mark">
            <TrendingUp size={22} />
          </div>
          <span className="eyebrow" style={{ marginTop: 14 }}>
            Личный кабинет
          </span>
          <h1>Мой капитал</h1>
          <p>Войдите в аккаунт владельца для синхронизации записей между ПК и телефоном.</p>
          <form onSubmit={signIn}>
            <label>
              Электронная почта
              <input
                className="inp"
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </label>
            <label>
              Пароль
              <input
                className="inp"
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            {authError && <p className="form-error">{authError}</p>}
            <button className="btn wide" type="submit">
              Войти в кабинет
            </button>
          </form>
          <div className="secure-note">
            <ShieldCheck size={16} /> Доступ защищён политиками владельца Supabase RLS
          </div>
        </div>
      </main>
    );
  }

  const pageTitle =
    page === 'home'
      ? 'Сводка капитала'
      : page === 'resale'
        ? 'Перепродажа'
        : page === 'part-time'
          ? 'Подработка'
          : page === 'tree'
            ? 'Спил деревьев'
            : page === 'auto'
              ? 'Ремонт авто'
              : page === 'custom'
                ? customPageName
                : page === 'investors'
                  ? 'Инвесторы'
                  : 'Потребительские долги';

  const pageDescription =
    page === 'home'
      ? 'Полная картина доходов, товаров на перепродаже, инвестиций и обязательств'
      : page === 'resale'
        ? 'Закупка товаров, расчёт с инвесторами и чистая прибыль с продаж'
        : page === 'investors'
          ? 'Партнёры, суммы вложений и расчёты по каждому проекту'
          : page === 'consumer'
            ? 'Личные займы, график погашений и актуальный остаток долга'
            : 'Учёт выполненных заказов, адресов, времени и заработка';

  const defaultAddAction = (): ModalType => {
    if (page === 'resale') return 'resale';
    if (page === 'investors') return 'investor';
    if (page === 'consumer') return 'debt';
    if (['part-time', 'tree', 'auto', 'custom'].includes(page)) return 'job';
    return 'resale';
  };

  const defaultJobCategory =
    page === 'tree'
      ? 'Спил деревьев'
      : page === 'auto'
        ? 'Ремонт авто'
        : page === 'custom' && customPageName
          ? customPageName
          : categories[0] || 'Спил деревьев';

  const rawPageItems =
    page === 'home'
      ? ledgerRecords
      : page === 'resale'
        ? resaleItems
        : page === 'part-time'
          ? jobs
          : page === 'tree'
            ? jobs.filter((item) => str(item.data, 'category') === 'Спил деревьев')
            : page === 'auto'
              ? jobs.filter((item) => str(item.data, 'category') === 'Ремонт авто')
              : page === 'custom'
                ? jobs.filter((item) => str(item.data, 'category') === customPageName)
                : page === 'investors'
                  ? investors
                  : debts;

  const trimmedQuery = query.trim().toLowerCase();
  const visibleItems = trimmedQuery
    ? (page === 'home' ? ledgerRecords : rawPageItems).filter((item) =>
        JSON.stringify(item.data).toLowerCase().includes(trimmedQuery),
      )
    : rawPageItems;

  const handleSave = async (entry: Entry) => {
    await persist(entry);
    closeModal();
    notify('Запись сохранена');
  };

  const handleSell = async (entry: Entry, saleKopecks: number, saleDate: string) => {
    await persist({
      ...entry,
      data: { ...entry.data, sold: true, saleKopecks, saleDate },
    });
    closeModal();
    notify('Продажа зафиксирована');
  };

  const handlePayment = async (entry: Entry, amountKopecks: number, date: string) => {
    const payments = Array.isArray(entry.data.payments)
      ? (entry.data.payments as Array<{ id: string; amountKopecks: number; date: string }>)
      : [];
    const remaining = consumerDebtRemaining(entry);
    if (amountKopecks > remaining) {
      notify(`Платёж не может превышать остаток ${formatMoney(remaining)}`);
      return;
    }
    await persist({
      ...entry,
      data: {
        ...entry.data,
        payments: [...payments, { id: createId(), amountKopecks, date }],
      },
    });
    closeModal();
    notify('Платёж внесён');
  };

  const ownerDisplay = session?.user.email
    ? session.user.email.split('@')[0]
    : 'Владелец';
  const ownerSub = session?.user.email
    ? `«Мой капитал» · ${session.user.email}`
    : '«Мой капитал» · локальное хранилище ПК';

  const activeWorkQueue = [
    ...activeResale.map((item) => ({
      id: item.id,
      tone: 'c-g' as const,
      title: str(item.data, 'name', 'Товар'),
      right: formatMoney(resaleCosts(item)),
      status: 'в продаже',
      sub: `${str(item.data, 'condition', 'Хорошее')} · ${formatShortDate(item.createdAt)}`,
      go: () => setPage('resale'),
    })),
    ...unsettledInvestorItems.map((item) => ({
      id: `inv-${item.id}`,
      tone: 'c-y' as const,
      title: str(item.data, 'investorName', 'Инвестор'),
      right: formatMoney(investorOutstanding(item)),
      status: 'ждёт расчёта',
      sub: `Товар: ${str(item.data, 'name', 'Без названия')}`,
      go: () => setPage('resale'),
    })),
    ...openDebts.map((item) => ({
      id: item.id,
      tone: 'c-r' as const,
      title: str(item.data, 'purpose', 'Долг'),
      right: formatMoney(consumerDebtRemaining(item)),
      status: 'не погашен',
      sub: `Кредитор: ${str(item.data, 'creditor', '—')}`,
      go: () => setPage('consumer'),
    })),
  ];

  const dropdownItems: Array<{ label: string; active: boolean; select: () => void }> = [
    { label: 'Сводка капитала', active: page === 'home', select: () => setPage('home') },
    { label: 'Перепродажа', active: page === 'resale', select: () => setPage('resale') },
    { label: 'Подработка (все)', active: page === 'part-time', select: () => setPage('part-time') },
    ...categories.map((cat) => ({
      label: `↳ ${cat}`,
      active:
        (page === 'tree' && cat === 'Спил деревьев') ||
        (page === 'auto' && cat === 'Ремонт авто') ||
        (page === 'custom' && customPageName === cat),
      select: () => {
        if (cat === 'Спил деревьев') setPage('tree');
        else if (cat === 'Ремонт авто') setPage('auto');
        else {
          setCustomPageName(cat);
          setPage('custom');
        }
      },
    })),
    { label: 'Инвесторы', active: page === 'investors', select: () => setPage('investors') },
    { label: 'Потребительские долги', active: page === 'consumer', select: () => setPage('consumer') },
  ];

  const isPartTimeSection = ['part-time', 'tree', 'auto', 'custom'].includes(page);

  return (
    <div className="app-page">
      {/* Липкая верхняя шапка — 1:1 как на сайте со скриншота */}
      <header className="head">
        <div className="head-wrap">
          <div className="head-in">
            <button type="button" className="logo" onClick={() => setPage('home')}>
              <span className="logo-mark">
                <TrendingUp size={20} />
              </span>
              <span>
                <b>Мой капитал</b>
                <span>Личный учёт</span>
              </span>
            </button>

            <button
              type="button"
              className="city-pill"
              onClick={() =>
                cloudEnabled ? void syncFromCloud('incremental') : setCabinetOpen(true)
              }
              title={
                cloudEnabled
                  ? 'Синхронизировать только последние изменения с облаком'
                  : 'Режим хранения и обновления приложения'
              }
            >
              <i className={`status-dot ${cloudEnabled ? 'online' : ''}`} />
              <span>{syncing ? 'Синхронизация…' : cloudEnabled ? 'Облако' : 'На устройстве'}</span>
            </button>

            <form
              className="search"
              onSubmit={(event) => {
                event.preventDefault();
              }}
            >
              <Search className="s-ic" size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск товара, работы, клиента, инвестора или долга"
              />
              {query && (
                <button
                  type="button"
                  className="s-clr"
                  onClick={() => setQuery('')}
                  aria-label="Очистить поиск"
                >
                  <X size={14} />
                </button>
              )}
              <button type="submit" className="s-go">
                Найти
              </button>
            </form>

            <nav className="hlinks" aria-label="Разделы приложения">
              <button
                type="button"
                className={`hlink ${page === 'home' ? 'on' : ''}`}
                onClick={() => setPage('home')}
              >
                <Home />
                <span>Главная</span>
              </button>
              <button
                type="button"
                className={`hlink ${page === 'resale' ? 'on' : ''}`}
                onClick={() => setPage('resale')}
              >
                <Package />
                <span>Перепродажа</span>
                {activeResale.length > 0 && <span className="dot">{activeResale.length}</span>}
              </button>
              <button
                type="button"
                className={`hlink ${isPartTimeSection ? 'on' : ''}`}
                onClick={() => setPage('part-time')}
              >
                <BriefcaseBusiness />
                <span>Подработка</span>
              </button>
              <button
                type="button"
                className={`hlink ${page === 'investors' ? 'on' : ''}`}
                onClick={() => setPage('investors')}
              >
                <Landmark />
                <span>Инвесторы</span>
                {unsettledInvestorItems.length > 0 && (
                  <span className="dot">{unsettledInvestorItems.length}</span>
                )}
              </button>
              <button
                type="button"
                className={`hlink ${page === 'consumer' ? 'on' : ''}`}
                onClick={() => setPage('consumer')}
              >
                <CreditCard />
                <span>Долги</span>
                {openDebts.length > 0 && <span className="dot">{openDebts.length}</span>}
              </button>
              <button
                type="button"
                className={`hlink ${
                  updater.status === 'ready'
                    ? 'ready'
                    : updater.status === 'downloading' || updater.status === 'available'
                      ? 'on'
                      : ''
                }`}
                onClick={() =>
                  updater.status === 'ready' || updater.status === 'available'
                    ? void applyUpdate()
                    : void checkUpdates()
                }
                title="Обновить приложение напрямую (скачиваются только изменения)"
              >
                {updater.status === 'checking' || updater.status === 'downloading' ? (
                  <RefreshCw className="spin" />
                ) : (
                  <Download />
                )}
                <span>
                  {updater.status === 'ready'
                    ? 'Применить'
                    : updater.status === 'downloading'
                      ? `${updater.percent}%`
                      : 'Обновить'}
                </span>
                {updater.status === 'ready' && <span className="dot">!</span>}
              </button>
              <button
                type="button"
                className={`hlink ${cabinetOpen ? 'on' : ''}`}
                onClick={() => setCabinetOpen(true)}
              >
                <span className="hlink-ava">{ownerDisplay.slice(0, 1).toUpperCase()}</span>
                <span>Кабинет</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Трёхколоночная рабочая область — как «Работа» на скриншоте */}
      <div className="workspace-wrap">
        <div className="st-layout">
          <div className="st-side-wrap">
            {/* Левая колонка: Активные позиции и обязательства */}
            <aside className="st-scol st-ocol" aria-label="В работе">
              <div className="st-side-h">
                <h2>В работе</h2>
                <span className="st-side-c">{activeWorkQueue.length}</span>
                <button
                  type="button"
                  className="st-side-link"
                  onClick={() => setPage('home')}
                >
                  Все
                </button>
              </div>
              <div className="st-side-card">
                <div className="st-side-lg">
                  <span className="g">В продаже {activeResale.length}</span>
                  <span className="y">Инвесторам {unsettledInvestorItems.length}</span>
                  <span className="r">Долги {openDebts.length}</span>
                </div>
                {activeWorkQueue.length > 0 ? (
                  <div className="st-slist">
                    {activeWorkQueue.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`st-si ${item.tone}`}
                        onClick={item.go}
                      >
                        <div className="st-si-t">
                          <b>{item.title}</b>
                          <small className="num-tab">{item.right}</small>
                        </div>
                        <div className="st-si-s">
                          <em>{item.status}</em> · {item.sub}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="st-side-empty">
                    Активных товаров на складе и непогашенных обязательств сейчас нет.
                  </div>
                )}
              </div>
            </aside>

            {/* Правая колонка: Журнал и быстрые действия */}
            <aside className="st-scol st-ccol" aria-label="Журнал операций">
              <div className="st-side-h">
                <h2>Журнал</h2>
                <span className="st-side-c">{ledgerRecords.length}</span>
                <button
                  type="button"
                  className="st-side-link"
                  onClick={() => openModal(defaultAddAction())}
                >
                  + Запись
                </button>
              </div>
              <div className="st-side-card">
                <div className="st-side-lg">
                  <span className="g">Работы {jobs.length}</span>
                  <span className="y">Сделки {soldResale.length}</span>
                  <span className="r">Долги {debts.length}</span>
                </div>

                <div className="side-quick-grid">
                  <button
                    type="button"
                    className="side-quick-btn"
                    onClick={() => openModal('resale')}
                  >
                    <Plus size={14} /> Товар
                  </button>
                  <button
                    type="button"
                    className="side-quick-btn"
                    onClick={() => openModal('job')}
                  >
                    <Plus size={14} /> Работа
                  </button>
                  <button
                    type="button"
                    className="side-quick-btn"
                    onClick={() => openModal('debt')}
                  >
                    <Plus size={14} /> Долг
                  </button>
                  <button
                    type="button"
                    className="side-quick-btn"
                    onClick={() => openModal('investor')}
                  >
                    <Plus size={14} /> Инвестор
                  </button>
                </div>

                {ledgerRecords.length > 0 ? (
                  <div className="st-slist">
                    {ledgerRecords.slice(0, 18).map((entry) => {
                      const isResale = entry.type === 'resale';
                      const isJob = entry.type === 'job';
                      const isDebt = entry.type === 'consumerDebt';
                      const title = isResale
                        ? str(entry.data, 'name', 'Товар')
                        : isJob
                          ? str(entry.data, 'category', 'Работа')
                          : isDebt
                            ? str(entry.data, 'purpose', 'Долг')
                            : str(entry.data, 'name', 'Инвестор');
                      const statusLabel = isResale
                        ? entry.data.sold
                          ? 'продан'
                          : 'в продаже'
                        : isJob
                          ? 'выполнено'
                          : isDebt
                            ? consumerDebtRemaining(entry) > 0
                              ? 'к возврату'
                              : 'погашен'
                            : 'партнёр';
                      const sumText = isResale
                        ? entry.data.sold
                          ? formatMoney(num(entry.data, 'saleKopecks'))
                          : formatMoney(resaleCosts(entry))
                        : isJob
                          ? formatMoney(num(entry.data, 'amountKopecks'))
                          : isDebt
                            ? formatMoney(consumerDebtRemaining(entry))
                            : '';
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          className="st-si"
                          onClick={() =>
                            setPage(
                              isResale
                                ? 'resale'
                                : isJob
                                  ? 'part-time'
                                  : isDebt
                                    ? 'consumer'
                                    : 'investors',
                            )
                          }
                        >
                          <div className="st-si-t">
                            <b>{title}</b>
                            <small>{formatShortDate(entry.updatedAt)}</small>
                          </div>
                          <div className="st-si-s">
                            {isResale
                              ? 'Перепродажа'
                              : isJob
                                ? 'Подработка'
                                : isDebt
                                  ? 'Долг'
                                  : 'Инвестор'}{' '}
                            · <em>{statusLabel}</em>
                          </div>
                          {sumText && <div className="st-si-l num-tab">Сумма: {sumText}</div>}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="st-side-empty">
                    Журнал пока пуст — добавьте первый товар, работу или обязательство.
                  </div>
                )}
              </div>
            </aside>
          </div>

          {/* Центральная рабочая область */}
          <main className="st-main">
            <div className="st-head">
              <div className="st-headrow">
                <div className="st-who">
                  <div className="owner-ava">{ownerDisplay.slice(0, 1).toUpperCase()}</div>
                  <div className="st-who-copy">
                    <div className="st-who-top">
                      <h1>{ownerDisplay}</h1>
                      <button
                        type="button"
                        className="btn sec xs"
                        onClick={() => openModal(defaultAddAction())}
                      >
                        Добавить
                      </button>
                    </div>
                    <div className="st-who-sub">{ownerSub}</div>
                  </div>
                </div>

                <div className="st-pinfo">
                  <h2>«{pageTitle}»</h2>
                  <div className="st-pinfo-a">{pageDescription}</div>
                  <div className="st-pinfo-m">
                    <span className="st-open">
                      {syncing ? 'Обновляется…' : 'Данные актуальны'}
                    </span>
                    <span className="st-accent num-tab">
                      Чистый доход: {formatMoney(totalIncome)}
                    </span>
                    <button
                      type="button"
                      className="st-rights-btn"
                      onClick={() =>
                        updater.status === 'ready' ? void applyUpdate() : void checkUpdates()
                      }
                    >
                      <ShieldCheck size={14} />
                      {updater.status === 'ready'
                        ? `Установить обновление v${updater.nextVersion}`
                        : `Версия v${updater.version} · Проверить обновление`}
                    </button>
                  </div>
                </div>

                <div className="st-ptsel">
                  <span className="st-ptsel-l">Раздел</span>
                  <div className={`st-dd ${dropdownOpen ? 'open' : ''}`}>
                    <button
                      type="button"
                      className="st-dd-btn"
                      onClick={() => setDropdownOpen((v) => !v)}
                    >
                      <span className="st-dd-v">{pageTitle}</span>
                      <ChevronDown size={16} />
                    </button>
                    {dropdownOpen && (
                      <div className="st-dd-menu">
                        {dropdownItems.map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            className={`st-dd-o ${item.active ? 'on' : ''}`}
                            onClick={() => {
                              item.select();
                              setDropdownOpen(false);
                            }}
                          >
                            <span>{item.label}</span>
                            {item.active && <Check size={16} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Плашка внутриприложенческого дельта-обновления */}
            {updater.status !== 'idle' && (
              <div
                className={`upd-banner ${
                  updater.status === 'ready'
                    ? 'ready'
                    : updater.status === 'error'
                      ? 'err'
                      : ''
                }`}
              >
                <div className="upd-copy">
                  {updater.status === 'checking' && (
                    <>
                      <b>Проверяем наличие свежих обновлений…</b>
                      <small>Скачиваются только изменённые файлы, а не всё приложение целиком.</small>
                    </>
                  )}
                  {updater.status === 'available' && (
                    <>
                      <b>Доступно обновление v{updater.nextVersion}</b>
                      <small>
                        {updater.mode === 'bundle'
                          ? `Быстрый пакет изменений (${formatBytes(updater.totalBytes) || '~140 КБ'}) без переустановки программы.`
                          : 'Дифференциальное обновление оболочки (загружаются только изменённые блоки).'}
                      </small>
                    </>
                  )}
                  {updater.status === 'downloading' && (
                    <>
                      <b>
                        Загрузка обновления v{updater.nextVersion} — {updater.percent}%
                      </b>
                      <small>
                        Скачано {formatBytes(updater.transferred)}
                        {updater.totalBytes ? ` из ${formatBytes(updater.totalBytes)}` : ''} (только
                        пакет изменений)
                      </small>
                      <div className="upd-bar">
                        <i style={{ width: `${updater.percent}%` }} />
                      </div>
                    </>
                  )}
                  {updater.status === 'ready' && (
                    <>
                      <b>Обновление v{updater.nextVersion} скачано и готово к применению</b>
                      <small>
                        {updater.mode === 'bundle'
                          ? `Размер пакета изменений: ${formatBytes(updater.totalBytes) || 'минимальный'}. Применится мгновенно прямо в окне.`
                          : 'Приложение перезапустится и обновится автоматически.'}
                      </small>
                    </>
                  )}
                  {updater.status === 'error' && (
                    <>
                      <b>Не удалось проверить обновление</b>
                      <small>{updater.message}</small>
                    </>
                  )}
                </div>
                {(updater.status === 'ready' || updater.status === 'available') && (
                  <button type="button" className="btn sm" onClick={() => void applyUpdate()}>
                    {updater.status === 'ready' ? 'Обновить сейчас' : 'Скачать изменения'}
                  </button>
                )}
                {updater.status === 'error' && (
                  <button
                    type="button"
                    className="btn sec sm"
                    onClick={() => void checkUpdates()}
                  >
                    Повторить
                  </button>
                )}
              </div>
            )}

            {/* Полоса из 5 живых счётчиков во всю ширину (1:1 со скриншотом) */}
            <div className="st-pcard">
              <div className="st-pcard-n">
                <button
                  type="button"
                  className={`st-pst g ${activeResale.length > 0 ? 'has' : 'zero'} ${
                    page === 'resale' ? 'active' : ''
                  }`}
                  onClick={() => setPage('resale')}
                >
                  <b className="num-tab">{activeResale.length}</b>
                  <span>В продаже</span>
                </button>
                <button
                  type="button"
                  className={`st-pst ${soldResale.length > 0 ? 'has' : 'zero'}`}
                  onClick={() => setPage('resale')}
                >
                  <b className="num-tab">{soldResale.length}</b>
                  <span>Продано</span>
                </button>
                <button
                  type="button"
                  className={`st-pst g ${jobs.length > 0 ? 'has' : 'zero'} ${
                    isPartTimeSection ? 'active' : ''
                  }`}
                  onClick={() => setPage('part-time')}
                >
                  <b className="num-tab">{jobs.length}</b>
                  <span>Подработки</span>
                </button>
                <button
                  type="button"
                  className={`st-pst y ${unsettledInvestorItems.length > 0 ? 'has' : 'zero'} ${
                    page === 'investors' ? 'active' : ''
                  }`}
                  onClick={() => setPage('investors')}
                >
                  <b className="num-tab">{unsettledInvestorItems.length}</b>
                  <span>Инвесторам</span>
                </button>
                <button
                  type="button"
                  className={`st-pst r ${openDebts.length > 0 ? 'has' : 'zero'} ${
                    page === 'consumer' ? 'active' : ''
                  }`}
                  onClick={() => setPage('consumer')}
                >
                  <b className="num-tab">{openDebts.length}</b>
                  <span>Долги</span>
                </button>
              </div>
            </div>

            {/* Подчёркнутые вкладки разделов (1:1 со скриншотом) */}
            <div className="tabs" role="tablist">
              <button
                type="button"
                className={page === 'home' ? 'on' : ''}
                onClick={() => setPage('home')}
              >
                Сводка
                <span className="n">{ledgerRecords.length}</span>
              </button>
              <button
                type="button"
                className={page === 'resale' ? 'on' : ''}
                onClick={() => setPage('resale')}
              >
                Перепродажа
                <span className="n">{resaleItems.length}</span>
              </button>
              <button
                type="button"
                className={isPartTimeSection ? 'on' : ''}
                onClick={() => setPage('part-time')}
              >
                Подработка
                <span className="n">{jobs.length}</span>
              </button>
              <button
                type="button"
                className={page === 'investors' ? 'on' : ''}
                onClick={() => setPage('investors')}
              >
                Инвесторы
                <span className="n">{investors.length}</span>
              </button>
              <button
                type="button"
                className={page === 'consumer' ? 'on' : ''}
                onClick={() => setPage('consumer')}
              >
                Долги
                <span className="n">{debts.length}</span>
              </button>
              <button type="button" onClick={() => openModal(defaultAddAction())}>
                + Добавить
              </button>
            </div>

            {/* Подкатегории подработки */}
            {isPartTimeSection && (
              <div className="subcats-bar">
                <button
                  type="button"
                  className={page === 'part-time' ? 'on' : ''}
                  onClick={() => setPage('part-time')}
                >
                  Все категории ({jobs.length})
                </button>
                {categories.map((cat) => {
                  const isActive =
                    (page === 'tree' && cat === 'Спил деревьев') ||
                    (page === 'auto' && cat === 'Ремонт авто') ||
                    (page === 'custom' && customPageName === cat);
                  const catCount = jobs.filter(
                    (j) => str(j.data, 'category') === cat,
                  ).length;
                  return (
                    <button
                      key={cat}
                      type="button"
                      className={isActive ? 'on' : ''}
                      onClick={() => {
                        if (cat === 'Спил деревьев') setPage('tree');
                        else if (cat === 'Ремонт авто') setPage('auto');
                        else {
                          setCustomPageName(cat);
                          setPage('custom');
                        }
                      }}
                    >
                      {cat} ({catCount})
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="add-pill"
                  onClick={() => openModal('category')}
                >
                  <Plus size={14} /> Добавить пункт
                </button>
              </div>
            )}

            {/* 4 крупные KPI-плитки (1:1 со скриншотом) */}
            {page === 'home' && (
              <>
                <div className="kpis">
                  <button
                    type="button"
                    className={`kpi ${totalIncome > 0 ? 'good' : ''}`}
                    onClick={() => setPage('part-time')}
                  >
                    <span className="lb">Чистый доход всего</span>
                    <strong className="vl num-tab">{formatMoney(totalIncome)}</strong>
                    <span className="sub">работы + чистая прибыль продаж</span>
                  </button>
                  <button
                    type="button"
                    className={`kpi ${jobsIncome > 0 ? 'good' : ''}`}
                    onClick={() => setPage('part-time')}
                  >
                    <span className="lb">Доход от работ</span>
                    <strong className="vl num-tab">{formatMoney(jobsIncome)}</strong>
                    <span className="sub">
                      {jobs.length} {plural(jobs.length, 'заказ', 'заказа', 'заказов')} выполнено
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`kpi ${resaleNet > 0 ? 'good' : resaleNet < 0 ? 'warn' : ''}`}
                    onClick={() => setPage('resale')}
                  >
                    <span className="lb">Прибыль перепродажи</span>
                    <strong className="vl num-tab">{formatMoney(resaleNet)}</strong>
                    <span className="sub">выручка {formatMoney(saleRevenue)}</span>
                  </button>
                  <button
                    type="button"
                    className="kpi"
                    onClick={() => setPage('resale')}
                  >
                    <span className="lb">Вложено в товары</span>
                    <strong className="vl num-tab">{formatMoney(resaleSpent)}</strong>
                    <span className="sub">на складе сейчас {formatMoney(activeStockValue)}</span>
                  </button>
                </div>

                <div className="kpis kpis-3">
                  <button
                    type="button"
                    className={`kpi ${investorBalance > 0 ? 'amber' : ''}`}
                    onClick={() => setPage('investors')}
                  >
                    <span className="lb">Обязательства инвесторам</span>
                    <strong className="vl num-tab">{formatMoney(investorBalance)}</strong>
                    <span className="sub">вложение + вознаграждение по правилам</span>
                  </button>
                  <button
                    type="button"
                    className={`kpi ${consumerBalance > 0 ? 'warn' : ''}`}
                    onClick={() => setPage('consumer')}
                  >
                    <span className="lb">Потребительские долги</span>
                    <strong className="vl num-tab">{formatMoney(consumerBalance)}</strong>
                    <span className="sub">погашено {formatMoney(consumerPaidTotal)}</span>
                  </button>
                  <button
                    type="button"
                    className="kpi"
                    onClick={() => openModal('resale')}
                  >
                    <span className="lb">Быстрое добавление</span>
                    <strong className="vl" style={{ color: 'var(--or)' }}>
                      + Запись
                    </strong>
                    <span className="sub">товар, работа, инвестор или долг</span>
                  </button>
                </div>
              </>
            )}

            {page === 'resale' && (
              <div className="kpis">
                <div className={`kpi ${activeResale.length > 0 ? 'good' : ''}`}>
                  <span className="lb">В продаже</span>
                  <strong className="vl num-tab">{activeResale.length}</strong>
                  <span className="sub">на сумму {formatMoney(activeStockValue)}</span>
                </div>
                <div className="kpi">
                  <span className="lb">Выручка продаж</span>
                  <strong className="vl num-tab">{formatMoney(saleRevenue)}</strong>
                  <span className="sub">продано {soldResale.length} шт.</span>
                </div>
                <div className={`kpi ${resaleNet > 0 ? 'good' : resaleNet < 0 ? 'warn' : ''}`}>
                  <span className="lb">Чистая прибыль</span>
                  <strong className="vl num-tab">{formatMoney(resaleNet)}</strong>
                  <span className="sub">после вычета закупки и инвестиций</span>
                </div>
                <div className={`kpi ${investorBalance > 0 ? 'amber' : ''}`}>
                  <span className="lb">К выплате инвесторам</span>
                  <strong className="vl num-tab">{formatMoney(investorBalance)}</strong>
                  <span className="sub">по активным и проданным товарам</span>
                </div>
              </div>
            )}

            {isPartTimeSection && (
              <>
                <div className="kpis">
                  <div className={`kpi ${jobsIncome > 0 ? 'good' : ''}`}>
                    <span className="lb">Заработано всего</span>
                    <strong className="vl num-tab">{formatMoney(jobsIncome)}</strong>
                    <span className="sub">по всем категориям подработки</span>
                  </div>
                  <div className="kpi">
                    <span className="lb">Выполнено работ</span>
                    <strong className="vl num-tab">{visibleItems.length}</strong>
                    <span className="sub">в выбранном фильтре</span>
                  </div>
                  <div className="kpi">
                    <span className="lb">Сумма в разделе</span>
                    <strong className="vl num-tab">
                      {formatMoney(
                        visibleItems.reduce(
                          (sum, item) => sum + num(item.data, 'amountKopecks'),
                          0,
                        ),
                      )}
                    </strong>
                    <span className="sub">{pageTitle}</span>
                  </div>
                  <div className="kpi">
                    <span className="lb">Категории</span>
                    <strong className="vl num-tab">{categories.length}</strong>
                    <span className="sub">спил, авто и свои пункты</span>
                  </div>
                </div>

                {page === 'part-time' && (
                  <div className="cat-cards-grid">
                    {categories.map((cat) => {
                      const catJobs = jobs.filter((j) => str(j.data, 'category') === cat);
                      const catTotal = catJobs.reduce(
                        (s, j) => s + num(j.data, 'amountKopecks'),
                        0,
                      );
                      return (
                        <button
                          key={cat}
                          type="button"
                          className="cat-tile"
                          onClick={() => {
                            if (cat === 'Спил деревьев') setPage('tree');
                            else if (cat === 'Ремонт авто') setPage('auto');
                            else {
                              setCustomPageName(cat);
                              setPage('custom');
                            }
                          }}
                        >
                          <span className="cat-tile-ico">
                            {cat === 'Спил деревьев' ? (
                              <Sprout size={28} />
                            ) : cat === 'Ремонт авто' ? (
                              <Wrench size={28} />
                            ) : (
                              <BriefcaseBusiness size={28} />
                            )}
                          </span>
                          <b>{cat}</b>
                          <span className="num-tab">
                            {catJobs.length} {plural(catJobs.length, 'запись', 'записи', 'записей')}{' '}
                            · {formatMoney(catTotal)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {page === 'investors' && (
              <div className="kpis">
                <div className="kpi">
                  <span className="lb">Инвесторов</span>
                  <strong className="vl num-tab">{investors.length}</strong>
                  <span className="sub">в справочнике партнёров</span>
                </div>
                <div className={`kpi ${investorBalance > 0 ? 'amber' : ''}`}>
                  <span className="lb">Текущий остаток к выплате</span>
                  <strong className="vl num-tab">{formatMoney(investorBalance)}</strong>
                  <span className="sub">капитал + расчётная доля</span>
                </div>
                <div className="kpi">
                  <span className="lb">Привлечено в товары</span>
                  <strong className="vl num-tab">
                    {formatMoney(
                      resaleItems.reduce(
                        (s, item) => s + num(item.data, 'investmentKopecks'),
                        0,
                      ),
                    )}
                  </strong>
                  <span className="sub">сумма всех вложений</span>
                </div>
                <div className="kpi">
                  <span className="lb">Незакрытых сделок</span>
                  <strong className="vl num-tab">{unsettledInvestorItems.length}</strong>
                  <span className="sub">ждут отметки о расчёте</span>
                </div>
              </div>
            )}

            {page === 'consumer' && (
              <div className="kpis">
                <div className={`kpi ${openDebts.length > 0 ? 'warn' : ''}`}>
                  <span className="lb">Активных долгов</span>
                  <strong className="vl num-tab">{openDebts.length}</strong>
                  <span className="sub">ждут погашения</span>
                </div>
                <div className={`kpi ${consumerBalance > 0 ? 'warn' : 'good'}`}>
                  <span className="lb">Остаток долга</span>
                  <strong className="vl num-tab">{formatMoney(consumerBalance)}</strong>
                  <span className="sub">с учётом всех платежей</span>
                </div>
                <div className={`kpi ${consumerPaidTotal > 0 ? 'good' : ''}`}>
                  <span className="lb">Уже погашено</span>
                  <strong className="vl num-tab">{formatMoney(consumerPaidTotal)}</strong>
                  <span className="sub">внесено по частям</span>
                </div>
                <div className="kpi">
                  <span className="lb">Всего обязательств</span>
                  <strong className="vl num-tab">{debts.length}</strong>
                  <span className="sub">включая закрытые</span>
                </div>
              </div>
            )}

            {/* Полоса фильтра и кнопки «Обновить» (1:1 со скриншотом) */}
            <div className="st-bar">
              <input
                className="inp"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Название, клиент, кредитор, инвестор, адрес или описание"
              />
              <button
                type="button"
                className="btn sec sm"
                onClick={() =>
                  cloudEnabled
                    ? void syncFromCloud('incremental')
                    : notify('Все локальные записи отображены актуально')
                }
              >
                Обновить
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={() => openModal(defaultAddAction())}
              >
                <Plus size={16} /> Добавить
              </button>
            </div>
            <div className="st-upd">
              <span>обновляется сразу</span>
              {!cloudEnabled && (
                <span>
                  Хранение: на этом устройстве (облако подключается через <code>.env</code>)
                </span>
              )}
            </div>

            {/* Список карточек записей */}
            <div className={`st-g ${visibleItems.length === 0 ? 'muted-g' : ''}`}>
              {page === 'home' ? 'ПОСЛЕДНИЕ ЗАПИСИ' : pageTitle.toUpperCase()} · {visibleItems.length}
            </div>

            {visibleItems.length > 0 ? (
              <div className="cards-stack">
                {visibleItems.map((entry) => (
                  <LedgerOrderCard
                    key={entry.id}
                    entry={entry}
                    allEntries={entries}
                    onSell={() => openModal('sale', entry)}
                    onPayment={() => openModal('payment', entry)}
                    onInvestorPaid={() =>
                      void persist({
                        ...entry,
                        data: { ...entry.data, investorPaid: true },
                      }).then(() => notify('Расчёт с инвестором отмечен'))
                    }
                    onDelete={() => void removeEntry(entry)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-box">
                <Package size={48} />
                <b>{trimmedQuery ? 'Ничего не найдено' : 'Записей пока нет'}</b>
                <p>
                  {trimmedQuery
                    ? 'Попробуйте изменить поисковый запрос или сбросить фильтр.'
                    : 'Добавьте первую запись в этот раздел — все суммы и показатели пересчитаются мгновенно.'}
                </p>
                {trimmedQuery ? (
                  <button type="button" className="btn sec sm" onClick={() => setQuery('')}>
                    Сбросить поиск
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => openModal(defaultAddAction())}
                  >
                    <Plus size={16} /> Добавить запись
                  </button>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Мобильное нижнее меню (как на сайте при ширине ≤760px) */}
      <nav className="bnav" aria-label="Нижнее меню">
        <div className="bnav-in">
          <button
            type="button"
            className={page === 'home' ? 'on' : ''}
            onClick={() => setPage('home')}
          >
            <Home size={21} />
            <span>Главная</span>
          </button>
          <button
            type="button"
            className={page === 'resale' ? 'on' : ''}
            onClick={() => setPage('resale')}
          >
            <Package size={21} />
            <span>Товары</span>
          </button>
          <button
            type="button"
            className="mid"
            onClick={() => openModal(defaultAddAction())}
            aria-label="Добавить запись"
          >
            <span className="plus">
              <Plus size={23} />
            </span>
          </button>
          <button
            type="button"
            className={isPartTimeSection ? 'on' : ''}
            onClick={() => setPage('part-time')}
          >
            <BriefcaseBusiness size={21} />
            <span>Работы</span>
          </button>
          <button
            type="button"
            className={page === 'consumer' || page === 'investors' ? 'on' : ''}
            onClick={() => setPage('consumer')}
          >
            <CreditCard size={21} />
            <span>Долги</span>
          </button>
        </div>
      </nav>

      {/* Модальное окно создания / продажи / платежа */}
      {modal && (
        <EntryModal
          type={modal}
          target={target}
          investors={investors}
          categories={categories}
          defaultCategory={defaultJobCategory}
          onClose={closeModal}
          onSave={(entry) => void handleSave(entry)}
          onSell={(entry, saleAmount, saleDate) => void handleSell(entry, saleAmount, saleDate)}
          onPayment={(entry, payAmount, payDate) =>
            void handlePayment(entry, payAmount, payDate)
          }
        />
      )}

      {/* Модальное окно «Кабинет и обновление приложения» */}
      {cabinetOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCabinetOpen(false);
          }}
        >
          <section className="modal-card" role="dialog" aria-modal="true">
            <header className="modal-header">
              <div>
                <span className="eyebrow">Кабинет и система</span>
                <h2>Мой капитал — ПК</h2>
              </div>
              <button
                className="close-btn"
                type="button"
                onClick={() => setCabinetOpen(false)}
                aria-label="Закрыть"
              >
                <X size={20} />
              </button>
            </header>
            <div className="modal-body">
              <div className="card-summary-box">
                <div>
                  <b>Текущая версия приложения:</b> v{updater.version}{' '}
                  {updater.deliveryMode === 'live-bundle' && '(обновлено быстрым пакетом)'}
                </div>
                <div>
                  <b>Режим обновления:</b> загружаются только изменённые файлы (пакет ~140 КБ или
                  дельта-блоки), без скачивания всего установщика заново.
                </div>
                <div>
                  <b>Хранилище данных:</b>{' '}
                  {cloudEnabled
                    ? `Облако Supabase (${session?.user.email || 'подключено'})`
                    : 'Локальное хранилище устройства'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() =>
                    updater.status === 'ready' ? void applyUpdate() : void checkUpdates()
                  }
                >
                  <RefreshCw
                    size={15}
                    className={
                      updater.status === 'checking' || updater.status === 'downloading'
                        ? 'spin'
                        : ''
                    }
                  />
                  {updater.status === 'ready'
                    ? `Применить v${updater.nextVersion}`
                    : updater.status === 'downloading'
                      ? `Загрузка ${updater.percent}%`
                      : 'Проверить обновления сейчас'}
                </button>
                {session && (
                  <button
                    type="button"
                    className="btn sec sm danger"
                    onClick={() => {
                      setCabinetOpen(false);
                      void supabase?.auth.signOut();
                    }}
                  >
                    <LogOut size={15} /> Выйти из аккаунта
                  </button>
                )}
              </div>
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="btn sec sm"
                onClick={() => setCabinetOpen(false)}
              >
                Закрыть
              </button>
            </footer>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

function LedgerOrderCard({
  entry,
  allEntries,
  onSell,
  onPayment,
  onInvestorPaid,
  onDelete,
}: {
  entry: Entry;
  allEntries: Entry[];
  onSell: () => void;
  onPayment: () => void;
  onInvestorPaid: () => void;
  onDelete: () => void;
}) {
  const data = entry.data;
  const isResale = entry.type === 'resale';
  const isJob = entry.type === 'job';
  const isDebt = entry.type === 'consumerDebt';
  const isInvestor = entry.type === 'investor';

  const sold = Boolean(data.sold);
  const hasInvestor = Boolean(str(data, 'investorName'));
  const investorSettled = !hasInvestor || Boolean(data.investorPaid);
  const debtRemaining = isDebt ? consumerDebtRemaining(entry) : 0;
  const debtPaid = isDebt ? consumerDebtPaid(entry) : 0;
  const debtTotal = isDebt ? num(data, 'amountKopecks') : 0;

  const investorItems = isInvestor
    ? allEntries.filter(
        (item) => item.type === 'resale' && str(item.data, 'investorName') === str(data, 'name'),
      )
    : [];
  const investorInvestedTotal = investorItems.reduce(
    (s, item) => s + num(item.data, 'investmentKopecks'),
    0,
  );
  const investorOwedTotal = investorItems.reduce(
    (s, item) => s + investorOutstanding(item),
    0,
  );

  const leftTone = isResale
    ? sold
      ? investorSettled
        ? ''
        : 't-rented'
      : 't-new'
    : isJob
      ? 't-new'
      : isDebt
        ? debtRemaining > 0
          ? 't-late'
          : 't-new'
        : investorOwedTotal > 0
          ? 't-rented'
          : '';

  const badgeClass = isResale
    ? sold
      ? investorSettled
        ? 'done'
        : 'mod'
      : 'deliv'
    : isJob
      ? 'act'
      : isDebt
        ? debtRemaining > 0
          ? 'off'
          : 'act'
        : 'deliv';

  const badgeText = isResale
    ? sold
      ? investorSettled
        ? 'Продано · расчёт закрыт'
        : 'Продан · ждёт расчёта с инвестором'
      : 'В продаже'
    : isJob
      ? str(data, 'category', 'Подработка')
      : isDebt
        ? debtRemaining > 0
          ? 'Потребительский долг'
          : 'Долг погашен'
        : 'Инвестор';

  const title = isResale
    ? str(data, 'name', 'Товар без названия')
    : isJob
      ? str(data, 'category', 'Выполненная работа')
      : isDebt
        ? str(data, 'purpose', 'Долг')
        : str(data, 'name', 'Инвестор');

  const workLines = Array.isArray(data.lines) ? (data.lines as WorkLine[]) : [];
  const voiceSource = str(data, 'voiceNote') || str(data, 'voicePath');

  return (
    <article className={`order-card ${leftTone}`}>
      <div className="top">
        <span className={`badge ${badgeClass}`}>{badgeText}</span>
        <span className="top-meta num-tab">
          {formatDateRu(str(data, 'date') || entry.createdAt)} · №{entry.id.slice(0, 4).toUpperCase()}
        </span>
      </div>

      {/* Трёхшаговая шкала прогресса — как на карточке заявки на скриншоте */}
      {isResale && (
        <div className="co-steps">
          <div className={`co-step on ${!sold ? 'cur' : ''}`}>
            <i />
            <span>Закуплен</span>
          </div>
          <div className={`co-step ${sold ? 'on' : ''} ${sold && !investorSettled ? 'cur' : ''}`}>
            <i />
            <span>{sold ? 'Продан' : 'В продаже'}</span>
          </div>
          <div className={`co-step ${sold && investorSettled ? 'on cur' : ''}`}>
            <i />
            <span>Расчёт закрыт</span>
          </div>
        </div>
      )}

      {isDebt && (
        <div className="co-steps">
          <div className={`co-step on ${debtPaid === 0 ? 'cur' : ''}`}>
            <i />
            <span>Оформлен</span>
          </div>
          <div
            className={`co-step ${debtPaid > 0 ? 'on' : ''} ${
              debtPaid > 0 && debtRemaining > 0 ? 'cur' : ''
            }`}
          >
            <i />
            <span>Частично погашен</span>
          </div>
          <div className={`co-step ${debtRemaining === 0 ? 'on cur' : ''}`}>
            <i />
            <span>Закрыт полностью</span>
          </div>
        </div>
      )}

      <div className="card-lines">
        {isResale && (
          <>
            <div>
              Состояние: <b>{str(data, 'condition', 'Хорошее')}</b>
              {hasInvestor && (
                <>
                  {' '}
                  · Инвестор: <span className="hl">{str(data, 'investorName')}</span>
                </>
              )}
            </div>
            {str(data, 'description') && <div>Комментарий: {str(data, 'description')}</div>}
          </>
        )}

        {isJob && (
          <>
            {str(data, 'address') && (
              <div>
                Адрес: <span className="hl">{str(data, 'address')}</span>
              </div>
            )}
            <div>
              Время работы:{' '}
              <b className="num-tab">
                {str(data, 'startTime', '09:00')}–{str(data, 'endTime', '10:00')}
              </b>
            </div>
            {str(data, 'description') && <div>Описание: {str(data, 'description')}</div>}
          </>
        )}

        {isDebt && (
          <>
            <div>
              Кредитор: <span className="hl">{str(data, 'creditor', '—')}</span>
            </div>
            {str(data, 'description') && <div>Примечание: {str(data, 'description')}</div>}
          </>
        )}

        {isInvestor && (
          <>
            <div>
              Связанных товаров: <b>{investorItems.length}</b>
            </div>
            {str(data, 'description') && <div>Условия и заметки: {str(data, 'description')}</div>}
          </>
        )}
      </div>

      <div className="title">{title}</div>

      <div className="card-summary-box num-tab">
        {isResale && (
          <>
            <div>
              Закупка: <b>{formatMoney(num(data, 'purchaseKopecks'))}</b> · Инвестиции:{' '}
              <b>{formatMoney(num(data, 'investmentKopecks'))}</b> · Вложено всего:{' '}
              <b>{formatMoney(resaleCosts(entry))}</b>
            </div>
            {sold && (
              <div>
                Продажа: <b>{formatMoney(num(data, 'saleKopecks'))}</b> · Результат:{' '}
                <span className={resaleProfit(entry) >= 0 ? 'pos' : 'neg'}>
                  {formatMoney(resaleProfit(entry))}
                </span>
                {hasInvestor && (
                  <>
                    {' '}
                    · Доля инвестора: <b>{formatMoney(investorPayout(entry))}</b> (к возврату с
                    телом: <b>{formatMoney(investorOutstanding(entry))}</b>)
                  </>
                )}
              </div>
            )}
          </>
        )}

        {isJob && (
          <>
            {workLines.length > 0 && (
              <div>
                Работы:{' '}
                {workLines
                  .map((l) => `${l.name} (${formatMoney(l.amountKopecks)})`)
                  .join(' · ')}
              </div>
            )}
            <div>
              Заработок за заказ:{' '}
              <span className="pos">{formatMoney(num(data, 'amountKopecks'))}</span>
            </div>
          </>
        )}

        {isDebt && (
          <div>
            Исходная сумма: <b>{formatMoney(debtTotal)}</b> · Погашено:{' '}
            <span className="pos">{formatMoney(debtPaid)}</span> · Остаток к возврату:{' '}
            <span className={debtRemaining > 0 ? 'neg' : 'pos'}>
              {formatMoney(debtRemaining)}
            </span>
          </div>
        )}

        {isInvestor && (
          <div>
            Всего вложено партнёром: <b>{formatMoney(investorInvestedTotal)}</b> · Текущий остаток
            обязательств:{' '}
            <span className={investorOwedTotal > 0 ? 'neg' : 'pos'}>
              {formatMoney(investorOwedTotal)}
            </span>
          </div>
        )}
      </div>

      {voiceSource && (
        <div className="voice-wrap">
          <AudioPlayer voice={voiceSource} />
        </div>
      )}

      <div className="acts">
        {isResale && !sold && (
          <button type="button" className="btn sm" onClick={onSell}>
            Продать товар
          </button>
        )}
        {isResale && sold && hasInvestor && !Boolean(data.investorPaid) && (
          <button type="button" className="btn sm" onClick={onInvestorPaid}>
            Отметить расчёт с инвестором
          </button>
        )}
        {isDebt && debtRemaining > 0 && (
          <button type="button" className="btn sm" onClick={onPayment}>
            Внести платёж
          </button>
        )}
        <button type="button" className="btn sec sm danger" onClick={onDelete}>
          Удалить
        </button>
      </div>
    </article>
  );
}

function AudioPlayer({ voice }: { voice: string }) {
  const [src, setSrc] = useState(voice.startsWith('data:') ? voice : '');

  useEffect(() => {
    if (voice.startsWith('data:')) {
      setSrc(voice);
      return;
    }
    let cancelled = false;
    if (supabase) {
      void supabase.storage
        .from('voice-notes')
        .createSignedUrl(voice, 3600)
        .then(({ data }) => {
          if (!cancelled && data?.signedUrl) setSrc(data.signedUrl);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [voice]);

  return src ? (
    <audio className="voice-player" controls src={src} />
  ) : (
    <small className="muted">Загружается голосовая заметка…</small>
  );
}
