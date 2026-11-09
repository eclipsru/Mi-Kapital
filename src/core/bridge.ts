import type { AppData } from './model';
export type UpdateState = { phase: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'; version: string; shellVersion: string; targetVersion?: string; mode: 'files' | 'native' | 'none'; percent: number; transferred: number; total: number; files?: number; message?: string; checkedAt?: string; packaged: boolean };
export interface DesktopBridge {
  platform?: 'windows' | 'android';
  scanPairing?: () => Promise<void>;
  onRemoteData?: (callback: (data: unknown) => void) => () => void;
  syncConfig?: () => Promise<import('./sync').SyncConfig>;
  saveSyncConfig?: (config: import('./sync').SyncConfig) => Promise<void>;
  syncInfo?: () => Promise<{ addresses: string[]; port: number; token: string; enabled: boolean; error?: string }>;
  onSyncStatus?: (callback: (status: import('./sync').SyncStatus) => void) => () => void;
  info: () => Promise<UpdateState>;
  checkUpdates: () => Promise<void>;
  installUpdate: () => Promise<{ ok: boolean; message?: string }>;
  openReleases: () => Promise<void>;
  onUpdate: (callback: (state: UpdateState) => void) => () => void;
  loadData: () => Promise<unknown | null>;
  saveData: (data: AppData) => Promise<void>;
  exportBackup: (json: string) => Promise<boolean>;
  bootReady: () => void;
}
declare global { interface Window { desktop?: DesktopBridge } }
export const desktop = () => window.desktop;
