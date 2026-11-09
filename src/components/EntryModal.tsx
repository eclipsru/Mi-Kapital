import { useState, type FormEvent } from 'react';
import { AlertCircle, Check, Trash2 } from 'lucide-react';
import { accountKinds, incomeCategories, incomeCategoryOptions, debtPaid, inputMoney, parseMoney, today, uid, validDate, type Account, type AccountKind, type AppData, type Debt, type Income, type IncomeCategory, type Movement, type Payment } from '../core/model';
import { Button, Field, Modal } from './ui';
export type EntryRequest = { type: 'account'; item?: Account } | { type: 'income'; item?: Income; category?: IncomeCategory } | { type: 'debt'; item?: Debt } | { type: 'payment'; debt: Debt; item?: Payment } | { type: 'movement'; item?: Movement; kind?: 'expense' | 'adjustment' };
export function EntryModal({ request, data, onClose, onSave, onDelete }: { request: EntryRequest; data: AppData; onClose: () => void; onSave: (data: AppData, message: string) => void; onDelete: (data: AppData, message: string) => void }) {
  const item = request.type === 'payment' ? request.item : request.item;
  const [name, setName] = useState(item && 'name' in item ? item.name : item && 'title' in item ? item.title : '');
  const [kind, setKind] = useState<AccountKind>(request.type === 'account' ? request.item?.kind ?? 'bank' : 'bank');
  const [amount, setAmount] = useState(item && 'openingKopecks' in item ? inputMoney(item.openingKopecks) : item && 'principalKopecks' in item ? inputMoney(item.principalKopecks) : item && 'amountKopecks' in item ? inputMoney(item.amountKopecks) : '');
  const [date, setDate] = useState(item && 'date' in item ? item.date : today());
  const [dueDate, setDueDate] = useState(request.type === 'debt' ? request.item?.dueDate ?? '' : '');
  const [accountId, setAccountId] = useState(item && 'accountId' in item && item.accountId ? item.accountId : request.type === 'debt' ? request.item?.initialAccountId ?? '' : data.accounts[0]?.id ?? '');
  const [category, setCategory] = useState(request.type === 'income' ? request.item?.category ?? request.category ?? incomeCategories[0] : incomeCategories[0]);
  const [counterparty, setCounterparty] = useState(request.type === 'debt' ? request.item?.counterparty ?? '' : '');
  const [direction, setDirection] = useState<'i_owe'|'owed_to_me'>(request.type === 'debt' ? request.item?.direction ?? 'i_owe' : 'i_owe');
  const [movementKind, setMovementKind] = useState<'expense'|'adjustment'>(request.type === 'movement' ? request.item?.kind ?? request.kind ?? 'expense' : 'expense');
  const [note, setNote] = useState(item && 'note' in item ? item.note : '');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editing = !!item;
  const labels = { account: editing ? 'Изменить счёт' : 'Новый счёт', income: editing ? 'Изменить доход' : 'Новый доход', debt: editing ? 'Изменить долг' : 'Новый долг', payment: request.type === 'payment' && request.debt.direction === 'owed_to_me' ? 'Возврат долга' : 'Погашение долга', movement: editing ? 'Изменить операцию' : 'Новая операция' };
  function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const value = parseMoney(amount, request.type === 'movement' && movementKind === 'adjustment');
    if (value === null || (request.type !== 'account' && value === 0) || (request.type !== 'account' && !(request.type === 'movement' && movementKind === 'adjustment') && value < 0)) return setError('Введите корректную сумму: до двух знаков после запятой, не больше 100 млрд ₽.');
    if (!validDate(date) || dueDate && !validDate(dueDate)) return setError('Проверьте дату. Формат: ДД.ММ.ГГГГ.');
    if (dueDate && dueDate < date) return setError('Срок возврата не может быть раньше даты создания долга.');
    if (request.type !== 'payment' && !name.trim()) return setError('Укажите название.');
    if (['income','payment','movement'].includes(request.type) && !data.accounts.some(a => a.id === accountId)) return setError('Сначала создайте счёт в разделе «Мой капитал».');
    const common = { title: name.trim().slice(0,120), amountKopecks:value, date, accountId, note:note.trim().slice(0,2000) };
    if (request.type === 'account') {
      const account: Account = { id:request.item?.id ?? uid(), name:name.trim().slice(0,80), kind, openingKopecks:value, createdAt:request.item?.createdAt ?? new Date().toISOString() };
      onSave({ ...data, accounts: editing ? data.accounts.map(a=>a.id===account.id?account:a) : [...data.accounts,account] }, editing ? 'Счёт обновлён' : 'Счёт добавлен');
    } else if (request.type === 'income') {
      if (!incomeCategoryOptions(request.item?.category).includes(category)) return setError('Выберите направление дохода.');
      const income: Income = { ...common, id:request.item?.id ?? uid(), category };
      onSave({ ...data, incomes:editing ? data.incomes.map(i=>i.id===income.id?income:i) : [...data.incomes,income] }, editing ? 'Доход обновлён. Остаток счёта пересчитан.' : 'Доход добавлен и зачислен на выбранный счёт');
    } else if (request.type === 'movement') {
      const movement: Movement = { ...common, id:request.item?.id ?? uid(), kind:movementKind };
      onSave({ ...data, movements:editing ? data.movements.map(m=>m.id===movement.id?movement:m) : [...data.movements,movement] }, 'Операция сохранена. Капитал пересчитан.');
    } else if (request.type === 'debt') {
      if (!counterparty.trim()) return setError('Укажите, кому вы должны или кто должен вам.');
      if (editing && value < debtPaid(request.item!)) return setError('Сумма долга не может быть меньше уже внесённых платежей.');
      const debt: Debt = { id:request.item?.id ?? uid(), title:common.title, counterparty:counterparty.trim().slice(0,100), direction, principalKopecks:value, date, dueDate, note:common.note, initialAccountId:accountId || null, payments:request.item?.payments ?? [] };
      onSave({ ...data, debts:editing ? data.debts.map(d=>d.id===debt.id?debt:d) : [...data.debts,debt] }, editing ? 'Долг обновлён' : 'Долг добавлен');
    } else {
      if (editing) {
        const old = request.item!.amountKopecks;
        if (value > request.debt.principalKopecks - debtPaid(request.debt) + old) return setError('Платёж больше остатка долга. Уменьшите сумму.');
      } else if (value > request.debt.principalKopecks - debtPaid(request.debt)) return setError('Платёж больше остатка долга. Уменьшите сумму.');
      const payment: Payment = { id:request.item?.id ?? uid(), amountKopecks:value, date, accountId, note:common.note };
      const payments = editing ? request.debt.payments.map(p=>p.id===payment.id?payment:p) : [...request.debt.payments,payment];
      onSave({ ...data, debts:data.debts.map(d=>d.id===request.debt.id?{...d,payments}:d) }, 'Платёж сохранён. Долг и остаток счёта пересчитаны.');
    }
    onClose();
  }
  function remove() {
    if (!item) return;
    if (request.type === 'account') {
      const referenced = data.incomes.some(i=>i.accountId===item.id) || data.movements.some(m=>m.accountId===item.id) || data.debts.some(d=>d.initialAccountId===item.id || d.payments.some(p=>p.accountId===item.id));
      if (referenced) return setError('На счёт ссылаются операции. Сначала измените или удалите их — так история останется согласованной.');
      onDelete({...data,accounts:data.accounts.filter(a=>a.id!==item.id)},'Счёт удалён');
    } else if (request.type === 'income') onDelete({...data,incomes:data.incomes.filter(i=>i.id!==item.id)},'Доход удалён. Остаток счёта пересчитан.');
    else if (request.type === 'movement') onDelete({...data,movements:data.movements.filter(m=>m.id!==item.id)},'Операция удалена');
    else if (request.type === 'debt') onDelete({...data,debts:data.debts.filter(d=>d.id!==item.id)},'Долг и его платежи удалены. Остатки счетов пересчитаны.');
    else if (request.type === 'payment') onDelete({...data,debts:data.debts.map(d=>d.id===request.debt.id?{...d,payments:d.payments.filter(p=>p.id!==item.id)}:d)},'Платёж удалён. Остаток долга восстановлен.');
    onClose();
  }
  const accountRequired = ['income','payment','movement'].includes(request.type);
  return <Modal title={labels[request.type]} subtitle={request.type === 'payment' ? request.debt.title : 'Все суммы в рублях. Изменения сразу отражаются в расчётах.'} onClose={onClose}><form onSubmit={submit} className="entry-form">
    {request.type === 'debt' && <div className="segmented"><button type="button" className={direction==='i_owe'?'active':''} onClick={()=>setDirection('i_owe')}>Я должен</button><button type="button" className={direction==='owed_to_me'?'active':''} onClick={()=>setDirection('owed_to_me')}>Мне должны</button></div>}
    {request.type === 'movement' && <div className="segmented"><button type="button" className={movementKind==='expense'?'active':''} onClick={()=>setMovementKind('expense')}>Расход</button><button type="button" className={movementKind==='adjustment'?'active':''} onClick={()=>setMovementKind('adjustment')}>Корректировка</button></div>}
    {request.type !== 'payment' && <Field label={request.type==='account'?'Название счёта':'Название'}><input className="inp" required maxLength={request.type==='account'?80:120} value={name} onChange={e=>setName(e.target.value)} placeholder={request.type==='account'?'Например, Основная карта':request.type==='debt'?'Например, заём на ремонт':request.type==='income'?(category==='Шабашки'?'Например, ремонт на выходных':'Например, продажа инструмента'):'Например, поступление за ноябрь'} autoComplete="off"/></Field>}
    {request.type==='account' && <Field label="Тип счёта"><select className="inp" value={kind} onChange={e=>setKind(e.target.value as AccountKind)}>{Object.entries(accountKinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>}
    {request.type==='debt' && <Field label={direction==='i_owe'?'Кому вы должны':'Кто вам должен'}><input className="inp" required maxLength={100} value={counterparty} onChange={e=>setCounterparty(e.target.value)} placeholder="Имя человека или название организации"/></Field>}
    <div className="form-row"><Field label={request.type==='account'?'Начальный остаток, ₽':request.type==='debt'?'Изначальная сумма, ₽':'Сумма, ₽'} hint={request.type==='account'?'Деньги, которые уже есть до записанных операций.':movementKind==='adjustment'&&request.type==='movement'?'Можно указать отрицательную сумму.':''}><input className="inp money-input" required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></Field>{request.type!=='account' && <Field label="Дата"><input className="inp" type="date" required min="1900-01-01" max="2200-12-31" value={date} onChange={e=>setDate(e.target.value)}/></Field>}</div>
    {request.type==='income' && <Field label="Направление дохода" hint="Новые поступления учитываются в разделе «Перепродажи» или «Шабашки»."><select className="inp" value={category} onChange={e=>setCategory(e.target.value)}>{incomeCategoryOptions(request.item?.category).map(c=><option key={c}>{c}</option>)}</select></Field>}
    {request.type==='debt' && <Field label="Срок возврата · необязательно"><input className="inp" type="date" min={date} max="2200-12-31" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></Field>}
    {request.type!=='account' && <Field label={request.type==='debt'?'Движение денег при создании':'Счёт'} hint={request.type==='debt'?'Выберите «Уже учтено», если сумма долга не должна менять остаток счёта.':undefined}><select className="inp" required={accountRequired} value={accountId} onChange={e=>setAccountId(e.target.value)}>{request.type==='debt' && <option value="">Уже учтено — не менять счёт</option>}{!data.accounts.length && <option value="">Сначала создайте счёт</option>}{data.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
    {request.type==='income' && <div className="form-note"><Check size={16}/><span>Доход увеличит остаток счёта и войдёт в капитал один раз.</span></div>}
    {request.type==='payment' && <div className="form-note"><Check size={16}/><span>{request.debt.direction==='i_owe'?'Сумма будет списана со счёта, а ваш долг уменьшится.':'Сумма поступит на счёт, а долг вам уменьшится.'}</span></div>}
    {request.type!=='account' && <Field label="Заметка · необязательно"><textarea className="inp" maxLength={2000} rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="Детали, которые важно не забыть"/></Field>}
    {error && <div className="form-error" role="alert"><AlertCircle size={17}/>{error}</div>}
    {confirmDelete && <div className="delete-confirm"><strong>Удалить запись?</strong><p>Связанные суммы будут пересчитаны. Это действие нельзя отменить.</p><div className="flex gap-2"><Button type="button" variant="danger" onClick={remove}>Да, удалить</Button><Button type="button" variant="secondary" onClick={()=>setConfirmDelete(false)}>Отмена</Button></div></div>}
    <div className="modal-actions">{editing && <Button type="button" variant="ghost" className="delete-btn" onClick={()=>{setConfirmDelete(true);setError('');}}><Trash2 size={16}/>Удалить</Button>}<Button type="button" variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit"><Check size={17}/>{editing?'Сохранить':'Добавить'}</Button></div>
  </form></Modal>;
}
