import { useRef, useState } from 'react';
import type { AppData } from '../core/model';
import { EntryModal } from '../components/EntryModal';
import { ProductModal } from '../components/ProductModal';
import { WorkModal } from '../components/WorkModal';

const tabs = [['debt', 'Долг'], ['product', 'Товар'], ['odd-job', 'Работа'], ['odd-job-plan', 'План'], ['movement', 'Расход'], ['income', 'Доход']] as const;
type Tab = typeof tabs[number][0];
export function AddPage({ data, onSave }: { data: AppData; onSave: (data: AppData, message: string) => void }) {
  const [active, setActive] = useState<Tab>('debt');
  const [visited, setVisited] = useState<Tab[]>(['debt']);
  const [versions, setVersions] = useState<Partial<Record<Tab, number>>>({});
  const [error, setError] = useState('');
  const failed = useRef(false);
  const section = useRef<HTMLElement>(null);
  function select(key: Tab) {
    if (section.current?.querySelector('[role=tabpanel]:not([hidden]) .voice-field[aria-busy=true]')) {
      setError('Остановите запись и дождитесь обработки аудио перед переключением.'); return;
    }
    setActive(key); setVisited(current => current.includes(key) ? current : [...current, key]); setError('');
  }
  function save(next: AppData, message: string) {
    failed.current = false;
    try { onSave(next, message); setError(''); }
    catch (e) { failed.current = true; setError((e as Error).message); }
  }
  function close(key: Tab) {
    if (failed.current) { failed.current = false; return; }
    setVersions(current => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
  }
  return <section className="add-page" ref={section}>
    <div className="page-head"><div><h1>Добавить</h1></div></div>
    <div className="add-tabs" role="tablist" aria-label="Тип записи">{tabs.map(([key, label], index) => <button type="button" role="tab" id={`add-tab-${key}`} aria-controls={`add-panel-${key}`} aria-selected={active === key} tabIndex={active === key ? 0 : -1} key={key} onClick={() => select(key)} onKeyDown={event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); select(tabs[next][0]); document.getElementById(`add-tab-${tabs[next][0]}`)?.focus(); }
    }}>{label}</button>)}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {tabs.map(([key]) => <div key={key} id={`add-panel-${key}`} hidden={active !== key} role="tabpanel" aria-labelledby={`add-tab-${key}`}>
      {visited.includes(key) && (key === 'product' ? <ProductModal key={versions[key] ?? 0} inline request={{ type: 'product' }} data={data} onClose={() => close(key)} onSave={save} onDelete={save}/> : key === 'odd-job' || key === 'odd-job-plan' ? <WorkModal key={versions[key] ?? 0} inline request={{ type: key }} data={data} onClose={() => close(key)} onSave={save} onDelete={save}/> : <EntryModal key={versions[key] ?? 0} inline request={key === 'movement' ? { type: 'movement', kind: 'expense' } : { type: key }} data={data} onClose={() => close(key)} onSave={save} onDelete={save}/>)}
    </div>)}
  </section>;
}
