'use strict';
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path        = require('path');
const ipcHandlers = require('./ipc-handlers');
const chaosWindow = require('./chaos-window');

let mainWindow;
let appConfig = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Forward simulation ticks to the chaos window (for live status dots)
  ipcHandlers.setExtraTarget((payload) => {
    chaosWindow.send('chaos:tick', {
      panels:         payload.panels,
      activeFailures: payload.activeFailures,
      timestamp:      payload.timestamp,
      decisions:      payload.decisions,
    });
  });

  buildMenu();
}

function buildMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Configurações', accelerator: 'CmdOrCtrl+,',
          click: () => {
            ipcHandlers.stop();
            mainWindow.webContents.send('settings:open');
          },
        },
        { type: 'separator' },
        { label: 'Sair', role: 'quit' },
      ],
    },
    {
      label: 'Simulação',
      submenu: [
        {
          label: 'Chaos Mode', accelerator: 'CmdOrCtrl+Shift+C',
          click: () => {
            if (!appConfig) return;
            // Gather current active failures from ipc-handlers internals is not exposed,
            // so we open with empty failures; chaos window syncs via tick anyway.
            chaosWindow.open(mainWindow, appConfig, []);
          },
        },
      ],
    },
    {
      label: 'Visualizar',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.on('config:submit', (_event, config) => {
  appConfig = config;
  ipcHandlers.init(mainWindow, config);
  // If chaos window is open, send updated config
  if (chaosWindow.isOpen()) {
    chaosWindow.send('chaos:config', { config, activeFailures: [] });
  }
});

ipcMain.handle('config:get', () => appConfig);

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
