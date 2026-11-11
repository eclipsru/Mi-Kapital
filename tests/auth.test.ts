// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LoginScreen } from '../src/components/LoginScreen';
import { defaultSyncConfig } from '../src/core/sync';
import type { SyncController } from '../src/core/useSync';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => { if (root) act(() => root!.unmount()); container?.remove(); root = undefined; container = undefined; });
function change(label: string, value: string) {
  const field = [...container!.querySelectorAll('label')].find(l => l.querySelector('.field-label')?.textContent === label);
  const input = field?.querySelector('input') as HTMLInputElement | null;
  if (!input) throw new Error(`Missing field ${label}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
}
async function mount(sync: SyncController) {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(createElement(LoginScreen, { sync })); });
}
function fakeSync() {
  const config = { ...defaultSyncConfig(), supabaseUrl: 'https://sample.supabase.co', supabaseKey: 'sb_publishable_test', email: 'old@example.com' };
  const saved: unknown[] = [];
  const signIn = vi.fn(async () => 'Вход выполнен. Синхронизация включится автоматически.');
  const sync = {
    config, configReady: true, authState: 'signed-out', status: { transport: 'offline', state: 'idle', message: '', pending: false }, pcInfo: null,
    saveConfig: vi.fn(async (next: typeof config) => { saved.push(next); }), signIn, signOut: vi.fn(async () => {}), syncNow: vi.fn(async () => {}),
  } as unknown as SyncController;
  return { sync, saved, signIn };
}
describe('account login screen', () => {
  it('saves only cloud configuration and email before signing in; the password is never saved', async () => {
    const { sync, saved, signIn } = fakeSync(); await mount(sync);
    await act(async () => { change('Логин · email', 'user@example.com'); change('Пароль', 'correct horse battery'); });
    await act(async () => { (container!.querySelector('.login-submit') as HTMLButtonElement).click(); await Promise.resolve(); });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ supabaseUrl: 'https://sample.supabase.co', supabaseKey: 'sb_publishable_test', email: 'user@example.com', cloudEnabled: false });
    expect(JSON.stringify(saved[0])).not.toContain('correct horse battery');
    expect(signIn).toHaveBeenCalledWith('user@example.com', 'correct horse battery', false);
    expect(container!.textContent).toContain('Вход выполнен.');
  });
  it('requires matching passwords before creating an account', async () => {
    const { sync, saved, signIn } = fakeSync(); await mount(sync);
    await act(async () => { (container!.querySelector('.login-mode') as HTMLButtonElement).click(); });
    await act(async () => { change('Логин · email', 'new@example.com'); change('Пароль', 'password123'); change('Повторите пароль', 'different123'); });
    await act(async () => { (container!.querySelector('.login-submit') as HTMLButtonElement).click(); await Promise.resolve(); });
    expect(container!.textContent).toContain('Пароли не совпадают');
    expect(saved).toHaveLength(0); expect(signIn).not.toHaveBeenCalled();
  });
});
