const { app, BrowserWindow, Menu, ipcMain, Tray, nativeImage, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { createBackgroundSync } = require('./background-sync');
const { startStaticAdmin } = require('./static-admin');

const PORT = Number(process.env.PORT || 4100);
const BACKEND_URL = (process.env.BACKEND_URL || 'http://187.124.23.65:5005').replace(/\/$/, '');
const USE_LOCAL_SERVER = process.env.USE_LOCAL_SERVER === '1';
/** Packaged: bundled admin HTML (new UI) + remote API. USE_REMOTE=1 forces old remote UI. */
const USE_BUNDLED_UI = app.isPackaged && process.env.USE_REMOTE !== '1' && !USE_LOCAL_SERVER;
const USE_REMOTE_UI = !USE_LOCAL_SERVER && !USE_BUNDLED_UI;
const BUNDLED_ADMIN_PORT = PORT;

function getAdminLoadTarget() {
  if (USE_LOCAL_SERVER) {
    return { type: 'url', url: `http://127.0.0.1:${PORT}/admin` };
  }
  if (USE_BUNDLED_UI) {
    return { type: 'url', url: `http://127.0.0.1:${BUNDLED_ADMIN_PORT}/admin/` };
  }
  return { type: 'url', url: `${BACKEND_URL}/admin` };
}
const START_HIDDEN = process.argv.includes('--background') || process.argv.includes('--hidden');

let mainWindow;
let tray;
let serverProcess;
let staticAdminServer;
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

function loadEdariConnectionModule() {
  return require(path.join(getPortalDir(), 'sync-client', 'edari-connection'));
}

function getEdariSettings() {
  const { DEFAULT_EDARI } = loadEdariConnectionModule();
  const saved = backgroundSync?.getSettings?.() || {};
  return { ...DEFAULT_EDARI, ...(saved.edari || {}) };
}

function edariEnvExtra(settings = null) {
  const { connectionToEnv } = loadEdariConnectionModule();
  return connectionToEnv(settings || getEdariSettings());
}

function getDatabasePath() {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'portal.db');
  }
  return path.join(getPortalDir(), 'data', 'portal.db');
}

function portalChildEnv(extra = {}) {
  return {
    ...process.env,
    EDARI_READER_ROOT: getEdariReaderRoot(),
    NODE_BIN: getNodeBin(),
    DATABASE_PATH: getDatabasePath(),
    ...edariEnvExtra(),
    ...extra
  };
}

function serverEnv() {
  const portalDir = getPortalDir();
  return {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    DATABASE_PATH: getDatabasePath(),
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
  const localPort = USE_BUNDLED_UI ? BUNDLED_ADMIN_PORT : PORT;
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${localPort}/api/health`, (res) => {
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
    if (USE_BUNDLED_UI) {
      startStaticAdmin(portalDir, BUNDLED_ADMIN_PORT)
        .then((server) => {
          staticAdminServer = server;
          startedServer = true;
          return checkHealth(`http://127.0.0.1:${BUNDLED_ADMIN_PORT}`);
        })
        .then(resolve)
        .catch(reject);
      return;
    }

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

function httpRequestJson(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    let urlObj;
    try {
      urlObj = new URL(targetUrl);
    } catch (err) {
      reject(new Error('عنوان السيرفر غير صالح'));
      return;
    }

    const lib = urlObj.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: `${urlObj.pathname}${urlObj.search}`,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 20000
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let data = {};
        try {
          data = body ? JSON.parse(body) : {};
        } catch {
          data = {};
        }
        resolve({ status: res.statusCode || 0, data });
      });
    });

    req.on('error', (err) => reject(new Error(err.message || 'تعذّر الاتصال بالسيرفر')));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('انتهت مهلة الاتصال بسيرفر الرفع'));
    });
    req.end();
  });
}

