const { app, BrowserWindow, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.PORT || 4100);
const PORTAL_DIR = path.join(__dirname, '..', '..');
const ADMIN_URL = `http://127.0.0.1:${PORT}/admin`;

let mainWindow;
let serverProcess;
let startedServer = false;

function waitForServer(maxMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        if (res.statusCode === 200) resolve();
        else retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > maxMs) reject(new Error('تعذّر تشغيل السيرفر'));
      else setTimeout(tick, 400);
    };
    tick();
  });
}

function startBackend() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
      if (res.statusCode === 200) {
        startedServer = false;
        resolve();
      } else {
        spawnServer().then(resolve).catch(reject);
      }
    }).on('error', () => {
      spawnServer().then(resolve).catch(reject);
    });
  });
}

function spawnServer() {
  return new Promise((resolve, reject) => {
    const serverScript = path.join(PORTAL_DIR, 'server.js');
    serverProcess = spawn(process.execPath, [serverScript], {
      cwd: PORTAL_DIR,
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'ignore',
      windowsHide: true
    });
    startedServer = true;
    serverProcess.on('error', reject);
    waitForServer().then(resolve).catch(reject);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: 'Edari Admin — لوحة التحكم',
    backgroundColor: '#0f1419',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL(ADMIN_URL);

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'ملف',
      submenu: [
        { label: 'تحديث', accelerator: 'F5', click: () => mainWindow?.reload() },
        { type: 'separator' },
        { role: 'quit', label: 'خروج' }
      ]
    },
    { label: 'عرض', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] }
  ]));
}

app.whenReady().then(async () => {
  try {
    await startBackend();
    createWindow();
  } catch (err) {
    console.error(err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (startedServer && serverProcess) {
    serverProcess.kill();
  }
});
