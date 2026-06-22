'use strict';
const { BrowserWindow } = require('electron');
const path = require('path');

let chaosWin = null;

function open(parent, config, activeFailures) {
  if (chaosWin && !chaosWin.isDestroyed()) {
    chaosWin.focus();
    // Refresh config/state in already-open window
    chaosWin.webContents.send('chaos:config', { config, activeFailures });
    return;
  }

  chaosWin = new BrowserWindow({
    width: 580, height: 680,
    parent,
    modal: false,        // NOT modal — main window stays interactive
    backgroundColor: '#0d1117',
    title: 'Chaos Mode — Gêmeo Digital',
    webPreferences: {
      preload:          path.join(__dirname, 'chaos-preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
    frame:     true,
    resizable: true,
    minWidth:  440,
    minHeight: 480,
  });

  chaosWin.loadFile(path.join(__dirname, '..', 'renderer', 'chaos.html'));

  chaosWin.webContents.on('did-finish-load', () => {
    if (config) {
      chaosWin.webContents.send('chaos:config', { config, activeFailures: activeFailures || [] });
    }
  });

  chaosWin.on('closed', () => { chaosWin = null; });
}

function send(channel, data) {
  if (chaosWin && !chaosWin.isDestroyed()) {
    chaosWin.webContents.send(channel, data);
  }
}

function isOpen() {
  return !!(chaosWin && !chaosWin.isDestroyed());
}

module.exports = { open, send, isOpen };
