const fs = require('fs');
const path = require('path');
const config = require('./config');

const QUERY_SCRIPT = 'edari-query.nxscript';
const BUNDLED_SCRIPT = path.join(__dirname, '..', 'scripts', QUERY_SCRIPT);

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
  const candidates = [
    path.join(config.edariRoot, 'nx4.7505', 'Adminroot'),
    path.join(config.edariRoot, 'nxServer', 'Adminroot'),
    path.join(config.edariRoot, 'Adminroot')
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.nxscript'))) return dir;
  }
  return null;
}

function ensureQueryScriptDeployed() {
  const adminRoot = resolveAdminRoot();
  if (!adminRoot) return false;

  const target = path.join(adminRoot, QUERY_SCRIPT);
  if (!fs.existsSync(BUNDLED_SCRIPT)) return false;

  try {
    const bundled = fs.readFileSync(BUNDLED_SCRIPT, 'utf8');
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== bundled) {
      fs.writeFileSync(target, bundled, 'utf8');
    }
    return true;
  } catch {
    return false;
  }
}

function extractJsonBody(textOrBuffer) {
  let raw = '';
  if (Buffer.isBuffer(textOrBuffer)) {
    let buf = textOrBuffer;
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      buf = buf.subarray(3);
    }
    raw = buf.toString('utf8').trim();
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
  runQueryViaNxscript,
  testConnectionViaNxscript,
  listTablesViaNxscript
};
