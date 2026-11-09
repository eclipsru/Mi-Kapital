import { useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, ClipboardList, Hammer, Plus, Search, TrendingUp, Wallet, X } from 'lucide-react';
import { formatDate, money, monthKey, monthLabel, oddJobIncomes, sum, today, workPlans, type AppData } from '../core/model';
import { Badge, Button, Empty, PageHead, SectionHead } from '../components/ui';
import type { EntryRequest } from '../components/EntryModal';
import type { WorkRequest } from '../components/WorkModal';

type JobsTab = 'done' | 'plan';
export function OddJobsPage({ data, onEdit, onBack }: { data: AppData; onEdit: (request: EntryRequest | WorkRequest) => void; onBack: () => void }) {
  const [tab, setTab] = useState<JobsTab>('done');
  const [month, setMonth] = useState(monthKey(today()));
  const [query, setQuery] = useState('');
  const jobs = oddJobIncomes(data);
  const plans = workPlans(data);
  const months = Array.from(new Set([monthKey(today()), ...jobs.map(i => monthKey(i.date))])).sort().reverse();
  const monthJobs = jobs.filter(i => !month || monthKey(i.date) === month);
  const doneTotal = sum(monthJobs.map(i => i.amountKopecks));
  const allTotal = sum(jobs.map(i => i.amountKopecks));
  const plannedTotal = sum(plans.map(p => p.expectedKopecks));
  const filteredJobs = useMemo(() => monthJobs.filter(i => !query || `${i.title} ${i.note} ${i.work?.kind ?? ''} ${Object.values(i.work?.values ?? {}).join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), [monthJobs, query]);
  const filteredPlans = useMemo(() => plans.filter(p => !query || `${p.title} ${p.kind} ${p.note}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.createdAt.localeCompare(b.createdAt)), [plans, query]);
  const periodLabel = month ? `за ${monthLabel(month)}` : 'за всё время';
  const switchTab = (next: JobsTab) => { setTab(next); setQuery(''); };
  return <>
    <button className="text-link orange-link jobs-back" onClick={onBack}><ArrowLeft size={16}/>К доходам</button>
    <PageHead eyebrow="ДОХОДЫ · РАЗОВЫЕ РАБОТЫ" title="Шабашки" description="Отдельная страница шабашек: сводка сверху, выполненное и планы ниже."/>
    <div className="jobs-summary">
      <section className="panel jobs-summary-card"><span className="metric-icon green"><TrendingUp size={22}/></span><div><span className="metric-label">Выполнено {periodLabel}</span><strong>{money(doneTotal)}</strong><small>{monthJobs.length} работ · уже в капитале</small></div></section>
      <section className="panel jobs-summary-card"><span className="metric-icon orange"><ClipboardList size={22}/></span><div><span className="metric-label">Запланировано</span><strong>{money(plannedTotal)}</strong><small>{plans.length} в плане · пока не в капитале</small></div></section>
      <section className="panel jobs-summary-card"><span className="metric-icon green"><Wallet size={22}/></span><div><span className="metric-label">Всего заработано на шабашках</span><strong>{money(allTotal)}</strong><small>{jobs.length} выполненных работ за всё время</small></div></section>
    </div>
    <div className="tabs jobs-tabs" role="tablist" aria-label="Разделы шабашек">
      <button role="tab" id="jobs-tab-done" aria-selected={tab === 'done'} aria-controls="jobs-panel" className={tab === 'done' ? 'active' : ''} onClick={() => switchTab('done')}>Выполнено</button>
      <button role="tab" id="jobs-tab-plan" aria-selected={tab === 'plan'} aria-controls="jobs-panel" className={tab === 'plan' ? 'active' : ''} onClick={() => switchTab('plan')}>Запланировать</button>
    </div>
    <section className="panel jobs-panel" id="jobs-panel" role="tabpanel" aria-labelledby={tab === 'done' ? 'jobs-tab-done' : 'jobs-tab-plan'}>
      <div className="filters">
        <div className="search-field"><Search size={17}/><input aria-label="Поиск шабашек" placeholder={tab === 'done' ? 'Найти выполненную работу…' : 'Найти план…'} value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={15}/></button>}</div>
        {tab === 'done' && <div className="month-select"><CalendarDays size={16}/><select className="inp" aria-label="Месяц шабашек" value={month} onChange={e => setMonth(e.target.value)}><option value="">За всё время</option>{months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></div>}
      </div>
      {tab === 'done' ? <>
        <SectionHead title="Выполнено" count={filteredJobs.length} action={<Button onClick={() => onEdit({ type: 'odd-job' })}><Plus size={16}/>Добавить выполненную</Button>}/>
        {filteredJobs.length ? <div className="table-scroll"><table className="ledger-table income-table"><thead><tr><th>Работа</th><th>Дата</th><th>Счёт</th><th className="align-right">Сумма</th></tr></thead><tbody>{filteredJobs.map(i => <tr key={i.id}><td><button className="text-link" onClick={() => onEdit({ type: 'odd-job', item: i })}>{i.title}</button><div><Badge>{i.work?.kind ?? 'Шабашка'}</Badge></div></td><td className="muted date-cell">{formatDate(i.date)}</td><td className="muted">{data.accounts.find(a => a.id === i.accountId)?.name}</td><td className="align-right money-cell text-green">+{money(i.amountKopecks)}</td></tr>)}</tbody></table></div> : <Empty icon={Hammer} title={jobs.length ? 'Ничего не найдено' : 'Пока нет выполненных шабашек'} text={jobs.length ? 'Попробуйте другой месяц или поисковый запрос.' : 'Добавьте первую выполненную работу: вид работы, детали и сумму.'} action={<Button onClick={() => onEdit({ type: 'odd-job' })}>Добавить выполненную</Button>}/>}
      </> : <>
        <SectionHead title="Запланировать" count={filteredPlans.length} action={<Button onClick={() => onEdit({ type: 'odd-job-plan' })}><Plus size={16}/>Запланировать работу</Button>}/>
        {filteredPlans.length ? <div className="table-scroll"><table className="ledger-table income-table"><thead><tr><th>Вид работы</th><th>Что нужно сделать</th><th>Дата</th><th className="align-right">Ожидаемая сумма</th></tr></thead><tbody>{filteredPlans.map(p => <tr key={p.id}><td><Badge tone="orange">{p.kind}</Badge></td><td><button className="text-link" onClick={() => onEdit({ type: 'odd-job-plan', item: p })}>{p.title}</button></td><td className="muted date-cell">{p.date ? formatDate(p.date) : '—'}</td><td className="align-right money-cell">{p.expectedKopecks ? money(p.expectedKopecks) : '—'}</td></tr>)}</tbody></table></div> : <Empty icon={ClipboardList} title={plans.length ? 'Ничего не найдено' : 'Пока нет запланированных шабашек'} text={plans.length ? 'Попробуйте другой поисковый запрос.' : 'Выберите вид работы и добавьте план. Остальные поля доработаем позже.'} action={<Button onClick={() => onEdit({ type: 'odd-job-plan' })}>Запланировать работу</Button>}/>}
      </>}
    </section>
  </>;
}
