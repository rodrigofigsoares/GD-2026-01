'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chaosAPI', {
  apply:     (panelId, type, intensity) =>
    ipcRenderer.send('chaos:apply', { panelId, type, intensity }),
  clearAll:  () => ipcRenderer.send('chaos:clear_all'),
  setGlobal: (overrides) => ipcRenderer.send('chaos:global', overrides),
  reinstate: (panelId) => ipcRenderer.send('reinstate:panel', { panelId }),

  onTick: (cb) => {
    ipcRenderer.removeAllListeners('chaos:tick');
    ipcRenderer.on('chaos:tick', (_e, data) => cb(data));
  },
  onConfig: (cb) => {
    ipcRenderer.removeAllListeners('chaos:config');
    ipcRenderer.on('chaos:config', (_e, data) => cb(data));
  },
});
