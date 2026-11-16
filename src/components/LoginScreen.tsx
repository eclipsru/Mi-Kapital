import { useState, type FormEvent } from 'react';
import { ArrowRight, Cloud, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Button, Field } from './ui';
import type { SyncController } from '../core/useSync';

export function LoginScreen({ sync }: { sync: SyncController }) {
  const [email, setEmail] = useState(sync.config.email);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    if (creating && password !== confirmPassword) return setError('Пароли не совпадают.');
    if (password.length < 6) return setError('Пароль должен содержать не менее 6 символов.');
    setBusy(true);
    try {
      await sync.saveConfig({ ...sync.config, email:email.trim(), cloudEnabled:false });
      const result = await sync.signIn(email.trim(), password, creating);
      setPassword(''); setConfirmPassword(''); setMessage(result);
    } catch (e) { setError((e as Error).message || 'Не удалось войти. Проверьте подключение и данные аккаунта.'); }
    finally { setBusy(false); }
  }

  return <main className="login-screen">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand"><img src="./favicon.svg" alt="" width="46" height="46"/><div><strong>Мой капитал</strong><span>Единая база на ПК и телефоне</span></div></div>
      <div className="login-heading"><span className="login-icon"><LockKeyhole size={21}/></span><div><h1 id="login-title">{creating ? 'Создать аккаунт' : 'Войти в приложение'}</h1><p>Используйте один email и пароль на обоих устройствах. Доходы, долги и изменения будут синхронизироваться автоматически.</p></div></div>
      <div className="login-cloud-note"><Cloud size={16}/><span>Общая облачная база уже настроена.</span></div>
      <form className="login-form" onSubmit={event => void submit(event)}>
        <Field label="Логин · email"><input className="inp" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com"/></Field>
        <Field label="Пароль"><input className="inp" type="password" required autoComplete={creating ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={creating ? 'Не менее 6 символов' : 'Введите пароль'}/></Field>
        {creating && <Field label="Повторите пароль"><input className="inp" type="password" required autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}/></Field>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-note" role="status"><ShieldCheck size={16}/>{message}</p>}
        <Button className="wide login-submit" disabled={busy || !email.trim() || !password}>{busy ? 'Подключаемся…' : creating ? 'Создать аккаунт' : 'Войти и синхронизировать'}{!busy && <ArrowRight size={17}/>}</Button>
      </form>
      <button className="login-mode" disabled={busy} onClick={() => { setCreating(!creating); setPassword(''); setConfirmPassword(''); setError(''); setMessage(''); }}>{creating ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Создать'}</button>
      <p className="login-privacy"><ShieldCheck size={14}/>Пароль не сохраняется приложением. Используйте один аккаунт на ПК и телефоне.</p>
    </section>
  </main>;
}
