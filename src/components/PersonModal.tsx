import { useState, type FormEvent } from 'react';
import { AlertCircle, Check, Trash2 } from 'lucide-react';
import { people, uid, type AppData, type Person } from '../core/model';
import { Button, Field, Modal } from './ui';

export type PersonRequest = { type: 'person'; item?: Person };

export function PersonModal({ request, data, onClose, onSave, onDelete }: { request: PersonRequest; data: AppData; onClose: () => void; onSave: (data: AppData, message: string) => void; onDelete: (data: AppData, message: string) => void }) {
  const item = request.item;
  const [name, setName] = useState(item?.name ?? '');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const clean = name.trim().slice(0, 100);
    if (!clean) return setError('Укажите имя.');
    if (people(data).some(p => p.id !== item?.id && p.name.trim().toLowerCase() === clean.toLowerCase())) return setError('Такой человек уже есть в списке.');
    const person: Person = { id: item?.id ?? uid(), name: clean, createdAt: item?.createdAt ?? new Date().toISOString() };
    onSave({ ...data, people: item ? people(data).map(p => p.id === person.id ? person : p) : [...people(data), person] }, item ? 'Человек обновлён' : 'Человек добавлен');
    onClose();
  }
  function remove() {
    if (!item) return;
    onDelete({ ...data, people: people(data).filter(p => p.id !== item.id) }, 'Человек удалён из списка');
    onClose();
  }
  return <Modal title={item ? 'Изменить человека' : 'Новый человек'} subtitle="Имя используется в долгах и в выборе инвестора." onClose={onClose}>
    <form className="entry-form" onSubmit={submit}>
      <Field label="Имя"><input className="inp" required maxLength={100} value={name} placeholder="Например, Алексей" onChange={e => setName(e.target.value)} autoComplete="off"/></Field>
      {error && <div className="form-error" role="alert"><AlertCircle size={17}/>{error}</div>}
      {confirmDelete && <div className="delete-confirm"><strong>Удалить человека из списка?</strong><p>Существующие долги и товары не изменятся.</p><div className="flex gap-2"><Button type="button" variant="danger" onClick={remove}>Да, удалить</Button><Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>Отмена</Button></div></div>}
      <div className="modal-actions">{item && <Button type="button" variant="ghost" className="delete-btn" onClick={() => setConfirmDelete(true)}><Trash2 size={16}/>Удалить</Button>}<Button type="button" variant="secondary" onClick={onClose}>Отмена</Button><Button type="submit"><Check size={17}/>{item ? 'Сохранить' : 'Добавить'}</Button></div>
    </form>
  </Modal>;
}
