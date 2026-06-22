'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  submitConfig: (config) => ipcRenderer.send('config:submit', config),
  getConfig:    ()       => ipcRenderer.invoke('config:get'),

  onOpenSettings: (cb) => {
    ipcRenderer.removeAllListeners('settings:open');
    ipcRenderer.on('settings:open', () => cb());
  },

  onSimulationTick: (cb) => {
    ipcRenderer.removeAllListeners('simulation:tick');
    ipcRenderer.on('simulation:tick', (_e, payload) => cb(payload));
  },

  simulationControl: (action, value) =>
    ipcRenderer.send('simulation:control', { action, value }),

  getDates: () => ipcRenderer.invoke('sim:get-dates'),

  chaosApply:    (panelId, type, intensity = 100) =>
    ipcRenderer.send('chaos:apply', { panelId, type, intensity }),
  chaosClearAll: () => ipcRenderer.send('chaos:clear_all'),

  reinstatePanel: (panelId) => ipcRenderer.send('reinstate:panel', { panelId }),

  onChaosStateChanged: (cb) => {
    ipcRenderer.removeAllListeners('chaos:state-changed');
    ipcRenderer.on('chaos:state-changed', (_e, data) => cb(data));
  },
});