function pushSyncProgress(text) {
  const line = String(text || '').trim();
  if (!line || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('sync-progress', line);
}

function pushSyncActivity(payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('sync-activity', payload);
}

function pushAutoSyncState(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('auto-sync-state', state);
}

function parseSyncResult(stdout) {
  const jsonLine = stdout.split(/\r?\n/).reverse().find((line) => line.startsWith('@SYNC_RESULT|'));
  if (jsonLine) {
    try {
      return JSON.parse(jsonLine.slice('@SYNC_RESULT|'.length));
    } catch { /* fall through */ }
  }
  const match = stdout.match(/(\d+) حساب، (\d+) حركة(?:، (\d+) فاتورة(?:، (\d+) بند)?)?(?:، (\d+) مادة Edari)?(?:، (\d+) منتج كتalog)?/);
  return {
    ok: true,
    accounts: match ? Number(match[1]) : 0,
    journal: match ? Number(match[2]) : 0,
    invoices: match && match[3] ? Number(match[3]) : 0,
    invoiceLines: match && match[4] ? Number(match[4]) : 0,
    products: match && match[5] ? Number(match[5]) : 0,
    catalogUpdated: match && match[6] ? Number(match[6]) : 0
  };
}

let activeSyncPromise = null;

function runLocalSyncScript(serverUrl, syncKey, treeSeqs = [], options = {}) {
  if (activeSyncPromise) return activeSyncPromise;

  const source = options.source === 'auto' ? 'auto' : 'manual';

  activeSyncPromise = new Promise((resolve, reject) => {
    if (!Array.isArray(treeSeqs) || !treeSeqs.length) {
      activeSyncPromise = null;
      return reject(new Error('حدد شجرة واحدة على الأقل للرفع'));
    }

    pushSyncActivity({
      phase: 'start',
      source,
      message: source === 'auto' ? 'بدء رفع تلقائي...' : 'بدء الرفع...'
    });

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
      env: portalChildEnv({
        SYNC_SERVER: syncTarget,
        SYNC_API_KEY: syncKey,
        SYNC_SOURCE: source,
        EDARI_BACKEND_URL: BACKEND_URL,
        EDARI_USE_REMOTE: USE_REMOTE_UI ? '1' : '0'
      }),
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
    child.on('error', (err) => {
      pushSyncActivity({ phase: 'error', source, message: err.message });
      reject(err);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        const message = stdout.trim() || `Sync exit ${code}`;
        pushSyncActivity({ phase: 'error', source, message });
        return reject(new Error(message));
      }
      const result = parseSyncResult(stdout);
      pushSyncActivity({ phase: 'complete', source, result });
      resolve(result);
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
      click: () => { void refreshBackgroundSyncFromUi().then(() => backgroundSync.runNow()); }
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
        `--edari-remote=${USE_REMOTE_UI ? '1' : '0'}`
      ]
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (show) mainWindow.show();
    pushAutoSyncState(backgroundSync?.getState() || {});
  });

  const target = getAdminLoadTarget();
  mainWindow.loadURL(target.url);

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
          click: () => { void refreshBackgroundSyncFromUi().then(() => backgroundSync?.runNow()); }
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

function runFetchEdariMaterialsScript() {
  return new Promise((resolve, reject) => {
    const portalDir = getPortalDir();
    const script = path.join(portalDir, 'sync-client', 'refresh-materials.js');
    const nodeBin = getNodeBin();
    let stdout = '';

    const child = spawn(nodeBin, [script], {
      cwd: portalDir,
      env: portalChildEnv(),
      windowsHide: true
    });

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stdout += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stdout.trim() || `Refresh materials exit ${code}`));
      const line = stdout.split(/\r?\n/).reverse().find((row) => row.startsWith('@MATERIALS|'));
      if (!line) return reject(new Error('تعذّر قراءة المواد من Edari'));
      try {
        resolve(JSON.parse(line.slice('@MATERIALS|'.length)));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function runListEdariTreesScript() {
  return new Promise((resolve, reject) => {
    const portalDir = getPortalDir();
    const script = path.join(portalDir, 'sync-client', 'sync.js');
    const nodeBin = getNodeBin();
    let stdout = '';

    const child = spawn(nodeBin, [script, '--list-trees'], {
      cwd: portalDir,
      env: portalChildEnv(),
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

function runListEdariMaterialTreesScript() {
  return new Promise((resolve, reject) => {
    const portalDir = getPortalDir();
    const script = path.join(portalDir, 'sync-client', 'sync.js');
    const nodeBin = getNodeBin();
    let stdout = '';

    const child = spawn(nodeBin, [script, '--list-material-trees'], {
      cwd: portalDir,
      env: portalChildEnv(),
      windowsHide: true
    });

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stdout += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stdout.trim() || `List material trees exit ${code}`));
      const line = stdout.split(/\r?\n/).reverse().find((row) => row.startsWith('@MATERIAL_TREES|'));
      if (!line) return reject(new Error('تعذّر قراءة شجرات المواد من EdariNX'));
      try {
        resolve(JSON.parse(line.slice('@MATERIAL_TREES|'.length)));
      } catch (err) {
        reject(err);
      }
    });
  });
}

let edariSalesReportModule = null;

function loadEdariSalesReportModule(forceReload = false) {
  Object.assign(process.env, edariEnvExtra());
  const reportPath = path.join(getPortalDir(), 'sync-client', 'edari-sales-report.js');
  if (forceReload || !edariSalesReportModule) {
    delete require.cache[require.resolve(reportPath)];
    edariSalesReportModule = require(reportPath);
  }
  return edariSalesReportModule;
}

async function queryEdariSalesReportInProcess(params = {}) {
  const { queryEdariSalesReport } = loadEdariSalesReportModule();
  return queryEdariSalesReport(params);
}

let salesReportWorker = null;
let salesReportLatestParams = null;
let salesReportLatestResult = null;
let salesReportLatestError = null;

async function queryEdariSalesReportSerialized(params = {}) {
  salesReportLatestParams = params || {};
  salesReportLatestResult = null;
  salesReportLatestError = null;

  if (!salesReportWorker) {
    salesReportWorker = (async () => {
      try {
        while (salesReportLatestParams) {
          const nextParams = salesReportLatestParams;
          salesReportLatestParams = null;
          salesReportLatestResult = null;
          salesReportLatestError = null;
          try {
            salesReportLatestResult = await queryEdariSalesReportInProcess(nextParams);
          } catch (err) {
            salesReportLatestError = err;
            if (!salesReportLatestParams) throw err;
          }
        }
        if (salesReportLatestError) throw salesReportLatestError;
        return salesReportLatestResult;
      } finally {
        salesReportWorker = null;
      }
    })();
  }

  return salesReportWorker;
}

async function listEdariSalesBranchesInProcess(params = {}) {
  const { listSalesBranches } = loadEdariSalesReportModule();
  return listSalesBranches(params);
}

async function listEdariMaterialTreesInProcess() {
  const { listMaterialTreeRoots } = loadEdariSalesReportModule(true);
  const trees = await listMaterialTreeRoots();
  return { ok: true, trees, count: trees.length };
}

function runEdariSalesReportScript(params = {}) {
  return queryEdariSalesReportSerialized(params);
}

let edariStatementModule = null;

function loadEdariStatementModule(forceReload = false) {
  Object.assign(process.env, edariEnvExtra());
  const modPath = path.join(getPortalDir(), 'sync-client', 'edari-account-statement.js');
  if (forceReload || !edariStatementModule) {
    delete require.cache[require.resolve(modPath)];
    edariStatementModule = require(modPath);
  }
  return edariStatementModule;
}

async function queryEdariAccountStatementsInProcess(params = {}) {
  const { queryEdariAccountStatements } = loadEdariStatementModule();
  return queryEdariAccountStatements(params);
}

async function pullSyncSettingsFromRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  try {
    return await mainWindow.webContents.executeJavaScript(`(function () {
      const checked = [...document.querySelectorAll('#syncTreeChecks input[name=syncTreeSeq]:checked')].map((c) => c.value).filter(Boolean);
      let saved = [];
      try { saved = JSON.parse(localStorage.getItem('syncTreeSeqs') || '[]'); } catch (e) { /* ignore */ }
      const treeSeqs = (checked.length ? checked : saved).map(String).filter(Boolean);
      const serverUrl = (document.getElementById('syncServerUrl')?.value || localStorage.getItem('syncServerUrl') || '').trim().replace(/\\/$/, '');
      const syncKey = (document.getElementById('syncApiKey')?.value || localStorage.getItem('syncApiKey') || '').trim();
      return { serverUrl, syncKey, treeSeqs };
    })()`);
  } catch {
    return null;
  }
}

async function refreshBackgroundSyncFromUi() {
  const fromUi = await pullSyncSettingsFromRenderer();
  if (!fromUi) return;
  const patch = {};
  if (fromUi.treeSeqs?.length) patch.treeSeqs = fromUi.treeSeqs;
  if (fromUi.syncKey) patch.syncKey = fromUi.syncKey;
  if (fromUi.serverUrl) patch.serverUrl = fromUi.serverUrl;
  if (Object.keys(patch).length) backgroundSync?.saveSettings(patch);
}

function initBackgroundSync() {
  backgroundSync = createBackgroundSync({
    app,
    getSettingsPath,
    defaultServerUrl: BACKEND_URL,
    runSync: runLocalSyncScript,
    prepareSync: refreshBackgroundSyncFromUi,
    onStateChange: (state) => {
      pushAutoSyncState(state);
      updateTrayMenu();
    },
    onNotify: (msg) => {
      const text = String(msg || '').trim();
      if (text) pushSyncProgress(text);
      if (tray && !mainWindow?.isVisible()) {
        tray.displayBalloon?.({
          title: 'Edari Admin',
          content: text,
          iconType: 'info'
        });
      }
    }
  });
  backgroundSync.init();
}

ipcMain.handle('run-local-sync', (_e, { serverUrl, syncKey, treeSeqs }) => {
  return runLocalSyncScript(serverUrl, syncKey, treeSeqs, { source: 'manual' });
});

ipcMain.handle('verify-sync-target', async (_e, { serverUrl, syncKey }) => {
  const base = String(serverUrl || BACKEND_URL).replace(/\/$/, '');
  const key = String(syncKey || '').trim();
  if (!base) throw new Error('عنوان سيرفر الرفع غير مضبوط');
  if (!key) throw new Error('مفتاح المزامنة فارغ');

  const { status, data } = await httpRequestJson(`${base}/api/sync/status`, {
    headers: { 'X-Sync-Key': key }
  });
  if (status !== 200 || !data.ok) {
    throw new Error(data.error || 'تعذّر التحقق من السيرفر — تأكد من العنوان ومفتاح المزامنة');
  }
  return data;
});

ipcMain.handle('list-edari-trees', () => {
  return runListEdariTreesScript();
});

ipcMain.handle('list-edari-material-trees', async () => {
  try {
    return await listEdariMaterialTreesInProcess();
  } catch (err) {
    return { ok: false, error: err.message || 'فشل قراءة شجرات المواد' };
  }
});

ipcMain.handle('query-edari-sales-report', async (_e, params) => {
  try {
    const report = await runEdariSalesReportScript(params || {});
    return { ok: true, report };
  } catch (err) {
    return { ok: false, error: err.message || 'فشل إنشاء التقرير من Edari' };
  }
});

ipcMain.handle('list-edari-sales-branches', async (_e, params) => {
  try {
    const branches = await listEdariSalesBranchesInProcess(params || {});
    return { ok: true, branches };
  } catch (err) {
    return { ok: false, error: err.message || 'فشل قراءة الفروع من Edari' };
  }
});

ipcMain.handle('export-edari-sales-report-pdf', async (_e, params = {}) => {
  try {
    process.env.DATABASE_PATH = getDatabasePath();
    const report = params.report || await queryEdariSalesReportSerialized(params);
    const pdfPath = path.join(getPortalDir(), 'lib', 'pdf-export.js');
    delete require.cache[require.resolve(pdfPath)];
    const { buildTreeSalesReportPdf } = require(pdfPath);
    const buffer = await buildTreeSalesReportPdf(report);
    const from = report.period?.dateFrom || 'from';
    const to = report.period?.dateTo || 'to';
    return {
      ok: true,
      data: buffer.toString('base64'),
      filename: `sales-trees-${from}_${to}.pdf`
    };
  } catch (err) {
    return { ok: false, error: err.message || 'فشل تصدير PDF من Edari' };
  }
});

ipcMain.handle('query-edari-account-statements', async (_e, params) => {
  try {
    process.env.DATABASE_PATH = getDatabasePath();
    const result = await queryEdariAccountStatementsInProcess(params || {});
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err.message || 'فشل إنشاء كشف الحساب من Edari' };
  }
});

ipcMain.handle('export-edari-account-statements-pdf', async (_e, params = {}) => {
  try {
    process.env.DATABASE_PATH = getDatabasePath();
    const result = params.statements
      ? { statements: params.statements }
      : await queryEdariAccountStatementsInProcess(params);
    const pdfPath = path.join(getPortalDir(), 'lib', 'pdf-export.js');
    delete require.cache[require.resolve(pdfPath)];
    const { buildAccountStatementsPdf } = require(pdfPath);
    const buffer = await buildAccountStatementsPdf(result.statements || []);
    const from = params.dateFrom || result.period?.dateFrom || result.meta?.dateFrom;
    const to = params.dateTo || result.period?.dateTo || result.meta?.dateTo;
    const stamp = from && to ? `${from}_${to}` : new Date().toISOString().slice(0, 10);
    return {
      ok: true,
      data: buffer.toString('base64'),
      filename: `account-statements-${stamp}.pdf`,
      missing: result.missing || []
    };
  } catch (err) {
    return { ok: false, error: err.message || 'فشل تصدير كشف الحساب من Edari' };
  }
});

ipcMain.handle('fetch-edari-catalog-materials', async (_e, { codes }) => {
  try {
    Object.assign(process.env, edariEnvExtra());
    const lookupPath = path.join(getPortalDir(), 'sync-client', 'material-lookup.js');
    delete require.cache[require.resolve(lookupPath)];
    const { lookupEdariMaterialsByCodes } = require(lookupPath);
    const rows = await lookupEdariMaterialsByCodes(Array.isArray(codes) ? codes : []);
    return { ok: true, rows, count: rows.length };
  } catch (err) {
    return { ok: false, error: err.message || 'فشل الاتصال بـ Edari' };
  }
});

ipcMain.handle('get-edari-settings', () => {
  return { ok: true, edari: getEdariSettings() };
});

ipcMain.handle('save-edari-settings', (_e, edari) => {
  backgroundSync?.saveSettings({ edari: edari || {} });
  return { ok: true, edari: getEdariSettings() };
});

ipcMain.handle('test-edari-connection', async (_e, edari) => {
  try {
    const { getEdariConnection } = loadEdariConnectionModule();
    const odbcBridge = require(path.join(getEdariReaderRoot(), 'lib', 'odbc-bridge'));
    const conn = getEdariConnection(edari || getEdariSettings());
    const result = await odbcBridge.testConnection(conn);
    if (result?.ok === false) {
      return { ok: false, error: result.error || 'فشل الاتصال' };
    }
    return { ok: true, message: 'تم الاتصال بقاعدة Edari بنجاح', alias: conn.alias };
  } catch (err) {
    return { ok: false, error: err.message || 'فشل الاتصال' };
  }
});

ipcMain.handle('list-edari-databases', async (_e, { dataRoot } = {}) => {
  try {
    const scanner = require(path.join(getEdariReaderRoot(), 'lib', 'scanner'));
    const root = String(dataRoot || getEdariSettings().dataRoot || '').trim();
    if (!root) return { ok: false, error: 'مجلد Data مطلوب' };
    const databases = scanner.listDatabases(root);
    let aliases = [];
    try {
      const { fetchAliases } = require(path.join(getEdariReaderRoot(), 'lib', 'nexus-admin'));
      aliases = await fetchAliases();
    } catch {
      /* nxServer admin optional */
    }
    return { ok: true, databases, aliases, dataRoot: root };
  } catch (err) {
    return { ok: false, error: err.message || 'تعذّر قراءة المجلد' };
  }
});

ipcMain.handle('fetch-edari-materials', () => {
  return runFetchEdariMaterialsScript();
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

ipcMain.handle('run-background-sync-now', async () => {
  await refreshBackgroundSyncFromUi();
  return backgroundSync?.runNow();
});

let activePriceSyncPromise = null;

function runPriceAppSyncScript({ serverUrl, syncKey, dateFrom, dateTo } = {}) {
  if (activePriceSyncPromise) return activePriceSyncPromise;

  activePriceSyncPromise = new Promise((resolve, reject) => {
    const portalDir = getPortalDir();
    const script = path.join(portalDir, 'sync-client', 'price-app-sync.js');
    const nodeBin = getNodeBin();
    let stdout = '';
    const syncTarget = String(serverUrl || 'http://187.124.23.65:5000').replace(/\/$/, '');

    const args = [script, '--server', syncTarget];
    if (syncKey) args.push('--key', syncKey);
    if (dateFrom) args.push('--from', dateFrom);
    if (dateTo) args.push('--to', dateTo);

    const child = spawn(nodeBin, args, {
      cwd: portalDir,
      env: portalChildEnv({
        PRICE_APP_SERVER: syncTarget,
        PRICE_SYNC_KEY: syncKey || '',
        PRICE_SYNC_FROM: dateFrom || '',
        PRICE_SYNC_TO: dateTo || '',
      }),
      windowsHide: true,
    });

    child.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      text.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) pushSyncProgress(trimmed);
      });
    });

    child.stderr.on('data', (d) => {
      const text = d.toString().trim();
      if (text) pushSyncProgress(text);
    });

    child.on('error', (err) => {
      activePriceSyncPromise = null;
      reject(err);
    });

    child.on('close', (code) => {
      activePriceSyncPromise = null;
      if (code !== 0) {
        reject(new Error(stdout.trim().split(/\r?\n/).pop() || 'فشلت مزامنة الأسعار'));
        return;
      }
      const jsonLine = stdout.split(/\r?\n/).reverse().find((line) => line.startsWith('@SYNC_RESULT|'));
      if (jsonLine) {
        try {
          resolve(JSON.parse(jsonLine.slice('@SYNC_RESULT|'.length)));
          return;
        } catch { /* fall through */ }
      }
      resolve({ ok: true });
    });
  });

  return activePriceSyncPromise;
}

