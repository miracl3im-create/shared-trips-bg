import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import url from 'url';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serverProcess = null;

function startServer() {
  const nodePath = process.execPath; // in packaged app, electron's node
  // In dev, use system node if needed; but for simplicity, use electron's embedded
  const serverEntry = path.join(__dirname, 'server', 'index.js');
  const env = { ...process.env, PORT: process.env.PORT || '4777' };
  serverProcess = spawn(nodePath, [serverEntry], { env, stdio: 'inherit' });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    // Serve built files
    win.loadURL(url.format({
      pathname: path.join(__dirname, 'renderer', 'dist', 'index.html'),
      protocol: 'file:',
      slashes: true
    }));
  }
}

app.whenReady().then(() => {
  startServer();
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
