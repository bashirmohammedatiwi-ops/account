const path = require('path');
const { applyEdariSettingsToEnv } = require('./server-settings');

const portalDir = path.join(__dirname, '..');

function withEdariEnv(fn) {
  applyEdariSettingsToEnv();
  return fn();
}

function requireFresh(modPath) {
  const abs = path.isAbsolute(modPath) ? modPath : path.join(portalDir, modPath);
  try {
    delete require.cache[require.resolve(abs)];
  } catch (_) { /* ignore */ }
  return require(abs);
}

/**
 * pdf-export يحمّل خطوط Cairo/Roboto عند التحميل — إعادة تحميله في كل تصدير
 * كانت تكلّف ثواني لكل ملف. الوحدة ثابتة فلا داعي لتحديثها.
 */
let pdfExportModule = null;
function loadPdfExport() {
  if (!pdfExportModule) pdfExportModule = require('./pdf-export');
  return pdfExportModule;
}

async function postReceiptToEdari(payload = {}) {
  return withEdariEnv(async () => {
    const { postReceiptToEdari: post } = requireFresh('sync-client/post-receipt.js');
    const result = await post(payload);
    return { ok: true, ...result };
  });
}

async function postCustomerToEdari(payload = {}) {
  return withEdariEnv(async () => {
    const { postCustomerToEdari: post } = requireFresh('sync-client/post-customer.js');
    const result = await post(payload);
    return { ok: true, ...result };
  });
}

async function searchEdariAccounts(params = {}) {
  return withEdariEnv(async () => {
    const { searchEdariAccounts: search } = requireFresh('sync-client/search-edari-accounts.js');
    return search(params);
  });
}

async function searchEdariMaterialTrees(params = {}) {
  return withEdariEnv(async () => {
    const { searchEdariMaterialTrees: search } = requireFresh('sync-client/search-edari-material-trees.js');
    return search(params);
  });
}

async function queryEdariAccountStatements(params = {}) {
  return withEdariEnv(async () => {
    const { queryEdariAccountStatements: query } = requireFresh('sync-client/edari-account-statement.js');
    return query(params);
  });
}

async function exportEdariAccountStatementsPdf(params = {}) {
  const result = params.statements
    ? { statements: params.statements }
    : await queryEdariAccountStatements(params);
  const { buildAccountStatementsPdf } = loadPdfExport();
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
}

async function listEdariMaterialTreesLive() {
  return withEdariEnv(async () => {
    const { listMaterialTreeRoots } = requireFresh('sync-client/edari-sales-report.js');
    const trees = await listMaterialTreeRoots();
    return { ok: true, trees, count: trees.length };
  });
}

async function listEdariSalesBranchesLive(params = {}) {
  return withEdariEnv(async () => {
    const { listSalesBranches } = requireFresh('sync-client/edari-sales-report.js');
    const branches = await listSalesBranches(params);
    return { ok: true, branches };
  });
}

async function searchEdariSalesBranchesLive(params = {}) {
  return withEdariEnv(async () => {
    const { searchEdariSalesBranches } = requireFresh('sync-client/edari-sales-report.js');
    return searchEdariSalesBranches(params);
  });
}

/** نفس مسار الرئيسي (ODBC داخل العملية) — أسرع من subprocess ودقيق للأجهزة الثانوية. */
let edariSalesReportModule = null;
function loadEdariSalesReportModule() {
  if (!edariSalesReportModule) {
    edariSalesReportModule = require(path.join(portalDir, 'sync-client', 'edari-sales-report.js'));
  }
  return edariSalesReportModule;
}

async function listEdariTreesLive() {
  return withEdariEnv(async () => {
    const { listEdariTrees } = require(path.join(portalDir, 'sync-client', 'list-edari-trees.js'));
    const trees = await listEdariTrees();
    return { ok: true, trees, count: trees.length };
  });
}

async function queryEdariSalesReportLive(params = {}) {
  return withEdariEnv(async () => {
    const { queryEdariSalesReport } = loadEdariSalesReportModule();
    return queryEdariSalesReport(params);
  });
}

async function exportEdariSalesReportPdf(params = {}) {
  const report = params.report || await queryEdariSalesReportLive(params);
  const { buildTreeSalesReportPdf, buildTreeSalesReportSummaryPdf } = loadPdfExport();
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
}

async function lookupEdariMaterial(code) {
  return withEdariEnv(async () => {
    const { lookupEdariMaterial: lookup } = requireFresh('sync-client/material-lookup.js');
    const material = await lookup(String(code || '').trim());
    if (!material) return { ok: false, error: 'المادة غير موجودة في Edari' };
    return { ok: true, material };
  });
}

async function fetchEdariCatalogMaterials(codes = []) {
  return withEdariEnv(async () => {
    const { lookupEdariMaterialsByCodes } = requireFresh('sync-client/material-lookup.js');
    const rows = await lookupEdariMaterialsByCodes(Array.isArray(codes) ? codes : []);
    return { ok: true, rows, count: rows.length };
  });
}

