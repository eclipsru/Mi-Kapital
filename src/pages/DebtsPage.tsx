import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, CheckCheck, ChevronRight, HandCoins, Pencil, Plus, Users } from 'lucide-react';
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
  const contacts = Array.from(new Set([...people(data).map(p => p.name), ...data.debts.map(d => d.counterparty.trim())].filter(Boolean))).sort((a,b)=>a.localeCompare(b,'ru'));
  const matchesPerson = (d: Debt) => !person || d.counterparty.trim().toLowerCase() === person.toLowerCase();
  if (!person) return <><PageHead eyebrow="ОБЯЗАТЕЛЬСТВА · КОНТАКТЫ" title="Долги" description="Выберите человека, чтобы открыть его долги и историю платежей." action={<div className="debts-head-actions"><IconButton label="Добавить человека" className="circle-add" onClick={() => onEdit({ type: 'person' })}><Plus size={18}/></IconButton><AddButton onClick={() => onEdit({ type: 'debt' })}>Добавить долг</AddButton></div>}/><div className="debt-summary"><section className="panel debt-summary-card"><span className="metric-icon red"><ArrowUpRight size={23}/></span><div><span className="metric-label">Я должен</span><strong>{money(sum(data.debts.filter(d=>d.direction==='i_owe').map(debtRemaining)))}</strong><small>По всем людям</small></div><Button variant="secondary" className="btn-small debt-repay-total" disabled={!sum(data.debts.filter(d=>d.direction==='i_owe').map(debtRemaining))} onClick={() => onEdit({ type: 'repayment' })}>Отдать</Button></section><section className="panel debt-summary-card"><span className="metric-icon green"><ArrowDownLeft size={23}/></span><div><span className="metric-label">Мне должны</span><strong>{money(sum(data.debts.filter(d=>d.direction==='owed_to_me').map(debtRemaining)))}</strong><small>По всем людям</small></div></section></div>{contacts.length ? <div className="people-debt-list">{contacts.map(name => { const items=data.debts.filter(d=>d.counterparty.trim().toLowerCase()===name.toLowerCase()); const outstanding=sum(items.map(debtRemaining)); return <button className="panel person-debt-card" key={name} onClick={()=>setPerson(name)}><span className="person-debt-avatar">{name.slice(0,1).toLocaleUpperCase('ru')}</span><span className="person-debt-info"><strong>{name}</strong><small>{items.length} {items.length===1?'долг':items.length>1&&items.length<5?'долга':'долгов'} · {items.filter(d=>debtRemaining(d)>0).length} открыто</small></span><span className="person-debt-total">{money(outstanding)}<small>остаток</small></span><ChevronRight size={18}/></button>; })}</div> : <div className="panel"><Empty icon={Users} title="Пока нет людей и долгов" text="Добавьте человека или сразу запишите долг — его контрагент появится здесь." action={<Button onClick={() => onEdit({ type: 'person' })}><Plus size={17}/>Добавить человека</Button>}/></div>}<div className="info-banner"><Users size={19}/><p>Список людей общий с формой выбора инвестора. Существующие долги и платежи сохранены.</p></div></>;
  const debts = data.debts.filter(d => (tab === 'all' || d.direction === tab) && (showClosed || debtRemaining(d) > 0) && matchesPerson(d));
  const scoped = data.debts.filter(matchesPerson);
  const payable = sum(scoped.filter(d => d.direction === 'i_owe').map(debtRemaining));
  const receivable = sum(scoped.filter(d => d.direction === 'owed_to_me').map(debtRemaining));
  return <>
    <PageHead eyebrow="ОБЯЗАТЕЛЬСТВА · КОНТРОЛЬ" title={person} description="Долги и возвраты выбранного человека." action={<div className="debts-head-actions"><Button variant="secondary" onClick={() => setPerson('')}>← Все люди</Button><AddButton onClick={() => onEdit({ type: 'debt' })}>Добавить долг</AddButton></div>}/>
    <div className="debt-summary">
      <section className="panel debt-summary-card"><span className="metric-icon red"><ArrowUpRight size={23}/></span><div><span className="metric-label">Я должен</span><strong>{money(payable)}</strong><small>Ведётся отдельно от капитала</small></div><Button variant="secondary" className="btn-small debt-repay-total" disabled={payable <= 0} onClick={() => onEdit({ type: 'repayment' })}>Отдать</Button></section>
      <section className="panel debt-summary-card"><span className="metric-icon green"><ArrowDownLeft size={23}/></span><div><span className="metric-label">Мне должны</span><strong>{money(receivable)}</strong><small>Ваши деньги к возврату</small></div></section>
    </div>
    <div className="list-toolbar"><div className="tabs">{([['all', 'Все долги'], ['i_owe', 'Я должен'], ['owed_to_me', 'Мне должны']] as const).map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div><label className="checkbox-label"><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)}/>Показывать закрытые</label></div>
    {debts.length ? <div className="debts-list">{debts.map(debt => <DebtRow key={debt.id} debt={debt} data={data} onEdit={onEdit}/>)}</div> : <div className="panel"><Empty icon={HandCoins} title={data.debts.length ? 'В этом списке нет долгов' : 'Здесь пока нет долгов'} text="Добавьте обязательство или заём. Частичные погашения и возвраты будут учитываться автоматически." action={<Button onClick={() => onEdit({ type: 'debt' })}><Plus size={17}/>Добавить долг</Button>}/></div>}
    <div className="info-banner"><Users size={19}/><p>Долги и их погашения учитываются в этом разделе отдельно и не меняют капитал для перепродаж. Кнопка «Отдать» погашает один долг; сумму можно распределить между несколькими счетами.</p></div>
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
