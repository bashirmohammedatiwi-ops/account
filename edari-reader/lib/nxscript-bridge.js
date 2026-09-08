const fs = require('fs');
const path = require('path');
const config = require('./config');

const QUERY_SCRIPT = 'edari-query.nxscript';
const EXEC_SCRIPT = 'edari-exec.nxscript';
const AUTOINC_SCRIPT = 'edari-file12n-autoinc.nxscript';
const TREE_SCRIPT = 'edari-file11n-tree.nxscript';
const REPAIR_SCRIPT = 'edari-file12n-repair.nxscript';
const MAINT_KEY = 'edari-receipt-maint';
const BUNDLED_SCRIPT = path.join(__dirname, '..', 'scripts', QUERY_SCRIPT);
const BUNDLED_EXEC_SCRIPT = path.join(__dirname, '..', 'scripts', EXEC_SCRIPT);
const BUNDLED_AUTOINC_SCRIPT = path.join(__dirname, '..', 'scripts', AUTOINC_SCRIPT);
const BUNDLED_TREE_SCRIPT = path.join(__dirname, '..', 'scripts', TREE_SCRIPT);
const BUNDLED_REPAIR_SCRIPT = path.join(__dirname, '..', 'scripts', REPAIR_SCRIPT);

/** @type {boolean | null} */
let nxscriptAvailable = null;

function isTrialExpiredError(message) {
  const text = String(message || '');
  return /trial period has expired/i.test(text);
}

function resolveAdminRoot() {
  if (process.env.NX_ADMIN_ROOT && fs.existsSync(process.env.NX_ADMIN_ROOT)) {
    return process.env.NX_ADMIN_ROOT;
  }
  const dataRoot = process.env.EDARI_DATA_ROOT || config.dataRoot;
  const nxRoot = dataRoot ? path.dirname(dataRoot) : '';
  const candidates = [
    path.join(config.edariRoot, 'nx4.7505', 'Adminroot'),
    path.join(config.edariRoot, 'nxServer', 'Adminroot'),
    path.join(config.edariRoot, 'Adminroot'),
    nxRoot ? path.join(nxRoot, 'nx4.7505', 'Adminroot') : '',
    nxRoot ? path.join(nxRoot, 'nxServer', 'Adminroot') : '',
    nxRoot ? path.join(nxRoot, 'Adminroot') : ''
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.nxscript'))) return dir;
  }
  return null;
}
function ensureScriptDeployed(fileName, bundledPath) {
  const adminRoot = resolveAdminRoot();
  if (!adminRoot) return false;
  const target = path.join(adminRoot, fileName);
  if (!fs.existsSync(bundledPath)) return false;
  try {
    const bundled = fs.readFileSync(bundledPath, 'utf8');
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== bundled) {
      fs.writeFileSync(target, bundled, 'utf8');
    }
    return true;
  } catch {
    return false;
  }
}

function ensureQueryScriptDeployed() {
  return ensureScriptDeployed(QUERY_SCRIPT, BUNDLED_SCRIPT);
}

function ensureExecScriptDeployed() {
  return ensureScriptDeployed(EXEC_SCRIPT, BUNDLED_EXEC_SCRIPT);
}

function ensureAutoIncScriptDeployed() {
  return ensureScriptDeployed(AUTOINC_SCRIPT, BUNDLED_AUTOINC_SCRIPT);
}

function ensureTreeScriptDeployed() {
  return ensureScriptDeployed(TREE_SCRIPT, BUNDLED_TREE_SCRIPT);
}

function ensureRepairScriptDeployed() {
  return ensureScriptDeployed(REPAIR_SCRIPT, BUNDLED_REPAIR_SCRIPT);
}

function sqlToHex(sqlText) {
  return Buffer.from(String(sqlText || ''), 'latin1').toString('hex');
}