async function fetchEdariMaterials() {
  return withEdariEnv(async () => {
    const { spawn } = require('child_process');
    const script = path.join(portalDir, 'sync-client', 'refresh-materials.js');
    const nodeBin = process.env.NODE_BIN || (process.platform === 'win32' ? 'node.exe' : 'node');
    const stdout = await new Promise((resolve, reject) => {
      let out = '';
      const child = spawn(nodeBin, [script], {
        cwd: portalDir,
        env: process.env,
        windowsHide: true
      });
      child.stdout.on('data', (d) => { out += d.toString(); });
      child.stderr.on('data', (d) => { out += d.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) return reject(new Error(out.trim() || `Refresh materials exit ${code}`));
        resolve(out);
      });
    });
    const line = stdout.split(/\r?\n/).reverse().find((row) => row.startsWith('@MATERIALS|'));
    if (!line) throw new Error('تعذّر قراءة المواد من Edari');
    const payload = JSON.parse(line.slice('@MATERIALS|'.length));
    return { ok: true, ...payload };
  });
}

async function testEdariConnection(edari = {}) {
  return withEdariEnv(async () => {
    const { getEdariConnection } = requireFresh('sync-client/edari-connection.js');
    const edariRoot = process.env.EDARI_READER_ROOT
      || path.join(portalDir, '..', 'edari-reader');
    const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
    const conn = getEdariConnection(edari);
    const result = await odbcBridge.testConnection(conn);
    if (result?.ok === false) {
      return { ok: false, error: result.error || 'فشل الاتصال' };
    }
    return { ok: true, message: 'تم الاتصال بقاعدة Edari بنجاح', alias: conn.alias };
  });
}

async function listEdariDatabases({ dataRoot } = {}) {
  return withEdariEnv(async () => {
    const edariRoot = process.env.EDARI_READER_ROOT
      || path.join(portalDir, '..', 'edari-reader');
    const scanner = require(path.join(edariRoot, 'lib', 'scanner'));
    const root = String(dataRoot || process.env.EDARI_DATA_ROOT || '').trim();
    if (!root) return { ok: false, error: 'مجلد Data مطلوب' };
    const databases = scanner.listDatabases(root);
    const aliases = typeof scanner.listAliases === 'function' ? scanner.listAliases(root) : [];
    return { ok: true, databases, aliases };
  });
}

async function runPriceAppSync(params = {}) {
  return withEdariEnv(async () => {
    const { spawn } = require('child_process');
    const script = path.join(portalDir, 'sync-client', 'price-app-sync.js');
    const nodeBin = process.env.NODE_BIN || (process.platform === 'win32' ? 'node.exe' : 'node');
    const syncTarget = String(params.serverUrl || process.env.PRICE_APP_SERVER || '').replace(/\/$/, '');
    const syncKey = params.syncKey || process.env.PRICE_SYNC_KEY || '';
    const syncMode = params.mode === 'full' ? 'full' : 'incremental';
    const syncStateFile = path.join(path.dirname(require('./server-settings').settingsPath()), 'price-sync-state.json');
    const args = [script, '--server', syncTarget];
    if (syncKey) args.push('--key', syncKey);
    args.push(syncMode === 'full' ? '--full' : '--incremental');

    const stdout = await new Promise((resolve, reject) => {
      let out = '';
      const child = spawn(nodeBin, args, {
        cwd: portalDir,
        env: {
          ...process.env,
          PRICE_APP_SERVER: syncTarget,
          PRICE_SYNC_KEY: syncKey,
          PRICE_SYNC_STATE_FILE: syncStateFile,
          POS_SQL_SERVER: params.posSqlServer || process.env.POS_SQL_SERVER || '',
          POS_SQL_DATABASE: params.posSqlDatabase || process.env.POS_SQL_DATABASE || '',
          POS_SQL_USER: params.posSqlUser || process.env.POS_SQL_USER || '',
          POS_SQL_PASSWORD: params.posSqlPassword || process.env.POS_SQL_PASSWORD || ''
        },
        windowsHide: true
      });
      child.stdout.on('data', (d) => { out += d.toString(); });
      child.stderr.on('data', (d) => { out += d.toString(); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) return reject(new Error(out.trim() || `Price sync exit ${code}`));
        resolve(out);
      });
    });
    const parsed = stdout.split(/\r?\n/).reverse().find((row) => row.trim().startsWith('@SYNC_RESULT|'));
    if (parsed) {
      try {
        const payload = JSON.parse(parsed.trim().slice('@SYNC_RESULT|'.length));
        return { ok: true, ...payload, log: stdout };
      } catch { /* fall through */ }
    }
    return { ok: true, log: stdout };
  });
}

module.exports = {
  postReceiptToEdari,
  postCustomerToEdari,
  searchEdariAccounts,
  searchEdariMaterialTrees,
  queryEdariAccountStatements,
  exportEdariAccountStatementsPdf,
  listEdariMaterialTreesLive,
  listEdariTreesLive,
  listEdariSalesBranchesLive,
  searchEdariSalesBranchesLive,
  queryEdariSalesReportLive,
  exportEdariSalesReportPdf,
  lookupEdariMaterial,
  fetchEdariCatalogMaterials,
  fetchEdariMaterials,
  testEdariConnection,
  listEdariDatabases,
  runPriceAppSync
};
