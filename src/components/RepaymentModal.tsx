import { useState, type FormEvent } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { accountBalance, debtRemaining, inputMoney, money, parseMoney, roleAccount, today, uid, validDate, type AppData, type Debt, type Payment } from '../core/model';
import { Button, Field, Modal } from './ui';
import { VoiceField } from './VoiceField';
import type { VoiceNote } from '../core/model';

export type RepaymentRequest = { type: 'repayment'; debt?: Debt };
type DebitDraft = { accountId: string; amount: string };

export function RepaymentModal({ request, data, onClose, onSave }: { request: RepaymentRequest; data: AppData; onClose: () => void; onSave: (data: AppData, message: string) => void }) {
  const open = data.debts.filter(d => d.direction === 'i_owe' && debtRemaining(d) > 0);
  const [amount, setAmount] = useState('');
  const [debtId, setDebtId] = useState(request.debt?.id ?? open[0]?.id ?? '');
  const [debits, setDebits] = useState<DebitDraft[]>(() => {
    const accountId = roleAccount(data, 'debt')?.id ?? data.accounts[0]?.id;
    return accountId ? [{ accountId, amount: '' }] : [];
  });
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [voice, setVoice] = useState<VoiceNote | undefined>();
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = open.find(d => d.id === debtId);
  const total = parseMoney(amount);
  const allocated = debits.reduce((sum, row) => sum + (parseMoney(row.amount) ?? 0), 0);
  function changeAmount(value: string) {
    setAmount(value);
    // Keep the familiar single-account flow: its amount follows the total.
    if (debits.length === 1) setDebits(rows => rows.map(row => ({ ...row, amount: value })));
  }
  function toggleAccount(accountId: string, checked: boolean) {
    setDebits(rows => {
      if (!checked) return rows.filter(row => row.accountId !== accountId);
      if (rows.some(row => row.accountId === accountId)) return rows;
      const remaining = Math.max(0, (total ?? 0) - rows.reduce((sum, row) => sum + (parseMoney(row.amount) ?? 0), 0));
      return [...rows, { accountId, amount: remaining ? inputMoney(remaining) : '' }];
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (voiceBusy) return setError('Остановите запись и дождитесь обработки аудио.');
    if (total === null || total <= 0) return setError('Введите корректную сумму: до двух знаков после запятой, не больше 100 млрд ₽.');
    if (!selected) return setError('Выберите долг для погашения.');
    if (total > debtRemaining(selected)) return setError('Платёж больше остатка выбранного долга. Уменьшите сумму.');
    if (!validDate(date)) return setError('Проверьте дату.');
    if (!debits.length) return setError('Выберите хотя бы один счёт списания.');
    if (new Set(debits.map(row => row.accountId)).size !== debits.length) return setError('Каждый счёт можно выбрать только один раз.');
    const payments: Payment[] = [];
    for (const row of debits) {
      const value = parseMoney(row.amount);
      const account = data.accounts.find(a => a.id === row.accountId);
      if (!account) return setError('Выбранный счёт больше не существует. Выберите другой.');
      if (value === null || value <= 0) return setError(`Укажите положительную сумму списания со счёта «${account.name}».`);
      // One voice attachment per operation; every split keeps the text note and its own account.
      payments.push({ id: uid(), amountKopecks: value, date, accountId: row.accountId, note: note.trim().slice(0, 2000), ...(voice && payments.length === 0 ? { voice } : {}) });
    }
    if (allocated !== total) return setError(`Суммы по счетам должны давать общую сумму ${money(total)}. Сейчас распределено ${money(allocated)}.`);
    onSave({ ...data, debts: data.debts.map(d => d.id === selected.id ? { ...d, payments: [...d.payments, ...payments] } : d) }, payments.length === 1 ? 'Погашение сохранено. Долг и остаток счёта пересчитаны.' : `Погашение сохранено одним действием. Списания с ${payments.length} счетов учтены в одном долге.`);
    onClose();
  }
  return <Modal title="Отдать долг" subtitle="Один долг и одно или несколько списаний с выбранных счетов." onClose={onClose}>
    <form className="entry-form" onSubmit={submit}>
      <Field label="Сумма, ₽"><input className="inp money-input" required inputMode="decimal" value={amount} placeholder="0,00" onChange={e => changeAmount(e.target.value)}/></Field>
      <Field label="Какой долг погасить"><select className="inp" required value={debtId} onChange={e => setDebtId(e.target.value)}>{!open.length && <option value="">Нет открытых долгов</option>}{open.map(d => <option key={d.id} value={d.id}>{d.title} · {d.counterparty} · остаток {money(debtRemaining(d))}</option>)}</select></Field>
      {selected && <div className="form-note"><Check size={16}/><span>Остаток выбранного долга: {money(debtRemaining(selected))}. Все списания будут добавлены только в этот долг.</span></div>}
      <Field label="Дата"><input className="inp" type="date" required min="1900-01-01" max="2200-12-31" value={date} onChange={e => setDate(e.target.value)}/></Field>
      <fieldset className="funding-fieldset repayment-accounts"><legend>Счета списания · можно несколько</legend><p className="field-hint">Отметьте счета и укажите сумму для каждого. В истории появится отдельное списание на каждый счёт.</p>
        {!data.accounts.length && <p className="form-error">Сначала создайте счёт в разделе «Мой капитал».</p>}
        {data.accounts.map(account => {
          const row = debits.find(d => d.accountId === account.id);
          return <div className={`repayment-account ${row ? 'selected' : ''}`} key={account.id}>
            <label className="checkbox-label"><input type="checkbox" aria-label={`Списать со счёта ${account.name}`} checked={!!row} onChange={e => toggleAccount(account.id, e.target.checked)}/><span>{account.name}<small>На счёте: {money(accountBalance(data, account.id))}</small></span></label>
            {row && <input className="inp money-input" aria-label={`Сумма со счёта ${account.name}`} inputMode="decimal" placeholder="0,00" value={row.amount} onChange={e => setDebits(rows => rows.map(d => d.accountId === account.id ? { ...d, amount: e.target.value } : d))}/>}
          </div>;
        })}
        {debits.length > 1 && <div className="purchase-total"><span>Распределено из {money(total ?? 0)}</span><strong className={allocated === total ? 'text-green' : 'text-red'}>{money(allocated)}</strong></div>}
      </fieldset>
      <VoiceField value={note} onChange={setNote} voice={voice} onVoiceChange={setVoice} onBusyChange={setVoiceBusy} placeholder="Детали платежа"/>
      {error && <div className="form-error" role="alert"><AlertCircle size={17}/>{error}</div>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit" disabled={!open.length || voiceBusy}><Check size={17}/>Отдать</Button></div>
    </form>
  </Modal>;
}
