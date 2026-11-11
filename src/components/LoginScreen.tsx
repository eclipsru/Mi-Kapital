import { useState, type FormEvent } from 'react';
import { ArrowRight, Cloud, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { sqlSetup } from './SyncSettings';
import { Button, Field } from './ui';
import type { SyncController } from '../core/useSync';

export function LoginScreen({ sync }: { sync: SyncController }) {
  const [url, setUrl] = useState(sync.config.supabaseUrl);
  const [publicKey, setPublicKey] = useState(sync.config.supabaseKey);
  const [email, setEmail] = useState(sync.config.email);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const configured = !!(sync.config.supabaseUrl && sync.config.supabaseKey);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    if (creating && password !== confirmPassword) return setError('Пароли не совпадают.');
    if (password.length < 6) return setError('Пароль должен содержать не менее 6 символов.');
    setBusy(true);
    try {
      await sync.saveConfig({ ...sync.config, supabaseUrl:url.trim(), supabaseKey:publicKey.trim(), email:email.trim(), cloudEnabled:false });
      const result = await sync.signIn(email.trim(), password, creating);
      setPassword(''); setConfirmPassword(''); setMessage(result);
    } catch (e) { setError((e as Error).message || 'Не удалось войти. Проверьте подключение и данные аккаунта.'); }
    finally { setBusy(false); }
  }

  return <main className="login-screen">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand"><img src="./favicon.svg" alt="" width="46" height="46"/><div><strong>Мой капитал</strong><span>Единая база на ПК и телефоне</span></div></div>
      <div className="login-heading"><span className="login-icon"><LockKeyhole size={21}/></span><div><h1 id="login-title">{creating ? 'Создать аккаунт' : 'Войти в приложение'}</h1><p>Используйте один email и пароль на обоих устройствах. Доходы, долги и изменения будут синхронизироваться автоматически.</p></div></div>
      <form className="login-form" onSubmit={event => void submit(event)}>
        {!configured && <details className="login-setup" open>
          <summary><Cloud size={16}/>Подключение общего облака · один раз</summary>
          <p>Для безопасной общей базы используется ваш проект Supabase. Введите его URL и публичный ключ; пароль от проекта не нужен. Эти настройки можно использовать на ПК и телефоне.</p>
          <Field label="URL проекта Supabase"><input className="inp" type="url" required value={url} placeholder="https://ваш-проект.supabase.co" onChange={e => setUrl(e.target.value)}/></Field>
          <Field label="Публичный ключ · publishable / anon" hint="Не вставляйте service_role или sb_secret_."><input className="inp" type="password" required autoComplete="off" value={publicKey} placeholder="sb_publishable_… или eyJ…" onChange={e => setPublicKey(e.target.value)}/></Field>
          <details className="login-sql-guide"><summary>Как подготовить базу Supabase (один раз)</summary><ol><li>В Supabase включите провайдера Email в Authentication → Providers.</li><li>Откройте SQL Editor и выполните этот код. Он создаст общую таблицу с доступом только к данным вошедшего пользователя.</li><li>В Project Settings → API скопируйте Project URL и publishable/anon key.</li></ol><pre>{sqlSetup}</pre></details>
        </details>}
        {configured && <details className="login-setup login-setup-compact"><summary><KeyRound size={16}/>Настройки облачного проекта</summary><Field label="URL проекта Supabase"><input className="inp" type="url" required value={url} onChange={e => setUrl(e.target.value)}/></Field><Field label="Публичный ключ · publishable / anon"><input className="inp" type="password" required autoComplete="off" value={publicKey} onChange={e => setPublicKey(e.target.value)}/></Field><details className="login-sql-guide"><summary>Инструкция и SQL для подготовки базы</summary><pre>{sqlSetup}</pre></details></details>}
        <Field label="Логин · email"><input className="inp" type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com"/></Field>
        <Field label="Пароль"><input className="inp" type="password" required autoComplete={creating ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={creating ? 'Не менее 6 символов' : 'Введите пароль'}/></Field>
        {creating && <Field label="Повторите пароль"><input className="inp" type="password" required autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}/></Field>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-note" role="status"><ShieldCheck size={16}/>{message}</p>}
        <Button className="wide login-submit" disabled={busy || !url.trim() || !publicKey.trim() || !email.trim() || !password}>{busy ? 'Подключаем безопасную базу…' : creating ? 'Создать аккаунт' : 'Войти и синхронизировать'}{!busy && <ArrowRight size={17}/>}</Button>
      </form>
      <button className="login-mode" disabled={busy} onClick={() => { setCreating(!creating); setPassword(''); setConfirmPassword(''); setError(''); setMessage(''); }}>{creating ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Создать'}</button>
      <p className="login-privacy"><ShieldCheck size={14}/>Пароль не сохраняется в приложении. Доступ к базе защищён вашим аккаунтом.</p>
    </section>
  </main>;
}
