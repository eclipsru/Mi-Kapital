import { useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, ClipboardList, Hammer, Plus, Search, TrendingUp, X } from 'lucide-react';
import { formatDate, jobEarnings, jobNetProfit, lastMonths, money, monthKey, monthLabel, oddJobIncomes, sum, today, workPlans, type AppData } from '../core/model';
import { Badge, Bars, Button, Empty, PageHead, SectionHead } from '../components/ui';
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
  const plannedTotal = sum(plans.map(p => p.expectedKopecks));
  const filteredJobs = useMemo(() => monthJobs.filter(i => !query || `${i.title} ${i.note} ${i.work?.kind ?? ''} ${Object.values(i.work?.values ?? {}).join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), [monthJobs, query]);
  const filteredPlans = useMemo(() => plans.filter(p => !query || `${p.title} ${p.kind} ${p.note}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.createdAt.localeCompare(b.createdAt)), [plans, query]);
  const periodLabel = month ? `за ${monthLabel(month)}` : 'за всё время';
  const series = lastMonths(6).map(key => ({ key, income: jobEarnings(data, key), expense: 0 }));
  const switchTab = (next: JobsTab) => { setTab(next); setQuery(''); };
  return <>
    <button className="text-link orange-link jobs-back" onClick={onBack}><ArrowLeft size={16}/>К доходам</button>
    <PageHead eyebrow="ДОХОДЫ · РАЗОВЫЕ РАБОТЫ" title="Шабашки" description="В доход идёт чистая прибыль: полученная сумма минус расходы на работу."/>
    <div className="income-top jobs-income-top" aria-label="Чистая прибыль шабашек">
      <section className="panel income-total"><span className="metric-icon green"><TrendingUp size={23}/></span><span className="metric-label">Чистая прибыль {periodLabel}</span><strong>{money(jobEarnings(data, month))}</strong><div className="flex gap-2"><Badge tone="green">После расходов</Badge><span className="muted small">{monthJobs.length} работ · получено {money(doneTotal)}</span></div></section>
      <section className="panel"><SectionHead title="Динамика чистой прибыли"/><Bars series={series}/></section>
    </div>
    {plans.length > 0 && <div className="legacy-income-note jobs-planned-note"><ClipboardList size={16}/><span>Запланировано: <strong>{money(plannedTotal)}</strong> · {plans.length} в плане. Планы пока не входят в прибыль.</span></div>}
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
        {filteredJobs.length ? <div className="table-scroll"><table className="ledger-table income-table"><thead><tr><th>Работа</th><th>Дата</th><th>Счёт</th><th className="align-right">Получено</th><th className="align-right">Расходы</th><th className="align-right">Чистая прибыль</th></tr></thead><tbody>{filteredJobs.map(i => <tr key={i.id}><td><button className="text-link" onClick={() => onEdit({ type: 'odd-job', item: i })}>{i.title}</button><div><Badge>{i.work?.kind ?? 'Шабашка'}</Badge></div></td><td className="muted date-cell">{formatDate(i.date)}</td><td className="muted">{data.accounts.find(a => a.id === i.accountId)?.name}</td><td className="align-right money-cell muted">{money(i.amountKopecks)}</td><td className="align-right money-cell muted">{money(i.costKopecks ?? 0)}</td><td className={`align-right money-cell ${jobNetProfit(i) >= 0 ? 'text-green' : 'text-red'}`}>{money(jobNetProfit(i))}</td></tr>)}</tbody></table></div> : <Empty icon={Hammer} title={jobs.length ? 'Ничего не найдено' : 'Пока нет выполненных шабашек'} text={jobs.length ? 'Попробуйте другой месяц или поисковый запрос.' : 'Добавьте первую выполненную работу: вид работы, детали, сумму и расходы.'} action={<Button onClick={() => onEdit({ type: 'odd-job' })}>Добавить выполненную</Button>}/>}
      </> : <>
        <SectionHead title="Запланировать" count={filteredPlans.length} action={<Button onClick={() => onEdit({ type: 'odd-job-plan' })}><Plus size={16}/>Запланировать работу</Button>}/>
        {filteredPlans.length ? <div className="table-scroll"><table className="ledger-table income-table"><thead><tr><th>Вид работы</th><th>Что нужно сделать</th><th>Дата</th><th className="align-right">Ожидаемая сумма</th></tr></thead><tbody>{filteredPlans.map(p => <tr key={p.id}><td><Badge tone="orange">{p.kind}</Badge></td><td><button className="text-link" onClick={() => onEdit({ type: 'odd-job-plan', item: p })}>{p.title}</button></td><td className="muted date-cell">{p.date ? formatDate(p.date) : '—'}</td><td className="align-right money-cell">{p.expectedKopecks ? money(p.expectedKopecks) : '—'}</td></tr>)}</tbody></table></div> : <Empty icon={ClipboardList} title={plans.length ? 'Ничего не найдено' : 'Пока нет запланированных шабашек'} text={plans.length ? 'Попробуйте другой поисковый запрос.' : 'Выберите вид работы и добавьте план. Остальные поля доработаем позже.'} action={<Button onClick={() => onEdit({ type: 'odd-job-plan' })}>Запланировать работу</Button>}/>}
      </>}
    </section>
  </>;
}
