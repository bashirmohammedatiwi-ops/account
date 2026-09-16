const fs = require('fs');
const path = require('path');

const DEFAULT_EDARI = {
  mode: 'tcp',
  alias: '2026',
  server: '127.0.0.1',
  port: 16000,
  dataRoot: '',
  databasePath: '',
  includePreviousYearOnSync: false,
  previousYear: { enabled: true, alias: '2025' }
};

function settingsPath() {
  const dbPath = process.env.DATABASE_PATH
    || path.join(__dirname, '..', 'data', 'portal.db');
  return path.join(path.dirname(dbPath), 'server-settings.json');
}

function readServerSettings() {
  const file = settingsPath();
  if (!fs.existsSync(file)) {
    return { edari: { ...DEFAULT_EDARI }, backgroundSync: {}, uiPrefs: {} };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      edari: { ...DEFAULT_EDARI, ...(raw.edari || {}) },
      backgroundSync: { ...(raw.backgroundSync || {}) },
      uiPrefs: { ...(raw.uiPrefs || {}) }
    };
  } catch {
    return { edari: { ...DEFAULT_EDARI }, backgroundSync: {}, uiPrefs: {} };
  }
}

function writeServerSettings(patch = {}) {
  const current = readServerSettings();
  let nextEdari = current.edari;
  if (patch.edari != null) {
    try {
      const { normalizeEdariConnection } = require('../sync-client/edari-connection');
      nextEdari = normalizeEdariConnection({ ...current.edari, ...patch.edari });
    } catch {
      nextEdari = { ...current.edari, ...patch.edari };
    }
  }
  const next = {
    edari: nextEdari,
    backgroundSync: patch.backgroundSync != null
      ? { ...current.backgroundSync, ...patch.backgroundSync }
      : current.backgroundSync,
    uiPrefs: patch.uiPrefs != null
      ? { ...current.uiPrefs, ...patch.uiPrefs }
      : current.uiPrefs,
    updatedAt: new Date().toISOString()
  };
  const file = settingsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
  if (patch.edari != null) {
    try {
      const bgFile = path.join(path.dirname(file), 'background-sync.json');
      let current = {};
      if (fs.existsSync(bgFile)) {
        current = JSON.parse(fs.readFileSync(bgFile, 'utf8')) || {};
      }
      current.edari = next.edari;
      fs.writeFileSync(bgFile, JSON.stringify(current, null, 2), 'utf8');
    } catch {
      /* Electron IPC store may be absent in Docker */
    }
  }
  return next;
}

function applyEdariSettingsToEnv(edari = null) {
  const { connectionToEnv, normalizeEdariConnection } = require('../sync-client/edari-connection');
  const settings = normalizeEdariConnection(edari || readServerSettings().edari);
  Object.assign(process.env, connectionToEnv(settings));
  return settings;
}

module.exports = {
  readServerSettings,
  writeServerSettings,
  applyEdariSettingsToEnv,
  settingsPath,
  DEFAULT_EDARI
};
