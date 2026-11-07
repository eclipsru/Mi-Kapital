'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopUpdater', {
  info: () => ipcRenderer.invoke('app:update:info'),
  check: () => ipcRenderer.invoke('app:update:check'),
  download: () => ipcRenderer.invoke('app:update:download'),
  install: () => ipcRenderer.invoke('app:update:install'),
  openRelease: () => ipcRenderer.invoke('app:update:open-release'),
  notifyBootReady: () => ipcRenderer.send('app:boot:ready'),
  onEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:update:event', listener);
    return () => ipcRenderer.removeListener('app:update:event', listener);
  },
});
