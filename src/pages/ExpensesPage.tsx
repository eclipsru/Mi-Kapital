import { useState } from 'react';
import { CalendarDays, Receipt, Search, Wallet } from 'lucide-react';
import { formatDate, ledger, money, monthKey, monthLabel, sum, today, type AppData } from '../core/model';
import { AddButton, Empty, PageHead, SectionHead } from '../components/ui';
import type { EntryRequest } from '../components/EntryModal';

export function ExpensesPage({ data, onEdit }: { data: AppData; onEdit: (request: EntryRequest) => void }) {
  const [month, setMonth] = useState(monthKey(today()));
  const [query, setQuery] = useState('');
  const months = Array.from(new Set([monthKey(today()), ...data.movements.filter(m => m.kind === 'expense').map(m => monthKey(m.date))])).sort().reverse();
  const rows = ledger(data).filter(item => item.type === 'expense' && (!month || monthKey(item.date) === month) && (!query || `${item.title} ${item.subtitle}`.toLowerCase().includes(query.toLowerCase())));
  const total = sum(data.movements.filter(m => m.kind === 'expense' && (!month || monthKey(m.date) === month)).map(m => m.amountKopecks));
  const label = month ? `за ${monthLabel(month)}` : 'за всё время';
  return <>
    <PageHead eyebrow="РАСХОДЫ · УЧЁТ ПО СЧЕТАМ" title="Расходы" description="Записывайте покупки и другие траты. Сумма сразу спишется с выбранного счёта." action={<AddButton onClick={() => onEdit({ type: 'movement', kind: 'expense' })}>Добавить расход</AddButton>}/>
    <section className="panel expenses-total-card"><span className="metric-icon orange"><Receipt size={21}/></span><div><span className="metric-label">Расходы {label}</span><strong>{money(total)}</strong><small>{rows.length} записей в выбранном периоде</small></div></section>
    <section className="panel expenses-history-panel">
      <div className="filters">
        <div className="search-field"><Search size={17}/><input aria-label="Поиск расходов" placeholder="Найти расход или счёт…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Очистить поиск" onClick={() => setQuery('')}><span aria-hidden="true">×</span></button>}</div>
        <div className="month-select"><CalendarDays size={16}/><select className="inp" aria-label="Месяц расходов" value={month} onChange={e => setMonth(e.target.value)}><option value="">За всё время</option>{months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></div>
      </div>
      <SectionHead title="Список расходов" count={rows.length}/>
      {rows.length ? <div className="table-scroll"><table className="ledger-table expenses-table"><thead><tr><th>Расход</th><th>Дата</th><th>Счёт</th><th className="align-right">Сумма</th></tr></thead><tbody>{rows.map(item => <tr key={item.id}><td><button className="text-link" onClick={() => onEdit({ type: 'movement', item: data.movements.find(m => m.id === item.id)! })}>{item.title}</button>{item.subtitle && <small className="expense-account-hint">{item.subtitle}</small>}</td><td className="muted date-cell">{formatDate(item.date)}</td><td className="muted">{data.accounts.find(a => a.id === item.accountId)?.name ?? '—'}</td><td className="align-right money-cell text-red">−{money(Math.abs(item.amount))}</td></tr>)}</tbody></table></div> : <Empty icon={Wallet} title={query ? 'Расходы не найдены' : 'Расходов за этот период пока нет'} text={query ? 'Измените поисковый запрос или период.' : 'Добавьте первую трату — она сохранится в истории и уменьшит остаток выбранного счёта.'} action={<AddButton onClick={() => onEdit({ type: 'movement', kind: 'expense' })}>Добавить расход</AddButton>}/>}
    </section>
  </>;
}

