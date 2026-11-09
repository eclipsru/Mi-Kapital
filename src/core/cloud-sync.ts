import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { validateData } from './storage';
import { mergeData, sameData, type SyncConfig, type SyncEnvelope } from './sync';
import type { AppData } from './model';

export function validateCloudConfig(url: string, key: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('Адрес Supabase должен быть HTTPS-адресом проекта без пути и параметров.');
  if (!key.trim() || key.length > 2000) throw new Error('Введите публичный ключ Supabase.');
  if (key.startsWith('sb_secret_')) throw new Error('Секретный ключ нельзя использовать в приложении. Нужен publishable или anon key.');
  if (key.split('.').length === 3) {
    try { const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (payload.role === 'service_role') throw new Error('Ключ service_role запрещён. Используйте anon key.'); } catch (e) { if ((e as Error).message.includes('service_role')) throw e; }
  }
  return parsed.origin;
}
export class CloudSync {
  private client: SupabaseClient | null = null;
  private fingerprint = '';
  private userId = '';
  private revision = 0;
  private channel: ReturnType<SupabaseClient['channel']> | null = null;
  constructor(private config: SyncConfig, private deviceId: string) {}
  async connect(): Promise<string> {
    const url = validateCloudConfig(this.config.supabaseUrl, this.config.supabaseKey);
    const fingerprint = `${url}\n${this.config.supabaseKey}`;
    if (!this.client || fingerprint !== this.fingerprint) {
      await this.close();
      this.fingerprint = fingerprint;
      this.client = createClient(url, this.config.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: `mi-kapital-auth-${url}` }, realtime: { params: { eventsPerSecond: 2 } } });
    }
    const { data: { session }, error } = await this.client.auth.getSession();
    if (error) throw error;
    if (!session) throw new Error('Войдите в Supabase по email и паролю в настройках.');
    this.userId = session.user.id;
    return session.user.email ?? this.config.email;
  }
  async signIn(email: string, password: string, signUp = false) {
    await this.connectClientOnly();
    const result = signUp ? await this.client!.auth.signUp({ email, password }) : await this.client!.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (signUp && !result.data.session) return 'Аккаунт создан. Подтвердите email по письму Supabase, затем войдите.';
    await this.connect();
    return 'Вход выполнен. Синхронизация включится автоматически.';
  }
  private async connectClientOnly() {
    const url = validateCloudConfig(this.config.supabaseUrl, this.config.supabaseKey);
    if (!this.client || this.fingerprint !== `${url}\n${this.config.supabaseKey}`) { await this.close(); this.fingerprint = `${url}\n${this.config.supabaseKey}`; this.client = createClient(url, this.config.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: `mi-kapital-auth-${url}` } }); }
  }
  async signOut() { await this.client?.auth.signOut(); await this.close(); }
  async pull(): Promise<SyncEnvelope | null> {
    if (!this.client || !this.userId) await this.connect();
    const { data, error } = await this.client!.from('mi_kapital_sync').select('data,revision,device_id').eq('user_id', this.userId).maybeSingle();
    if (error) throw new Error(`Supabase: ${error.message}. Проверьте таблицу и права доступа по инструкции.`);
    if (!data) return null;
    this.revision = Number(data.revision);
    return { data: validateData(data.data), revision: this.revision, deviceId: String(data.device_id) };
  }
  async push(data: AppData): Promise<SyncEnvelope | 'saved'> {
    if (!this.client || !this.userId) await this.connect();
    const { data: result, error } = await this.client!.rpc('mi_kapital_push', { expected_revision: this.revision, next_data: data, next_device_id: this.deviceId });
    if (error) throw new Error(`Supabase: ${error.message}. Выполните SQL из настроек приложения.`);
    if (!result || typeof result !== 'object') throw new Error('Supabase не вернул результат синхронизации.');
    const row = result as { conflict?: boolean; data: unknown; revision: number; device_id: string };
    this.revision = Number(row.revision);
    if (row.conflict) return { data: validateData(row.data), revision: this.revision, deviceId: row.device_id };
    return 'saved';
  }
  async exchange(current: () => AppData, apply: (data: AppData) => void): Promise<void> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const remote = await this.pull();
      let next = current();
      if (remote && remote.deviceId !== this.deviceId) { next = validateData(mergeData(next, remote.data)); if (!sameData(current(), next)) apply(next); }
      if (remote && sameData(next, remote.data)) return;
      const result = await this.push(next);
      if (result === 'saved') return;
      const merged = validateData(mergeData(current(), result.data));
      if (!sameData(current(), merged)) apply(merged);
    }
    throw new Error('Данные меняются одновременно. Повторим синхронизацию автоматически.');
  }
  subscribe(onChange: () => void) {
    if (!this.client || !this.userId || this.channel) return;
    this.channel = this.client.channel(`mi-kapital-${this.userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'mi_kapital_sync', filter: `user_id=eq.${this.userId}` }, payload => { const row = payload.new as { device_id?: string }; if (row.device_id !== this.deviceId) onChange(); }).subscribe();
  }
  async close() { if (this.channel) await this.client?.removeChannel(this.channel); this.channel = null; this.client?.auth.stopAutoRefresh(); this.client = null; this.userId = ''; this.revision = 0; }
}
