import type { DesktopBridge, UpdateState } from './bridge';
import type { AppData } from './model';
import type { SyncConfig } from './sync';
export interface AndroidNative {
  platform(): string; loadData(): string; saveData(json: string): string;
  syncConfig(): string; saveSyncConfig(json: string): string; syncInfo(): string;
  consumePairing?(): string; routeChanged?(route: string): void;
  info(): string; checkUpdates(): void; installUpdate(): string; openReleases(): void;
  exportBackup(json: string): void; bootReady(): void; scanPairing(): void;
}
declare global { interface Window { MiKapitalNative?: AndroidNative } }
export function installAndroidBridge() {
  const native = window.MiKapitalNative;
  if (!native || window.desktop) return;
  const bridge: DesktopBridge = {
    platform: 'android',
    info: async () => JSON.parse(native.info()) as UpdateState,
    checkUpdates: async () => native.checkUpdates(),
    installUpdate: async () => JSON.parse(native.installUpdate()),
    openReleases: async () => native.openReleases(),
    onUpdate: callback => { const listener = (event: Event) => callback((event as CustomEvent<UpdateState>).detail); window.addEventListener('mi-kapital-update', listener); return () => window.removeEventListener('mi-kapital-update', listener); },
    loadData: async () => JSON.parse(native.loadData()) as AppData | null,
    saveData: async data => { const result = JSON.parse(native.saveData(JSON.stringify(data))) as { ok: boolean; message?: string }; if (!result.ok) throw new Error(result.message || 'Не удалось сохранить данные на телефоне.'); },
    exportBackup: json => new Promise<boolean>(resolve => { const listener = (event: Event) => { window.removeEventListener('mi-kapital-backup', listener); clearTimeout(timer); resolve((event as CustomEvent<boolean>).detail); }; const timer = setTimeout(() => { window.removeEventListener('mi-kapital-backup', listener); resolve(false); }, 120000); window.addEventListener('mi-kapital-backup', listener); native.exportBackup(json); }),
    bootReady: () => native.bootReady(),
    syncConfig: async () => JSON.parse(native.syncConfig()) as SyncConfig,
    saveSyncConfig: async config => { const result = JSON.parse(native.saveSyncConfig(JSON.stringify(config))) as { ok: boolean; message?: string }; if (!result.ok) throw new Error(result.message || 'Не удалось сохранить настройки синхронизации.'); },
    syncInfo: async () => JSON.parse(native.syncInfo()),
    consumePairing: async () => native.consumePairing ? JSON.parse(native.consumePairing()) : null,
    routeChanged: route => native.routeChanged?.(route),
    scanPairing: async () => native.scanPairing(),
    onRemoteData: callback => { const listener = (event: Event) => callback((event as CustomEvent).detail); window.addEventListener('mi-kapital-remote', listener); return () => window.removeEventListener('mi-kapital-remote', listener); },
  };
  window.desktop = Object.freeze(bridge);
}
