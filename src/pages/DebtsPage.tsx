import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, CheckCheck, HandCoins, Pencil, Plus, Users } from 'lucide-react';
import { debtKindLabels, debtPaid, debtRemaining, formatDate, money, people, sum, today, type AppData, type Debt } from '../core/model';
import { AddButton, Badge, Button, Empty, IconButton, PageHead } from '../components/ui';
import type { EntryRequest } from '../components/EntryModal';
import type { PersonRequest } from '../components/PersonModal';
import type { RepaymentRequest } from '../components/RepaymentModal';

type DebtsEdit = EntryRequest | PersonRequest | RepaymentRequest;
export function DebtsPage({ data, onEdit }: { data: AppData; onEdit: (request: DebtsEdit) => void }) {
  const [tab, setTab] = useState<'all' | 'i_owe' | 'owed_to_me'>('all');
  const [showClosed, setShowClosed] = useState(false);
  const [person, setPerson] = useState('');
  const matchesPerson = (d: Debt) => !person || d.counterparty.trim().toLowerCase() === person.toLowerCase();
  const debts = data.debts.filter(d => (tab === 'all' || d.direction === tab) && (showClosed || debtRemaining(d) > 0) && matchesPerson(d));
  const scoped = data.debts.filter(matchesPerson);
  const payable = sum(scoped.filter(d => d.direction === 'i_owe').map(debtRemaining));
  const receivable = sum(scoped.filter(d => d.direction === 'owed_to_me').map(debtRemaining));
  return <>
    <PageHead eyebrow="ОБЯЗАТЕЛЬСТВА · КОНТРОЛЬ" title="Долги" description="Кто должен вам и что должны вы. Список людей общий с формой инвестора." action={<div className="debts-head-actions"><IconButton label="Добавить человека" className="circle-add" onClick={() => onEdit({ type: 'person' })}><Plus size={18}/></IconButton><select className="inp debts-person-select" aria-label="Человек" value={person} onChange={e => setPerson(e.target.value)}><option value="">Все</option>{people(data).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}</select><AddButton onClick={() => onEdit({ type: 'debt' })}>Добавить долг</AddButton></div>}/>
    <div className="debt-summary">
      <section className="panel debt-summary-card"><span className="metric-icon red"><ArrowUpRight size={23}/></span><div><span className="metric-label">Я должен</span><strong>{money(payable)}</strong><small>Не учитывается в общем капитале</small></div><Button variant="secondary" className="btn-small debt-repay-total" disabled={payable <= 0} onClick={() => onEdit({ type: 'repayment' })}>Отдать</Button></section>
      <section className="panel debt-summary-card"><span className="metric-icon green"><ArrowDownLeft size={23}/></span><div><span className="metric-label">Мне должны</span><strong>{money(receivable)}</strong><small>Ваши деньги к возврату</small></div></section>
    </div>
    <div className="list-toolbar"><div className="tabs">{([['all', 'Все долги'], ['i_owe', 'Я должен'], ['owed_to_me', 'Мне должны']] as const).map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div><label className="checkbox-label"><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)}/>Показывать закрытые</label></div>
    {debts.length ? <div className="debts-list">{debts.map(debt => <DebtRow key={debt.id} debt={debt} data={data} onEdit={onEdit}/>)}</div> : <div className="panel"><Empty icon={HandCoins} title={data.debts.length ? 'В этом списке нет долгов' : 'Здесь пока нет долгов'} text="Добавьте обязательство или заём. Частичные погашения и возвраты будут учитываться автоматически." action={<Button onClick={() => onEdit({ type: 'debt' })}><Plus size={17}/>Добавить долг</Button>}/></div>}
    <div className="info-banner"><Users size={19}/><p>Погашение уменьшает деньги на счёте и сумму долга одновременно. Долги вообще не учитываются в общем капитале: ни получение займа, ни платёж его не меняют. Кнопка «Отдать» погашает один долг, можно выбрать несколько счетов списания.</p></div>
  </>;
}
function DebtRow({ debt, data, onEdit }: { debt: Debt; data: AppData; onEdit: (request: DebtsEdit) => void }) {
  const remaining = debtRemaining(debt);
  const paid = debtPaid(debt);
  const percent = Math.round(paid / debt.principalKopecks * 100);
  const closed = remaining === 0;
  const overdue = !!debt.dueDate && debt.dueDate < today() && !closed;
  return <article className={`debt-list-item ${closed ? 'closed' : ''}`}>
    <div className="debt-row-main">
      <span className={`account-icon ${debt.direction === 'i_owe' ? 'kind-cash' : 'kind-bank'}`}><HandCoins size={20}/></span>
      <div className="debt-row-title"><button className="text-link" onClick={() => onEdit({ type: 'debt', item: debt })}>{debt.title}</button><span className="counterparty">{debt.counterparty} · {debtKindLabels[debt.kind ?? 'business']}</span></div>
      <Badge tone={closed ? 'green' : overdue ? 'red' : debt.direction === 'i_owe' ? 'orange' : 'neutral'}>{closed ? <><CheckCheck size={13}/>Закрыт</> : overdue ? 'Срок прошёл' : debt.direction === 'i_owe' ? 'Я должен' : 'Мне должны'}</Badge>
      <div className="debt-row-amount"><strong>{money(remaining)}</strong><span>из {money(debt.principalKopecks)}</span></div>
      <div className="debt-row-progress"><div className="progress-track"><span style={{ width: `${percent}%` }}/></div><span>{percent}%</span></div>
      {debt.dueDate && <div className={`debt-date ${overdue ? 'text-red' : ''}`}><CalendarClock size={14}/>{formatDate(debt.dueDate)}</div>}
      <div className="debt-row-actions">{!closed && <Button variant={debt.direction === 'i_owe' ? 'primary' : 'secondary'} className="btn-small" onClick={() => onEdit(debt.direction === 'i_owe' ? { type: 'repayment', debt } : { type: 'payment', debt })}><Plus size={14}/>{debt.direction === 'i_owe' ? 'Отдать' : 'Записать возврат'}</Button>}<IconButton label={`Изменить долг ${debt.title}`} onClick={() => onEdit({ type: 'debt', item: debt })}><Pencil size={15}/></IconButton></div>
    </div>
    {debt.note && <p className="debt-note">{debt.note}</p>}
    <details className="payment-history debt-repayments" open={debt.payments.length > 0}>
      <summary>{debt.direction === 'i_owe' ? 'Погашения' : 'Возвраты'} · {debt.payments.length}</summary>
      {debt.payments.length ? <ul>{[...debt.payments].sort((a, b) => b.date.localeCompare(a.date)).map(p => <li key={p.id}><button onClick={() => onEdit({ type: 'payment', debt, item: p })}><span>{formatDate(p.date)}<small>{data.accounts.find(a => a.id === p.accountId)?.name}</small></span><strong>{money(p.amountKopecks)}</strong></button></li>)}</ul> : <p className="muted small">Платежей пока нет.</p>}
    </details>
  </article>;
}