ipcMain.handle('run-price-app-sync', (_e, params = {}) => {
  return runPriceAppSyncScript(params);
});

ipcMain.handle('lookup-edari-material', async (_e, code) => {
  try {
    Object.assign(process.env, edariEnvExtra());
    const lookupPath = path.join(getPortalDir(), 'sync-client', 'material-lookup.js');
    delete require.cache[require.resolve(lookupPath)];
    const { lookupEdariMaterial } = require(lookupPath);
    const material = await lookupEdariMaterial(code);
    if (!material) return { ok: false, error: 'المادة غير موجودة في Edari' };
    return { ok: true, material };
  } catch (err) {
    return { ok: false, error: err.message || 'فشل الاتصال بـ Edari' };
  }
});

function showStartupError(err) {
  const message = String(err?.message || err || 'خطأ غير معروف');
  console.error(message);
  if (!START_HIDDEN) {
    dialog.showErrorBox(
      'Edari Admin — تعذّر التشغيل',
      `${message}\n\nتأكد من:\n• اتصال الإنترنت\n• أن السيرفر يعمل: ${BACKEND_URL}\n• إعادة تثبيت التطبيق إن استمرت المشكلة`
    );
  }
}

app.whenReady().then(async () => {
  try {
    process.env.DATABASE_PATH = getDatabasePath();
    if (USE_LOCAL_SERVER || USE_BUNDLED_UI) {
      await startBackend();
    } else {
      await checkHealth(BACKEND_URL);
    }
    initBackgroundSync();
    createTray();
    createWindow({ show: !START_HIDDEN });

    if (START_HIDDEN) {
      setTimeout(async () => {
        await refreshBackgroundSyncFromUi();
        void backgroundSync?.runNow();
      }, 15000);
    }
  } catch (err) {
    showStartupError(err);
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
  if (staticAdminServer) {
    staticAdminServer.close();
    staticAdminServer = null;
  }
  if (startedServer && serverProcess) {
    serverProcess.kill();
  }
});
