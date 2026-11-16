import { useCallback, useEffect, useState } from 'react';
import { Button, SectionHead } from './ui';
import { desktop } from '../core/bridge';

const options = [
  ['my_due', 'Мои долги: срок в ближайшие 3 дня'],
  ['their_due', 'Мне должны: срок в ближайшие 3 дня'],
  ['my_overdue', 'Мои просроченные долги'],
  ['their_overdue', 'Просроченные долги передо мной'],
  ['work', 'Запланированные работы в ближайшие 3 дня'],
  ['past_work', 'Планы с прошедшей датой: проверить актуальность'],
  ['preparing', 'Товары на подготовке от 14 дней'],
  ['listed', 'Товары на продаже от 30 дней'],
] as const;
type Key = typeof options[number][0];
type Settings = Record<Key, boolean> & { allowed: boolean };
export function ReminderSettings() {
  const native = window.MiKapitalNative;
  const [value, setValue] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(() => { try { if (native?.reminderSettings) setValue(JSON.parse(native.reminderSettings()) as Settings); } catch { setError('Не удалось прочитать настройки уведомлений.'); } }, [native]);
  useEffect(() => { refresh(); window.addEventListener('mi-kapital-reminders', refresh); return () => window.removeEventListener('mi-kapital-reminders', refresh); }, [refresh]);
  if (desktop()?.platform !== 'android') return null;
  if (!native?.reminderSettings || !native.saveReminderSettings) return <section className="backup-section"><SectionHead title="Уведомления Android"/><p className="muted small">Для уведомлений обновите Android-приложение до новой версии APK.</p></section>;
  function change(key: Key, checked: boolean) {
    if (!value) return;
    const next = { ...value, [key]: checked };
    try { const result = JSON.parse(native!.saveReminderSettings!(JSON.stringify(next))) as { ok: boolean }; if (!result.ok) throw new Error(); setValue(next); setError(''); } catch { setError('Не удалось сохранить настройки уведомлений.'); }
  }
  return <section className="backup-section reminder-settings"><SectionHead title="Уведомления Android"/><p className="muted small">Напоминания включаются отдельно на этом телефоне. Тексты на экране блокировки не содержат имён и сумм.</p>{options.map(([key,label])=><label className="checkbox-label" key={key}><input type="checkbox" checked={value?.[key] ?? false} disabled={!value} onChange={e=>change(key,e.target.checked)}/>{label}</label>)}<p className="muted small">{value?.allowed ? 'Уведомления приложения разрешены.' : 'Уведомления приложения не разрешены.'} Сначала включите нужные виды, затем разрешите уведомления в Android.</p><Button variant="secondary" onClick={()=>native.requestNotificationPermission?.()}>Запросить разрешение</Button> <Button variant="secondary" onClick={()=>native.openNotificationSettings?.()}>Настройки Android</Button><p className="field-hint">Каждый вид напоминает не чаще раза в день, пока есть подходящие записи. Проверка выполняется примерно раз в час по последним данным на телефоне; Android может задержать её при энергосбережении. После принудительной остановки приложения напоминания не работают до повторного запуска. Фоновая синхронизация не гарантируется.</p>{error&&<p className="form-error" role="alert">{error}</p>}</section>;
}
