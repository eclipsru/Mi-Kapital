'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', Object.freeze({
  platform: 'windows',
  syncConfig: () => ipcRenderer.invoke('sync:config'),
  saveSyncConfig: config => ipcRenderer.invoke('sync:save-config', config),
  syncInfo: () => ipcRenderer.invoke('sync:info'),
  onRemoteData: callback => { const listener = (_event, data) => callback(data); ipcRenderer.on('data:changed', listener); return () => ipcRenderer.removeListener('data:changed', listener); },
  info: () => ipcRenderer.invoke('info'),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  openReleases: () => ipcRenderer.invoke('updates:releases'),
  onUpdate: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('updates:state', listener); return () => ipcRenderer.removeListener('updates:state', listener); },
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: data => ipcRenderer.invoke('data:save', data),
  exportBackup: json => ipcRenderer.invoke('data:export', json),
  bootReady: () => ipcRenderer.send('boot:ready'),
}));
