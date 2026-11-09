import { useState } from 'react';
import { Cloud, Copy, Laptop, RefreshCw, ShieldCheck, Wifi } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { SyncController } from '../core/useSync';
import { desktop } from '../core/bridge';
import { Button, Field, SectionHead } from './ui';
export const sqlSetup = `-- Выполните один раз в Supabase → SQL Editor.
create table if not exists public.mi_kapital_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  revision bigint not null default 1,
  device_id text not null,
  updated_at timestamptz not null default now()
);
alter table public.mi_kapital_sync enable row level security;
drop policy if exists "own sync row" on public.mi_kapital_sync;
create policy "own sync row" on public.mi_kapital_sync
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.mi_kapital_sync to authenticated;
create or replace function public.mi_kapital_push(expected_revision bigint, next_data jsonb, next_device_id text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare current_row public.mi_kapital_sync%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if pg_column_size(next_data) > 15000000 then raise exception 'Data exceeds 15 MB'; end if;
  select * into current_row from public.mi_kapital_sync where user_id = auth.uid() for update;
  if found and current_row.revision <> expected_revision then
    return jsonb_build_object('conflict', true, 'data', current_row.data, 'revision', current_row.revision, 'device_id', current_row.device_id);
  end if;
  insert into public.mi_kapital_sync(user_id,data,revision,device_id)
    values(auth.uid(),next_data,coalesce(current_row.revision,0)+1,next_device_id)
    on conflict (user_id) do update set data=excluded.data,revision=excluded.revision,device_id=excluded.device_id,updated_at=now()
    returning * into current_row;
  return jsonb_build_object('conflict', false, 'data', current_row.data, 'revision', current_row.revision, 'device_id', current_row.device_id);
end $$;
revoke all on function public.mi_kapital_push(bigint,jsonb,text) from public, anon;
grant execute on function public.mi_kapital_push(bigint,jsonb,text) to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='mi_kapital_sync') then
    alter publication supabase_realtime add table public.mi_kapital_sync;
  end if;
end $$;`;
export function SyncSettings({ sync }: { sync: SyncController }) {
  const { config, saveConfig, status, pcInfo } = sync;
  const [url,setUrl]=useState(config.supabaseUrl);const[key,setKey]=useState(config.supabaseKey);const[email,setEmail]=useState(config.email);const[password,setPassword]=useState('');const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');const[error,setError]=useState('');const[lanUrl,setLanUrl]=useState(config.lanUrl);const[lanToken,setLanToken]=useState(config.lanToken);
  const android=desktop()?.platform==='android';
  const pairing=pcInfo ? JSON.stringify({type:'mi-kapital-pair',url:pcInfo.addresses[0]??'',token:pcInfo.token}) : '';
  async function act(fn:()=>Promise<string|void>){setBusy(true);setError('');setMessage('');try{const result=await fn();setMessage(result||'Настройки сохранены.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="sync-section"><SectionHead title="Единая база · ПК и телефон" action={<Wifi size={19} className="muted"/>}/><div className="sync-status-line" role="status"><span className={`status-dot ${status.state==='error'?'red':'green'}`}/>{status.message}</div><p className="muted small">На ПК база остаётся локальной. Телефон сначала подключается к нему по Wi‑Fi; если ПК выключен или недоступен — использует Supabase. Изменения объединяются автоматически, удаления тоже синхронизируются.</p>
    {!android && pcInfo && <div className="sync-pairing"><div className="qr-large"><QRCodeSVG value={pairing} size={156} level="M" marginSize={1}/></div><div><strong className="small">Сопряжение телефона</strong><p className="muted small">В Android-приложении откройте «Данные и настройки» → «Сканировать QR ПК». ПК и телефон должны быть в одной Wi‑Fi.</p>{pcInfo.addresses.map(a=><code className="small muted" key={a}>{a}</code>)}{!pcInfo.addresses.length&&<p className="form-error">Нет активной локальной сети. Подключите ПК к Wi‑Fi.</p>}{pcInfo.error&&<p className="form-error">{pcInfo.error}</p>}<label className="checkbox-label"><input type="checkbox" checked={config.lanEnabled} onChange={e=>void saveConfig({...config,lanEnabled:e.target.checked}).catch(err=>setError(err.message))}/>Разрешить подключение в локальной сети</label><p className="field-hint">При первом запуске Windows может спросить разрешение для частного сети. QR содержит секретный ключ сопряжения — не публикуйте его.</p></div></div>}
    {android && <div className="entry-form"><div className="form-note"><Laptop size={17}/><span>Откройте настройки на ПК и отсканируйте QR сопряжения камерой телефона. Можно ввести адрес и ключ вручную.</span></div><Button variant="secondary" onClick={()=>void desktop()?.scanPairing?.()}>Сканировать QR ПК</Button><Field label="Адрес ПК"><input className="inp" type="url" value={lanUrl} placeholder="http://192.168.1.10:47653" onChange={e=>setLanUrl(e.target.value)}/></Field><Field label="Ключ сопряжения"><input className="inp" type="password" value={lanToken} autoComplete="off" onChange={e=>setLanToken(e.target.value)}/></Field><Button variant="secondary" disabled={busy} onClick={()=>void act(async()=>{const parsed=new URL(lanUrl);if(parsed.protocol!=='http:'||!/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(parsed.hostname))throw new Error('Нужен адрес ПК в частной Wi‑Fi сети.');if(!/^[a-f0-9]{64}$/.test(lanToken))throw new Error('Скопируйте ключ сопряжения с ПК.');await saveConfig({...config,lanUrl:parsed.origin,lanToken});await sync.syncNow();})}>Подключить ПК</Button></div>}
    <div className="entry-form" style={{marginTop:18}}><label className="checkbox-label"><input type="checkbox" checked={config.cloudEnabled} onChange={e=>void saveConfig({...config,cloudEnabled:e.target.checked}).catch(err=>setError(err.message))}/>Включить Supabase вне домашней Wi‑Fi</label><Field label="URL проекта Supabase"><input className="inp" type="url" value={url} placeholder="https://ваш-проект.supabase.co" onChange={e=>setUrl(e.target.value)}/></Field><Field label="Публичный ключ · publishable / anon" hint="Никогда не используйте service_role или sb_secret_. Ключ и вход хранятся на устройстве, не в резервной копии капитала."><input className="inp" type="password" autoComplete="off" value={key} placeholder="sb_publishable_… или eyJ…" onChange={e=>setKey(e.target.value)}/></Field><div className="form-row"><Field label="Email"><input className="inp" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Пароль"><input className="inp" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></Field></div><div className="backup-actions"><Button variant="secondary" disabled={busy||!url||!key||!email||!password} onClick={()=>void act(async()=>{await saveConfig({...config,supabaseUrl:url,supabaseKey:key,email});const result=await sync.signIn(email,password,false);setPassword('');return result;})}><Cloud size={16}/>Войти и включить</Button><Button variant="ghost" disabled={busy||!email||!password} onClick={()=>void act(async()=>{await saveConfig({...config,supabaseUrl:url,supabaseKey:key,email});const result=await sync.signIn(email,password,true);setPassword('');return result;})}>Создать аккаунт</Button><Button variant="ghost" disabled={busy} onClick={()=>void act(sync.signOut)}>Выйти</Button></div><details><summary>Инструкция настройки Supabase</summary><ol><li>В Supabase откройте Authentication → Providers → Email: включите Email, отключите подтверждение смены email при использовании одного адреса. Для нового аккаунта подтвердите письмо.</li><li>Откройте SQL Editor, вставьте код ниже и выполните один раз. Таблица защищена RLS: каждый пользователь видит только свою базу.</li><li>Скопируйте Project URL и publishable/anon key из Project Settings → API. Вставьте выше, войдите с одним аккаунтом на ПК и телефоне.</li><li>Realtime включается SQL-кодом. Если он недоступен, приложение проверяет изменения каждые 5 секунд.</li></ol><pre>{sqlSetup}</pre><Button variant="secondary" onClick={()=>void navigator.clipboard.writeText(sqlSetup).then(()=>setMessage('SQL скопирован.')).catch(()=>setError('Выделите SQL и скопируйте вручную.'))}><Copy size={15}/>Скопировать SQL</Button></details>{message&&<p className="form-note" role="status"><ShieldCheck size={16}/>{message}</p>}{error&&<p className="form-error" role="alert">{error}</p>}<Button variant="ghost" disabled={busy} onClick={()=>void act(async()=>{await sync.syncNow();return 'Проверка синхронизации выполнена.';})}><RefreshCw size={15}/>Синхронизировать сейчас</Button><p className="field-hint">В облако передаются все данные, включая фото и аудио. Используйте свой проект Supabase и надёжный пароль. Бесплатный тариф имеет ограничения объёма и трафика.</p></div>
  </section>;
}
