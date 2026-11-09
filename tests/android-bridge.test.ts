// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installAndroidBridge } from '../src/core/android-bridge';
import { desktop } from '../src/core/bridge';
import { emptyData } from '../src/core/model';

afterEach(() => { delete (window as any).desktop; delete (window as any).MiKapitalNative; });
function native(overrides: Record<string, unknown> = {}) {
  return {
    platform: () => 'android', loadData: () => 'null', saveData: () => '{"ok":true}',
    syncConfig: () => '{}', saveSyncConfig: () => '{"ok":true}', syncInfo: () => 'null',
    info: () => '{"version":"2.0.37","phase":"idle"}', checkUpdates: () => {}, installUpdate: () => '{"ok":true}',
    openReleases: () => {}, exportBackup: () => {}, bootReady: () => {}, scanPairing: () => {}, ...overrides,
  };
}
describe('Android native bridge', () => {
  it('surfaces native save and sync-config failures instead of reporting success', async () => {
    (window as any).MiKapitalNative = native({ saveData: () => '{"ok":false,"message":"Диск заполнен"}', saveSyncConfig: () => '{"ok":false,"message":"Нет доступа к настройкам"}' });
    installAndroidBridge();
    await expect(desktop()!.saveData(emptyData())).rejects.toThrow('Диск заполнен');
    await expect(desktop()!.saveSyncConfig!({} as any)).rejects.toThrow('Нет доступа к настройкам');
  });
  it('replays a pairing result and reports the current route for native reloads', async () => {
    const routeChanged = vi.fn();
    (window as any).MiKapitalNative = native({ consumePairing: () => '{"lanUrl":"http://192.168.1.10:47653","lanToken":"a"}', routeChanged });
    installAndroidBridge();
    expect(await desktop()!.consumePairing!()).toEqual({ lanUrl: 'http://192.168.1.10:47653', lanToken: 'a' });
    desktop()!.routeChanged!('debts'); expect(routeChanged).toHaveBeenCalledWith('debts');
  });
});
