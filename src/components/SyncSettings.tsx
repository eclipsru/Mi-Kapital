import { Cloud, LogOut, ShieldCheck } from 'lucide-react';
import { Button, SectionHead } from './ui';
import type { SyncController } from '../core/useSync';

export function SyncSettings({ sync }: { sync: SyncController }) {
  const { config, status } = sync;
  async function signOut() {
    try { await sync.signOut(); }
    catch (error) { console.error('Не удалось завершить сеанс Supabase', error); }
  }
  return <section className="sync-section">
    <SectionHead title="Единая база · ПК и телефон" action={<Cloud size={19} className="muted"/>}/>
    <div className="sync-status-line" role="status"><span className={`status-dot ${status.state==='error'?'red':'green'}`}/>{status.message}</div>
    {status.lastSyncedAt&&<p className="field-hint">Последний обмен: {new Date(status.lastSyncedAt).toLocaleString('ru-RU')}</p>}
    <p className="muted small">После входа записи автоматически синхронизируются между устройствами с одним аккаунтом. При временной потере интернета изменения сохраняются на устройстве и отправляются после восстановления связи.</p>
    <div className="account-session-card"><ShieldCheck size={18}/><div><strong>Вход выполнен</strong><span>{config.email}</span></div><Button variant="ghost" className="btn-small" onClick={() => void signOut()}><LogOut size={15}/>Выйти</Button></div>
  </section>;
}
