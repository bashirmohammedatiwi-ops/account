const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const config = require('./config');

const execFileAsync = promisify(execFile);
const PS_SCRIPT = path.join(__dirname, '..', 'scripts', 'odbc-query.ps1');
/** Windows CreateProcess arg limit ~8191 — use temp file for larger ODBC payloads */
const PAYLOAD_FILE_THRESHOLD = 6000;

/** Remember the driver resolved by the first successful call so later calls skip the registry scan. */
let cachedDriver = null;

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

async function detectDrivers() {
  return runPowerShell({ action: 'detectDrivers', candidates: config.odbcDriverCandidates });
}

async function testConnection(options) {
  return runPowerShell({
    action: 'testConnection',
    ...options,
    candidates: config.odbcDriverCandidates
  });
}

async function runQuery(options) {
  const sql = String(options.sql || '').trim();
  if (!sql) {
    throw new Error('SQL query is required');
  }
  if (!/^\s*(select|with)\b/i.test(sql)) {
    throw new Error('Only SELECT queries are allowed for safety');
  }

  return runPowerShell({
    action: 'query',
    ...options,
    driver: options.driver || cachedDriver || undefined,
    sql,
    candidates: config.odbcDriverCandidates
  });
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

  return runPowerShell({
    action: 'batchQuery',
    ...options,
    driver: options.driver || cachedDriver || undefined,
    queries,
    candidates: config.odbcDriverCandidates
  });
}

async function listSqlTables(options) {
  return runPowerShell({
    action: 'listTables',
    ...options,
    candidates: config.odbcDriverCandidates
  });
}

module.exports = {
  detectDrivers,
  testConnection,
  runQuery,
  runBatchQuery,
  listSqlTables
};
