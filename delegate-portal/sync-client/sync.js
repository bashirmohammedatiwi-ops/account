/**
 * Local sync client — reads EdariNX via ODBC and pushes to delegate portal server.
 * Usage: node sync-client/sync.js [--server URL] [--key KEY] [--trees seq1,seq2]
 *        node sync-client/sync.js --list-trees
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const {
  assignBillNosForLines,
  chunkInvoiceLinesByBill,
  isActiveInvoiceLineRow,
  resolveLineTotal
} = require(path.join(__dirname, '..', 'lib', 'invoice-line-sync'));
const edariRoot = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const { getEdariConnection, getPreviousYearConnection } = require('./edari-connection');

const SERVER_ARG = process.argv.includes('--server')
  ? process.argv[process.argv.indexOf('--server') + 1]
  : (process.env.SYNC_SERVER || 'http://187.124.23.65:5005');

/**
 * `--server` accepts a comma-separated list so one Edari read can feed both the
 * LAN server and the internet server. Uploads run sequentially per target.
 */
const SYNC_TARGETS = [...new Set(
  String(SERVER_ARG).split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)
)];

let SERVER = SYNC_TARGETS[0] || '';

const SYNC_KEY = process.argv.includes('--key')
  ? process.argv[process.argv.indexOf('--key') + 1]
  : (process.env.SYNC_API_KEY || 'edari-sync-local-key-2025');

const QUERY_IN_CHUNK = 300;
const UPLOAD_BATCH = {
  accounts: 400,
  journal: 800,
  invoices: 250,
  invoiceLines: 800,
  products: 400
};
const SKIP_PRODUCTS = process.env.SYNC_SKIP_PRODUCTS !== '0'
  && !process.argv.includes('--with-products');

const ACCOUNT_COLS = [
  'Seq', 'Num', 'Name1', 'Name2', 'Master', 'SubCount', 'Bal', 'Tot1', 'Tot2',
  'Address', 'Remarks', 'OfficialName', 'FixDate', 'FixBal'
].map((c) => `"${c}"`).join(', ');

const { isReconciliationMovement } = require('../lib/reconciliation-utils');

async function query(sql, timeoutMs = 120000, conn = null) {
  const r = await odbcBridge.runQuery({ ...(conn || getEdariConnection()), sql, timeoutMs });
  if (!r.ok) throw new Error(r.error || 'Query failed');
  return r.rows;
}