/** Windows-1256 high-byte map (0x80–0xFF) — Edari ANSI Arabic. */
const CP1256_HI = [
  0x20AC, 0x067E, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
  0x02C6, 0x2030, 0x0679, 0x2039, 0x0152, 0x0686, 0x0698, 0x0688,
  0x06AF, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
  0x06A9, 0x2122, 0x0691, 0x203A, 0x0153, 0x200C, 0x200D, 0x06BA,
  0x00A0, 0x060C, 0x00A2, 0x00A3, 0x00A4, 0x00A5, 0x00A6, 0x00A7,
  0x00A8, 0x00A9, 0x06BE, 0x00AB, 0x00AC, 0x00AD, 0x00AE, 0x00AF,
  0x00B0, 0x00B1, 0x00B2, 0x00B3, 0x00B4, 0x00B5, 0x00B6, 0x00B7,
  0x00B8, 0x00B9, 0x061B, 0x00BB, 0x00BC, 0x00BD, 0x00BE, 0x061F,
  0x06C1, 0x0621, 0x0622, 0x0623, 0x0624, 0x0625, 0x0626, 0x0627,
  0x0628, 0x0629, 0x062A, 0x062B, 0x062C, 0x062D, 0x062E, 0x062F,
  0x0630, 0x0631, 0x0632, 0x0633, 0x0634, 0x0635, 0x0636, 0x00D7,
  0x0637, 0x0638, 0x0639, 0x063A, 0x0640, 0x0641, 0x0642, 0x0643,
  0x00E0, 0x0644, 0x00E2, 0x0645, 0x0646, 0x0647, 0x0648, 0x00E7,
  0x00E8, 0x00E9, 0x00EA, 0x00EB, 0x0649, 0x064A, 0x00EE, 0x00EF,
  0x064B, 0x064C, 0x064D, 0x064E, 0x00F4, 0x064F, 0x0650, 0x00F7,
  0x0651, 0x00F9, 0x0652, 0x00FB, 0x00FC, 0x200E, 0x200F, 0x06D2
];

function decodeWin1256(buf) {
  let out = '';
  for (let i = 0; i < buf.length; i += 1) {
    const b = buf[i];
    out += b < 0x80 ? String.fromCharCode(b) : String.fromCharCode(CP1256_HI[b - 0x80]);
  }
  return out;
}

function countArabic(text) {
  return (String(text || '').match(/[\u0600-\u06FF]/g) || []).length;
}

function bufferToNxText(buf) {
  let slice = buf;
  if (slice.length >= 3 && slice[0] === 0xEF && slice[1] === 0xBB && slice[2] === 0xBF) {
    slice = slice.subarray(3);
  }
  const utf8 = slice.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  const win = decodeWin1256(slice);
  if (countArabic(win) > countArabic(utf8)) return win;
  return utf8;
}

function extractJsonBody(textOrBuffer) {
  let raw = '';
  if (Buffer.isBuffer(textOrBuffer)) {
    raw = bufferToNxText(textOrBuffer).trim();
  } else {
    raw = String(textOrBuffer || '').trim();
  }
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  if (!raw) return null;

  if (raw.startsWith('{')) {
    try {
      return JSON.parse(raw);
    } catch {
      /* fall through */
    }
  }

  const start = raw.indexOf('{"ok"');
  if (start >= 0) {
    const end = raw.lastIndexOf('}');
    if (end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function parseNxResponse(bodyBuf, fallbackMessage) {
  const parsed = extractJsonBody(bodyBuf);
  if (parsed) return parsed;
  const bodyText = bodyBuf.toString('utf8');
  const preMatch = bodyText.match(/<pre>([\s\S]*?)<\/pre>/i);
  const errText = preMatch
    ? preMatch[1].replace(/<BR>/gi, '\n').replace(/<[^>]+>/g, '').trim()
    : bodyText.trim();
  return {
    ok: false,
    error: errText || fallbackMessage,
    raw: bodyText.slice(0, 500)
  };
}

async function pingNxAdmin() {
  const response = await fetch(config.nexusAdminUrl, { signal: AbortSignal.timeout(4000) });
  return response.ok;
}

async function runQueryViaNxscript(options) {
  const sql = String(options.sql || '').trim();
  const alias = String(options.alias || '').trim();
  if (!sql) throw new Error('SQL query is required');
  if (!alias) throw new Error('Database alias is required for nxServer query bridge');

  if (!ensureQueryScriptDeployed()) {
    return {
      ok: false,
      error: 'Could not deploy edari-query.nxscript to nxServer Adminroot.',
      needsNxScript: true
    };
  }

  const url = `${config.nexusAdminUrl}/${QUERY_SCRIPT}?alias=${encodeURIComponent(alias)}&sql=${encodeURIComponent(sql)}`;

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(Number(options.timeoutMs) || 120000) });
  } catch (err) {
    return {
      ok: false,
      error: `nxServer admin unreachable (${config.nexusAdminUrl}): ${err.message}`,
      needsNxServer: true
    };
  }

  const bodyBuf = Buffer.from(await response.arrayBuffer());
  const parsed = extractJsonBody(bodyBuf);
  if (!parsed) {
    const bodyText = bodyBuf.toString('utf8');
    const preMatch = bodyText.match(/<pre>([\s\S]*?)<\/pre>/i);
    const errText = preMatch ? preMatch[1].replace(/<BR>/gi, '\n').trim() : bodyText.trim();
    return {
      ok: false,
      error: errText || 'nxServer query script returned invalid JSON. Ensure nxServer is running.',
      raw: bodyText.slice(0, 500)
    };
  }

  if (!parsed.ok) return parsed;

  const columns = parsed.columns || [];
  const rows = (parsed.rows || []).map((row) => {
    const item = {};
    for (let i = 0; i < columns.length; i += 1) {
      item[columns[i]] = row[i] ?? null;
    }
    return item;
  });

  return {
    ok: true,
    driver: 'nxServer (HTTP)',
    columns,
    rows,
    rowCount: parsed.rowCount ?? rows.length,
    viaNxScript: true
  };
}

