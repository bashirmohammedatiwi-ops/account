const { app, BrowserWindow, Menu, ipcMain, Tray, nativeImage, dialog } = require('electron');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { createBackgroundSync } = require('./background-sync');
const { startStaticAdmin } = require('./static-admin');
const appMode = require('./app-mode');

const PORT = Number(process.env.PORT || 4100);
const ADMIN_LAN_CLIENT = process.env.ADMIN_LAN_CLIENT === '1' || appMode.mode === 'lan-client';

function getLanClientConfigPath() {
  return path.join(app.getPath('userData'), 'lan-client.json');
}

function readLanClientBackendUrl() {
  try {
    const raw = JSON.parse(fs.readFileSync(getLanClientConfigPath(), 'utf8'));
    return String(raw.backendUrl || '').trim().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function saveLanClientBackendUrl(url) {
  try {
    fs.mkdirSync(path.dirname(getLanClientConfigPath()), { recursive: true });
    fs.writeFileSync(getLanClientConfigPath(), JSON.stringify({ backendUrl: url }, null, 2), 'utf8');
  } catch { /* non-fatal */ }
}

const REMOTE_BACKEND_URL = 'http://187.124.23.65:5005';
const LAN_PROBE_PORTS = [4100, 5005];
const LAN_PROBE_SUBNETS = ['192.168.75', '192.168.1', '192.168.0', '10.0.0'];

function normalizeBackendUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function isPrivateBackendUrl(url) {
  try {
    return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * LAN addresses worth probing when looking for the machine that owns Edari.
 * A saved address is tried first, then a short sweep of the shop subnets.
 */
function lanProbeCandidates() {
  const saved = normalizeBackendUrl(readLanClientBackendUrl());
  const env = normalizeBackendUrl(process.env.EDARI_HOST_URL);
  const lan = [];
  for (const subnet of LAN_PROBE_SUBNETS) {
    for (const host of [1, 10, 100, 254]) {
      for (const port of LAN_PROBE_PORTS) {
        lan.push(`http://${subnet}.${host}:${port}`);
      }
    }
  }
  return [...new Set([
    ...(isPrivateBackendUrl(env) ? [env] : []),
    ...(isPrivateBackendUrl(saved) ? [saved] : []),
    ...lan
  ].filter(Boolean))];
}

/**
 * Find the LAN machine running Edari Admin Server. Live Edari work (posting
 * receipts, reading trees over ODBC) can only run there, so the client routes
 * those calls to it even though it reads its data from the internet server.
 */
async function pickEdariHost() {
  for (const url of lanProbeCandidates()) {
    if (!(await checkHealthOnce(`${url}/api/health`, 1200))) continue;
    if (await checkLanInfoOnce(url, 2000)) return url;
  }
  return '';
}

/**
 * Delegates submit receipts from their phones over the internet, so the online
 * server is the only place that holds the full picture. Both machines read
 * their data from it to stay identical.
 *
 * The page itself is served by the machine that owns Edari, so live Edari calls
 * stay same-origin and the secondary machine reaches Edari across the LAN.
 */
const REMOTE_DATA_URL = normalizeBackendUrl(
  process.env.DATA_BACKEND_URL || process.env.BACKEND_URL || REMOTE_BACKEND_URL
);

let BACKEND_URL = '';
let DATA_BACKEND_URL = '';
let EDARI_HOST_URL = '';
const USE_LOCAL_SERVER = process.env.USE_LOCAL_SERVER === '1' || appMode.mode === 'lan-server';
const LAN_SERVER = process.env.LAN_SERVER === '1' || appMode.mode === 'lan-server';
const USE_BUNDLED_UI = app.isPackaged && process.env.USE_REMOTE !== '1' && !USE_LOCAL_SERVER && !ADMIN_LAN_CLIENT;
const USE_REMOTE_UI = !USE_LOCAL_SERVER && !USE_BUNDLED_UI;
const BUNDLED_ADMIN_PORT = PORT;

/**
 * Empty means "read from whichever server delivered the page" — the offline
 * fallback, where the LAN database still holds accounts, journal and trees.
 */
async function pickDataBackend() {
  return (await checkHealthOnce(`${REMOTE_DATA_URL}/api/health`, 5000)) ? REMOTE_DATA_URL : '';
}

function getAdminLoadTarget() {
  if (USE_BUNDLED_UI) {
    return { type: 'url', url: `http://127.0.0.1:${BUNDLED_ADMIN_PORT}/admin/` };
  }
  if (USE_LOCAL_SERVER) {
    return { type: 'url', url: `http://127.0.0.1:${PORT}/admin` };
  }
  if (ADMIN_LAN_CLIENT) {
    return EDARI_HOST_URL
      ? { type: 'url', url: `${EDARI_HOST_URL}/admin` }
      : { type: 'setup' };
  }
  return { type: 'url', url: `${BACKEND_URL || REMOTE_DATA_URL}/admin` };
}
const START_HIDDEN = process.argv.includes('--background') || process.argv.includes('--hidden');

const execFileAsync = promisify(execFile);

function edariPostingKey(kind, payload = {}) {
  const id = payload.id ?? payload.receiptId ?? payload.requestId;
  if (id != null && String(id).trim()) return `${kind}:id:${id}`;
  if (kind === 'receipt') {
    const no = String(payload.receiptNo || payload.receipt_no || '').trim();
    if (no) return `${kind}:no:${no}`;
  }
  if (kind === 'customer') {
    const tree = String(payload.treeNum || payload.treeAccSeq || '').trim();
    const name = String(payload.name || '').trim();
    if (tree && name) return `${kind}:${tree}:${name}`;
  }
  return '';
}

async function runEdariPostingJob(key, fn) {
  if (!key) return fn();
  if (edariPostingJobs.has(key)) {
    return { ok: false, error: 'جاري الترحيل — انتظر اكتمال العملية السابقة' };
  }
  const job = (async () => fn())();
  edariPostingJobs.set(key, job);
  try {
    return await job;
  } finally {
    edariPostingJobs.delete(key);
  }
}

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

let cachedNodeRunner = null;

function resolveNodeRunner() {
  if (cachedNodeRunner) return cachedNodeRunner;
  const candidates = [];
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'node-portable', 'node.exe'));
    candidates.push(path.join(process.resourcesPath, 'node', 'node.exe'));
    candidates.push(path.join(path.dirname(process.execPath), 'resources', 'node-portable', 'node.exe'));
    candidates.push(path.join(path.dirname(process.execPath), 'resources', 'node', 'node.exe'));
  }
  candidates.push(path.join(__dirname, '..', 'build-resources', 'node-portable', 'node.exe'));
  candidates.push(path.join(__dirname, '..', 'build-resources', 'node', 'node.exe'));
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        cachedNodeRunner = { executable: candidate, envExtra: {}, bundled: true };
        return cachedNodeRunner;
      }
    } catch { /* ignore */ }
  }
  cachedNodeRunner = {
    executable: process.execPath,
    envExtra: { ELECTRON_RUN_AS_NODE: '1' },
    bundled: false
  };
  return cachedNodeRunner;
}

