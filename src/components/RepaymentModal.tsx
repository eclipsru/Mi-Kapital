import { useState, type FormEvent } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { debtRemaining, money, parseMoney, roleAccount, today, uid, validDate, type AppData, type Debt, type Payment } from '../core/model';
import { Button, Field, Modal } from './ui';

export type RepaymentRequest = { type: 'repayment'; debt?: Debt };

export function RepaymentModal({ request, data, onClose, onSave }: { request: RepaymentRequest; data: AppData; onClose: () => void; onSave: (data: AppData, message: string) => void }) {
  const open = data.debts.filter(d => d.direction === 'i_owe' && debtRemaining(d) > 0);
  const [amount, setAmount] = useState('');
  const [debtId, setDebtId] = useState(request.debt?.id ?? open[0]?.id ?? '');
  const [accountId, setAccountId] = useState(roleAccount(data, 'debt')?.id ?? data.accounts[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const selected = open.find(d => d.id === debtId);
  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const value = parseMoney(amount);
    if (value === null || value <= 0) return setError('Введите корректную сумму: до двух знаков после запятой, не больше 100 млрд ₽.');
    if (!selected) return setError('Выберите долг для погашения.');
    if (value > debtRemaining(selected)) return setError('Платёж больше остатка выбранного долга. Уменьшите сумму.');
    if (!validDate(date)) return setError('Проверьте дату.');
    if (!data.accounts.some(a => a.id === accountId)) return setError('Сначала создайте счёт в разделе «Мой капитал».');
    const payment: Payment = { id: uid(), amountKopecks: value, date, accountId, note: note.trim().slice(0, 2000) };
    onSave({ ...data, debts: data.debts.map(d => d.id === selected.id ? { ...d, payments: [...d.payments, payment] } : d) }, 'Погашение сохранено. Долг и остаток счёта пересчитаны.');
    onClose();
  }
  return <Modal title="Отдать долг" subtitle="Сначала сумма, затем один долг. За одну операцию погашается только выбранный долг." onClose={onClose}>
    <form className="entry-form" onSubmit={submit}>
      <Field label="Сумма, ₽"><input className="inp money-input" required inputMode="decimal" value={amount} placeholder="0,00" onChange={e => setAmount(e.target.value)}/></Field>
      <Field label="Какой долг погасить"><select className="inp" required value={debtId} onChange={e => setDebtId(e.target.value)}>{!open.length && <option value="">Нет открытых долгов</option>}{open.map(d => <option key={d.id} value={d.id}>{d.title} · {d.counterparty} · остаток {money(debtRemaining(d))}</option>)}</select></Field>
      {selected && <div className="form-note"><Check size={16}/><span>Остаток выбранного долга: {money(debtRemaining(selected))}. Платёж будет добавлен только в этот долг.</span></div>}
      <div className="form-row"><Field label="Дата"><input className="inp" type="date" required min="1900-01-01" max="2200-12-31" value={date} onChange={e => setDate(e.target.value)}/></Field><Field label="Счёт списания"><select className="inp" required value={accountId} onChange={e => setAccountId(e.target.value)}>{!data.accounts.length && <option value="">Сначала создайте счёт</option>}{data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field></div>
      <Field label="Заметка · необязательно"><textarea className="inp" maxLength={2000} rows={2} value={note} placeholder="Детали платежа" onChange={e => setNote(e.target.value)}/></Field>
      {error && <div className="form-error" role="alert"><AlertCircle size={17}/>{error}</div>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" disabled={!open.length}><Check size={17}/>Отдать</Button></div>
    </form>
  </Modal>;
}
