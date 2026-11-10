import { useState } from 'react';
import { ArrowRight, ArrowUpRight, CircleHelp, Eye, EyeOff, Layers3, Plus, ShieldCheck, Sparkles, TrendingUp, Wallet } from 'lucide-react';
import { accountBalance, accountRoleOrder, accountRoles, allocations, inventoryProducts, ledger, money, monthlySeries, roleAccount, totals, type AppData, type LedgerItem } from '../core/model';
import { AccountIcon, AddButton, Badge, Bars, Button, Empty, IconButton, LedgerTable, Modal, PageHead, SectionHead } from '../components/ui';
import type { EntryRequest } from '../components/EntryModal';

export function CapitalPage({ data, onEdit, onCalculate, onOpenResales }: { data: AppData; onEdit: (request: EntryRequest) => void; onCalculate: () => void; onOpenResales: () => void }) {
  const t = totals(data);
  const operations = ledger(data);
  const [hidden, setHidden] = useState(false);
  const amount = (value: number) => hidden ? '••••• ₽' : money(value);
  const split = allocations(data);
  const unassigned = data.accounts.filter(a => !a.role);
  const [assignRole, setAssignRole] = useState<'capital' | 'hand' | 'debt' | null>(null);
  return <>
    <PageHead eyebrow="ВАШИ ФИНАНСЫ · ОБЗОР" title="Мой капитал" description="Активы, остаток и распределение прибыли — в одной картине." action={<AddButton onClick={() => onEdit({ type: 'account' })}>Добавить счёт</AddButton>}/>
    <div className="overview-grid">
      <section className="balance-card">
        <div className="balance-top"><span><Wallet size={18}/>Общий капитал</span><IconButton label={hidden ? 'Показать суммы' : 'Скрыть суммы'} onClick={() => setHidden(!hidden)}>{hidden ? <EyeOff size={18}/> : <Eye size={18}/>}</IconButton></div>
        <div className="balance-amount">{amount(t.totalCapital)}</div>
        <p>Активы + остаток · долги не вычитаются</p>
        <div className="balance-bottom"><span><span className="status-dot green"/>Покупка переводит остаток в активы, продажа возвращает тело и 15% прибыли</span><ShieldCheck size={19}/></div>
        <div className="balance-art" aria-hidden="true"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-ring ring-three"/><div className="art-coin"><span>₽</span></div><div className="art-mini"><TrendingUp size={27}/></div></div>
      </section>
      <div className="summary-stack">
        <section className="summary-card"><span className="metric-icon green"><ArrowUpRight size={21}/></span><div><span className="metric-label">Остаток</span><strong>{amount(t.remainder)}</strong><small>Капитал вне товаров</small></div><button className="metric-link" aria-label="Перейти к доходам" onClick={() => { window.location.hash = 'income'; }}><ArrowRight size={18}/></button></section>
        <section className="summary-card inventory-summary" onClick={onOpenResales} role="link" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenResales(); } }}><span className="metric-icon orange"><Layers3 size={21}/></span><div><span className="metric-label">Активы</span><strong>{amount(t.assets)}</strong><small>{inventoryProducts(data).length} товаров · свои вложения без инвестора</small></div></section>
      </div>
    </div>
    <div className="debt-strip"><div><span className="mini-dot red"/><span>Я должен</span><strong>{amount(t.payable)}</strong></div><div><span className="mini-dot green"/><span>Мне должны</span><strong>{amount(t.receivable)}</strong></div><button onClick={onCalculate}><Sparkles size={16}/>Что будет с капиталом дальше?<ArrowRight size={16}/></button></div>
    <SectionHead title="Мои счета" count={data.accounts.length} action={<button className="text-link orange-link" onClick={() => onEdit({ type: 'account' })}><Plus size={16}/>Добавить счёт</button>}/>
    <div className="accounts-grid role-accounts-grid">
      {accountRoleOrder.map(role => {
        const account = roleAccount(data, role);
        return <button className={`account-card role-account-card role-${role}`} key={role} onClick={() => account ? onEdit({ type: 'account', item: account }) : setAssignRole(role)}>
          <div className="account-card-top"><span className={`account-icon kind-${account?.kind ?? 'bank'}`}>{account ? <AccountIcon kind={account.kind}/> : <Wallet size={21}/>}</span><ArrowUpRight size={17}/></div>
          <span className="metric-label">{accountRoles[role]}</span>
          {role === 'hand' && <small className="borrowed-on-hand">Взял в долг: {amount(t.payable)}</small>}
          <h3>{account?.name ?? 'Счёт не назначен'}</h3>
          <strong>{amount(split[role])}</strong>
          {account && (role === 'capital' || role === 'hand') && <small className="role-balance-small">На счёте: {amount(accountBalance(data, account.id))}</small>}
          <div className="account-card-foot"><span>Начислено · без вычетов</span><span className="currency">RUB</span></div>
        </button>;
      })}
    </div>
    {!data.accounts.length && <div className="info-banner role-assign-banner"><Wallet size={19}/><p>Назначьте роли существующим счетам или создайте новые. Карточки показывают начисленные 15% / 70% / 15% чистой прибыли и ничего не вычитают.</p></div>}
    {!data.accounts.length && <div className="panel"><Empty icon={Wallet} title="Начните с первого счёта" text="Добавьте карту, наличные или накопления. Дальше доходы и платежи будут обновлять баланс автоматически." action={<Button onClick={() => onEdit({ type: 'account' })}><Plus size={17}/>Создать первый счёт</Button>}/></div>}
    {assignRole && <Modal title={`Назначить счёт · ${accountRoles[assignRole]}`} subtitle="Выберите существующий счёт без роли. Его баланс сохранится." onClose={() => setAssignRole(null)}><div className="entry-form"><div className="role-assign-list">{unassigned.map(a => <Button key={a.id} variant="secondary" onClick={() => { onEdit({ type: 'account', item: a, role: assignRole }); setAssignRole(null); }}>{a.name}<small>{money(accountBalance(data, a.id))}</small></Button>)}{!unassigned.length && <p className="muted">Все счета уже назначены. Создайте новый счёт или измените роль существующего.</p>}</div><Button onClick={() => { onEdit({ type: 'account', role: assignRole }); setAssignRole(null); }}><Plus size={16}/>Создать счёт с этой ролью</Button></div></Modal>}
    <div className="overview-lower"><section className="panel operations-panel"><SectionHead title="Последние операции" action={<div className="flex gap-2"><Button variant="ghost" className="btn-small" onClick={() => onEdit({ type: 'movement' })}>Расход / корректировка</Button><Button variant="secondary" className="btn-small" onClick={onOpenResales}><Plus size={15}/>Товар</Button></div>}/><LedgerTable items={operations.slice(0, 5)} onEdit={(item: LedgerItem) => { if (item.type === 'product-purchase' || item.type === 'product-sale') { onOpenResales(); return; } if (item.type === 'income') onEdit({ type: 'income', item: data.incomes.find(i => i.id === item.id)! }); else if (item.type === 'expense' || item.type === 'adjustment') onEdit({ type: 'movement', item: data.movements.find(m => m.id === item.id) }); else if (item.type === 'payment') { const debt = data.debts.find(d => d.id === item.debtId)!; onEdit({ type: 'payment', debt, item: debt.payments.find(p => p.id === item.id) }); } else onEdit({ type: 'debt', item: data.debts.find(d => d.id === item.debtId) }); }} emptyAction={<button className="text-link orange-link" onClick={onOpenResales}>Добавить первый товар<ArrowRight size={15}/></button>}/></section><section className="panel dynamics-panel"><SectionHead title="Чистая прибыль и расходы" action={<span title="За последние 6 календарных месяцев"><CircleHelp size={16} className="muted"/></span>}/><div className="chart-legend"><span><i className="mini-dot green"/>Чистая прибыль</span><span><i className="mini-dot orange"/>Расходы</span></div><Bars series={monthlySeries(data)}/><div className="chart-foot"><Badge tone="green">Живая статистика</Badge><span>Последние 6 месяцев</span></div></section></div>
  </>;
}
