const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path        = require('path');
const ipcHandlers = require('./ipc-handlers');

let mainWindow;
let appConfig = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:    1400,
    height:   900,
    minWidth: 1100,
    minHeight:700,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  buildMenu();
}

function buildMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        {
          label:       'Configurações',
          accelerator: 'CmdOrCtrl+,',
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
          label:       'Chaos Mode',
          accelerator: 'CmdOrCtrl+Shift+C',
          type:        'checkbox',
          checked:     false,
          click: (mi) => mainWindow.webContents.send('chaos:toggle', mi.checked),
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
});

ipcMain.handle('config:get', () => appConfig);

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
