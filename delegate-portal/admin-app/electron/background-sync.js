const fs = require('fs');
const path = require('path');

const AUTO_SYNC_INTERVAL_SEC = 30 * 60;

function createBackgroundSync({
  app,
  getSettingsPath,
  defaultServerUrl,
  runSync,
  prepareSync,
  onStateChange,
  onNotify
}) {
  let settings = loadSettings();
  let tickTimer = null;
  const state = {
    syncing: false,
    secondsLeft: AUTO_SYNC_INTERVAL_SEC
  };

  function loadSettings() {
    const file = getSettingsPath();
    const defaults = {
      serverUrl: defaultServerUrl,
      syncKey: '',
      treeSeqs: [],
      autoSyncEnabled: true,
      startAtLogin: true,
      edari: {
        mode: 'tcp',
        alias: '2025',
        server: '127.0.0.1',
        port: 16000,
        dataRoot: 'D:\\Future of Technology\\EdariNX\\Data',
        databasePath: 'D:\\Future of Technology\\EdariNX\\Data\\2025'
      }
    };
    try {
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        return {
          ...defaults,
          ...parsed,
          edari: { ...defaults.edari, ...(parsed.edari || {}) }
        };
      }
    } catch {
      /* ignore */
    }
    return defaults;
  }

  function persistSettings(patch = {}) {
    const next = { ...settings, ...patch };
    if (patch.edari) {
      next.edari = { ...(settings.edari || {}), ...patch.edari };
    }
    settings = next;
    fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
    emitState();
  }

  function publicState() {
    return {
      enabled: Boolean(settings.autoSyncEnabled),
      startAtLogin: Boolean(settings.startAtLogin),
      secondsLeft: state.secondsLeft,
      syncing: state.syncing,
      serverUrl: settings.serverUrl || defaultServerUrl,
      hasTrees: Array.isArray(settings.treeSeqs) && settings.treeSeqs.length > 0,
      hasKey: Boolean(String(settings.syncKey || '').trim())
    };
  }

  function emitState() {
    onStateChange?.(publicState());
  }

  function resetCountdown() {
    state.secondsLeft = AUTO_SYNC_INTERVAL_SEC;
    emitState();
  }

  function stopTimer() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
  }

  function startTimer() {
    stopTimer();
    if (!settings.autoSyncEnabled) return;
    tickTimer = setInterval(() => {
      void onTick();
    }, 1000);
  }

  async function onTick() {
    if (!settings.autoSyncEnabled) {
      emitState();
      return;
    }
    if (state.syncing) {
      emitState();
      return;
    }
    if (state.secondsLeft <= 1) {
      state.secondsLeft = 0;
      emitState();
      await runBackgroundSync();
      return;
    }
    state.secondsLeft -= 1;
    emitState();
  }

  async function runBackgroundSync() {
    if (state.syncing) return { ok: false, error: 'المزامنة قيد التنفيذ' };
    if (prepareSync) {
      try {
        await prepareSync();
        settings = loadSettings();
      } catch {
        /* ignore */
      }
    }
    const treeSeqs = (settings.treeSeqs || []).map(String).filter(Boolean);
    const syncKey = String(settings.syncKey || '').trim();
    const serverUrl = String(settings.serverUrl || defaultServerUrl).replace(/\/$/, '');

    if (!treeSeqs.length) {
      onNotify?.('تخطّي المزامنة: لم تُحدد شجرات');
      resetCountdown();
      return { ok: false, error: 'لا توجد شجرات' };
    }
    if (!syncKey) {
      onNotify?.('تخطّي المزامنة: مفتاح الرفع غير مضبوط');
      resetCountdown();
      return { ok: false, error: 'مفتاح المزامنة فارغ' };
    }

    state.syncing = true;
    emitState();
    onNotify?.('بدء رفع البيانات تلقائياً...');

    try {
      const result = await runSync(serverUrl, syncKey, treeSeqs, { source: 'auto' });
      const invPart = result.invoices ? `، ${result.invoices} فاتورة` : '';
      const linesPart = result.invoiceLines ? `، ${result.invoiceLines} بند` : '';
      onNotify?.(`اكتمل الرفع التلقائي: ${result.accounts} حساب، ${result.journal} حركة${invPart}${linesPart}`);
      return { ok: true, result };
    } catch (err) {
      onNotify?.(`فشل الرفع التلقائي: ${err.message}`);
      return { ok: false, error: err.message };
    } finally {
      state.syncing = false;
      resetCountdown();
    }
  }

  function applyLoginItem() {
    if (process.platform === 'win32' || process.platform === 'darwin') {
      app.setLoginItemSettings({
        openAtLogin: Boolean(settings.startAtLogin),
        openAsHidden: true,
        path: process.execPath,
        args: ['--background']
      });
    }
  }

  return {
    init() {
      state.secondsLeft = AUTO_SYNC_INTERVAL_SEC;
      applyLoginItem();
      startTimer();
      emitState();
    },
    getState: publicState,
    getSettings: () => ({ ...settings }),
    saveSettings(patch) {
      persistSettings(patch);
      applyLoginItem();
      if (settings.autoSyncEnabled) startTimer();
      else stopTimer();
    },
    setAutoSyncEnabled(enabled) {
      persistSettings({ autoSyncEnabled: Boolean(enabled) });
      if (enabled) {
        resetCountdown();
        startTimer();
      } else {
        stopTimer();
      }
    },
    setStartAtLogin(enabled) {
      persistSettings({ startAtLogin: Boolean(enabled) });
      applyLoginItem();
    },
    resetCountdown,
    runNow: runBackgroundSync,
    shutdown: stopTimer
  };
}

module.exports = { createBackgroundSync, AUTO_SYNC_INTERVAL_SEC };
