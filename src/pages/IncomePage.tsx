import { useMemo, useState } from 'react';
import { ArrowUpRight, CalendarDays, Hammer, History, Repeat2, Search, TrendingUp, Wallet, X } from 'lucide-react';
import { earnedIncome, formatDate, incomeCategories, jobEarnings, jobNetProfit, money, monthKey, monthLabel, monthlySeries, oddJobIncomes, products, resaleEarnings, saleBreakdown, soldProducts, sum, today, type AppData, type IncomeCategory } from '../core/model';
import { Badge, Bars, Button, Empty, PageHead, SectionHead } from '../components/ui';
import type { EntryRequest } from '../components/EntryModal';
import type { WorkRequest } from '../components/WorkModal';
import type { ProductRequest } from '../components/ProductModal';

const descriptions: Record<IncomeCategory, string> = {
  Перепродажи: 'Отдельная страница: товары, покупка, инвестор и продажа. В доход — чистая прибыль после инвестора.',
  Шабашки: 'Отдельная страница: сводка, выполненное и планы. В доход — сумма работы минус расходы.',
};
export function IncomePage({ data, onEdit, onOpenJobs, onOpenResales }: { data: AppData; onEdit: (request: EntryRequest | WorkRequest | ProductRequest) => void; onOpenJobs: () => void; onOpenResales: () => void }) {
  const [month, setMonth] = useState(monthKey(today()));
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState(false);
  const [legacyCategory, setLegacyCategory] = useState('all');
  const months = Array.from(new Set([monthKey(today()), ...data.incomes.map(i => monthKey(i.date)), ...products(data).flatMap(p => p.sale ? [monthKey(p.sale.date)] : [])])).sort().reverse();
  const periodLabel = month ? `за ${monthLabel(month)}` : 'за всё время';
  const jobs = oddJobIncomes(data).filter(i => !month || monthKey(i.date) === month);
  const sales = soldProducts(data, month);
  const resaleIncome = resaleEarnings(data, month), jobsIncome = jobEarnings(data, month);
  const legacyCategories = Array.from(new Set(data.incomes.map(i => i.category).filter(c => !incomeCategories.includes(c as IncomeCategory))));
  const filtered = useMemo(() => data.incomes.filter(i => (!month || monthKey(i.date) === month) && (!query || `${i.title} ${i.category} ${i.note}`.toLowerCase().includes(query.toLowerCase())) && (legacyCategory === 'all' || i.category === legacyCategory)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), [data.incomes, month, query, legacyCategory]);
  const historyTotal = sum(filtered.map(i => i.amountKopecks));
  const earnings = [
    ...sales.map(p => ({ id: p.id, title: p.kind, date: p.sale!.date, category: 'Перепродажи', amount: saleBreakdown(p).personalProfit, gross: p.sale!.priceKopecks, open: () => onEdit({ type: 'product-sale', item: p }) })),
    ...jobs.map(i => ({ id: i.id, title: i.title, date: i.date, category: 'Шабашки', amount: jobNetProfit(i), gross: i.amountKopecks, open: () => onEdit({ type: 'odd-job', item: i } as WorkRequest) })),
  ].filter(i => !query || `${i.title} ${i.category}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
  return <>
    <PageHead eyebrow="ДОХОДЫ · ЧИСТАЯ ПРИБЫЛЬ" title="Доходы" description="Два направления. В доход входит чистая прибыль, а не вся выручка."/>
    <div className="income-directions" aria-label="Направления доходов">
      <button className="income-direction income-direction-link" aria-label="Перепродажи — открыть отдельную страницу" onClick={onOpenResales}><span className="direction-icon"><Repeat2 size={22} strokeWidth={1.8}/></span><span className="direction-copy"><strong>Перепродажи</strong><small>{descriptions['Перепродажи']}</small></span><span className="direction-amount"><strong>{money(resaleIncome)}</strong><small>{sales.length} продаж {periodLabel} · открыть <ArrowUpRight size={12}/></small></span></button>
      <button className="income-direction income-direction-link" aria-label="Шабашки — открыть отдельную страницу" onClick={onOpenJobs}><span className="direction-icon"><Hammer size={22} strokeWidth={1.8}/></span><span className="direction-copy"><strong>Шабашки</strong><small>{descriptions['Шабашки']}</small></span><span className="direction-amount"><strong>{money(jobsIncome)}</strong><small>{jobs.length} работ {periodLabel} · открыть <ArrowUpRight size={12}/></small></span></button>
    </div>
    <div className="income-top" id="income-details" aria-label="Чистая прибыль">
      <section className="panel income-total"><span className="metric-icon green"><TrendingUp size={23}/></span><span className="metric-label">Чистая прибыль {periodLabel}</span><strong>{money(earnedIncome(data, month))}</strong><div className="flex gap-2"><Badge tone="green">После расходов и инвестора</Badge><span className="muted small">Распределение 15/15/70 — в «Моём капитале»</span></div></section>
      <section className="panel"><SectionHead title="Динамика чистой прибыли"/><Bars series={monthlySeries(data)}/></section>
    </div>
    <div className="legacy-income-note"><History size={16}/><span>Прежние поступления сохранены. Без цены покупки они не считаются прибылью новых товаров.</span><button className="text-link orange-link" onClick={() => { setHistory(!history); setQuery(''); setLegacyCategory('all'); }}>{history ? 'Вернуться к доходам' : 'Показать всю историю'}</button></div>
    <section className="panel income-history-panel"><div className="filters"><div className="search-field"><Search size={17}/><input aria-label="Поиск доходов" placeholder={history ? 'Найти прежнее поступление…' : 'Найти продажу или работу…'} value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={15}/></button>}</div>{history && <select className="inp" aria-label="Категория дохода" value={legacyCategory} onChange={e => setLegacyCategory(e.target.value)}><option value="all">Все категории</option>{incomeCategories.map(c => <option key={c}>{c}</option>)}{legacyCategories.map(c => <option key={c}>{c}</option>)}</select>}<div className="month-select"><CalendarDays size={16}/><select className="inp" aria-label="Месяц доходов" value={month} onChange={e => setMonth(e.target.value)}><option value="">За всё время</option>{months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></div></div>
      <SectionHead title={history ? 'Прежние поступления · полные суммы' : 'Чистая прибыль по операциям'} count={history ? filtered.length : earnings.length}/>
      {history ? <>{filtered.length ? <div className="table-scroll"><table className="ledger-table income-table"><thead><tr><th>Поступление</th><th>Дата</th><th>Счёт</th><th className="align-right">Сумма записи</th></tr></thead><tbody>{filtered.map(i => <tr key={i.id}><td><button className="text-link" onClick={() => onEdit(i.category === 'Шабашки' ? { type: 'odd-job', item: i } : { type: 'income', item: i })}>{i.title}</button><div><Badge>{i.category}</Badge></div></td><td className="muted date-cell">{formatDate(i.date)}</td><td className="muted">{data.accounts.find(a => a.id === i.accountId)?.name}</td><td className="align-right money-cell text-green">+{money(i.amountKopecks)}</td></tr>)}</tbody></table></div> : <Empty icon={Wallet} title="Поступлений не найдено" text="Попробуйте другой месяц или поисковый запрос."/>}<p className="income-history-total">Всего в выбранных записях: <strong>{money(historyTotal)}</strong>. Это история движений, не новый расчёт личного дохода.</p></> : earnings.length ? <div className="table-scroll"><table className="ledger-table income-table"><thead><tr><th>Продажа / работа</th><th>Дата</th><th className="align-right">Полная сумма</th><th className="align-right">Чистая прибыль</th></tr></thead><tbody>{earnings.map(i => <tr key={`${i.category}-${i.id}`}><td><button className="text-link" onClick={i.open}>{i.title}</button><div><Badge>{i.category}</Badge></div></td><td className="muted date-cell">{formatDate(i.date)}</td><td className="align-right money-cell muted">{money(i.gross)}</td><td className={`align-right money-cell ${i.amount >= 0 ? 'text-green' : 'text-red'}`}>{i.amount >= 0 ? '+' : ''}{money(i.amount)}</td></tr>)}</tbody></table></div> : <Empty icon={TrendingUp} title={query ? 'Ничего не найдено' : 'Доход появится после продажи или работы'} text="Добавьте товар и отметьте его продажу либо запишите выполненную шабашку." action={<div className="flex gap-2"><Button onClick={onOpenResales}>К товарам</Button><Button variant="secondary" onClick={onOpenJobs}>К шабашкам</Button></div>}/>}
    </section>
  </>;
}
