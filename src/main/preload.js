const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  submitConfig: (config) => ipcRenderer.send('config:submit', config),
  getConfig:    ()       => ipcRenderer.invoke('config:get'),

  // Menu → renderer
  onOpenSettings: (cb) => {
    ipcRenderer.removeAllListeners('settings:open');
    ipcRenderer.on('settings:open', () => cb());
  },
  onChaosToggle: (cb) => {
    ipcRenderer.removeAllListeners('chaos:toggle');
    ipcRenderer.on('chaos:toggle', (_e, enabled) => cb(enabled));
  },

  // Simulation data → renderer
  onSimulationTick: (cb) => {
    ipcRenderer.removeAllListeners('simulation:tick');
    ipcRenderer.on('simulation:tick', (_e, payload) => cb(payload));
  },

  // Simulation controls → main
  simulationControl: (action, value) =>
    ipcRenderer.send('simulation:control', { action, value }),

  // Chaos Mode → main
  chaosApply:    (panelId, failure) =>
    ipcRenderer.send('chaos:apply', { panelId, failure }),
  chaosClearAll: () => ipcRenderer.send('chaos:clear_all'),
});