function getNodeBin() {
  return resolveNodeRunner().executable;
}

function applyNodeRunnerEnv(extra = {}) {
  const { envExtra } = resolveNodeRunner();
  return { ...process.env, ...envExtra, ...extra };
}

function warnIfNodeBundleMissing() {
  const runner = resolveNodeRunner();
  if (!runner.bundled && (LAN_SERVER || USE_LOCAL_SERVER)) {
    console.warn('node.exe المضمّن غير موجود — استخدام وضع احتياطي');
  }
  return runner;
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
  return applyNodeRunnerEnv({
    EDARI_READER_ROOT: getEdariReaderRoot(),
    NODE_BIN: getNodeBin(),
    DATABASE_PATH: getDatabasePath(),
    ...edariEnvExtra(),
    ...extra
  });
}

function serverEnv() {
  const bindHost = LAN_SERVER ? '0.0.0.0' : (process.env.HOST || '127.0.0.1');
  return applyNodeRunnerEnv({
    PORT: String(PORT),
    HOST: bindHost,
    LAN_SERVER: LAN_SERVER ? '1' : '',
    DATABASE_PATH: getDatabasePath(),
    EDARI_READER_ROOT: getEdariReaderRoot(),
    NODE_BIN: getNodeBin()
  });
}

function getLanHostModule() {
  return require(path.join(getPortalDir(), 'lib', 'lan-host'));
}

