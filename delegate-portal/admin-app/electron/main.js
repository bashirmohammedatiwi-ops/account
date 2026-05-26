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

function pushSyncProgress(text) {
  const line = String(text || '').trim();
  if (!line || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('sync-progress', line);
}

function parseSyncResult(stdout) {
  const match = stdout.match(/(\d+) حساب، (\d+) حركة(?:، (\d+) فاتورة(?:، (\d+) بند)?)?/);
  return {
    ok: true,
    accounts: match ? Number(match[1]) : 0,
    journal: match ? Number(match[2]) : 0,
    invoices: match && match[3] ? Number(match[3]) : 0,
    invoiceLines: match && match[4] ? Number(match[4]) : 0
  };
}

function runLocalSyncScript(serverUrl, syncKey, treeSeqs = []) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(treeSeqs) || !treeSeqs.length) {
      return reject(new Error('حدد شجرة واحدة على الأقل للرفع'));
    }

    const portalDir = getPortalDir();
    const script = path.join(portalDir, 'sync-client', 'sync.js');
    const nodeBin = getNodeBin();
    let stdout = '';

    const child = spawn(nodeBin, [
      script,
      '--server', serverUrl,
      '--key', syncKey,
      '--trees', treeSeqs.join(',')
    ], {
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

    child.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      text.split(/\r?\n/).forEach((line) => {
        const trimmed = line.replace(/^\r+/, '').trim();
        if (trimmed) pushSyncProgress(trimmed);
      });
    });
    child.stderr.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      text.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) pushSyncProgress(trimmed);
      });
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stdout.trim() || `Sync exit ${code}`));
      resolve(parseSyncResult(stdout));
    });
  });
}

function getAppIcon() {
  if (app.isPackaged) {
    const packaged = path.join(process.resourcesPath, 'icon.png');
    if (fs.existsSync(packaged)) return packaged;
  }
  const devIco = path.join(__dirname, '..', 'icons', 'app-icon.ico');
  const devPng = path.join(__dirname, '..', 'icons', 'app-icon-256.png');
  const devSrc = path.join(__dirname, '..', 'icons', 'app-icon.png');
  if (fs.existsSync(devIco)) return devIco;
  if (fs.existsSync(devPng)) return devPng;
  if (fs.existsSync(devSrc)) return devSrc;
  return undefined;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: 'Edari Admin — لوحة التحكم',
    icon: getAppIcon(),
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
          click: () => {
            mainWindow?.webContents.executeJavaScript(`
              document.querySelector('.nav-item[data-page="sync"]')?.click();
              alert('حدّد الشجرات من صفحة رفع البيانات ثم اضغط «تحديث ورفع البيانات»');
            `);
          }
        }
      ]
    },
    { label: 'عرض', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] }
  ]));
}

function runListEdariTreesScript() {
  return new Promise((resolve, reject) => {
    const portalDir = getPortalDir();
    const script = path.join(portalDir, 'sync-client', 'sync.js');
    const nodeBin = getNodeBin();
    let stdout = '';

    const child = spawn(nodeBin, [script, '--list-trees'], {
      cwd: portalDir,
      env: {
        ...process.env,
        EDARI_READER_ROOT: getEdariReaderRoot(),
        NODE_BIN: nodeBin
      },
      windowsHide: true
    });

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stdout += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stdout.trim() || `List trees exit ${code}`));
      const line = stdout.split(/\r?\n/).reverse().find((row) => row.startsWith('@TREES|'));
      if (!line) return reject(new Error('تعذّر قراءة الشجرات من EdariNX'));
      try {
        resolve(JSON.parse(line.slice('@TREES|'.length)));
      } catch (err) {
        reject(err);
      }
    });
  });
}

ipcMain.handle('run-local-sync', (_e, { serverUrl, syncKey, treeSeqs }) => {
  return runLocalSyncScript(serverUrl, syncKey, treeSeqs);
});

ipcMain.handle('list-edari-trees', () => {
  return runListEdariTreesScript();
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
