import { useMemo, useState } from 'react';
import { ArrowUpRight, CalendarDays, Hammer, History, Repeat2, Search, TrendingUp, Wallet, X } from 'lucide-react';
import { formatDate, incomeCategories, money, monthKey, monthLabel, monthlySeries, sum, today, type AppData, type IncomeCategory } from '../core/model';
import { AddButton, Badge, Bars, Button, Empty, PageHead, SectionHead } from '../components/ui';
import type { EntryRequest } from '../components/EntryModal';
import type { WorkRequest } from '../components/WorkModal';

type IncomeView = 'Перепродажи' | 'all';
const descriptions: Record<IncomeCategory, string> = {
  Перепродажи: 'Продажи товаров и вещей: поступления отдельно от разовых работ.',
  Шабашки: 'Отдельная страница: сводка, выполненное и планы разовых работ.',
};
export function IncomePage({ data, onEdit, onOpenJobs }: { data: AppData; onEdit: (request: EntryRequest | WorkRequest) => void; onOpenJobs: () => void }) {
  const [month, setMonth] = useState(monthKey(today()));
  const [query, setQuery] = useState('');
  const [view, setView] = useState<IncomeView>('Перепродажи');
  const [legacyCategory, setLegacyCategory] = useState('all');
  const months = Array.from(new Set([monthKey(today()), ...data.incomes.map(i => monthKey(i.date))])).sort().reverse();
  const scoped = view === 'all' ? data.incomes : data.incomes.filter(i => i.category === 'Перепродажи');
  const legacyCount = data.incomes.filter(i => !incomeCategories.includes(i.category as IncomeCategory)).length;
  const legacyCategories = Array.from(new Set(data.incomes.map(i => i.category).filter(c => !incomeCategories.includes(c as IncomeCategory))));
  const filtered = useMemo(() => scoped.filter(i => (!month || monthKey(i.date) === month) && (!query || `${i.title} ${i.category} ${i.note}`.toLowerCase().includes(query.toLowerCase())) && (view !== 'all' || legacyCategory === 'all' || i.category === legacyCategory)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), [scoped, month, query, view, legacyCategory]);
  const total = sum(filtered.map(i => i.amountKopecks));
  const periodLabel = month ? `за ${monthLabel(month)}` : 'за всё время';
  const addIncome = () => onEdit({ type: 'income', category: 'Перепродажи' });
  const switchView = (next: IncomeView) => { setView(next); setQuery(''); setLegacyCategory('all'); };
  const grouped = useMemo(() => {
    const groups = new Map<string, number>();
    for (const item of filtered) { const key = view === 'all' ? item.category : item.title; groups.set(key, (groups.get(key) ?? 0) + item.amountKopecks); }
    return [...groups].map(([name, value]) => ({ name, total: value })).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [filtered, view]);
  const chartData = { ...data, incomes: scoped, movements: [] };
  const jobsMonth = data.incomes.filter(i => i.category === 'Шабашки' && (!month || monthKey(i.date) === month));
  return <>
    <PageHead eyebrow="ПОСТУПЛЕНИЯ · РОСТ КАПИТАЛА" title="Доходы" description="Перепродажи здесь, шабашки — на отдельной странице. Баланс счёта обновляется сам." action={<AddButton onClick={addIncome}>Добавить доход</AddButton>}/>
    <div className="income-directions" aria-label="Направления доходов">
      <button className={`income-direction ${view === 'Перепродажи' ? 'active' : ''}`} aria-pressed={view === 'Перепродажи'} onClick={() => switchView('Перепродажи')}>
        <span className="direction-icon"><Repeat2 size={22} strokeWidth={1.8}/></span>
        <span className="direction-copy"><strong>Перепродажи</strong><small>{descriptions['Перепродажи']}</small></span>
        <span className="direction-amount"><strong>{money(sum(scopedForMonth(data.incomes, 'Перепродажи', month).map(i => i.amountKopecks)))}</strong><small>{receiptCount(scopedForMonth(data.incomes, 'Перепродажи', month).length)} {periodLabel}</small></span>
      </button>
      <button className="income-direction income-direction-link" aria-label="Шабашки — открыть отдельную страницу" onClick={onOpenJobs}>
        <span className="direction-icon"><Hammer size={22} strokeWidth={1.8}/></span>
        <span className="direction-copy"><strong>Шабашки</strong><small>{descriptions['Шабашки']}</small></span>
        <span className="direction-amount"><strong>{money(sum(jobsMonth.map(i => i.amountKopecks)))}</strong><small>{receiptCount(jobsMonth.length)} {periodLabel} · открыть <ArrowUpRight size={12}/></small></span>
      </button>
    </div>
    {legacyCount > 0 && <div className="legacy-income-note"><History size={16}/><span>В истории: {receiptCount(legacyCount)} в прежних категориях. Они по-прежнему учитываются в капитале.</span><button className="text-link orange-link" onClick={() => switchView(view === 'all' ? 'Перепродажи' : 'all')}>{view === 'all' ? 'Вернуться к перепродажам' : 'Показать всю историю'}</button></div>}
    <div className="income-top" id="income-details" aria-label={view === 'all' ? 'Вся история доходов' : 'Перепродажи'}>
      <section className="panel income-total"><span className="metric-icon green"><TrendingUp size={23}/></span><span className="metric-label">{view === 'all' ? 'Все доходы' : 'Перепродажи'} {periodLabel}</span><strong>{money(total)}</strong><div className="flex gap-2"><Badge tone="green">{receiptCount(filtered.length)}</Badge><span className="muted small">Уже включено в капитал</span></div></section>
      <section className="panel"><SectionHead title={view === 'all' ? 'Динамика всех доходов' : 'Динамика · Перепродажи'}/><Bars series={monthlySeries(chartData)}/></section>
    </div>
    <div className="income-layout"><section className="panel"><div className="filters"><div className="search-field"><Search size={17}/><input aria-label="Поиск доходов" placeholder="Найти поступление…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={15}/></button>}</div>{view === 'all' && <select className="inp" aria-label="Категория дохода" value={legacyCategory} onChange={e => setLegacyCategory(e.target.value)}><option value="all">Все категории</option>{incomeCategories.map(c => <option key={c}>{c}</option>)}{legacyCategories.map(c => <option key={c}>{c}</option>)}</select>}<div className="month-select"><CalendarDays size={16}/><select className="inp" aria-label="Месяц доходов" value={month} onChange={e => setMonth(e.target.value)}><option value="">За всё время</option>{months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></div></div>
      {filtered.length ? <div className="table-scroll"><table className="ledger-table income-table"><thead><tr><th>Поступление</th><th>Дата</th><th>Счёт</th><th className="align-right">Сумма</th></tr></thead><tbody>{filtered.map(i => <tr key={i.id}><td><button className="text-link" onClick={() => onEdit(i.category === 'Шабашки' ? { type: 'odd-job', item: i } : { type: 'income', item: i })}>{i.title}</button><div><Badge>{i.category}</Badge></div></td><td className="muted date-cell">{formatDate(i.date)}</td><td className="muted">{data.accounts.find(a => a.id === i.accountId)?.name}</td><td className="align-right money-cell text-green">+{money(i.amountKopecks)}</td></tr>)}</tbody></table></div> : <Empty icon={Wallet} title={scoped.length ? 'Ничего не найдено' : view === 'all' ? 'Пока нет поступлений' : 'Пока нет перепродаж'} text={scoped.length ? 'Попробуйте другой месяц или поисковый запрос.' : 'Добавьте первую перепродажу — сумма сразу поступит на выбранный счёт.'} action={<Button onClick={addIncome}>Добавить доход</Button>}/>}</section>
      <aside className="panel category-panel"><SectionHead title={view === 'all' ? 'Источники дохода' : 'Крупные поступления'}/>{grouped.length ? <div className="category-list">{grouped.map((c, i) => <div key={c.name}><div className="category-row"><span><i className={`category-dot dot-${i % 4}`}/>{c.name}</span><strong>{money(c.total)}</strong></div><div className="progress-track"><span style={{ width: `${total ? c.total / total * 100 : 0}%` }}/></div><small>{total ? Math.round(c.total / total * 100) : 0}% от выбранного дохода</small></div>)}</div> : <p className="muted empty-copy">После добавления доходов здесь появится распределение поступлений.</p>}<div className="aside-note"><ShieldNote/></div></aside>
    </div>
  </>;
}
function scopedForMonth(incomes: AppData['incomes'], category: IncomeCategory, month: string) { return incomes.filter(i => i.category === category && (!month || monthKey(i.date) === month)); }
function receiptCount(count: number) { const tens = count % 100, units = count % 10; const word = tens >= 11 && tens <= 14 ? 'поступлений' : units === 1 ? 'поступление' : units >= 2 && units <= 4 ? 'поступления' : 'поступлений'; return `${count} ${word}`; }
function ShieldNote() { return <><span className="mini-dot green"/><p>Доход учитывается один раз: на счёте и в общей статистике. Шабашки живут на отдельной странице и не удваивают капитал.</p></>; }