function getLanAdvertiseIp() {
  try {
    const lanHost = getLanHostModule();
    return lanHost.getEthernetLanAddress() || lanHost.getPrimaryLanAddress();
  } catch {
    return null;
  }
}

function checkHealthOnce(url, timeoutMs = 3500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function checkLanInfoOnce(baseUrl, timeoutMs = 3500) {
  return new Promise((resolve) => {
    const target = `${String(baseUrl || '').replace(/\/$/, '')}/api/admin/lan-info`;
    const req = http.get(target, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          resolve(res.statusCode === 200 && data.ok && data.role === 'server');
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function getListeningPids(port) {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync('netstat', ['-ano'], { windowsHide: true });
    const pids = new Set();
    const portNeedle = `:${port}`;
    for (const line of stdout.split('\n')) {
      if (!line.includes('LISTENING') || !line.includes(portNeedle)) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (pid > 0) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

async function releasePort(port) {
  if (serverProcess) {
    try { serverProcess.kill(); } catch { /* ignore */ }
    serverProcess = null;
    startedServer = false;
    await new Promise((r) => setTimeout(r, 600));
  }
  const pids = await getListeningPids(port);
  for (const pid of pids) {
    if (pid === process.pid) continue;
    try { process.kill(pid); } catch { /* ignore */ }
  }
  if (pids.length) await new Promise((r) => setTimeout(r, 900));
}

async function ensureLanFirewall(port) {
  if (process.platform !== 'win32' || !LAN_SERVER) return;
  const ruleName = `Edari Admin LAN ${port}`;
  try {
    await execFileAsync('netsh', [
      'advfirewall', 'firewall', 'add', 'rule',
      `name=${ruleName}`, 'dir=in', 'action=allow', 'protocol=TCP',
      `localport=${port}`, 'profile=private'
    ], { windowsHide: true });
  } catch { /* rule may already exist */ }
}

async function isLanServerReachable(port) {
  const ip = getLanAdvertiseIp();
  if (!ip) return false;
  const base = `http://${ip}:${port}`;
  if (!(await checkHealthOnce(`${base}/api/health`))) return false;
  return checkLanInfoOnce(base);
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

async function startBackend() {
  const localPort = USE_BUNDLED_UI ? BUNDLED_ADMIN_PORT : PORT;

  if (LAN_SERVER) {
    await ensureLanFirewall(localPort);
    if (await isLanServerReachable(localPort)) {
      startedServer = false;
      return;
    }
    const localHealth = await checkHealthOnce(`http://127.0.0.1:${localPort}/api/health`);
    const realLanBackend = await checkLanInfoOnce(`http://127.0.0.1:${localPort}`);
    if (localHealth && !realLanBackend) {
      await releasePort(localPort);
    } else if (localHealth && realLanBackend && !(await isLanServerReachable(localPort))) {
      await releasePort(localPort);
    }
    await spawnServer();
    await ensureLanFirewall(localPort);
    const ip = getLanAdvertiseIp();
    if (ip && !(await isLanServerReachable(localPort))) {
      throw new Error(
        `السيرفر يعمل محلياً لكن غير متاح عبر Ethernet (${ip}:${localPort}). `
        + 'أعد تشغيل Edari Admin Server كمسؤول أو اسمح للمنفذ في جدار الحماية.'
      );
    }
    return;
  }

  const localOk = await checkHealthOnce(`http://127.0.0.1:${localPort}/api/health`);
  if (localOk) {
    startedServer = false;
    return;
  }
  await spawnServer();
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
    const nodeBin = getNodeBin();
    serverProcess = spawn(nodeBin, [serverScript], {
      cwd: portalDir,
      env: serverEnv(),
      stdio: 'ignore',
      windowsHide: true
    });
    startedServer = true;
    serverProcess.on('error', (err) => {
      if (err?.code === 'ENOENT') {
        reject(new Error('تعذّر تشغيل السيرفر — أعد تثبيت Edari Admin Server (Setup) وليس Edari Admin العادي'));
        return;
      }
      reject(err);
    });
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

/**
 * On the LAN server the sync must fill both databases: the local one the
 * secondary machine reads over Ethernet, and the internet one used by mobile.
 * sync.js takes a comma-separated list and reads Edari only once.
 */
function buildSyncTargets(serverUrl) {
  const targets = [];
  const primary = normalizeBackendUrl(serverUrl || BACKEND_URL);
  if (primary) targets.push(primary);
  if (LAN_SERVER) {
    targets.push(`http://127.0.0.1:${PORT}`);
    targets.push(REMOTE_BACKEND_URL);
  }
  return [...new Set(targets)].join(',');
}

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

    const syncTarget = buildSyncTargets(serverUrl);

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

let lanRecoveryTimer = null;

/**
 * The Edari host is handed to the page through preload launch arguments, which
 * are fixed per window — so a changed host needs a fresh window, not a reload.
 */
function recreateAdminWindow() {
  const wasVisible = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());
  if (mainWindow && !mainWindow.isDestroyed()) {
    const old = mainWindow;
    mainWindow = null;
    old.destroy();
  }
  createWindow({ show: wasVisible || !START_HIDDEN });
}

/**
 * The LAN link can drop while the client is open. Re-probe every backend and
 * reload as soon as one answers, instead of leaving a dead error page.
 */
async function recoverLanClientConnection(failedUrl) {
  if (lanRecoveryTimer) return;
  const attempt = async () => {
    if (ADMIN_LAN_CLIENT) {
      EDARI_HOST_URL = await pickEdariHost();
      if (!EDARI_HOST_URL) return false;
      saveLanClientBackendUrl(EDARI_HOST_URL);
    }
    DATA_BACKEND_URL = await pickDataBackend();
    BACKEND_URL = DATA_BACKEND_URL || REMOTE_DATA_URL;
    const target = getAdminLoadTarget();
    if (target.type !== 'url') return false;
    recreateAdminWindow();
    return true;
  };

  if (await attempt()) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadFile(path.join(__dirname, 'lan-setup.html'), {
      query: { failed: String(failedUrl || '') }
    }).catch(() => { /* ignore */ });
  }
  lanRecoveryTimer = setInterval(async () => {
    if (await attempt()) {
      clearInterval(lanRecoveryTimer);
      lanRecoveryTimer = null;
    }
  }, 5000);
}

function createWindow({ show = !START_HIDDEN } = {}) {
  const titles = {
    'lan-server': 'Edari Admin Server — الجهاز الرئيسي',
    'lan-client': 'Edari Admin Client — عميل LAN',
    default: 'Edari Admin — لوحة التحكم'
  };
  const isSetup = ADMIN_LAN_CLIENT && !BACKEND_URL;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: isSetup ? 'Edari Admin Client — إعداد' : (titles[appMode.mode] || titles.default),
    icon: getAppIcon(),
    backgroundColor: '#f0f4f8',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, isSetup ? 'lan-setup-preload.js' : 'preload.js'),
      additionalArguments: isSetup ? [] : [
        `--edari-backend=${BACKEND_URL}`,
        `--edari-remote=${USE_REMOTE_UI ? '1' : '0'}`,
        `--edari-lan-client=${ADMIN_LAN_CLIENT ? '1' : '0'}`,
        `--edari-api-same-origin=${USE_LOCAL_SERVER || ADMIN_LAN_CLIENT ? '1' : '0'}`,
        `--edari-host=${EDARI_HOST_URL}`,
        `--edari-data-backend=${DATA_BACKEND_URL}`
      ]
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (show) mainWindow.show();
    pushAutoSyncState(backgroundSync?.getState() || {});
  });

  const target = getAdminLoadTarget();
  if (target.type === 'setup') {
    mainWindow.loadFile(path.join(__dirname, 'lan-setup.html'));
  } else {
    mainWindow.loadURL(target.url);
  }

  if (!USE_BUNDLED_UI) {
    mainWindow.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
      if (!isMainFrame || code === -3) return;
      void recoverLanClientConnection(url);
    });
  }

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
    { label: 'عرض', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] },
    ...(ADMIN_LAN_CLIENT ? [{
      label: 'الاتصال',
      submenu: [
        {
          label: 'إعادة البحث عن السيرفر',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: async () => {
            EDARI_HOST_URL = await pickEdariHost();
            if (EDARI_HOST_URL) saveLanClientBackendUrl(EDARI_HOST_URL);
            DATA_BACKEND_URL = await pickDataBackend();
            BACKEND_URL = DATA_BACKEND_URL || REMOTE_DATA_URL;
            recreateAdminWindow();
            dialog.showMessageBox({
              type: EDARI_HOST_URL ? 'info' : 'warning',
              title: 'حالة الاتصال',
              message: [
                EDARI_HOST_URL
                  ? `الجهاز الرئيسي (Edari): ${EDARI_HOST_URL}`
                  : 'لم يُعثر على الجهاز الرئيسي.\nتأكد من تشغيل «Edari Admin Server» وتوصيل كابل الشبكة.',
                DATA_BACKEND_URL
                  ? `مصدر البيانات: ${DATA_BACKEND_URL}`
                  : 'سيرفر الإنترنت غير متاح — سيتم عرض بيانات الجهاز الرئيسي فقط.'
              ].join('\n')
            });
          }
        },
        {
          label: 'تغيير عنوان الجهاز الرئيسي',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => {
            mainWindow?.loadFile(path.join(__dirname, 'lan-setup.html'));
          }
        }
      ]
    }] : [])
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
  const utilsPath = path.join(getPortalDir(), 'lib', 'statement-utils.js');
  if (forceReload || !edariStatementModule) {
    for (const p of [modPath, utilsPath]) {
      try { delete require.cache[require.resolve(p)]; } catch (_) { /* ignore */ }
    }
    edariStatementModule = require(modPath);
  }
  return edariStatementModule;
}

async function queryEdariAccountStatementsInProcess(params = {}) {
  const { queryEdariAccountStatements } = loadEdariStatementModule();
  return queryEdariAccountStatements(params);
}

/**
 * pdf-export يبني خطوط Cairo/Roboto عند التحميل، لذلك نحمّله مرة واحدة —
 * إعادة تحميله لكل تصدير كانت أبطأ خطوة في توليد التقارير.
 */
let pdfExportModule = null;

function loadPdfExportModule() {
  if (!pdfExportModule) {
    pdfExportModule = require(path.join(getPortalDir(), 'lib', 'pdf-export.js'));
  }
  return pdfExportModule;
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

function loadLanDefaults() {
  try {
    const p = path.join(getPortalDir(), 'lib', 'lan-defaults.js');
    delete require.cache[require.resolve(p)];
    return require(p);
  } catch {
    return {
      LAN_PORTS: LAN_PROBE_PORTS,
      LAN_PREFER_SUBNETS: LAN_PROBE_SUBNETS,
      defaultPrefillUrl: () => 'http://192.168.75.1:4100',
      quickProbeIps: () => LAN_PROBE_SUBNETS.flatMap((s) => [1, 10, 100, 254].map((h) => `${s}.${h}`))
    };
  }
}

function notifyLanServerReady() {
  if (!LAN_SERVER || !tray) return;
  try {
    const lanHost = require(path.join(getPortalDir(), 'lib', 'lan-host'));
    const ip = lanHost.getEthernetLanAddress() || lanHost.getPrimaryLanAddress();
    if (!ip) return;
    const url = `http://${ip}:${PORT}`;
    tray.displayBalloon?.({
      title: 'Edari Admin Server',
      content: `للأجهزة الثانوية (Ethernet):\n${url}`,
      iconType: 'info'
    });
  } catch { /* ignore */ }
}

ipcMain.handle('lan-client:get-setup-config', () => {
  const d = loadLanDefaults();
  return {
    ports: d.LAN_PORTS,
    preferSubnets: d.LAN_PREFER_SUBNETS,
    prefillUrl: d.defaultPrefillUrl(),
    quickProbeIps: d.quickProbeIps(),
    autoConnect: true
  };
});

ipcMain.handle('lan-client:save-url', async (_e, url) => {
  const norm = normalizeBackendUrl(url);
  if (!norm) return { ok: false, error: 'عنوان فارغ' };
  saveLanClientBackendUrl(norm);
  EDARI_HOST_URL = norm;
  DATA_BACKEND_URL = await pickDataBackend();
  BACKEND_URL = DATA_BACKEND_URL || REMOTE_DATA_URL;
  recreateAdminWindow();
  return { ok: true, backendUrl: norm };
});

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
    const { buildTreeSalesReportPdf, buildTreeSalesReportSummaryPdf } = loadPdfExportModule();
    const summaryOnly = Boolean(params.summaryOnly);
    const buildPdf = summaryOnly ? buildTreeSalesReportSummaryPdf : buildTreeSalesReportPdf;
    const buffer = await buildPdf(report);
    const from = report.period?.dateFrom || 'from';
    const to = report.period?.dateTo || 'to';
    const prefix = summaryOnly ? 'sales-trees-summary' : 'sales-trees';
    return {
      ok: true,
      data: buffer.toString('base64'),
      filename: `${prefix}-${from}_${to}.pdf`
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
    const { buildAccountStatementsPdf } = loadPdfExportModule();
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
const PRICE_SYNC_TIMEOUT_MS = 20 * 60 * 1000;

function parseSyncResultLine(stdout) {
  const jsonLine = String(stdout || '').split(/\r?\n/).reverse().find((line) => line.trim().startsWith('@SYNC_RESULT|'));
  if (!jsonLine) return null;
  try {
    return JSON.parse(jsonLine.trim().slice('@SYNC_RESULT|'.length));
  } catch {
    return null;
  }
}

function runPriceAppSyncScript({ serverUrl, syncKey, mode, posSqlServer, posSqlDatabase, posSqlUser, posSqlPassword } = {}) {
  if (activePriceSyncPromise) return activePriceSyncPromise;

  activePriceSyncPromise = new Promise((resolve, reject) => {
    const portalDir = getPortalDir();
    const script = path.join(portalDir, 'sync-client', 'price-app-sync.js');
    const nodeBin = getNodeBin();
    let stdout = '';
    let stderr = '';
    let settled = false;
    let parsedResult = null;
    let postResultKillTimer = null;
    const syncTarget = String(serverUrl || 'https://demaalhayaadelivery.online/price-api').replace(/\/$/, '');
    const syncMode = mode === 'full' ? 'full' : 'incremental';
    const syncStateFile = path.join(app.getPath('userData'), 'price-sync-state.json');

    const args = [script, '--server', syncTarget];
    if (syncKey) args.push('--key', syncKey);
    args.push(syncMode === 'full' ? '--full' : '--incremental');

    const child = spawn(nodeBin, args, {
      cwd: portalDir,
      env: portalChildEnv({
        PRICE_APP_SERVER: syncTarget,
        PRICE_SYNC_KEY: syncKey || '',
        PRICE_SYNC_STATE_FILE: syncStateFile,
        POS_SQL_SERVER: posSqlServer || process.env.POS_SQL_SERVER || '',
        POS_SQL_DATABASE: posSqlDatabase || process.env.POS_SQL_DATABASE || '',
        POS_SQL_USER: posSqlUser || process.env.POS_SQL_USER || '',
        POS_SQL_PASSWORD: posSqlPassword || process.env.POS_SQL_PASSWORD || '',
      }),
      windowsHide: true,
    });

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      activePriceSyncPromise = null;
      if (postResultKillTimer) clearTimeout(postResultKillTimer);
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      reject(new Error('انتهت مهلة مزامنة الأسعار (20 دقيقة) — جرّب «مزامنة كاملة» أو تحقق أن EdariNX يعمل'));
    }, PRICE_SYNC_TIMEOUT_MS);

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (postResultKillTimer) clearTimeout(postResultKillTimer);
      fn();
    };

    const noteSyncResultLine = (line) => {
      const trimmed = String(line || '').trim();
      if (!trimmed.startsWith('@SYNC_RESULT|')) return;
      try {
        parsedResult = JSON.parse(trimmed.slice('@SYNC_RESULT|'.length));
      } catch {
        parsedResult = null;
      }
      // بعض عمليات ODBC/POS على Windows لا تُغلق العملية فوراً — أنهِ IPC عند ظهور النتيجة.
      if (postResultKillTimer) clearTimeout(postResultKillTimer);
      postResultKillTimer = setTimeout(() => {
        if (settled) return;
        finish(() => {
          activePriceSyncPromise = null;
          try { child.kill('SIGTERM'); } catch { /* ignore */ }
          resolve(parsedResult || { ok: true });
        });
      }, 1500);
    };

    child.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      text.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        noteSyncResultLine(trimmed);
        pushSyncProgress(trimmed);
      });
    });

    child.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      text.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) pushSyncProgress(trimmed);
      });
    });

    child.on('error', (err) => {
      finish(() => {
        activePriceSyncPromise = null;
        reject(err);
      });
    });

    child.on('close', (code) => {
      finish(() => {
        activePriceSyncPromise = null;
        if (parsedResult) {
          resolve(parsedResult);
          return;
        }
        if (code !== 0) {
          const errFromStderr = stderr
            .trim()
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .pop();
          const errFromStdout = stdout
            .trim()
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('@PROGRESS|') && !line.startsWith('@SYNC_RESULT|'))
            .pop();
          reject(new Error(errFromStderr || errFromStdout || 'فشلت مزامنة الأسعار'));
          return;
        }
        const parsed = parseSyncResultLine(stdout);
        if (parsed) {
          resolve(parsed);
          return;
        }
        resolve({ ok: true });
      });
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

ipcMain.handle('search-edari-accounts', async (_e, params) => {
  try {
    Object.assign(process.env, { EDARI_READER_ROOT: getEdariReaderRoot() }, edariEnvExtra());
    const searchPath = path.join(getPortalDir(), 'sync-client', 'search-edari-accounts.js');
    delete require.cache[require.resolve(searchPath)];
    const { searchEdariAccounts } = require(searchPath);
    return await searchEdariAccounts(params || {});
  } catch (err) {
    return { ok: false, error: err.message || 'فشل البحث في حسابات الإداري' };
  }
});

ipcMain.handle('post-edari-receipt', async (_e, payload) => {
  const key = edariPostingKey('receipt', payload || {});
  return runEdariPostingJob(key, async () => {
    try {
      Object.assign(process.env, { EDARI_READER_ROOT: getEdariReaderRoot() }, edariEnvExtra());
      const portalDir = getPortalDir();
      const postingPath = path.join(portalDir, 'lib', 'receipt-posting.js');
      const postPath = path.join(portalDir, 'sync-client', 'post-receipt.js');
      for (const modPath of [postingPath, postPath]) {
        try {
          delete require.cache[require.resolve(modPath)];
        } catch (_) {}
      }
      const { postReceiptToEdari } = require(postPath);
      const result = await postReceiptToEdari(payload || {});
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message || 'فشل ترحيل سند القبض إلى الإداري' };
    }
  });
});

