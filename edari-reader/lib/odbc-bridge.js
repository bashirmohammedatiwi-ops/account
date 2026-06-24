const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const config = require('./config');
const nxscriptBridge = require('./nxscript-bridge');

const execFileAsync = promisify(execFile);
const PS_SCRIPT = path.join(__dirname, '..', 'scripts', 'odbc-query.ps1');
/** Windows CreateProcess arg limit ~8191 — use temp file for larger ODBC payloads */
const PAYLOAD_FILE_THRESHOLD = 6000;

/** Remember the driver resolved by the first successful call so later calls skip the registry scan. */
let cachedDriver = null;
/** After ODBC trial expiry, skip slow failing ODBC attempts. */
let preferNxScript = false;

async function runPowerShell(payload) {
  const json = JSON.stringify(payload);
  let payloadArg = json;
  let tmpFile = null;

  if (json.length > PAYLOAD_FILE_THRESHOLD) {
    tmpFile = path.join(os.tmpdir(), `edari-odbc-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json, 'utf8');
    payloadArg = `@${tmpFile}`;
  }

  let stdout = '';
  let stderr = '';

  try {
    const out = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT, payloadArg],
      { maxBuffer: 50 * 1024 * 1024, windowsHide: true, encoding: 'utf8' }
    );
    stdout = out.stdout;
    stderr = out.stderr;
  } catch (err) {
    stdout = err.stdout || '';
    stderr = err.stderr || '';
    const parsed = tryParse(stdout);
    if (parsed?.ok) return parsed;
    throw new Error(parsed?.error || stderr || stdout || err.message || 'PowerShell query failed');
  } finally {
    if (tmpFile) {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  if (stderr && stderr.trim()) {
    const parsed = tryParse(stdout);
    if (parsed && parsed.ok === false) return parsed;
  }

  const result = tryParse(stdout);
  if (!result) {
    throw new Error(stderr || stdout || 'PowerShell returned invalid JSON');
  }
  if (result.ok && result.driver && !cachedDriver) {
    cachedDriver = result.driver;
  }
  return result;
}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function shouldUseNxscriptFallback(resultOrError) {
  const message = resultOrError?.error || resultOrError?.message || String(resultOrError || '');
  return nxscriptBridge.isTrialExpiredError(message)
    || /nexusdb odbc driver is not installed/i.test(message);
}

async function withNxscriptFallback(action, options, odbcFn) {
  if (preferNxScript) {
    return action(options);
  }

  try {
    const result = await odbcFn(options);
    if (result?.ok) return result;
    if (shouldUseNxscriptFallback(result)) {
      preferNxScript = true;
      return action(options);
    }
    return result;
  } catch (err) {
    if (shouldUseNxscriptFallback(err)) {
      preferNxScript = true;
      return action(options);
    }
    throw err;
  }
}

async function detectDrivers() {
  const odbc = await runPowerShell({ action: 'detectDrivers', candidates: config.odbcDriverCandidates });
  let nxAvailable = false;
  try {
    nxAvailable = await nxscriptBridge.isNxscriptBridgeAvailable();
  } catch {
    nxAvailable = false;
  }

  return {
    ...odbc,
    nxScriptBridge: nxAvailable,
    preferNxScript
  };
}

async function testConnection(options) {
  return withNxscriptFallback(
    nxscriptBridge.testConnectionViaNxscript,
    options,
    (opts) => runPowerShell({
      action: 'testConnection',
      ...opts,
      candidates: config.odbcDriverCandidates
    })
  );
}

async function runQuery(options) {
  const sql = String(options.sql || '').trim();
  if (!sql) {
    throw new Error('SQL query is required');
  }
  if (!/^\s*(select|with)\b/i.test(sql)) {
    throw new Error('Only SELECT queries are allowed for safety');
  }

  return withNxscriptFallback(
    nxscriptBridge.runQueryViaNxscript,
    options,
    (opts) => runPowerShell({
      action: 'query',
      ...opts,
      driver: opts.driver || cachedDriver || undefined,
      sql,
      candidates: config.odbcDriverCandidates
    })
  );
}

async function runBatchQuery(options) {
  const queries = Array.isArray(options.queries) ? options.queries : [];
  if (!queries.length) {
    throw new Error('At least one query is required');
  }
  for (const item of queries) {
    const sql = String(item?.sql || '').trim();
    if (!sql) throw new Error('Each batch query needs SQL');
    if (!/^\s*(select|with)\b/i.test(sql)) {
      throw new Error('Only SELECT queries are allowed for safety');
    }
  }

  if (preferNxScript) {
    const batch = {};
    for (const item of queries) {
      const id = String(item.id);
      const result = await nxscriptBridge.runQueryViaNxscript({ ...options, sql: item.sql });
      if (!result.ok) return result;
      batch[id] = {
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount
      };
    }
    return { ok: true, driver: 'nxServer (HTTP)', viaNxScript: true, results: batch };
  }

  try {
    const result = await runPowerShell({
      action: 'batchQuery',
      ...options,
      driver: options.driver || cachedDriver || undefined,
      queries,
      candidates: config.odbcDriverCandidates
    });
    if (result?.ok) return result;
    if (shouldUseNxscriptFallback(result)) {
      preferNxScript = true;
      return runBatchQuery(options);
    }
    return result;
  } catch (err) {
    if (shouldUseNxscriptFallback(err)) {
      preferNxScript = true;
      return runBatchQuery(options);
    }
    throw err;
  }
}

async function listSqlTables(options) {
  return withNxscriptFallback(
    nxscriptBridge.listTablesViaNxscript,
    options,
    (opts) => runPowerShell({
      action: 'listTables',
      ...opts,
      candidates: config.odbcDriverCandidates
    })
  );
}

module.exports = {
  detectDrivers,
  testConnection,
  runQuery,
  runBatchQuery,
  listSqlTables
};
