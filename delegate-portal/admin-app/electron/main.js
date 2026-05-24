const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = Number(process.env.PORT || 4100);
const BACKEND_URL = (process.env.BACKEND_URL || 'http://187.124.23.65:5005').replace(/\/$/, '');
const USE_REMOTE = process.env.USE_LOCAL_SERVER !== '1';
const ADMIN_URL = USE_REMOTE ? `${BACKEND_URL}/admin` : `http://127.0.0.1:${PORT}/admin`;

let mainWindow;
let serverProcess;
let startedServer = false;

function getPortalDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'portal');
  }
  return path.join(__dirname, '..', '..');
}

function getEdariReaderRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'edari-reader');
  }
  return path.join(__dirname, '..', '..', '..', 'edari-reader');
}

function getNodeBin() {
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'node', 'node.exe');
    if (fs.existsSync(bundled)) return bundled;
  }
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

function serverEnv() {
  const portalDir = getPortalDir();
  return {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    DATABASE_PATH: path.join(portalDir, 'data', 'portal.db'),
    EDARI_READER_ROOT: getEdariReaderRoot(),
    NODE_BIN: getNodeBin()
  };
}

function checkHealth(url, maxMs = 45000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      http.get(`${url}/api/health`, (res) => {
        if (res.statusCode === 200) resolve();
        else retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > maxMs) reject(new Error('تعذّر الاتصال بالسيرفر'));
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
    const portalDir = getPortalDir();
    const serverScript = path.join(portalDir, 'server.js');
    serverProcess = spawn(getNodeBin(), [serverScript], {
      cwd: portalDir,
      env: serverEnv(),
      stdio: 'ignore',
      windowsHide: true
    });
    startedServer = true;
    serverProcess.on('error', reject);
    checkHealth(`http://127.0.0.1:${PORT}`).then(resolve).catch(reject);
  });
}

function runLocalSyncScript(serverUrl, syncKey) {
  return new Promise((resolve, reject) => {
    const portalDir = getPortalDir();
    const script = path.join(portalDir, 'sync-client', 'sync.js');
    const nodeBin = getNodeBin();
    let stdout = '';

    const child = spawn(nodeBin, [script, '--server', serverUrl, '--key', syncKey], {
      cwd: portalDir,
      env: {
        ...process.env,
        SYNC_SERVER: serverUrl,
        SYNC_API_KEY: syncKey,
        EDARI_READER_ROOT: getEdariReaderRoot(),
        NODE_BIN: nodeBin
      },
      windowsHide: true
    });

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stdout += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stdout || `Sync exit ${code}`));
      const match = stdout.match(/(\d+) حساب، (\d+) حركة/);
      resolve({
        ok: true,
        accounts: match ? Number(match[1]) : 0,
        journal: match ? Number(match[2]) : 0
      });
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: 'Edari Admin — لوحة التحكم',
    backgroundColor: '#f0f4f8',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
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
    {
      label: 'مزامنة',
      submenu: [
        {
          label: 'رفع من EdariNX إلى السيرفر',
          click: async () => {
            try {
              await runLocalSyncScript(BACKEND_URL, process.env.SYNC_API_KEY || 'edari-sync-local-key-2025');
              mainWindow?.reload();
            } catch (e) {
              console.error(e);
            }
          }
        }
      ]
    },
    { label: 'عرض', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] }
  ]));
}

ipcMain.handle('run-local-sync', (_e, { serverUrl, syncKey }) => {
  return runLocalSyncScript(serverUrl, syncKey);
});

app.whenReady().then(async () => {
  try {
    if (USE_REMOTE) {
      await checkHealth(BACKEND_URL);
    } else {
      await startBackend();
    }
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
