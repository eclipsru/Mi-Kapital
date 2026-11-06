import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, BadgeRussianRuble, BriefcaseBusiness,
  Check, ChevronDown, ChevronRight, CircleHelp, Clock3, CreditCard, Filter, Home,
  Landmark, LogOut, Menu, MoreHorizontal, Package, Plus, Search, ShieldCheck,
  Sprout, TrendingDown, TrendingUp, Wallet, Wrench,
} from 'lucide-react';
import { EntryModal, type ModalType } from './EntryModal';
import { consumerDebtPaid, consumerDebtRemaining, createId, formatMoney, investorOutstanding, num, resaleCosts, resaleProfit, str, today, type Entry } from './domain';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const cloudEnabled = Boolean(supabaseUrl && supabaseKey);
const supabase = cloudEnabled ? createClient(supabaseUrl!, supabaseKey!) : null;

type PageKey = 'home' | 'resale' | 'part-time' | 'tree' | 'auto' | 'custom' | 'investors' | 'consumer';
const defaultCategories = ['Спил деревьев', 'Ремонт авто'];
type PendingOperation = { action: 'upsert'; entry: Entry } | { action: 'delete'; id: string; voicePath?: string };
const queueKey = (userId: string) => `mi-kapital.pending.${userId}`;
function readPending(userId: string): PendingOperation[] { try { return JSON.parse(localStorage.getItem(queueKey(userId)) || '[]') as PendingOperation[]; } catch { return []; } }
function writePending(userId: string, queue: PendingOperation[]) { localStorage.setItem(queueKey(userId), JSON.stringify(queue)); }
function replacePending(userId: string, operation: PendingOperation) {
  const id = operation.action === 'upsert' ? operation.entry.id : operation.id;
  writePending(userId, [...readPending(userId).filter((item) => (item.action === 'upsert' ? item.entry.id : item.id) !== id), operation]);
}
function clearPending(userId: string, id: string) { writePending(userId, readPending(userId).filter((item) => (item.action === 'upsert' ? item.entry.id : item.id) !== id)); }
async function syncUpsert(client: SupabaseClient, userId: string, entry: Entry): Promise<Entry> {
  const updated: Entry = { ...entry, data: { ...entry.data } };
  const voice = updated.data.voiceNote;
  if (typeof voice === 'string' && voice.startsWith('data:')) {
    const blob = await (await fetch(voice)).blob();
    const mimeType = blob.type.split(';')[0] || 'audio/webm';
    const extension = mimeType.split('/')[1] || 'webm';
    const path = `${userId}/${updated.id}.${extension}`;
    const { error: uploadError } = await client.storage.from('voice-notes').upload(path, blob, { contentType: mimeType, upsert: true });
    if (uploadError) throw uploadError;
    delete updated.data.voiceNote;
    updated.data.voicePath = path;
  }
  const { error } = await client.from('ledger_entries').upsert({ id: updated.id, owner_id: userId, kind: updated.type, payload: updated.data, created_at: updated.createdAt, updated_at: updated.updatedAt });
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
function App() {
  const [entries, setEntries] = useState<Entry[]>(() => {
    if (cloudEnabled) return [];
    try { return JSON.parse(localStorage.getItem('mi-kapital.entries') || '[]') as Entry[]; } catch { return []; }
  });
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!cloudEnabled);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [page, setPage] = useState<PageKey>('home');
  const [customPageName, setCustomPageName] = useState('');
  const [modal, setModal] = useState<ModalType>(null);
  const [target, setTarget] = useState<Entry | null>(null);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3800); }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  const refreshCloud = useCallback(async () => {
    if (!supabase || !session?.user) return;
    const userId = session.user.id;
    setSyncing(true);
    const { data, error } = await supabase.from('ledger_entries').select('id,kind,payload,created_at,updated_at').order('created_at', { ascending: false });
    if (error) {
      let cache: Entry[] = [];
      try { cache = JSON.parse(localStorage.getItem(`mi-kapital.cache.${userId}`) || '[]') as Entry[]; } catch { /* empty cache */ }
      setEntries(cache); setLoadedUserId(userId); setSyncing(false);
      notify(`Нет связи с облаком. Показаны последние сохранённые данные: ${error.message}`); return;
    }
    const records = (data || []).map((row) => ({ id: row.id, type: row.kind as Entry['type'], data: row.payload as Record<string, unknown>, createdAt: row.created_at, updatedAt: row.updated_at }));
    const synced = new Map(records.map((entry) => [entry.id, entry]));
    const pending = readPending(userId); const retry: PendingOperation[] = [];
    for (const operation of pending) {
      try {
        if (operation.action === 'upsert') synced.set(operation.entry.id, await syncUpsert(supabase, userId, operation.entry));
        else {
          const existing = synced.get(operation.id);
          await syncDelete(supabase, operation.id, operation.voicePath || str(existing?.data || {}, 'voicePath'));
          synced.delete(operation.id);
        }
      } catch { retry.push(operation); }
    }
    writePending(userId, retry);
    const merged = [...synced.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setEntries(merged); setLoadedUserId(userId); setSyncing(false);
    localStorage.setItem(`mi-kapital.cache.${userId}`, JSON.stringify(merged));
    if (retry.length) notify(`Не удалось синхронизировать ${retry.length} запись(и). Они сохранены на устройстве и будут отправлены при следующем обновлении.`);
  }, [session, notify]);

  useEffect(() => { if (cloudEnabled && session) void refreshCloud(); }, [session?.user.id, refreshCloud]);

  useEffect(() => {
    if (!supabase || !session?.user.id) return;
    const channel = supabase.channel(`ledger-${session.user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'ledger_entries', filter: `owner_id=eq.${session.user.id}` }, () => { void refreshCloud(); }).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [session?.user.id, refreshCloud]);

  useEffect(() => {
    if (!cloudEnabled) localStorage.setItem('mi-kapital.entries', JSON.stringify(entries));
  }, [entries]);

  const persist = useCallback(async (entry: Entry) => {
    let updated: Entry = { ...entry, updatedAt: new Date().toISOString(), data: { ...entry.data } };
    if (supabase && session) {
      try {
        updated = await syncUpsert(supabase, session.user.id, updated);
        clearPending(session.user.id, updated.id);
      } catch (error) {
        replacePending(session.user.id, { action: 'upsert', entry: updated });
        const optimistic = [updated, ...entries.filter((item) => item.id !== entry.id)];
        setEntries(optimistic);
        localStorage.setItem(`mi-kapital.cache.${session.user.id}`, JSON.stringify(optimistic));
        notify(`Запись сохранена на устройстве и будет синхронизирована при восстановлении связи: ${error instanceof Error ? error.message : 'ошибка'}`);
        return;
      }
      const cache = [updated, ...entries.filter((item) => item.id !== entry.id)];
      localStorage.setItem(`mi-kapital.cache.${session.user.id}`, JSON.stringify(cache));
    }
    setEntries((current) => [updated, ...current.filter((item) => item.id !== entry.id)]);
  }, [session, entries, notify]);

  const removeEntry = async (entry: Entry) => {
    const remaining = entries.filter((item) => item.id !== entry.id);
    setEntries(remaining);
    if (supabase && session) {
      localStorage.setItem(`mi-kapital.cache.${session.user.id}`, JSON.stringify(remaining));
      try {
        await syncDelete(supabase, entry.id, str(entry.data, 'voicePath'));
        clearPending(session.user.id, entry.id);
      } catch (error) {
        replacePending(session.user.id, { action: 'delete', id: entry.id, voicePath: str(entry.data, 'voicePath') || undefined });
        notify(`Удаление сохранено на устройстве и будет синхронизировано позже: ${error instanceof Error ? error.message : 'ошибка'}`);
      }
    }
  };

  const openModal = (type: ModalType, entry: Entry | null = null) => { setTarget(entry); setModal(type); };
  const closeModal = () => { setTarget(null); setModal(null); };

  const categories = useMemo(() => [...defaultCategories, ...entries.filter((item) => item.type === 'category').map((item) => str(item.data, 'name')).filter(Boolean)], [entries]);
  const investors = useMemo(() => entries.filter((item) => item.type === 'investor'), [entries]);
  const jobs = entries.filter((item) => item.type === 'job');
  const resaleItems = entries.filter((item) => item.type === 'resale');
  const debts = entries.filter((item) => item.type === 'consumerDebt');
  const jobsIncome = jobs.reduce((sum, item) => sum + num(item.data, 'amountKopecks'), 0);
  const saleRevenue = resaleItems.reduce((sum, item) => sum + (item.data.sold ? num(item.data, 'saleKopecks') : 0), 0);
  const resaleNet = resaleItems.reduce((sum, item) => sum + (item.data.sold ? resaleProfit(item) : 0), 0);
  const resaleSpent = resaleItems.reduce((sum, item) => sum + resaleCosts(item), 0);
  const consumerBalance = debts.reduce((sum, item) => sum + consumerDebtRemaining(item), 0);
  const investorBalance = resaleItems.reduce((sum, item) => sum + investorOutstanding(item), 0);
  const totalIncome = jobsIncome + resaleNet;

  const signIn = async (event: FormEvent) => {
    event.preventDefault(); setAuthError('');
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
  };

  if (cloudEnabled && !authReady) return <div className="loading-screen"><div className="brand-mark"><BadgeRussianRuble /></div><p>Подключаем защищённый профиль…</p></div>;
  if (cloudEnabled && session && loadedUserId !== session.user.id) return <div className="loading-screen"><div className="brand-mark"><BadgeRussianRuble /></div><p>Загружаем ваши записи…</p></div>;
  if (cloudEnabled && !session) return <main className="auth-screen"><div className="auth-card"><div className="brand-mark"><BadgeRussianRuble /></div><span className="eyebrow">ЛИЧНЫЙ ФИНАНСОВЫЙ УЧЁТ</span><h1>Мой капитал</h1><p>Войдите, чтобы синхронизировать записи между устройствами.</p><form onSubmit={signIn}><label>Электронная почта<input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required autoComplete="username" /></label><label>Пароль<input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required autoComplete="current-password" /></label>{authError && <p className="form-error">{authError}</p>}<button className="primary-button full" type="submit">Войти в аккаунт <ChevronRight size={17} /></button></form><div className="secure-note"><ShieldCheck size={16} /> Данные видны только вашему аккаунту</div></div></main>;

  const nav = <>
    <div className="nav-label">ОБЗОР</div>
    <NavButton active={page === 'home'} icon={<Home />} label="Главная" onClick={() => setPage('home')} />
    <div className="nav-label nav-label-spaced">ИСТОЧНИКИ ДОХОДА</div>
    <NavButton active={page === 'resale'} icon={<Package />} label="Перепродажа" onClick={() => setPage('resale')} badge={resaleItems.filter((item) => !item.data.sold).length || undefined} />
    <NavButton active={['part-time','tree','auto','custom'].includes(page)} icon={<BriefcaseBusiness />} label="Подработка" onClick={() => setPage('part-time')} />
    <div className="subnav">{categories.map((category) => <button className={`subnav-link ${((page === 'tree' && category === 'Спил деревьев') || (page === 'auto' && category === 'Ремонт авто') || (page === 'custom' && customPageName === category)) ? 'selected' : ''}`} key={category} onClick={() => { setPage(category === 'Спил деревьев' ? 'tree' : category === 'Ремонт авто' ? 'auto' : 'custom'); setCustomPageName(category); }}><span className="subnav-dot" />{category}</button>)}<button className="subnav-add" onClick={() => openModal('category')}><Plus size={14} /> Добавить пункт</button></div>
    <div className="nav-label nav-label-spaced">ОБЯЗАТЕЛЬСТВА</div>
    <NavButton active={page === 'investors'} icon={<Landmark />} label="Инвесторы" onClick={() => setPage('investors')} badge={investors.length || undefined} />
    <NavButton active={page === 'consumer'} icon={<CreditCard />} label="Потребительские" onClick={() => setPage('consumer')} />
  </>;

  const pageTitle = page === 'home' ? 'Главная' : page === 'resale' ? 'Перепродажа' : page === 'part-time' ? 'Подработка' : page === 'tree' ? 'Спил деревьев' : page === 'auto' ? 'Ремонт авто' : page === 'custom' ? customPageName : page === 'investors' ? 'Инвесторы' : 'Потребительские долги';
  const pageDescription = page === 'home' ? 'Полная картина доходов, вложений и обязательств' : page === 'resale' ? 'Товары, вложения и результаты продаж' : page === 'part-time' ? 'Доход от выполненных работ' : page === 'investors' ? 'Люди и вложения, связанные с проектами' : page === 'consumer' ? 'Личные займы и их погашения' : 'Список выполненных работ и заработка';

  const pageItems = page === 'resale' ? resaleItems : page === 'tree' ? jobs.filter((item) => str(item.data, 'category') === 'Спил деревьев') : page === 'auto' ? jobs.filter((item) => str(item.data, 'category') === 'Ремонт авто') : page === 'custom' ? jobs.filter((item) => str(item.data, 'category') === customPageName) : page === 'consumer' ? debts : page === 'investors' ? investors : [];
  const visibleItems = pageItems.filter((item) => JSON.stringify(item.data).toLowerCase().includes(query.toLowerCase()));

  const handleSave = async (entry: Entry) => { await persist(entry); closeModal(); notify('Запись сохранена'); };
  const handleSell = async (entry: Entry, saleKopecks: number, saleDate: string) => { await persist({ ...entry, data: { ...entry.data, sold: true, saleKopecks, saleDate } }); closeModal(); notify('Продажа добавлена'); };
  const handlePayment = async (entry: Entry, amountKopecks: number, date: string) => {
    const payments = Array.isArray(entry.data.payments) ? entry.data.payments as Array<{ id: string; amountKopecks: number; date: string }> : [];
    const remaining = consumerDebtRemaining(entry);
    if (amountKopecks > remaining) { notify(`Платёж не может превышать остаток ${formatMoney(remaining)}.`); return; }
    await persist({ ...entry, data: { ...entry.data, payments: [...payments, { id: createId(), amountKopecks, date }] } }); closeModal(); notify('Погашение записано');
  };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
      <button className="brand" onClick={() => { setPage('home'); setMobileMenu(false); }}><span className="brand-mark"><BadgeRussianRuble size={21} /></span><span><strong>Мой капитал</strong><small>ЛИЧНЫЙ УЧЁТ</small></span></button>
      <nav className="side-nav" onClick={() => setMobileMenu(false)}>{nav}</nav>
      <div className="sidebar-bottom"><div className="profile-chip"><span className="avatar">{session?.user.email?.slice(0, 1).toUpperCase() || 'Я'}</span><span className="profile-copy"><b>{session?.user.email || 'Личный профиль'}</b><small>{cloudEnabled ? 'Облачная синхронизация' : 'Локальный режим'}</small></span>{session && <button className="icon-button logout" title="Выйти" onClick={() => void supabase?.auth.signOut()}><LogOut size={16} /></button>}</div><button className="help-link" onClick={() => notify('Подсказки и настройки подключим следующим этапом.')}><CircleHelp size={16} /> Помощь и настройки <MoreHorizontal size={17} /></button></div>
    </aside>
    {mobileMenu && <button className="mobile-backdrop" aria-label="Закрыть меню" onClick={() => setMobileMenu(false)} />}
    <main className="main-area">
      <header className="topbar"><button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Открыть меню"><Menu /></button><div className="crumb"><span>Мой капитал</span><ChevronRight size={14} /><b>{pageTitle}</b></div><div className="topbar-right"><span className={`connection-pill ${cloudEnabled ? 'cloud' : ''}`}><i />{syncing ? 'Синхронизация…' : cloudEnabled ? 'Облако подключено' : 'Только на этом устройстве'}</span><button className="icon-button" title="Обновить данные" onClick={() => void refreshCloud()} disabled={!cloudEnabled || syncing}><ArrowLeftRight size={17} /></button><span className="top-avatar">{session?.user.email?.slice(0, 1).toUpperCase() || 'Я'}</span></div></header>
      {!cloudEnabled && <div className="local-warning"><span><CircleHelp size={15} /> Сейчас записи сохраняются только в этом браузере. Для синхронизации настройте Supabase в <code>.env</code>.</span></div>}
      <div className="content-wrap">
        <div className="page-heading"><div><div className="eyebrow">МОЙ КАПИТАЛ <span>/</span> {page === 'home' ? 'ОБЗОР' : page === 'consumer' || page === 'investors' ? 'ДОЛГИ' : 'ДОХОДЫ'}</div><h1>{pageTitle}</h1><p>{pageDescription}</p></div>{page !== 'home' && page !== 'part-time' && <button className="primary-button" onClick={() => openModal(page === 'resale' ? 'resale' : page === 'consumer' ? 'debt' : page === 'investors' ? 'investor' : 'job')}><Plus size={18} />{page === 'resale' ? 'Добавить товар' : page === 'investors' ? 'Добавить инвестора' : page === 'consumer' ? 'Добавить долг' : 'Добавить работу'}</button>}</div>
        {page === 'home' ? <Dashboard {...{ jobsIncome, saleRevenue, resaleNet, resaleSpent, consumerBalance, investorBalance, totalIncome, resaleItems, jobs, debts, entries, setPage, openModal }} /> : page === 'part-time' ? <PartTimeLanding categories={categories} jobs={jobs} setPage={(key, name) => { setPage(key); setCustomPageName(name || ''); }} openAdd={() => openModal('category')} /> : <>
          {page === 'resale' && <div className="quick-strip"><MiniStat icon={<Package />} label="Всего товаров" value={String(resaleItems.length)} /><MiniStat icon={<Clock3 />} label="В продаже" value={String(resaleItems.filter((item) => !item.data.sold).length)} /><MiniStat icon={<BadgeRussianRuble />} label="Прибыль от продаж" value={formatMoney(resaleNet)} positive /></div>}
          {page === 'consumer' && <div className="quick-strip"><MiniStat icon={<CreditCard />} label="Остаток долга" value={formatMoney(consumerBalance)} /><MiniStat icon={<Check />} label="Долгов" value={String(debts.length)} /></div>}
          {page === 'investors' && <div className="quick-strip"><MiniStat icon={<Landmark />} label="Инвесторов" value={String(investors.length)} /><MiniStat icon={<BadgeRussianRuble />} label="Оценка обязательств" value={formatMoney(investorBalance)} /></div>}
          <div className="list-toolbar"><div><h2>{page === 'resale' ? 'Мои товары' : page === 'investors' ? 'Список инвесторов' : page === 'consumer' ? 'Список долгов' : 'Записи'}</h2><span>{visibleItems.length} {plural(visibleItems.length, 'запись', 'записи', 'записей')}</span></div><label className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по списку" /></label></div>
          {visibleItems.length ? <div className="record-list">{visibleItems.map((item) => <RecordCard key={item.id} entry={item} entries={entries} onSell={() => openModal('sale', item)} onPayment={() => openModal('payment', item)} onInvestorPaid={() => void persist({ ...item, data: { ...item.data, investorPaid: true, investorPaidAt: today() } })} onDelete={() => { if (window.confirm('Удалить эту запись?')) void removeEntry(item); }} />)}</div> : <EmptyState page={page} onAdd={() => openModal(page === 'resale' ? 'resale' : page === 'consumer' ? 'debt' : page === 'investors' ? 'investor' : 'job')} />}
        </>}
      </div>
      <footer className="footer-note"><ShieldCheck size={15} /> Ваши записи — только для личного учёта <span>•</span> Денежные суммы хранятся в копейках</footer>
    </main>
    {modal && <EntryModal type={modal} target={target} investors={investors} categories={categories} defaultCategory={page === 'tree' ? 'Спил деревьев' : page === 'auto' ? 'Ремонт авто' : page === 'custom' ? customPageName : ''} onClose={closeModal} onSave={handleSave} onSell={handleSell} onPayment={handlePayment} />}
    {toast && <div className="toast"><Check size={17} />{toast}</div>}
  </div>;
}

export default App;

function paymentTotal(entry: Entry): number { return consumerDebtPaid(entry); }
function plural(n: number, one: string, few: string, many: string) { const mod10 = n % 10; const mod100 = n % 100; return mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many; }
function NavButton({ active, icon, label, onClick, badge }: { active: boolean; icon: ReactNode; label: string; onClick: () => void; badge?: number }) { return <button className={`nav-link ${active ? 'active' : ''}`} onClick={onClick}><span className="nav-icon">{icon}</span><span>{label}</span>{badge !== undefined && <em>{badge}</em>}</button>; }
function MiniStat({ icon, label, value, positive = false }: { icon: ReactNode; label: string; value: string; positive?: boolean }) { return <div className="mini-stat"><span className="mini-icon">{icon}</span><span><small>{label}</small><b className={positive ? 'text-positive' : ''}>{value}</b></span></div>; }

function Dashboard(props: { jobsIncome: number; saleRevenue: number; resaleNet: number; resaleSpent: number; consumerBalance: number; investorBalance: number; totalIncome: number; resaleItems: Entry[]; jobs: Entry[]; debts: Entry[]; entries: Entry[]; setPage: (key: PageKey) => void; openModal: (type: ModalType, entry?: Entry | null) => void }) {
  const recent = [...props.entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  return <>
    <section className="welcome-banner"><div className="welcome-copy"><span className="welcome-kicker"><Sprout size={15} /> ФИНАНСЫ ПОД КОНТРОЛЕМ</span><h2>Каждая цифра<br />на своём месте.</h2><p>Сводка обновляется по вашим записям и помогает видеть доходы, вложения и обязательства отдельно.</p><button className="banner-link" onClick={() => props.setPage('resale')}>Перейти к товарам <ChevronRight size={16} /></button></div><div className="banner-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-center"><Wallet size={34} /></div><div className="art-label label-one"><TrendingUp size={15} />Доходы</div><div className="art-label label-two"><Landmark size={15} />Долги</div><span className="art-spark spark-one">✳</span><span className="art-spark spark-two">✦</span></div><div className="banner-bottom"><span>Сводка за всё время</span><span><i /> {cloudEnabled ? 'Облако синхронизировано' : 'Локальные данные'}</span></div></section>
    <div className="section-heading"><div><h2>Финансовая сводка</h2><p>Показатели не смешивают выручку, прибыль и задолженность</p></div><button className="period-button"><Filter size={15} /> За всё время <ChevronDown size={15} /></button></div>
    <div className="metric-grid">
      <MetricCard label="Доход от подработки" value={formatMoney(props.jobsIncome)} icon={<BriefcaseBusiness />} tone="mint" caption={`${props.jobs.length} ${plural(props.jobs.length, 'работа', 'работы', 'работ')}`} onClick={() => props.setPage('part-time')} />
      <MetricCard label="Выручка от продаж" value={formatMoney(props.saleRevenue)} icon={<ArrowDownLeft />} tone="blue" caption={`${props.resaleItems.filter((x) => x.data.sold).length} продано`} onClick={() => props.setPage('resale')} />
      <MetricCard label="Прибыль / убыток перепродаж" value={formatMoney(props.resaleNet)} icon={props.resaleNet >= 0 ? <TrendingUp /> : <TrendingDown />} tone={props.resaleNet >= 0 ? 'green' : 'red'} caption={`Затраты: ${formatMoney(props.resaleSpent)}`} onClick={() => props.setPage('resale')} />
      <MetricCard label="Долг инвесторам*" value={formatMoney(props.investorBalance)} icon={<Landmark />} tone="sand" caption="Капитал и расчётная выплата" onClick={() => props.setPage('investors')} />
      <MetricCard label="Потребительские долги" value={formatMoney(props.consumerBalance)} icon={<CreditCard />} tone="rose" caption={`${props.debts.length} ${plural(props.debts.length, 'обязательство', 'обязательства', 'обязательств')}`} onClick={() => props.setPage('consumer')} />
      <MetricCard label="Доход всего**" value={formatMoney(props.totalIncome)} icon={<BadgeRussianRuble />} tone="violet" caption="Подработка + прибыль от перепродаж" onClick={() => undefined} />
    </div>
    <div className="dashboard-lower"><section className="panel recent-panel"><div className="panel-heading"><div><h3>Последние записи</h3><p>Недавно добавленные данные</p></div><button className="text-button" onClick={() => props.setPage('resale')}>Все записи <ChevronRight size={15} /></button></div>{recent.length ? <div className="recent-list">{recent.map((entry) => <RecentRow key={entry.id} entry={entry} />)}</div> : <div className="compact-empty"><span className="empty-icon"><ArrowLeftRight size={19} /></span><div><b>Записей пока нет</b><small>Добавьте товар, работу или долг — сводка начнёт заполняться.</small></div></div>}</section><section className="panel actions-panel"><div className="panel-heading"><div><h3>Быстрое действие</h3><p>Добавьте новую запись</p></div><span className="action-spark">✳</span></div><button className="quick-action" onClick={() => props.openModal('resale')}><span className="quick-action-icon aqua"><Package size={18} /></span><span><b>Новый товар</b><small>Добавить в перепродажу</small></span><Plus size={18} /></button><button className="quick-action" onClick={() => props.openModal('job')}><span className="quick-action-icon peach"><BriefcaseBusiness size={18} /></span><span><b>Новая работа</b><small>Записать заработок</small></span><Plus size={18} /></button><button className="quick-action" onClick={() => props.openModal('debt')}><span className="quick-action-icon lilac"><CreditCard size={18} /></span><span><b>Новый долг</b><small>Добавить обязательство</small></span><Plus size={18} /></button></section></div>
    <p className="calculation-footnote">* Обязательство перед инвесторами рассчитывается по выбранному для каждого вложения правилу. ** Доход всего — сумма дохода от работ и результата перепродаж; выручка и вложения показаны отдельно.</p>
  </>;
}
function MetricCard({ label, value, icon, tone, caption, onClick }: { label: string; value: string; icon: ReactNode; tone: string; caption: string; onClick: () => void }) { return <button className="metric-card" onClick={onClick}><div className="metric-top"><span className={`metric-icon ${tone}`}>{icon}</span><ChevronRight className="metric-arrow" size={16} /></div><span className="metric-label">{label}</span><strong>{value}</strong><small>{caption}</small></button>; }
function RecentRow({ entry }: { entry: Entry }) { const title = entry.type === 'resale' ? str(entry.data, 'name', 'Товар') : entry.type === 'job' ? str(entry.data, 'category', 'Работа') : entry.type === 'consumerDebt' ? str(entry.data, 'purpose', 'Долг') : entry.type === 'investor' ? str(entry.data, 'name', 'Инвестор') : 'Запись'; const amount = entry.type === 'resale' ? (entry.data.sold ? formatMoney(num(entry.data, 'saleKopecks')) : 'В продаже') : entry.type === 'job' ? formatMoney(num(entry.data, 'amountKopecks')) : entry.type === 'consumerDebt' ? formatMoney(consumerDebtRemaining(entry)) : ''; return <div className="recent-row"><span className={`recent-dot ${entry.type}`}><RecentIcon type={entry.type} /></span><span className="recent-title"><b>{title}</b><small>{new Date(entry.updatedAt).toLocaleDateString('ru-RU')}</small></span><strong>{amount}</strong></div>; }
function RecentIcon({ type }: { type: Entry['type'] }) { if (type === 'resale') return <Package size={16} />; if (type === 'job') return <BriefcaseBusiness size={16} />; if (type === 'consumerDebt') return <CreditCard size={16} />; return <Landmark size={16} />; }
function AudioPlayer({ voice }: { voice: string }) {
  const [src, setSrc] = useState(voice.startsWith('data:') ? voice : '');
  useEffect(() => {
    if (voice.startsWith('data:')) { setSrc(voice); return; }
    let cancelled = false;
    if (supabase) void supabase.storage.from('voice-notes').createSignedUrl(voice, 3600).then(({ data }) => { if (!cancelled && data?.signedUrl) setSrc(data.signedUrl); });
    return () => { cancelled = true; };
  }, [voice]);
  return src ? <audio className="voice-player" controls src={src} /> : <small>Загружается аудио…</small>;
}

function PartTimeLanding({ categories, jobs, setPage, openAdd }: { categories: string[]; jobs: Entry[]; setPage: (key: PageKey, name?: string) => void; openAdd: () => void }) { return <><div className="category-grid">{categories.map((category) => { const count = jobs.filter((job) => str(job.data, 'category') === category).length; const total = jobs.filter((job) => str(job.data, 'category') === category).reduce((sum, job) => sum + num(job.data, 'amountKopecks'), 0); return <button key={category} className="category-card" onClick={() => setPage(category === 'Спил деревьев' ? 'tree' : category === 'Ремонт авто' ? 'auto' : 'custom', category)}><span className={`category-art ${category === 'Спил деревьев' ? 'tree-art' : category === 'Ремонт авто' ? 'auto-art' : 'custom-art'}`}>{category === 'Спил деревьев' ? <Sprout size={28} /> : category === 'Ремонт авто' ? <Wrench size={28} /> : <BriefcaseBusiness size={28} />}</span><span className="category-card-body"><small>КАТЕГОРИЯ</small><b>{category}</b><span>{count} {plural(count, 'запись', 'записи', 'записей')} <i>·</i> {formatMoney(total)}</span></span><ChevronRight size={19} /></button>; })}<button className="add-category-card" onClick={openAdd}><span><Plus size={21} /></span><b>Добавить пункт</b><small>Создайте свою категорию подработки</small></button></div><div className="info-callout"><span><CircleHelp size={18} /></span><p>В категориях можно хранить описание работы, время начала и окончания, а также сумму заработка. Для ремонта авто добавляйте несколько выполненных работ в одной записи.</p></div></>; }

function RecordCard({ entry, entries, onSell, onPayment, onInvestorPaid, onDelete }: { entry: Entry; entries: Entry[]; onSell: () => void; onPayment: () => void; onInvestorPaid: () => void; onDelete: () => void }) {
  const data = entry.data;
  const isResale = entry.type === 'resale'; const isJob = entry.type === 'job'; const isDebt = entry.type === 'consumerDebt'; const isInvestor = entry.type === 'investor';
  const title = isResale ? str(data, 'name', 'Товар без названия') : isJob ? str(data, 'category', 'Работа') : isDebt ? str(data, 'purpose', 'Долг') : str(data, 'name', 'Инвестор');
  const amount = isResale ? data.sold ? num(data, 'saleKopecks') : resaleCosts(entry) : isJob ? num(data, 'amountKopecks') : isDebt ? consumerDebtRemaining(entry) : 0;
  const investments = isInvestor ? entries.filter((item) => item.type === 'resale' && str(item.data, 'investorName') === str(data, 'name')) : [];
  const invested = investments.reduce((sum, item) => sum + num(item.data, 'investmentKopecks'), 0);
  const outstanding = investments.reduce((sum, item) => sum + investorOutstanding(item), 0);
  const status = isResale ? Boolean(data.sold) ? Boolean(data.investorPaid) ? 'Расчёт завершён' : 'Продан' : 'В продаже' : isDebt ? amount <= 0 ? 'Погашен' : 'Не погашен' : isJob ? str(data, 'date', today()) : 'Учет';
  return <article className="record-card"><div className={`record-icon ${entry.type}`}><RecentIcon type={entry.type} /></div><div className="record-main"><div className="record-title-row"><h3>{title}</h3><span className={`status-pill ${isResale ? Boolean(data.sold) ? Boolean(data.investorPaid) ? 'neutral' : 'sold' : 'active' : isDebt ? amount <= 0 ? 'sold' : 'owed' : 'neutral'}`}>{status}</span></div><p>{isResale ? [str(data, 'condition'), str(data, 'investorName') && `Инвестор: ${str(data, 'investorName')}`, str(data, 'description')].filter(Boolean).join(' · ') || 'Описание не добавлено' : isJob ? [str(data, 'address'), str(data, 'description'), `${str(data, 'startTime')}–${str(data, 'endTime')}`].filter(Boolean).join(' · ') || 'Работа выполнена' : isDebt ? [`Кредитор: ${str(data, 'creditor')}`, str(data, 'description')].filter(Boolean).join(' · ') : isInvestor ? `${investments.length} вложений · Остаток обязательств: ${formatMoney(outstanding)}` : str(data, 'description') || 'Инвестор добавлен в список'}</p><div className="record-meta"><span><Clock3 size={14} />{new Date(entry.createdAt).toLocaleDateString('ru-RU')}</span>{isResale && <span>Вложения: {formatMoney(resaleCosts(entry))}</span>}{isJob && str(data, 'address') && <span><ArrowUpRight size={14} />{str(data, 'address')}</span>}{isDebt && <span>Погашено: {formatMoney(paymentTotal(entry))}</span>}{isInvestor && <span>Всего вложено: {formatMoney(invested)}</span>}{(str(data, 'voiceNote') || str(data, 'voicePath')) && <AudioPlayer voice={str(data, 'voiceNote') || str(data, 'voicePath')} />}</div></div><div className="record-amount"><small>{isResale ? data.sold ? 'СУММА ПРОДАЖИ' : 'ВЛОЖЕНИЯ' : isJob ? 'ЗАРАБОТОК' : isDebt ? 'ОСТАТОК' : isInvestor ? 'ВЛОЖЕНО' : ''}</small><strong>{isInvestor ? formatMoney(invested) : formatMoney(amount)}</strong>{isResale && !Boolean(data.sold) && <button className="small-primary" onClick={onSell}>Продал товар</button>}{isResale && Boolean(data.sold) && str(data, 'investorName') && !Boolean(data.investorPaid) && <button className="small-primary repay" onClick={onInvestorPaid}>Отметить расчёт</button>}{isDebt && amount > 0 && <button className="small-primary repay" onClick={onPayment}>Записать платёж</button>}</div><button className="icon-button delete-button" title="Удалить запись" onClick={onDelete}><MoreHorizontal size={19} /></button></article>;
}
function EmptyState({ page, onAdd }: { page: PageKey; onAdd: () => void }) { const description = page === 'resale' ? 'Добавьте первый товар, чтобы учитывать вложения и результат продажи.' : page === 'investors' ? 'Добавьте инвесторов, чтобы связывать их с вложениями в товары.' : page === 'consumer' ? 'Добавьте долг и фиксируйте погашения — остаток пересчитается автоматически.' : 'Добавьте выполненную работу — сумма попадёт в сводку доходов.'; return <div className="empty-state"><span className="empty-illustration"><Package size={27} /></span><h3>Здесь пока пусто</h3><p>{description}</p><button className="primary-button" onClick={onAdd}><Plus size={17} />Добавить запись</button></div>; }
