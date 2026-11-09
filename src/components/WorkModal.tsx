import { useState, type FormEvent } from 'react';
import { AlertCircle, Check, Trash2 } from 'lucide-react';
import { cleanWorkValues, inputMoney, money, parseMoney, today, uid, validDate, workKindFields, workKinds, workTitle, type AppData, type Income, type WorkKind, type WorkPlan } from '../core/model';
import { Button, Field, Modal } from './ui';

export type WorkRequest =
  | { type: 'odd-job'; item?: Income }
  | { type: 'odd-job-plan'; item?: WorkPlan };

export function WorkModal({ request, data, onClose, onSave, onDelete }: { request: WorkRequest; data: AppData; onClose: () => void; onSave: (data: AppData, message: string) => void; onDelete: (data: AppData, message: string) => void }) {
  const completed = request.type === 'odd-job';
  const item = request.item;
  const editing = !!item;
  const initialKind: WorkKind = completed ? request.item?.work?.kind ?? workKinds[0] : request.item?.kind ?? workKinds[0];
  const initialValues = completed ? request.item?.work?.values ?? {} : request.item?.values ?? {};
  const [kind, setKind] = useState<WorkKind>(initialKind);
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [amount, setAmount] = useState(completed ? request.item ? inputMoney(request.item.amountKopecks) : '' : request.item?.expectedKopecks ? inputMoney(request.item.expectedKopecks) : '');
  const [cost, setCost] = useState(completed && request.item?.costKopecks ? inputMoney(request.item.costKopecks) : '');
  const [date, setDate] = useState(completed ? request.item?.date ?? today() : request.item?.date ?? '');
  const [accountId, setAccountId] = useState(completed ? request.item?.accountId ?? data.accounts[0]?.id ?? '' : '');
  const [planTitle, setPlanTitle] = useState(!completed ? request.item?.title ?? '' : '');
  const [note, setNote] = useState(item?.note ?? '');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fields = workKindFields[kind];

  function changeKind(next: WorkKind) {
    setKind(next);
    setValues({});
    setError('');
  }
  function setValue(key: string, value: string) {
    setValues(current => ({ ...current, [key]: value }));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (completed) {
      const value = parseMoney(amount);
      if (value === null || value <= 0) return setError('Введите корректную сумму: до двух знаков после запятой, не больше 100 млрд ₽.');
      const costValue = cost.trim() ? parseMoney(cost) : 0;
      if (costValue === null || costValue < 0) return setError('Расходы должны быть неотрицательной суммой, до двух знаков после запятой.');
      if (!validDate(date)) return setError('Проверьте дату выполнения.');
      if (!data.accounts.some(a => a.id === accountId)) return setError('Сначала создайте счёт в разделе «Мой капитал».');
      const cleaned = cleanWorkValues(kind, values);
      const required = fields.find(f => f.required);
      if (required && !cleaned[required.key]) return setError(`Заполните поле «${required.label}».`);
      const income: Income = {
        id: request.item?.id ?? uid(),
        title: workTitle(kind, cleaned),
        category: 'Шабашки',
        amountKopecks: value,
        costKopecks: costValue,
        date,
        accountId,
        note: note.trim().slice(0, 2000),
        work: { kind, values: cleaned },
      };
      onSave({ ...data, incomes: editing ? data.incomes.map(i => i.id === income.id ? income : i) : [...data.incomes, income] }, editing ? 'Шабашка обновлена. Остаток счёта пересчитан.' : 'Шабашка добавлена и зачислена на выбранный счёт');
    } else {
      const expected = amount.trim() ? parseMoney(amount) : 0;
      if (expected === null || expected < 0) return setError('Ожидаемая сумма должна быть неотрицательной, до двух знаков после запятой.');
      if (date && !validDate(date)) return setError('Проверьте планируемую дату.');
      const plan: WorkPlan = {
        id: request.item?.id ?? uid(),
        kind,
        title: (planTitle.trim() || workTitle(kind, {})).slice(0, 120),
        date,
        expectedKopecks: expected,
        note: note.trim().slice(0, 2000),
        createdAt: request.item?.createdAt ?? new Date().toISOString(),
        values: {},
      };
      const plans = data.workPlans ?? [];
      onSave({ ...data, workPlans: editing ? plans.map(p => p.id === plan.id ? plan : p) : [...plans, plan] }, editing ? 'План шабашки обновлён' : 'Шабашка запланирована');
    }
    onClose();
  }
  function remove() {
    if (!item) return;
    if (completed) onDelete({ ...data, incomes: data.incomes.filter(i => i.id !== item.id) }, 'Шабашка удалена. Остаток счёта пересчитан.');
    else onDelete({ ...data, workPlans: (data.workPlans ?? []).filter(p => p.id !== item.id) }, 'План шабашки удалён');
    onClose();
  }

  return <Modal title={completed ? editing ? 'Изменить шабашку' : 'Выполненная шабашка' : editing ? 'Изменить план шабашки' : 'Запланировать шабашку'} subtitle={completed ? 'Первым указывается вид работы, дальше — поля этого вида.' : 'Пока базовая форма планирования: вид работы и основные детали.'} onClose={onClose}>
    <form onSubmit={submit} className="entry-form">
      <Field label="Вид работы" hint="От выбранного вида зависят поля ниже.">
        <select className="inp" value={kind} onChange={e => changeKind(e.target.value as WorkKind)}>{workKinds.map(k => <option key={k} value={k}>{k}</option>)}</select>
      </Field>
      {completed && fields.map(field => <Field key={`${kind}-${field.key}`} label={field.label}>
        <input className="inp" required={field.required} maxLength={500} value={values[field.key] ?? ''} placeholder={field.placeholder} onChange={e => setValue(field.key, e.target.value)} autoComplete="off"/>
      </Field>)}
      {!completed && <Field label="Что нужно сделать">
        <input className="inp" maxLength={120} value={planTitle} placeholder="Например, собрать кухню в субботу" onChange={e => setPlanTitle(e.target.value)} autoComplete="off"/>
      </Field>}
      <div className="form-row">
        <Field label={completed ? 'Получено, ₽' : 'Ожидаемая сумма, ₽'} hint={completed ? undefined : 'Можно оставить пустым и уточнить позже.'}>
          <input className="inp money-input" required={completed} inputMode="decimal" value={amount} placeholder="0,00" onChange={e => setAmount(e.target.value)}/>
        </Field>
        <Field label={completed ? 'Дата' : 'Планируемая дата'}>
          <input className="inp" type="date" required={completed} min="1900-01-01" max="2200-12-31" value={date} onChange={e => setDate(e.target.value)}/>
        </Field>
      </div>
      {completed && <Field label="Расходы на работу, ₽" hint="Материалы, топливо, инструмент и другие затраты. Можно оставить пустым."><input className="inp money-input" inputMode="decimal" value={cost} placeholder="0,00" onChange={e => setCost(e.target.value)}/></Field>}
      {completed && (parseMoney(amount) !== null || cost.trim()) && <div className="sale-preview job-net-preview" aria-label="Чистая прибыль шабашки"><div><span>Получено</span><strong>{money(parseMoney(amount) ?? 0)}</strong></div><div><span>Расходы</span><strong>−{money(parseMoney(cost) ?? 0)}</strong></div><div className="sale-preview-total"><span>Чистая прибыль</span><strong>{money((parseMoney(amount) ?? 0) - (parseMoney(cost) ?? 0))}</strong></div></div>}
      {completed && <Field label="Счёт">
        <select className="inp" required value={accountId} onChange={e => setAccountId(e.target.value)}>
          {!data.accounts.length && <option value="">Сначала создайте счёт</option>}
          {data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>}
      {completed && <div className="form-note"><Check size={16}/><span>На счёт поступит вся полученная сумма. В доход направлений войдёт чистая прибыль: получено минус расходы. Распределение 15/15/70 считается в «Моём капитале».</span></div>}
      {!completed && <div className="form-note"><Check size={16}/><span>План пока не меняет капитал. Позже свяжем его с выполненной работой.</span></div>}
      <Field label="Заметка · необязательно">
        <textarea className="inp" maxLength={2000} rows={2} value={note} placeholder="Детали, которые важно не забыть" onChange={e => setNote(e.target.value)}/>
      </Field>
      {error && <div className="form-error" role="alert"><AlertCircle size={17}/>{error}</div>}
      {confirmDelete && <div className="delete-confirm"><strong>Удалить запись?</strong><p>{completed ? 'Сумма будет пересчитана. Это действие нельзя отменить.' : 'План будет удалён. Выполненные доходы это не затронет.'}</p><div className="flex gap-2"><Button type="button" variant="danger" onClick={remove}>Да, удалить</Button><Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>Отмена</Button></div></div>}
      <div className="modal-actions">
        {editing && <Button type="button" variant="ghost" className="delete-btn" onClick={() => { setConfirmDelete(true); setError(''); }}><Trash2 size={16}/>Удалить</Button>}
        <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
        <Button type="submit"><Check size={17}/>{editing ? 'Сохранить' : completed ? 'Добавить' : 'Запланировать'}</Button>
      </div>
    </form>
  </Modal>;
}
