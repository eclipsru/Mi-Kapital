/// <reference types="vite/client" />

export type DesktopUpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version?: string; mode?: 'bundle' | 'installer' | 'manual'; totalBytes?: number }
  | { type: 'none'; version?: string }
  | { type: 'progress'; percent: number; transferred: number; total: number; mode?: 'bundle' | 'installer' }
  | { type: 'downloaded'; version?: string; mode?: 'bundle' | 'installer'; totalBytes?: number }
  | { type: 'applied'; version?: string }
  | { type: 'error'; message: string };

export interface DesktopUpdaterInfo {
  supported: boolean;
  isPackaged?: boolean;
  version: string;
  shellVersion?: string;
  deliveryMode?: 'builtin' | 'live-bundle';
}

export interface DesktopUpdaterBridge {
  info: () => Promise<DesktopUpdaterInfo>;
  check: () => Promise<{ ok: boolean; available?: boolean; version?: string; mode?: string; reason?: string }>;
  download: () => Promise<{ ok: boolean; reason?: string }>;
  install: () => Promise<{ ok: boolean; mode?: string; version?: string; reason?: string }>;
  openRelease: () => Promise<{ ok: boolean }>;
  notifyBootReady?: () => void;
  onEvent: (callback: (event: DesktopUpdateEvent) => void) => () => void;
}

declare global {
  interface Window {
    desktopUpdater?: DesktopUpdaterBridge;
  }
}
