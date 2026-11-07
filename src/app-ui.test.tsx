// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { DesktopUpdateEvent } from './vite-env';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('App UI & in-app differential updater integration', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    delete window.desktopUpdater;
  });

  it('renders the 3-column dark workspace, opens modals, and applies live differential updates', async () => {
    let listener: ((event: DesktopUpdateEvent) => void) | null = null;
    const check = vi.fn(async () => ({ ok: true, available: false, version: '1.0.12' }));
    const install = vi.fn(async () => ({ ok: true, mode: 'bundle', version: '1.0.15' }));

    window.desktopUpdater = {
      info: vi.fn(async () => ({
        supported: true,
        isPackaged: true,
        version: '1.0.12',
        shellVersion: '1.0.12',
        deliveryMode: 'builtin' as const,
      })),
      check,
      download: vi.fn(async () => ({ ok: true })),
      install,
      openRelease: vi.fn(async () => ({ ok: true })),
      notifyBootReady: vi.fn(),
      onEvent: (cb) => {
        listener = cb;
        return () => {
          listener = null;
        };
      },
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<App />);
    });
    // Flush bridge.info() microtask
    await act(async () => {
      await Promise.resolve();
    });

    // Verify 3-column screenshot structure
    expect(container.querySelector('header.head')).not.toBeNull();
    expect(container.querySelector('.st-layout')).not.toBeNull();
    expect(container.querySelector('.st-scol.st-ocol')).not.toBeNull();
    expect(container.querySelector('.st-main')).not.toBeNull();
    expect(container.querySelector('.st-scol.st-ccol')).not.toBeNull();
    expect(container.querySelectorAll('.st-pcard .st-pst').length).toBe(5);
    expect(container.querySelectorAll('.kpis:not(.kpis-3) .kpi').length).toBe(4);
    expect(container.querySelectorAll('.kpis.kpis-3 .kpi').length).toBe(3);
    expect(container.textContent).toContain('v1.0.12');

    // Trigger manual update check from header button
    const headerButtons = Array.from(container.querySelectorAll('.hlinks .hlink')) as HTMLButtonElement[];
    const updateBtn = headerButtons.find((b) => b.textContent?.includes('Обновить'));
    expect(updateBtn).toBeDefined();
    await act(async () => {
      updateBtn!.click();
    });
    expect(check).toHaveBeenCalledTimes(1);

    // Simulate differential bundle downloaded (151 KB) -> ready banner appears
    expect(listener).not.toBeNull();
    await act(async () => {
      listener!({
        type: 'downloaded',
        version: '1.0.15',
        mode: 'bundle',
        totalBytes: 154704,
      });
    });

    const banner = container.querySelector('.upd-banner.ready');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain('v1.0.15');
    expect(banner!.textContent).toContain('Размер пакета изменений');

    const applyBtn = Array.from(banner!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Обновить сейчас'),
    );
    expect(applyBtn).toBeDefined();
    await act(async () => {
      applyBtn!.click();
    });
    expect(install).toHaveBeenCalledTimes(1);

    // Open new entry modal from right column "+ Запись" and verify modal opens
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('+ Запись'),
    );
    expect(addBtn).toBeDefined();
    await act(async () => {
      addBtn!.click();
    });
    expect(container.querySelector('.modal-backdrop .modal-card')).not.toBeNull();

    // Open Cabinet / System modal from header "Кабинет"
    const cabinetBtn = headerButtons.find((b) => b.textContent?.includes('Кабинет'));
    expect(cabinetBtn).toBeDefined();
    await act(async () => {
      cabinetBtn!.click();
    });
    expect(container.textContent).toContain('Кабинет и система');
    expect(container.textContent).toContain('загружаются только изменённые файлы');

    await act(async () => {
      root.unmount();
    });
  });
});
