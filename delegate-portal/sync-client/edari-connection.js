/**
 * EdariNX / NexusDB connection settings — read from env (set by Admin desktop app).
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_EDARI = {
  mode: 'tcp',
  alias: '2026',
  server: '127.0.0.1',
  port: 16000,
  dataRoot: 'D:\\Future of Technology\\EdariNX\\Data',
  databasePath: 'D:\\Future of Technology\\EdariNX\\Data\\2026',
  includePreviousYearOnSync: false,
  previousYear: {
    enabled: true,
    alias: '2025',
    dataRoot: 'D:\\Future of Technology\\EdariNX\\Data',
    databasePath: 'D:\\Future of Technology\\EdariNX\\Data\\2025'
  }
};

function folderName(p) {
  return String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
}

function envValue(name) {
  const v = process.env[name];
  return v == null || String(v).trim() === '' ? '' : String(v).trim();
}

function truthy(v) {
  return v === true || v === 1 || v === '1' || v === 'true' || v === 'yes';
}

function suggestPreviousAlias(alias) {
  const y = Number(String(alias || '').trim());
  if (Number.isInteger(y) && y >= 2001 && y <= 2100) return String(y - 1);
  return '';
}

/** 20252026 بلا مجلد حقيقي = السنتان 2025 و2026 ملتصقتان، ليست قاعدة مستقلة. */
function splitGluedYearAlias(alias, dataRoot) {
  const m = String(alias || '').trim().match(/^(20\d{2})(20\d{2})$/);
  if (!m || m[1] === m[2]) return null;
  const earlier = m[1] < m[2] ? m[1] : m[2];
  const later = m[1] < m[2] ? m[2] : m[1];
  const root = String(dataRoot || '').trim();
  if (root) {
    const gluedDir = path.join(root, String(alias).trim());
    try {
      if (fs.existsSync(gluedDir)) return null;
    } catch {
      /* keep split */
    }
  }
  return { current: later, previous: earlier };
}

function normalizeEdariConnection(raw = {}) {
  const conn = {
    mode: raw.mode === 'internal' ? 'internal' : 'tcp',
    alias: String(raw.alias || '').trim(),
    server: String(raw.server || DEFAULT_EDARI.server).trim() || DEFAULT_EDARI.server,
    port: Number(raw.port || DEFAULT_EDARI.port) || DEFAULT_EDARI.port,
    dataRoot: String(raw.dataRoot || '').trim(),
    databasePath: String(raw.databasePath || '').trim()
  };
  if (!conn.dataRoot && conn.databasePath) {
    conn.dataRoot = path.dirname(conn.databasePath);
  }
  if (!conn.alias && conn.databasePath) {
    conn.alias = folderName(conn.databasePath);
  }
  const glued = splitGluedYearAlias(conn.alias, conn.dataRoot);
  if (glued) {
    conn.alias = glued.current;
    if (conn.dataRoot) conn.databasePath = path.join(conn.dataRoot, conn.alias);
    if (!raw.previousYear || typeof raw.previousYear !== 'object') {
      raw = { ...raw, previousYear: { enabled: true, alias: glued.previous } };
    } else if (!String(raw.previousYear.alias || '').trim()) {
      raw = { ...raw, previousYear: { ...raw.previousYear, enabled: true, alias: glued.previous } };
    }
  }

  if (conn.dataRoot && conn.alias) {
    const expected = path.join(conn.dataRoot, conn.alias);
    const pathAlias = folderName(conn.databasePath);
    if (!conn.databasePath || (pathAlias && pathAlias !== conn.alias)) {
      conn.databasePath = expected;
    }
  }

  const prevRaw = raw.previousYear && typeof raw.previousYear === 'object' ? raw.previousYear : {};
  const suggested = suggestPreviousAlias(conn.alias);
  const prevEnabled = prevRaw.enabled == null
    ? Boolean(String(prevRaw.alias || suggested || '').trim())
    : truthy(prevRaw.enabled);
  let prevAlias = String(prevRaw.alias || '').trim();
  if (prevEnabled && !prevAlias) prevAlias = suggested;
  const prevRoot = String(prevRaw.dataRoot || conn.dataRoot || '').trim();
  let prevPath = String(prevRaw.databasePath || '').trim();
  if (prevRoot && prevAlias) {
    const expectedPrev = path.join(prevRoot, prevAlias);
    if (!prevPath || folderName(prevPath) !== prevAlias) prevPath = expectedPrev;
  }
  conn.previousYear = {
    enabled: Boolean(prevEnabled && prevAlias && prevAlias !== conn.alias),
    alias: prevAlias && prevAlias !== conn.alias ? prevAlias : '',
    dataRoot: prevRoot,
    databasePath: prevPath,
    mode: prevRaw.mode === 'internal' ? 'internal' : conn.mode,
    server: String(prevRaw.server || conn.server).trim() || conn.server,
    port: Number(prevRaw.port || conn.port) || conn.port
  };
  conn.includePreviousYearOnSync = truthy(raw.includePreviousYearOnSync);
  return conn;
}