ipcMain.handle('post-edari-customer', async (_e, payload) => {
  const key = edariPostingKey('customer', payload || {});
  return runEdariPostingJob(key, async () => {
    try {
      Object.assign(process.env, { EDARI_READER_ROOT: getEdariReaderRoot() }, edariEnvExtra());
      const portalDir = getPortalDir();
      const postingPath = path.join(portalDir, 'lib', 'customer-posting.js');
      const postPath = path.join(portalDir, 'sync-client', 'post-customer.js');
      for (const modPath of [postingPath, postPath]) {
        try {
          delete require.cache[require.resolve(modPath)];
        } catch (_) {}
      }
      const { postCustomerToEdari } = require(postPath);
      const result = await postCustomerToEdari(payload || {});
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, error: err.message || 'فشل ترحيل الزبون إلى الإداري' };
    }
  });
});

function showStartupError(err) {
  const message = String(err?.message || err || 'خطأ غير معروف');
  console.error(message);
  let title = 'Edari Admin — تعذّر التشغيل';
  let hints;
  if (LAN_SERVER || USE_LOCAL_SERVER) {
    title = 'Edari Admin Server — تعذّر التشغيل';
    const ip = getLanAdvertiseIp() || '192.168.75.1';
    hints = [
      'تأكد من:',
      '• تثبيت Edari-Admin-Server-Setup (وليس Edari Admin العادي)',
      `• تشغيل التطبيق كمسؤول (Run as administrator)`,
      `• السماح للمنفذ ${PORT} في جدار الحماية`,
      `• عنوان الأجهزة الثانوية: http://${ip}:${PORT}`
    ].join('\n');
  } else if (ADMIN_LAN_CLIENT) {
    title = 'Edari Admin Client — تعذّر التشغيل';
    hints = [
      'تأكد من:',
      '• Edari Admin Server يعمل على الجهاز الرئيسي',
      '• العنوان: http://192.168.75.1:4100',
      '• Ethernet متصل على نفس الشبكة'
    ].join('\n');
  } else {
    hints = [
      'تأكد من:',
      '• اتصال الإنترنت',
      `• أن السيرفر يعمل: ${BACKEND_URL}`,
      '• إعادة تثبيت التطبيق إن استمرت المشكلة'
    ].join('\n');
  }
  if (!START_HIDDEN) {
    dialog.showErrorBox(title, `${message}\n\n${hints}`);
  }
}

app.whenReady().then(async () => {
  try {
    process.env.DATABASE_PATH = getDatabasePath();
    if (USE_LOCAL_SERVER || USE_BUNDLED_UI) {
      if (USE_LOCAL_SERVER) warnIfNodeBundleMissing();
      await startBackend();
    }

    if (ADMIN_LAN_CLIENT) {
      EDARI_HOST_URL = await pickEdariHost();
      if (EDARI_HOST_URL) saveLanClientBackendUrl(EDARI_HOST_URL);
    }
    DATA_BACKEND_URL = await pickDataBackend();
    BACKEND_URL = DATA_BACKEND_URL || REMOTE_DATA_URL;
    if (!USE_LOCAL_SERVER && !USE_BUNDLED_UI && !ADMIN_LAN_CLIENT) {
      await checkHealth(BACKEND_URL);
    }
    initBackgroundSync();
    createTray();
    createWindow({ show: !START_HIDDEN });
    notifyLanServerReady();

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