async function testConnectionViaNxscript(options) {
  const alias = String(options.alias || '').trim();
  if (!alias) {
    return { ok: false, error: 'Database alias is required' };
  }

  try {
    await pingNxAdmin();
  } catch (err) {
    return {
      ok: false,
      error: `nxServer admin is offline (${config.nexusAdminUrl}): ${err.message}`,
      needsNxServer: true
    };
  }

  const result = await runQueryViaNxscript({
    alias,
    sql: 'SELECT TOP 1 * FROM #Tables',
    timeoutMs: options.timeoutMs || 30000
  });

  if (!result.ok) return result;

  return {
    ok: true,
    driver: 'nxServer (HTTP)',
    viaNxScript: true,
    sample: result
  };
}

async function listTablesViaNxscript(options) {
  const alias = String(options.alias || '').trim();
  const result = await runQueryViaNxscript({
    alias,
    sql: 'SELECT TABLE_NAME FROM #Tables',
    timeoutMs: options.timeoutMs || 60000
  });

  if (!result.ok) return result;

  const tables = (result.rows || [])
    .map((row) => row.TABLE_NAME || row.table_name)
    .filter(Boolean);

  return {
    ok: true,
    driver: 'nxServer (HTTP)',
    viaNxScript: true,
    tables
  };
}

async function runExecViaNxscript(options) {
  const sql = String(options.sql || '').trim();
  const alias = String(options.alias || '').trim();
  if (!sql) throw new Error('SQL query is required');
  if (!alias) throw new Error('Database alias is required for nxServer query bridge');
  if (!/^\s*INSERT\s+INTO\s+File1[12]n\b/i.test(sql)) {
    return { ok: false, error: 'Only INSERT INTO File11n or File12n is allowed' };
  }
  if (!ensureExecScriptDeployed()) {
    return {
      ok: false,
      error: 'Could not deploy edari-exec.nxscript to nxServer Adminroot.',
      needsNxScript: true
    };
  }

  const url = `${config.nexusAdminUrl}/${EXEC_SCRIPT}?alias=${encodeURIComponent(alias)}&sqlhex=${sqlToHex(sql)}`;
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(Number(options.timeoutMs) || 120000) });
  } catch (err) {
    return {
      ok: false,
      error: `nxServer admin unreachable (${config.nexusAdminUrl}): ${err.message}`,
      needsNxServer: true
    };
  }
  const bodyBuf = Buffer.from(await response.arrayBuffer());
  const parsed = extractJsonBody(bodyBuf);
  if (!parsed) {
    return parseNxResponse(bodyBuf, 'Invalid nxServer exec response');
  }
  return parsed;
}

async function runFile12nAutoIncViaNxscript(options) {
  const alias = String(options.alias || '').trim();
  const autoinc = Number(options.autoinc);
  if (!alias) throw new Error('Database alias is required for nxServer query bridge');
  if (!Number.isFinite(autoinc) || autoinc < 0) {
    return { ok: false, error: 'autoinc required' };
  }
  if (!ensureAutoIncScriptDeployed()) {
    return {
      ok: false,
      error: 'Could not deploy edari-file12n-autoinc.nxscript to nxServer Adminroot.',
      needsNxScript: true
    };
  }
  const table = String(options.table || 'File12n').trim();
  if (!/^File1[12]n$/i.test(table)) {
    return { ok: false, error: 'table not allowed' };
  }
  const q = new URLSearchParams({
    alias,
    key: MAINT_KEY,
    autoinc: String(autoinc),
    table
  });
  const url = `${config.nexusAdminUrl}/${AUTOINC_SCRIPT}?${q.toString()}`;
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(Number(options.timeoutMs) || 60000) });
  } catch (err) {
    return {
      ok: false,
      error: `nxServer admin unreachable (${config.nexusAdminUrl}): ${err.message}`,
      needsNxServer: true
    };
  }
  const bodyBuf = Buffer.from(await response.arrayBuffer());
  const parsed = extractJsonBody(bodyBuf);
  if (!parsed) return parseNxResponse(bodyBuf, 'Invalid nxServer autoinc response');
  return parsed;
}