function previousYearFromEnv() {
  const flag = envValue('EDARI_PREV_ENABLED');
  if (flag === '0') return { enabled: false };
  if (flag !== '1' && !envValue('EDARI_PREV_ALIAS')) return undefined;
  return {
    enabled: true,
    alias: envValue('EDARI_PREV_ALIAS'),
    dataRoot: envValue('EDARI_PREV_DATA_ROOT') || envValue('EDARI_DATA_ROOT'),
    databasePath: envValue('EDARI_PREV_DATABASE_PATH'),
    mode: envValue('EDARI_PREV_MODE') || envValue('EDARI_MODE'),
    server: envValue('EDARI_PREV_SERVER') || envValue('EDARI_SERVER'),
    port: envValue('EDARI_PREV_PORT') || envValue('EDARI_PORT')
  };
}

function getEdariConnection(overrides = {}) {
  const conn = {
    mode: envValue('EDARI_MODE') || DEFAULT_EDARI.mode,
    alias: envValue('EDARI_ALIAS') || DEFAULT_EDARI.alias,
    server: envValue('EDARI_SERVER') || DEFAULT_EDARI.server,
    port: Number(envValue('EDARI_PORT') || DEFAULT_EDARI.port),
    dataRoot: envValue('EDARI_DATA_ROOT') || DEFAULT_EDARI.dataRoot,
    databasePath: envValue('EDARI_DATABASE_PATH') || '',
    previousYear: overrides.previousYear != null ? overrides.previousYear : previousYearFromEnv(),
    includePreviousYearOnSync: overrides.includePreviousYearOnSync != null
      ? overrides.includePreviousYearOnSync
      : envValue('SYNC_INCLUDE_PREV_YEAR') === '1'
  };
  return normalizeEdariConnection({ ...conn, ...overrides });
}

function getPreviousYearConnection(edari = null) {
  const current = edari ? normalizeEdariConnection(edari) : getEdariConnection();
  const prev = current.previousYear;
  if (!prev || !prev.enabled || !prev.alias || prev.alias === current.alias) return null;
  return normalizeEdariConnection({
    mode: prev.mode || current.mode,
    alias: prev.alias,
    server: prev.server || current.server,
    port: prev.port || current.port,
    dataRoot: prev.dataRoot || current.dataRoot,
    databasePath: prev.databasePath,
    previousYear: { enabled: false },
    includePreviousYearOnSync: false
  });
}

function connectionToEnv(conn = {}) {
  const c = normalizeEdariConnection({ ...getEdariConnection(), ...conn });
  const env = {
    EDARI_MODE: c.mode,
    EDARI_ALIAS: c.alias,
    EDARI_SERVER: c.server,
    EDARI_PORT: String(c.port),
    EDARI_DATA_ROOT: c.dataRoot,
    EDARI_DATABASE_PATH: c.databasePath,
    SYNC_INCLUDE_PREV_YEAR: c.includePreviousYearOnSync ? '1' : '0'
  };
  if (c.previousYear?.enabled && c.previousYear.alias) {
    env.EDARI_PREV_ENABLED = '1';
    env.EDARI_PREV_ALIAS = c.previousYear.alias;
    env.EDARI_PREV_MODE = c.previousYear.mode || c.mode;
    env.EDARI_PREV_SERVER = c.previousYear.server || c.server;
    env.EDARI_PREV_PORT = String(c.previousYear.port || c.port);
    env.EDARI_PREV_DATA_ROOT = c.previousYear.dataRoot || c.dataRoot;
    env.EDARI_PREV_DATABASE_PATH = c.previousYear.databasePath || '';
  } else {
    env.EDARI_PREV_ENABLED = '0';
  }
  return env;
}

module.exports = {
  DEFAULT_EDARI,
  getEdariConnection,
  getPreviousYearConnection,
  connectionToEnv,
  normalizeEdariConnection,
  suggestPreviousAlias,
  splitGluedYearAlias
};