function sqlIdList(ids) {
  return [...new Set((ids || []).map((id) => String(id).replace(/[^0-9]/g, '')).filter(Boolean))].join(',');
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function reportProgress(step, totalSteps, pct, message) {
  const safePct = Math.max(0, Math.min(100, Math.round(pct)));
  console.log(`@PROGRESS|${step}|${totalSteps}|${safePct}|${message}`);
}

function parseArgvFlag(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : '';
}

function parseTreeSeqs() {
  const fromArg = parseArgvFlag('--trees');
  if (fromArg) {
    return fromArg.split(',').map((s) => s.replace(/[^0-9]/g, '')).filter(Boolean);
  }
  if (process.env.SYNC_TREE_SEQS) {
    return process.env.SYNC_TREE_SEQS.split(',').map((s) => s.replace(/[^0-9]/g, '')).filter(Boolean);
  }
  return [];
}

function accountSeq(row) {
  return String(row.Seq ?? row.seq ?? '').replace(/[^0-9]/g, '');
}

/** Flatten ODBC/driver values that sometimes arrive as objects. */
function fieldText(v, depth = 0) {
  if (v == null) return '';
  if (typeof v === 'string') {
    const s = v.trim();
    return (!s || s === '[object Object]') ? '' : s;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Buffer.isBuffer(v)) return v.toString('utf8').trim();
  if (typeof v === 'object' && depth < 4) {
    if (Array.isArray(v)) {
      return v.map((x) => fieldText(x, depth + 1)).filter(Boolean).join(' ').trim();
    }
    const nested = v.value ?? v.Value ?? v.name1 ?? v.Name1 ?? v.name ?? v.Name
      ?? v.label ?? v.text ?? v.data ?? v.Data;
    if (nested != null && nested !== v) return fieldText(nested, depth + 1);
  }
  return '';
}

function buildChildrenMap(accounts) {
  const children = new Map();
  for (const a of accounts) {
    const seq = accountSeq(a);
    const master = String(a.Master ?? a.master ?? '0').replace(/[^0-9]/g, '') || '0';
    if (!children.has(master)) children.set(master, []);
    children.get(master).push(seq);
  }
  return children;
}

function collectDescendantSeqs(rootSeq, children) {
  const root = String(rootSeq).replace(/[^0-9]/g, '');
  const out = new Set([root]);
  const queue = [root];
  while (queue.length) {
    const seq = queue.shift();
    for (const kid of children.get(seq) || []) {
      if (!out.has(kid)) {
        out.add(kid);
        queue.push(kid);
      }
    }
  }
  return out;
}

function filterAccountsByTrees(allAccounts, treeSeqs) {
  if (!treeSeqs.length) {
    throw new Error('حدد شجرة واحدة على الأقل للرفع');
  }
  const children = buildChildrenMap(allAccounts);
  const allowed = new Set();
  for (const root of treeSeqs) {
    for (const seq of collectDescendantSeqs(root, children)) allowed.add(seq);
  }
  return allAccounts.filter((a) => allowed.has(accountSeq(a)));
}

async function fetchAccountsBySeqs(seqs) {
  const out = [];
  for (const part of chunk(seqs, QUERY_IN_CHUNK)) {
    const ids = sqlIdList(part);
    if (!ids) continue;
    out.push(...await query(`SELECT ${ACCOUNT_COLS} FROM File11n WHERE Seq IN (${ids})`));
  }
  return out;
}

async function fetchChildAccounts(masterSeqs) {
  const out = [];
  for (const part of chunk(masterSeqs, QUERY_IN_CHUNK)) {
    const ids = sqlIdList(part);
    if (!ids) continue;
    out.push(...await query(`SELECT ${ACCOUNT_COLS} FROM File11n WHERE Master IN (${ids})`));
  }
  return out;
}

async function fetchAccountsForTrees(treeSeqs) {
  if (!treeSeqs.length) throw new Error('حدد شجرة واحدة على الأقل للرفع');
  const bySeq = new Map();
  const roots = await fetchAccountsBySeqs(treeSeqs);
  for (const row of roots) {
    const seq = accountSeq(row);
    if (seq) bySeq.set(seq, row);
  }
  let frontier = [...bySeq.keys()];
  let depth = 0;
  while (frontier.length && depth < 24) {
    depth += 1;
    const kids = await fetchChildAccounts(frontier);
    const next = [];
    for (const row of kids) {
      const seq = accountSeq(row);
      if (!seq || bySeq.has(seq)) continue;
      bySeq.set(seq, row);
      next.push(seq);
    }
    frontier = next;
    reportProgress(1, 7, Math.min(95, 15 + bySeq.size), `قراءة الشجرة: ${bySeq.size} حساب`);
  }
  if (!bySeq.size) {
    throw new Error('تعذّر إيجاد الشجرات المحددة في الإداري');
  }
  return [...bySeq.values()];
}

function isDebitRow(row) {
  const dept = row.Dept ?? row.is_debit;
  return dept === 'True' || dept === true || dept === 1 || dept === '1';
}

function normalizeBillSeq(value) {
  const seq = String(value ?? '').replace(/[^0-9]/g, '');
  return seq && seq !== '0' ? seq : '';
}

function normalizeBillNum(value) {
  const num = String(value ?? '').replace(/[^0-9]/g, '');
  return num && num !== '0' ? num : '';
}

function extractBillNumFromText(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  const patterns = [
    /(?:مردود|مرتجع)\s*(?:مبيعات\s*)?(?:بال)?(?:فات?[او]?رة?\s*)?(\d+)/i,
    /(?:فات?[او]?رة?|فت?[او]?رة?)\s*(\d+)/i,
    /(?:invoice|bill)\s*#?\s*(\d+)/i,
    /(\d+)\s*[-–—]?\s*$/
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return normalizeBillNum(m[1]);
  }
  return '';
}

function hasInvoiceRef(row) {
  if (normalizeBillSeq(row.BillSeq ?? row.bill_seq)) return true;
  if (normalizeBillNum(row.BillNum ?? row.bill_num)) return true;
  return Boolean(extractBillNumFromText(row.Exp1 ?? row.exp1));
}

function isSalesInvoiceMovement(row) {
  return isDebitRow(row) && hasInvoiceRef(row);
}

async function getJson(urlPath, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${SERVER}${urlPath}`, {
      method: 'GET',
      headers: { 'X-Sync-Key': SYNC_KEY },
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(text || `HTTP ${res.status}`);
    }
    const data = JSON.parse(text);
    if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('انتهت مهلة الاتصال بالسيرفر');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(urlPath, body, timeoutMs = 600000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${SERVER}${urlPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Key': SYNC_KEY
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(text.includes('Cannot POST') || res.status === 404
        ? `HTTP ${res.status} Not Found`
        : (text || `HTTP ${res.status}`));
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`استجابة غير صالحة من السيرفر (${res.status})`);
    }
    if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('انتهت مهلة الاتصال بالسيرفر — حاول مرة أخرى');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function isRetryableSyncError(err) {
  const message = String(err?.message || err);
  if (/401|403|404|Not Found|غير صالح|حدد شجرة/i.test(message)) return false;
  return true;
}

async function postJsonWithRetry(urlPath, body, retries = 5, timeoutMs = 180000) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await postJson(urlPath, body, timeoutMs);
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isRetryableSyncError(err)) {
        const waitMs = Math.min(15000, 1500 * (2 ** (attempt - 1)));
        reportProgress(6, 7, 0, `انقطع الرفع — إعادة المحاولة ${attempt}/${retries - 1} بعد ${Math.round(waitMs / 1000)} ث`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

async function fetchAllJournal(accSeqs, conn = null) {
  if (!accSeqs.length) return [];
  const all = [];
  const parts = chunk(accSeqs, QUERY_IN_CHUNK);
  let done = 0;
  for (const part of parts) {
    const ids = sqlIdList(part);
    if (!ids) continue;
    const rows = await query(
      `SELECT Seq, Acc, "Date", Am, Dept, Exp1, Exp2, Remarks, BillNum, BillSeq, BillKind FROM File12n
       WHERE Acc IN (${ids})
       ORDER BY Acc, "Date", Seq`,
      180000,
      conn
    );
    all.push(...rows);
    done += part.length;
    const pct = Math.round((done / accSeqs.length) * 100);
    reportProgress(2, 7, pct, `حركات الحساب: ${all.length} (${done}/${accSeqs.length} حساب)`);
  }
  return all;
}

function isPrevYearOnlySync() {
  return process.env.SYNC_PREV_YEAR_ONLY === '1' || process.argv.includes('--prev-year-only');
}

function pyId(alias, raw) {
  const n = String(raw ?? '').replace(/[^0-9]/g, '');
  return n && n !== '0' ? `PY${alias}:${n}` : '';
}

async function mapPreviousYearAccounts(currentAccounts) {
  const prev = getPreviousYearConnection();
  if (!prev) throw new Error('السنة السابقة غير مربوطة في الإعدادات');
  const current = getEdariConnection();
  if (prev.alias && current.alias && prev.alias === current.alias) {
    throw new Error('قاعدة السنة السابقة هي نفسها الحالية');
  }

  const nums = [...new Set(
    currentAccounts.map((a) => String(a.Num ?? a.num ?? '').trim()).filter(Boolean)
  )];
  if (!nums.length) throw new Error('لا توجد أرقام حسابات لربط السنة السابقة');

  reportProgress(2, 7, 0, `قراءة حسابات السنة السابقة (${prev.alias})...`);
  const prevAccounts = [];
  for (const part of chunk(nums, QUERY_IN_CHUNK)) {
    const quoted = part.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
    if (!quoted) continue;
    const rows = await query(
      `SELECT Seq, Num FROM File11n WHERE Num IN (${quoted})`,
      60000,
      prev
    );
    prevAccounts.push(...(rows || []));
  }
  const numToCurrent = new Map();
  for (const a of currentAccounts) {
    const num = String(a.Num ?? a.num ?? '').trim();
    const seq = accountSeq(a);
    if (num && seq) numToCurrent.set(num, seq);
  }
  const prevSeqToCurrent = new Map();
  for (const row of prevAccounts || []) {
    const cur = numToCurrent.get(String(row.Num ?? '').trim());
    const prevSeq = accountSeq(row);
    if (cur && prevSeq) prevSeqToCurrent.set(prevSeq, cur);
  }
  return { prev, prevSeqToCurrent };
}

async function fetchPreviousYearBundle(currentAccounts) {
  const { prev, prevSeqToCurrent } = await mapPreviousYearAccounts(currentAccounts);
  const prevSeqs = [...prevSeqToCurrent.keys()];
  if (!prevSeqs.length) throw new Error('تعذّر مطابقة حسابات السنة السابقة بأرقام السنة الحالية');

  reportProgress(2, 7, 20, `قراءة حركات السنة السابقة ${prev.alias}...`);
  const rawJournal = await fetchAllJournal(prevSeqs, prev);
  reportProgress(2, 7, 70, `حركات السنة السابقة: ${rawJournal.length}`);

  const billSeqs = await resolveBillSeqsFromJournal(rawJournal, prev);
  reportProgress(3, 7, 0, `قراءة ${billSeqs.length} فاتورة من السنة السابقة...`);
  const rawInvoices = await fetchInvoices(billSeqs, prev);
  reportProgress(3, 7, 100, `فواتير السنة السابقة: ${rawInvoices.length}`);

  reportProgress(4, 7, 0, 'قراءة بنود فواتير السنة السابقة...');
  const rawLines = await fetchInvoiceLines(billSeqs, prev);
  reportProgress(4, 7, 100, `بنود السنة السابقة: ${rawLines.length}`);

  const journal = rawJournal.map((row) => {
    const prevAcc = String(row.Acc ?? row.acc ?? '').replace(/[^0-9]/g, '');
    const currentAcc = prevSeqToCurrent.get(prevAcc);
    const origSeq = pyId(prev.alias, row.Seq ?? row.seq);
    if (!currentAcc || !origSeq) return null;
    const origBill = pyId(prev.alias, row.BillSeq ?? row.bill_seq);
    return {
      ...row,
      Seq: origSeq,
      Acc: currentAcc,
      BillSeq: origBill || row.BillSeq || '',
      Exp2: String(row.Exp2 ?? row.exp2 ?? '').trim() || `سنة ${prev.alias}`
    };
  }).filter(Boolean);

  const invoices = rawInvoices.map((inv) => {
    const orig = pyId(prev.alias, inv.Seq ?? inv.seq);
    if (!orig) return null;
    const prevTwo = String(inv.Two ?? inv.acc_seq ?? '').replace(/[^0-9]/g, '');
    return {
      ...inv,
      Seq: orig,
      Two: prevSeqToCurrent.get(prevTwo) || inv.Two
    };
  }).filter(Boolean);

  const invoiceLines = rawLines.map((line) => {
    const bill = pyId(prev.alias, line.BillSeq ?? line.bill_seq);
    if (!bill) return null;
    return { ...line, BillSeq: bill };
  }).filter(Boolean);

  return { journal, invoices, invoiceLines, alias: prev.alias };
}

function lastMatchMapFromJournal(journal = []) {
  const map = new Map();
  for (const row of journal) {
    if (String(row.Seq ?? row.seq ?? '').startsWith('PY')) continue;
    if (!isReconciliationMovement(row)) continue;
    const acc = String(row.Acc ?? row.acc ?? '').replace(/[^0-9]/g, '');
    if (!acc) continue;
    const next = {
      LastMatchSeq: String(row.Seq ?? row.seq ?? ''),
      LastMatchDate: row.Date || row.date || ''
    };
    const prev = map.get(acc);
    if (!prev) {
      map.set(acc, next);
      continue;
    }
    const newerDate = String(next.LastMatchDate) > String(prev.LastMatchDate);
    const sameDateNewer = String(next.LastMatchDate) === String(prev.LastMatchDate)
      && Number(next.LastMatchSeq || 0) > Number(prev.LastMatchSeq || 0);
    if (newerDate || sameDateNewer) map.set(acc, next);
  }
  return map;
}

function enrichAccountsWithMatchInfo(accounts, lastMatchMap) {
  return accounts.map((account) => {
    const seq = accountSeq(account);
    const match = lastMatchMap.get(seq);
    if (!match) return account;
    return { ...account, ...match };
  });
}

function collectBillSeqs(journal) {
  const seqs = new Set();
  const nums = new Set();
  for (const row of journal) {
    const seq = normalizeBillSeq(row.BillSeq ?? row.bill_seq);
    if (seq) {
      seqs.add(seq);
      continue;
    }
    const num = normalizeBillNum(row.BillNum ?? row.bill_num) || extractBillNumFromText(row.Exp1 ?? row.exp1);
    if (num) nums.add(num);
  }
  return { seqs, nums };
}

async function lookupBillSeqsByNums(nums, conn = null) {
  const map = new Map();
  if (!nums.length) return map;
  for (const part of chunk(nums, 120)) {
    const list = part.join(',');
    const rows = await query(`SELECT Seq, Num FROM File15n WHERE Num IN (${list})`, 120000, conn);
    for (const row of rows) {
      map.set(String(row.Num), String(row.Seq));
    }
  }
  return map;
}

async function resolveBillSeqsFromJournal(journal, conn = null) {
  const { seqs, nums } = collectBillSeqs(journal);
  const resolved = new Set(seqs);
  if (nums.size) {
    const byNum = await lookupBillSeqsByNums([...nums], conn);
    for (const seq of byNum.values()) resolved.add(seq);
  }
  return [...resolved];
}

async function fetchInvoices(billSeqs, conn = null) {
  if (!billSeqs.length) return [];
  const all = [];
  const parts = chunk(billSeqs, QUERY_IN_CHUNK);
  for (let i = 0; i < parts.length; i++) {
    const ids = sqlIdList(parts[i]);
    if (!ids) continue;
    const rows = await query(
      `SELECT Seq, Num, Kind, "Date", Total, Payment, DisCnt, "count", Two, remarks FROM File15n WHERE Seq IN (${ids})`,
      180000,
      conn
    );
    all.push(...rows);
    const pct = Math.round(((i + 1) / parts.length) * 100);
    reportProgress(3, 7, pct, `فواتير بيع: ${all.length}/${billSeqs.length}`);
  }
  return all;
}

async function fetchMaterialMap(matSeqs, conn = null) {
  const map = new Map();
  if (!matSeqs.length) return map;
  for (const part of chunk(matSeqs, QUERY_IN_CHUNK)) {
    const ids = sqlIdList(part);
    if (!ids) continue;
    const rows = await query(
      `SELECT Seq, Num, Name1 FROM File13n WHERE Seq IN (${ids})`,
      120000,
      conn
    );
    for (const row of rows) {
      map.set(String(row.Seq), { num: String(row.Num || ''), name1: row.Name1 || '' });
    }
  }
  return map;
}

async function fetchInvoiceLineRows(ids, conn = null) {
  const baseCols = 'BillSeq, BillNo, Mat, MatName, Quant, Price, OBonus, MatRem, Kind';
  const withSum = `${baseCols}, Sum`;
  try {
    return await query(`SELECT ${withSum} FROM file14n WHERE BillSeq IN (${ids}) ORDER BY BillSeq, BillNo`, 180000, conn);
  } catch {
    return await query(`SELECT ${baseCols} FROM file14n WHERE BillSeq IN (${ids}) ORDER BY BillSeq, BillNo`, 180000, conn);
  }
}

async function fetchInvoiceLines(billSeqs, conn = null) {
  if (!billSeqs.length) return [];
  const all = [];
  const parts = chunk(billSeqs, QUERY_IN_CHUNK);
  for (let i = 0; i < parts.length; i++) {
    const ids = sqlIdList(parts[i]);
    if (!ids) continue;
    const rows = await fetchInvoiceLineRows(ids, conn);
    all.push(...rows);
    const pct = Math.round(((i + 1) / parts.length) * 100);
    reportProgress(4, 7, pct, `بنود الفواتير: ${all.length} (${i + 1}/${parts.length})`);
  }

  const missingNameMats = [...new Set(
    all
      .map((line) => String(line.Mat || '').replace(/[^0-9]/g, ''))
      .filter(Boolean)
  )];

  let materials = new Map();
  if (missingNameMats.length) {
    reportProgress(4, 7, 95, `جلب بيانات ${missingNameMats.length} مادة...`);
    materials = await fetchMaterialMap(missingNameMats, conn);
  }

  return assignBillNosForLines(all.map((line) => {
    const mat = materials.get(String(line.Mat));
    return {
      ...line,
      MatNum: mat?.num || '',
      MatName: (line.MatName || '').trim() || mat?.name1 || '',
      line_total: resolveLineTotal(line)
    };
  })).filter(isActiveInvoiceLineRow);
}

async function fetchAllProducts() {
  reportProgress(5, 7, 0, 'جاري قراءة شجرة المواد من EdariNX...');
  const rows = await query(`
    SELECT Seq, Num, Name1, Name2, Barcode, SellPr1, SellPr2, SellPr3, SellPr4, SellPr5, Unt1, DefUnit, Bonus, Remarks, InTot, OutTot, Father, SubCount
    FROM File13n ORDER BY Num
  `);
  reportProgress(5, 7, 100, `تم: ${rows.length} عقدة مواد`);
  return rows;
}

function mergeMaterialRows(primary = [], overlay = []) {
  const bySeq = new Map();
  for (const row of primary) bySeq.set(String(row.Seq ?? row.seq ?? ''), row);
  for (const row of overlay) {
    const key = String(row.Seq ?? row.seq ?? '');
    if (key) bySeq.set(key, row);
  }
  return [...bySeq.values()];
}

/** Live Edari lookup for catalog products already on the server (prices/qty for /m). */
async function fetchCatalogMaterialsForSync() {
  let codes = [];
  try {
    const data = await getJson('/api/sync/catalog-product-codes');
    codes = data.codes || [];
  } catch {
    return [];
  }
  if (!codes.length) return [];

  reportProgress(5, 7, 85, `تحديث ${codes.length} منتج كتalog من Edari...`);
  const { lookupEdariMaterialsByCodes } = require('./material-lookup');
  return lookupEdariMaterialsByCodes(codes);
}

function syncScope() {
  return isPrevYearOnlySync() ? 'previous-year' : 'current';
}

async function uploadLegacy(payload, accountSeqs = []) {
  reportProgress(6, 7, 50, 'رفع دفعة واحدة (وضع قديم)...');
  const data = await postJson('/api/sync/push', { ...payload, accountSeqs, scope: syncScope() }, 900000);
  reportProgress(7, 7, 100, 'اكتمل الرفع');
  return data;
}

async function uploadChunked(payload, accountSeqs = []) {
  const stats = {
    accounts: payload.accounts.length,
    journal: payload.journal.length,
    invoices: payload.invoices.length,
    invoiceLines: payload.invoiceLines.length,
    products: payload.products.length
  };

  reportProgress(6, 7, 0, 'بدء الرفع إلى السيرفر...');
  let start;
  try {
    start = await postJsonWithRetry('/api/sync/start', {
      accountSeqs,
      purge: false,
      replace: false,
      scope: syncScope(),
      preservePreviousYear: true,
      refreshCurrent: syncScope() === 'current'
    }, 4, 60000);
  } catch (err) {
    if (/404|Cannot POST|Not Found/i.test(err.message)) {
      return uploadLegacy(payload, accountSeqs);
    }
    throw err;
  }
  const syncId = start.syncId;

  const uploadPlan = [
    { kind: 'accounts', rows: payload.accounts, batchSize: UPLOAD_BATCH.accounts, label: 'حسابات' },
    { kind: 'journal', rows: payload.journal, batchSize: UPLOAD_BATCH.journal, label: 'حركات' },
    { kind: 'invoices', rows: payload.invoices, batchSize: UPLOAD_BATCH.invoices, label: 'فواتير' },
    { kind: 'invoiceLines', rows: payload.invoiceLines, batchSize: UPLOAD_BATCH.invoiceLines, label: 'بنود' },
    { kind: 'products', rows: payload.products, batchSize: UPLOAD_BATCH.products, label: 'منتجات' }
  ];

  const jobs = [];
  for (const item of uploadPlan) {
    if (!item.rows.length) continue;
    const parts = item.kind === 'invoiceLines'
      ? chunkInvoiceLinesByBill(item.rows, item.batchSize)
      : chunk(item.rows, item.batchSize);
    for (let i = 0; i < parts.length; i++) {
      jobs.push({ ...item, part: parts[i], index: i + 1, total: parts.length });
    }
  }

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const pct = jobs.length ? Math.round(((i + 1) / jobs.length) * 100) : 100;
    reportProgress(
      6,
      7,
      pct,
      `رفع ${job.label}: ${job.index}/${job.total} (${job.part.length} سجل)`
    );
    await postJsonWithRetry('/api/sync/chunk', {
      syncId,
      kind: job.kind,
      rows: job.part,
      batch: job.index,
      totalBatches: job.total
    }, 5, 180000);
  }

  reportProgress(7, 7, 100, 'جاري إنهاء المزامنة...');
  const source = String(process.env.SYNC_SOURCE || '').trim();
  return postJsonWithRetry('/api/sync/finish', {
    syncId,
    stats: source ? { ...stats, source } : stats
  });
}

async function listEdariTrees() {
  const { listEdariTrees: listLive } = require('./list-edari-trees');
  return listLive();
}

async function listEdariMaterialTrees() {
  const rows = await query(`
    SELECT Seq, Num, Name1, SubCount, Father
    FROM File13n WHERE SubCount > 0 ORDER BY Num
  `);
  return rows.map((r) => ({
    seq: String(r.Seq ?? ''),
    num: String(r.Num || ''),
    name1: r.Name1 || '',
    sub_count: Number(r.SubCount || 0),
    subCount: Number(r.SubCount || 0),
    father_num: String(r.Father || '0')
  }));
}

async function main() {
  const treeSeqs = parseTreeSeqs();
  if (!treeSeqs.length) {
    throw new Error('حدد شجرة واحدة على الأقل للرفع');
  }

  reportProgress(1, 7, 0, `جاري قراءة ${treeSeqs.length} شجرة من EdariNX...`);
  const accounts = await fetchAccountsForTrees(treeSeqs);
  reportProgress(1, 7, 100, `تم: ${accounts.length} حساب (${treeSeqs.length} شجرة)`);

  const leafSeqs = accounts
    .filter((a) => Number(a.SubCount ?? a.sub_count) === 0)
    .map((a) => accountSeq(a));
  const journalSeqs = [...new Set([...treeSeqs.map((s) => String(s).replace(/[^0-9]/g, '')), ...leafSeqs].filter(Boolean))];

  const prevYearOnly = isPrevYearOnlySync();
  let journal = [];
  let invoices = [];
  let invoiceLines = [];

  if (prevYearOnly) {
    reportProgress(2, 7, 0, 'رفع يدوي لسنة سابقة — حركات وفواتير بالتفاصيل...');
    const bundle = await fetchPreviousYearBundle(accounts);
    journal = bundle.journal;
    invoices = bundle.invoices;
    invoiceLines = bundle.invoiceLines;
    reportProgress(2, 7, 100, `سنة ${bundle.alias}: ${journal.length} حركة · ${invoices.length} فاتورة · ${invoiceLines.length} بند`);
  } else {
    reportProgress(2, 7, 0, `جاري قراءة حركات ${journalSeqs.length} حساب...`);
    journal = await fetchAllJournal(journalSeqs);
    reportProgress(2, 7, 100, `تم: ${journal.length} حركة`);

    const billSeqs = await resolveBillSeqsFromJournal(journal);
    reportProgress(3, 7, 0, `جاري قراءة ${billSeqs.length} فاتورة بيع...`);
    invoices = await fetchInvoices(billSeqs);
    reportProgress(3, 7, 100, `تم: ${invoices.length} فاتورة`);

    reportProgress(4, 7, 0, 'جاري قراءة بنود فواتير البيع...');
    invoiceLines = await fetchInvoiceLines(billSeqs);
    reportProgress(4, 7, 100, `تم: ${invoiceLines.length} بند`);
  }

  const accountsForUpload = enrichAccountsWithMatchInfo(accounts, lastMatchMapFromJournal(journal));

  let products = [];
  if (prevYearOnly || SKIP_PRODUCTS) {
    reportProgress(5, 7, 100, prevYearOnly
      ? 'رفع السنة السابقة: بدون تحديث شجرة المواد'
      : 'تخطي شجرة المواد — رفع حسابات المندوبين فقط');
  } else {
    const productsAll = await fetchAllProducts();
    const catalogMaterials = await fetchCatalogMaterialsForSync();
    products = catalogMaterials.length
      ? mergeMaterialRows(productsAll, catalogMaterials)
      : productsAll;
    if (catalogMaterials.length) {
      reportProgress(5, 7, 100, `تم: ${products.length} صنف (${catalogMaterials.length} محدّث للكتalog)`);
    }
  }

  const allAccountSeqs = accounts.map((a) => accountSeq(a)).filter(Boolean);
  const payload = {
    accounts: accountsForUpload,
    journal: journal.map((row) => ({
      Seq: row.Seq ?? row.seq,
      Acc: row.Acc ?? row.acc,
      Date: row.Date ?? row.date,
      Am: row.Am ?? row.am,
      Dept: row.Dept ?? row.dept,
      Exp1: row.Exp1 ?? row.exp1,
      Exp2: row.Exp2 ?? row.exp2,
      Remarks: row.Remarks ?? row.remarks,
      BillNum: row.BillNum ?? row.bill_num,
      BillSeq: row.BillSeq ?? row.bill_seq,
      BillKind: row.BillKind ?? row.bill_kind
    })),
    invoices,
    invoiceLines,
    products
  };

  let result = null;
  const failures = [];
  for (const target of SYNC_TARGETS) {
    SERVER = target;
    if (SYNC_TARGETS.length > 1) {
      reportProgress(6, 7, 0, `الرفع إلى ${target} ...`);
    }
    try {
      const uploaded = await uploadChunked(payload, allAccountSeqs);
      if (!result) result = uploaded;
    } catch (err) {
      failures.push(`${target}: ${err.message}`);
      console.log(`⚠ فشل الرفع إلى ${target} — ${err.message}`);
    }
  }
  if (!result) {
    throw new Error(failures.join(' | ') || 'فشل الرفع إلى كل السيرفرات');
  }
  const remoteFailures = failures.filter((line) => !/127\.0\.0\.1|localhost/i.test(line));
  if (remoteFailures.length) {
    throw new Error(remoteFailures.join(' | '));
  }
  console.log(`@SYNC_RESULT|${JSON.stringify({
    ok: true,
    accounts: result.accounts,
    journal: result.journal,
    invoices: result.invoices,
    invoiceLines: result.invoiceLines,
    products: result.products ?? products.length,
    catalogUpdated: result.catalogUpdated || 0,
    catalogPrices: result.catalogPrices || 0
  })}`);
  const catalogPart = result.catalogUpdated
    ? `، ${result.catalogUpdated} منتج كتalog`
    : '';
  console.log('✓ تمت المزامنة:', result.accounts, 'حساب،', result.journal, 'حركة،', result.invoices, 'فاتورة،', result.invoiceLines, 'بند،', result.products ?? products.length, 'مادة Edari', catalogPart);
}

if (process.argv.includes('--list-trees')) {
  listEdariTrees()
    .then((trees) => {
      console.log(`@TREES|${JSON.stringify({ ok: true, trees })}`);
    })
    .catch((e) => {
      console.error('✗', e.message);
      process.exit(1);
    });
} else if (process.argv.includes('--list-material-trees')) {
  listEdariMaterialTrees()
    .then((trees) => {
      console.log(`@MATERIAL_TREES|${JSON.stringify({ ok: true, trees })}`);
    })
    .catch((e) => {
      console.error('✗', e.message);
      process.exit(1);
    });
} else if (process.argv.includes('--sales-report')) {
  const { queryEdariSalesReport } = require('./edari-sales-report');
  const arg = process.argv.find((row) => row.startsWith('--params='));
  let params = {};
  if (arg) {
    try {
      params = JSON.parse(decodeURIComponent(arg.slice('--params='.length)));
    } catch (e) {
      console.error('✗', 'معاملات التقرير غير صالحة');
      process.exit(1);
    }
  }
  queryEdariSalesReport(params)
    .then((report) => {
      console.log(`@SALES_REPORT|${JSON.stringify({ ok: true, report })}`);
    })
    .catch((e) => {
      console.error('✗', e.message);
      process.exit(1);
    });
} else {
  main().catch((e) => {
    console.error('✗', e.message);
    process.exit(1);
  });
}
