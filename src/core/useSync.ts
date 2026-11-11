import { useCallback, useEffect, useRef, useState } from 'react';
import { desktop } from './bridge';
import { CloudSync } from './cloud-sync';
import { validateData } from './storage';
import { conflictMessage, defaultSyncConfig, deviceId, mergeData, sameData, type SyncConfig, type SyncEnvelope, type SyncStatus } from './sync';
import type { AppData } from './model';

const LOCAL_CONFIG = 'mi-kapital.sync-settings';
export function useSync(data: AppData, ready: boolean, mergeRemote: (data: unknown, preferRemote?: boolean) => void, dataRef: React.RefObject<AppData>) {
  const [config, setConfig] = useState<SyncConfig>(defaultSyncConfig);
  const [configReady, setConfigReady] = useState(false);
  const [authState, setAuthState] = useState<'checking' | 'setup' | 'signed-out' | 'signed-in'>('checking');
  const [status, setStatus] = useState<SyncStatus>({ transport:'offline', state:'idle', message:'Локальное сохранение', pending:false });
  const [pcInfo, setPcInfo] = useState<{ addresses:string[]; port:number; token:string; enabled:boolean; error?:string } | null>(null);
  const cloud = useRef<CloudSync | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const alive = useRef(true);
  const pcHealthy = useRef(false);
  const lastPcRevision = useRef(-1);
  const configRef = useRef(config);
  const runRef = useRef<() => Promise<SyncStatus | undefined>>(async () => undefined);
  const activeRun = useRef<Promise<SyncStatus | undefined> | null>(null);
  const id = useRef(deviceId());
  const saveConfig = useCallback(async (next: SyncConfig) => {
    if (desktop()?.saveSyncConfig) await desktop()!.saveSyncConfig!(next);
    else localStorage.setItem(LOCAL_CONFIG, JSON.stringify(next));
    configRef.current = next; setConfig(next); setConfigReady(true);
    if (desktop()?.syncInfo) setPcInfo(await desktop()!.syncInfo!());
  }, []);
  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        const bridge = desktop();
        const next = bridge?.syncConfig ? await bridge.syncConfig() : JSON.parse(localStorage.getItem(LOCAL_CONFIG) || 'null') ?? defaultSyncConfig();
        if (!alive.current) return;
        configRef.current = next; setConfig(next); setConfigReady(true);
        if (bridge?.syncInfo) setPcInfo(await bridge.syncInfo());
        if (!next.supabaseUrl || !next.supabaseKey || !next.cloudEnabled) { setAuthState(next.supabaseUrl && next.supabaseKey ? 'signed-out' : 'setup'); return; }
        const account = new CloudSync(next, id.current);
        try { await account.connect(); if (alive.current) { setAuthState('signed-in'); void runRef.current(); } }
        catch { if (alive.current) setAuthState('signed-out'); }
        finally { await account.close(); }
      } catch (e) { if (alive.current) { setConfigReady(true); setAuthState('setup'); setStatus(s => ({ ...s, state:'error', message:(e as Error).message })); } }
    })();
    return () => { alive.current = false; void cloud.current?.close(); cloud.current = null; };
  }, []);
  useEffect(() => {
    void cloud.current?.close(); cloud.current = null;
    if (config.cloudEnabled && config.supabaseUrl && config.supabaseKey) cloud.current = new CloudSync(config, id.current);
    void runRef.current();
  }, [config.cloudEnabled, config.supabaseUrl, config.supabaseKey, config.lanUrl, config.lanToken]);
  const execute = useCallback(async () => {
    let result: SyncStatus = { transport:'offline', state:'idle', message:'Локальное сохранение', pending:false };
    try {
      do {
        again.current = false;
        const cfg = configRef.current;
        const bridge = desktop();
        const current = () => dataRef.current;
        const apply = (next: AppData, preferRemote = false) => mergeRemote(validateData(next), preferRemote);
        let pcError = '';
        setStatus(s => ({ ...s, state:'syncing', pending:true }));
        let transported = false;
        if (bridge?.platform === 'android' && cfg.lanUrl && cfg.lanToken) {
          try {
            const base = cfg.lanUrl.replace(/\/$/, '');
            const request = async (path: string, body?: unknown) => {
              const response = await fetch(`${base}${path}`, { method:body ? 'POST' : 'GET', headers:{ Authorization:`Bearer ${cfg.lanToken}`, 'Content-Type':'application/json' }, ...(body ? { body:JSON.stringify(body) } : {}), signal:AbortSignal.timeout(4000) });
              if (!response.ok && response.status !== 409) throw new Error(`ПК вернул HTTP ${response.status}`);
              return await response.json() as SyncEnvelope;
            };
            let converged = false;
            for (let attempt = 0; attempt < 5; attempt++) {
              let remote = await request('/sync/pull');
              let next = current();
              if (remote.data) { next = validateData(mergeData(next, remote.data, true)); if (!sameData(current(), next)) apply(next, true); }
              if (remote.data && sameData(next, remote.data)) { converged = true; break; }
              remote = await request('/sync/push', { revision:remote.revision, deviceId:id.current, data:next });
              if (remote.data) { const merged = validateData(mergeData(current(), remote.data, true)); if (!sameData(current(), merged)) apply(merged, true); }
              lastPcRevision.current = remote.revision;
            }
            if (!converged) throw new Error('Данные меняются одновременно; повторим подключение к ПК.');
            pcHealthy.current = true; transported = true;
            result = { transport:'pc', state:'synced', message:'Синхронизировано с ПК · Wi‑Fi', lastSyncedAt:new Date().toISOString(), pending:false };
            setStatus(result);
          } catch (error) { pcHealthy.current = false; pcError = `ПК недоступен: ${(error as Error).message}. Изменения сохранены на телефоне.`; }
        } else if (bridge?.platform === 'windows') { pcHealthy.current = true; transported = true; }
        if (cloud.current && (bridge?.platform !== 'android' || !pcHealthy.current)) {
          try {
            await cloud.current.exchange(current, apply);
            cloud.current.subscribe(() => void runRef.current());
            transported = true;
            result = { transport:'cloud', state:'synced', message:pcError ? 'Supabase включён · ПК недоступен' : 'Синхронизировано с Supabase', lastSyncedAt:new Date().toISOString(), pending:false };
            setStatus(result);
          } catch (e) { result = { transport:transported ? 'pc' : 'offline', state:transported ? 'synced' : 'error', message:transported ? 'ПК синхронизирован; облако временно недоступно' : `${pcError ? pcError + ' ' : ''}Supabase: ${(e as Error).message}`, pending:!transported }; setStatus(result); }
        } else if (transported) {
          if (bridge?.platform === 'windows') { result = { transport:'pc', state:'synced', message:'База на этом ПК · телефон подключается по Wi‑Fi', lastSyncedAt:new Date().toISOString(), pending:false }; setStatus(result); }
        } else { result = { transport:'offline', state:pcError ? 'error' : 'idle', message:pcError || (bridge?.platform === 'android' ? 'Локально на телефоне · настройте синхронизацию' : 'Локально на ПК · облако не включено'), pending:!!pcError }; setStatus(result); }
      } while (again.current);
    } catch (e) { result = { transport:'offline', state:'error', message:conflictMessage(e), pending:true }; if (alive.current) setStatus(result); }
    return result;
  }, [mergeRemote, dataRef]);
  const run = useCallback(async (): Promise<SyncStatus | undefined> => {
    if (!ready || !configReady) return;
    if (running.current) { again.current = true; await activeRun.current; return runRef.current(); }
    running.current = true;
    const task = execute(); activeRun.current = task;
    try { return await task; } finally { running.current = false; activeRun.current = null; }
  }, [execute, ready, configReady]);
  useEffect(() => { runRef.current = run; }, [run]);
  useEffect(() => { if (ready && configReady) void run(); }, [data, ready, configReady, run]);
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => void runRef.current(), 5000);
    const online = () => void runRef.current();
    window.addEventListener('online', online);
    return () => { clearInterval(timer); window.removeEventListener('online', online); };
  }, [ready]);
  useEffect(() => {
    if (!ready || desktop()?.platform !== 'android' || !config.lanUrl || !config.lanToken) return;
    const controller = new AbortController();
    void (async () => {
      while (!controller.signal.aborted) {
        try {
          const response = await fetch(`${config.lanUrl.replace(/\/$/, '')}/sync/events`, { headers:{ Authorization:`Bearer ${config.lanToken}` }, signal:controller.signal });
          if (!response.ok || !response.body) throw new Error('SSE unavailable');
          pcHealthy.current = true;
          const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
          while (!controller.signal.aborted) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream:true }); const events = buffer.split('\n\n'); buffer = events.pop() ?? ''; for (const event of events) { const line = event.split('\n').find(l => l.startsWith('data: ')); if (!line) continue; const payload = JSON.parse(line.slice(6)); if (payload.revision !== lastPcRevision.current) await runRef.current(); } }
        } catch { pcHealthy.current = false; }
        if (!controller.signal.aborted) await new Promise(resolve => setTimeout(resolve, 3000));
      }
    })();
    return () => controller.abort();
  }, [ready, config.lanUrl, config.lanToken]);
  const signIn = useCallback(async (email: string, password: string, signUp: boolean) => {
    const client = new CloudSync(configRef.current, id.current);
    try {
      const message = await client.signIn(email, password, signUp);
      const authenticated = await client.hasSession();
      await saveConfig({ ...configRef.current, email, cloudEnabled:authenticated });
      setAuthState(authenticated ? 'signed-in' : 'signed-out');
      return message;
    } finally { await client.close(); }
  }, [saveConfig]);
  const signOut = useCallback(async () => { await cloud.current?.signOut(); await saveConfig({ ...configRef.current, cloudEnabled:false }); setAuthState('signed-out'); }, [saveConfig]);
  const syncNow = useCallback(async () => { const result = await run(); if (result?.state === 'error') throw new Error(result.message); }, [run]);
  return { config, configReady, authState, saveConfig, status, pcInfo, signIn, signOut, syncNow };
}
export type SyncController = ReturnType<typeof useSync>;