async function runTreeRepairViaNxscript(options) {
  const alias = String(options.alias || '').trim();
  const seq = Number(options.seq);
  const subCount = Number(options.subCount);
  const subHex = String(options.subHex || '').trim();
  if (!alias) throw new Error('Database alias is required for nxServer query bridge');
  if (!Number.isFinite(seq) || seq <= 0) {
    return { ok: false, error: 'seq required' };
  }
  if (!Number.isFinite(subCount) || subCount < 0) {
    return { ok: false, error: 'subcount required' };
  }
  if (!ensureTreeScriptDeployed()) {
    return {
      ok: false,
      error: 'Could not deploy edari-file11n-tree.nxscript to nxServer Adminroot.',
      needsNxScript: true
    };
  }
  const q = new URLSearchParams({
    alias,
    key: MAINT_KEY,
    seq: String(seq),
    subcount: String(subCount)
  });
  if (subHex) q.set('subhex', subHex);
  const url = `${config.nexusAdminUrl}/${TREE_SCRIPT}?${q.toString()}`;
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(Number(options.timeoutMs) || 60000) });
  } catch (err) {
    return {
      ok: false,
      error: `nxServer admin unreachable (${config.nexusAdminUrl}): ${err.message}`,
      needsNxServer: true
    };
  }
  const bodyBuf = Buffer.from(await response.arrayBuffer());
  const parsed = extractJsonBody(bodyBuf);
  if (!parsed) return parseNxResponse(bodyBuf, 'Invalid nxServer tree repair response');
  return parsed;
}

async function runFile12nRepairViaNxscript(options) {
  const alias = String(options.alias || '').trim();
  const seq = Number(options.seq);
  const day = Number(options.day);
  const month = Number(options.month);
  const year = Number(options.year);
  const equal = Number(options.equal ?? 1);
  if (!alias) throw new Error('Database alias is required for nxServer query bridge');
  if (!Number.isFinite(seq) || seq <= 0) {
    return { ok: false, error: 'seq required' };
  }
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return { ok: false, error: 'day, month, year required' };
  }
  if (!ensureRepairScriptDeployed()) {
    return {
      ok: false,
      error: 'Could not deploy edari-file12n-repair.nxscript to nxServer Adminroot.',
      needsNxScript: true
    };
  }
  const q = new URLSearchParams({
    alias,
    key: MAINT_KEY,
    seq: String(seq),
    day: String(day),
    month: String(month),
    year: String(year),
    equal: String(Number.isFinite(equal) ? equal : 1)
  });
  const url = `${config.nexusAdminUrl}/${REPAIR_SCRIPT}?${q.toString()}`;
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(Number(options.timeoutMs) || 60000) });
  } catch (err) {
    return {
      ok: false,
      error: `nxServer admin unreachable (${config.nexusAdminUrl}): ${err.message}`,
      needsNxServer: true
    };
  }
  const bodyBuf = Buffer.from(await response.arrayBuffer());
  const parsed = extractJsonBody(bodyBuf);
  if (!parsed) return parseNxResponse(bodyBuf, 'Invalid nxServer File12n repair response');
  return parsed;
}

async function isNxscriptBridgeAvailable() {
  if (nxscriptAvailable !== null) return nxscriptAvailable;
  try {
    await pingNxAdmin();
    nxscriptAvailable = ensureQueryScriptDeployed();
  } catch {
    nxscriptAvailable = false;
  }
  return nxscriptAvailable;
}

module.exports = {
  isTrialExpiredError,
  isNxscriptBridgeAvailable,
  ensureQueryScriptDeployed,
  ensureExecScriptDeployed,
  ensureAutoIncScriptDeployed,
  ensureTreeScriptDeployed,
  runQueryViaNxscript,
  runExecViaNxscript,
  runFile12nAutoIncViaNxscript,
  runFile12nRepairViaNxscript,
  runTreeRepairViaNxscript,
  testConnectionViaNxscript,
  listTablesViaNxscript
};
