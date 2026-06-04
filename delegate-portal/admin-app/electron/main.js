const { app, BrowserWindow, Menu, ipcMain, Tray, nativeImage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { createBackgroundSync } = require('./background-sync');

const PORT = Number(process.env.PORT || 4100);
const BACKEND_URL = (process.env.BACKEND_URL || 'http://187.124.23.65:5005').replace(/\/$/, '');
const USE_REMOTE = process.env.USE_LOCAL_SERVER !== '1';
const ADMIN_URL = USE_REMOTE ? `${BACKEND_URL}/admin` : `http://127.0.0.1:${PORT}/admin`;
const START_HIDDEN = process.argv.includes('--background') || process.argv.includes('--hidden');

let mainWindow;
let tray;
let serverProcess;
let startedServer = false;
let appIsQuitting = false;
let backgroundSync;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });
}

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

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'background-sync.json');
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

function pushAutoSyncState(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('auto-sync-state', state);
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

let activeSyncPromise = null;

function runLocalSyncScript(serverUrl, syncKey, treeSeqs = []) {
  if (activeSyncPromise) return activeSyncPromise;

  activeSyncPromise = new Promise((resolve, reject) => {
    if (!Array.isArray(treeSeqs) || !treeSeqs.length) {
      activeSyncPromise = null;
      return reject(new Error('حدد شجرة واحدة على الأقل للرفع'));
    }

    const portalDir = getPortalDir();
    const script = path.join(portalDir, 'sync-client', 'sync.js');
    const nodeBin = getNodeBin();
    let stdout = '';

    const syncTarget = (serverUrl || BACKEND_URL).replace(/\/$/, '');

    const child = spawn(nodeBin, [
      script,
      '--server', syncTarget,
      '--key', syncKey,
      '--trees', treeSeqs.join(',')
    ], {
      cwd: portalDir,
      env: {
        ...process.env,
        SYNC_SERVER: syncTarget,
        SYNC_API_KEY: syncKey,
        EDARI_READER_ROOT: getEdariReaderRoot(),
        NODE_BIN: nodeBin,
        EDARI_BACKEND_URL: BACKEND_URL,
        EDARI_USE_REMOTE: USE_REMOTE ? '1' : '0'
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
  }).finally(() => {
    activeSyncPromise = null;
  });

  return activeSyncPromise;
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

function formatTrayCountdown(secondsLeft, syncing) {
  if (syncing) return 'جاري المزامنة...';
  const sec = Math.max(0, Math.floor(secondsLeft));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateTrayMenu() {
  if (!tray || !backgroundSync) return;
  const st = backgroundSync.getState();
  const countdown = formatTrayCountdown(st.secondsLeft, st.syncing);

  tray.setToolTip(`Edari Admin — مزامنة تلقائية ${countdown}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'فتح لوحة التحكم', click: () => showMainWindow() },
    {
      label: st.syncing ? 'جاري المزامنة...' : 'رفع الآن',
      enabled: !st.syncing,
      click: () => { void backgroundSync.runNow(); }
    },
    { type: 'separator' },
    {
      label: 'مزامنة تلقائية كل 30 دقيقة',
      type: 'checkbox',
      checked: st.enabled,
      click: (item) => backgroundSync.setAutoSyncEnabled(item.checked)
    },
    {
      label: 'تشغيل مع Windows',
      type: 'checkbox',
      checked: st.startAtLogin,
      click: (item) => backgroundSync.setStartAtLogin(item.checked)
    },
    { type: 'separator' },
    {
      label: 'إنهاء التطبيق',
      click: () => {
        appIsQuitting = true;
        app.quit();
      }
    }
  ]));
}

function createTray() {
  const iconPath = getAppIcon();
  if (!iconPath) return;

  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('Edari Admin — يعمل في الخلفية');
  tray.on('double-click', () => showMainWindow());
  updateTrayMenu();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow({ show: true });
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow({ show = !START_HIDDEN } = {}) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'Edari Admin — لوحة التحكم',
    icon: getAppIcon(),
    backgroundColor: '#f0f4f8',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [
        `--edari-backend=${BACKEND_URL}`,
        `--edari-remote=${USE_REMOTE ? '1' : '0'}`
      ]
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (show) mainWindow.show();
    pushAutoSyncState(backgroundSync?.getState() || {});
  });

  mainWindow.loadURL(ADMIN_URL);

  mainWindow.on('close', (e) => {
    if (!appIsQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'ملف',
      submenu: [
        { label: 'إظهار النافذة', click: () => showMainWindow() },
        { label: 'تحديث', accelerator: 'F5', click: () => mainWindow?.reload() },
        { type: 'separator' },
        {
          label: 'إنهاء',
          click: () => {
            appIsQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: 'مزامنة',
      submenu: [
        {
          label: 'رفع الآن',
          click: () => { void backgroundSync?.runNow(); }
        },
        {
          label: 'صفحة رفع البيانات',
          click: () => {
            showMainWindow();
            mainWindow?.webContents.executeJavaScript(`
              document.querySelector('.nav-item[data-page="sync"]')?.click();
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

function initBackgroundSync() {
  backgroundSync = createBackgroundSync({
    app,
    getSettingsPath,
    defaultServerUrl: BACKEND_URL,
    runSync: runLocalSyncScript,
    onStateChange: (state) => {
      pushAutoSyncState(state);
      updateTrayMenu();
    },
    onNotify: (msg) => {
      if (tray && !mainWindow?.isVisible()) {
        tray.displayBalloon?.({
          title: 'Edari Admin',
          content: String(msg || ''),
          iconType: 'info'
        });
      }
    }
  });
  backgroundSync.init();
}

ipcMain.handle('run-local-sync', (_e, { serverUrl, syncKey, treeSeqs }) => {
  return runLocalSyncScript(serverUrl, syncKey, treeSeqs);
});

ipcMain.handle('list-edari-trees', () => {
  return runListEdariTreesScript();
});

ipcMain.handle('get-auto-sync-state', () => backgroundSync?.getState() || {});

ipcMain.handle('save-background-sync-settings', (_e, patch) => {
  backgroundSync?.saveSettings(patch || {});
  return backgroundSync?.getState() || {};
});

ipcMain.handle('set-auto-sync-enabled', (_e, enabled) => {
  backgroundSync?.setAutoSyncEnabled(Boolean(enabled));
  return backgroundSync?.getState() || {};
});

ipcMain.handle('set-start-at-login', (_e, enabled) => {
  backgroundSync?.setStartAtLogin(Boolean(enabled));
  return backgroundSync?.getState() || {};
});

ipcMain.handle('run-background-sync-now', () => backgroundSync?.runNow());

app.whenReady().then(async () => {
  try {
    if (USE_REMOTE) {
      await checkHealth(BACKEND_URL);
    } else {
      await startBackend();
    }
    initBackgroundSync();
    createTray();
    createWindow({ show: !START_HIDDEN });

    if (START_HIDDEN) {
      setTimeout(() => {
        void backgroundSync?.runNow();
      }, 15000);
    }
  } catch (err) {
    console.error(err);
    if (!START_HIDDEN) app.quit();
  }
});

app.on('window-all-closed', () => {
  /* يبقى التطبيق يعمل في الخلفية (أيقونة بجانب الساعة) */
});

app.on('activate', () => {
  showMainWindow();
});

app.on('before-quit', () => {
  appIsQuitting = true;
  backgroundSync?.shutdown();
  if (startedServer && serverProcess) {
    serverProcess.kill();
  }
});
