/**
 * Local sync client — reads EdariNX via ODBC and pushes to delegate portal server.
 * Usage: node sync-client/sync.js [--server URL] [--key KEY] [--trees seq1,seq2]
 *        node sync-client/sync.js --list-trees
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const edariRoot = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));

const SERVER = process.argv.includes('--server')
  ? process.argv[process.argv.indexOf('--server') + 1]
  : (process.env.SYNC_SERVER || 'http://187.124.23.65:5005');

const SYNC_KEY = process.argv.includes('--key')
  ? process.argv[process.argv.indexOf('--key') + 1]
  : (process.env.SYNC_API_KEY || 'edari-sync-local-key-2025');

const CONN = {
  mode: 'tcp',
  alias: process.env.EDARI_ALIAS || '2025',
  server: process.env.EDARI_SERVER || '127.0.0.1',
  port: Number(process.env.EDARI_PORT || 16000)
};

const UPLOAD_BATCH = {
  journal: 2500,
  invoices: 400,
  invoiceLines: 1500
};

const ACCOUNT_COLS = [
  'Seq', 'Num', 'Name1', 'Name2', 'Master', 'SubCount', 'Bal', 'Tot1', 'Tot2',
  'Address', 'Remarks', 'OfficialName', 'FixDate', 'FixBal'
].map((c) => `"${c}"`).join(', ');

const { MATCH_SQL, isReconciliationMovement } = require('../lib/reconciliation-utils');

async function query(sql) {
  const r = await odbcBridge.runQuery({ ...CONN, sql });
  if (!r.ok) throw new Error(r.error || 'Query failed');
  return r.rows;
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

async function postJsonWithRetry(urlPath, body, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await postJson(urlPath, body);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        reportProgress(5, 6, 0, `إعادة محاولة الرفع (${attempt}/${retries - 1})...`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw lastErr;
}

async function fetchAllJournal(accSeqs) {
  if (!accSeqs.length) return [];
  const all = [];
  const parts = chunk(accSeqs, 60);
  let done = 0;
  for (const part of parts) {
    const ids = part.join(',');
    const rows = await query(
      `SELECT Seq, Acc, "Date", Am, Dept, Exp1, Exp2, Remarks, BillNum, BillSeq, BillKind FROM File12n
       WHERE Acc IN (${ids})
       ORDER BY Acc, "Date", Seq`
    );
    all.push(...rows);
    done += part.length;
    const pct = Math.round((done / accSeqs.length) * 100);
    reportProgress(2, 6, pct, `كل حركات الحساب: ${all.length} (${done}/${accSeqs.length} حساب)`);
  }
  return all;
}

async function fetchLastMatchByAccount(accSeqs) {
  const map = new Map();
  if (!accSeqs.length) return map;
  const parts = chunk(accSeqs, 60);
  for (const part of parts) {
    const ids = part.join(',');
    // لا تقارن Dept بـ 'False' في SQL — NexusDB يخزّنها Boolean وتسبب Type mismatch
    const rows = await query(
      `SELECT Acc, Seq, "Date", Exp1, Remarks, Dept, BillSeq, BillNum FROM File12n
       WHERE Acc IN (${ids}) AND ${MATCH_SQL}
       ORDER BY Acc, "Date", Seq`
    );
    for (const row of rows) {
      if (!isReconciliationMovement(row)) continue;
      map.set(String(row.Acc), {
        LastMatchSeq: String(row.Seq),
        LastMatchDate: row.Date || ''
      });
    }
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

async function lookupBillSeqsByNums(nums) {
  const map = new Map();
  if (!nums.length) return map;
  for (const part of chunk(nums, 120)) {
    const list = part.join(',');
    const rows = await query(`SELECT Seq, Num FROM File15n WHERE Num IN (${list})`);
    for (const row of rows) {
      map.set(String(row.Num), String(row.Seq));
    }
  }
  return map;
}

async function resolveBillSeqsFromJournal(journal) {
  const { seqs, nums } = collectBillSeqs(journal);
  const resolved = new Set(seqs);
  if (nums.size) {
    const byNum = await lookupBillSeqsByNums([...nums]);
    for (const seq of byNum.values()) resolved.add(seq);
  }
  return [...resolved];
}

async function fetchInvoices(billSeqs) {
  if (!billSeqs.length) return [];
  const all = [];
  const parts = chunk(billSeqs, 120);
  for (let i = 0; i < parts.length; i++) {
    const ids = parts[i].join(',');
    const rows = await query(
      `SELECT Seq, Num, Kind, "Date", Total, Payment, DisCnt, "count", Two, remarks FROM File15n WHERE Seq IN (${ids})`
    );
    all.push(...rows);
    const pct = Math.round(((i + 1) / parts.length) * 100);
    reportProgress(3, 6, pct, `فواتير بيع: ${all.length}/${billSeqs.length}`);
  }
  return all;
}

async function fetchMaterialMap(matSeqs) {
  const map = new Map();
  if (!matSeqs.length) return map;
  for (const part of chunk(matSeqs, 120)) {
    const ids = part.join(',');
    const rows = await query(
      `SELECT Seq, Num, Name1 FROM File13n WHERE Seq IN (${ids})`
    );
    for (const row of rows) {
      map.set(String(row.Seq), { num: String(row.Num || ''), name1: row.Name1 || '' });
    }
  }
  return map;
}

async function fetchInvoiceLineRows(ids) {
  const baseCols = 'BillSeq, BillNo, Mat, MatName, Quant, Price, OBonus, MatRem, Kind';
  const withSum = `${baseCols}, Sum`;
  try {
    return await query(`SELECT ${withSum} FROM file14n WHERE BillSeq IN (${ids}) ORDER BY BillSeq, BillNo`);
  } catch {
    return await query(`SELECT ${baseCols} FROM file14n WHERE BillSeq IN (${ids}) ORDER BY BillSeq, BillNo`);
  }
}

async function fetchInvoiceLines(billSeqs) {
  if (!billSeqs.length) return [];
  const all = [];
  const parts = chunk(billSeqs, 100);
  for (let i = 0; i < parts.length; i++) {
    const ids = parts[i].join(',');
    const rows = await fetchInvoiceLineRows(ids);
    all.push(...rows);
    const pct = Math.round(((i + 1) / parts.length) * 100);
    reportProgress(4, 6, pct, `بنود الفواتير: ${all.length} (${i + 1}/${parts.length})`);
  }

  const missingNameMats = [...new Set(
    all
      .map((line) => String(line.Mat || '').replace(/[^0-9]/g, ''))
      .filter(Boolean)
  )];

  let materials = new Map();
  if (missingNameMats.length) {
    reportProgress(4, 6, 95, `جلب بيانات ${missingNameMats.length} مادة...`);
    materials = await fetchMaterialMap(missingNameMats);
  }

  return all.map((line) => {
    const mat = materials.get(String(line.Mat));
    const quant = Number(line.Quant || 0);
    const price = Number(line.Price || 0);
    const storedTotal = Number(line.Sum ?? line.sum ?? 0);
    return {
      ...line,
      MatNum: mat?.num || '',
      MatName: (line.MatName || '').trim() || mat?.name1 || '',
      line_total: storedTotal > 0 ? storedTotal : quant * price
    };
  }).filter((line) => {
    const quant = Number(line.Quant || 0);
    const bonus = Number(line.OBonus || 0);
    const price = Number(line.Price || 0);
    const total = Number(line.line_total || 0);
    const name = String(line.MatName || '').trim();
    const mat = String(line.Mat || '').trim();
    return quant !== 0 || bonus !== 0 || price !== 0 || total !== 0 || Boolean(name) || Boolean(mat);
  });
}

async function uploadLegacy(payload, accountSeqs = []) {
  reportProgress(5, 6, 50, 'رفع دفعة واحدة (وضع قديم)...');
  const data = await postJson('/api/sync/push', { ...payload, accountSeqs }, 900000);
  reportProgress(6, 6, 100, 'اكتمل الرفع');
  return data;
}

async function uploadChunked(payload, accountSeqs = []) {
  const stats = {
    accounts: payload.accounts.length,
    journal: payload.journal.length,
    invoices: payload.invoices.length,
    invoiceLines: payload.invoiceLines.length
  };

  reportProgress(5, 6, 0, 'بدء الرفع إلى السيرفر...');
  let start;
  try {
    start = await postJson('/api/sync/start', { accountSeqs }, 120000);
  } catch (err) {
    if (/404|Cannot POST|Not Found/i.test(err.message)) {
      return uploadLegacy(payload, accountSeqs);
    }
    throw err;
  }
  const syncId = start.syncId;

  const uploadPlan = [
    { kind: 'accounts', rows: payload.accounts, batchSize: Math.max(payload.accounts.length, 1), label: 'حسابات' },
    { kind: 'journal', rows: payload.journal, batchSize: UPLOAD_BATCH.journal, label: 'حركات' },
    { kind: 'invoices', rows: payload.invoices, batchSize: UPLOAD_BATCH.invoices, label: 'فواتير' },
    { kind: 'invoiceLines', rows: payload.invoiceLines, batchSize: UPLOAD_BATCH.invoiceLines, label: 'بنود' }
  ];

  const jobs = [];
  for (const item of uploadPlan) {
    if (!item.rows.length) continue;
    const parts = chunk(item.rows, item.batchSize);
    for (let i = 0; i < parts.length; i++) {
      jobs.push({ ...item, part: parts[i], index: i + 1, total: parts.length });
    }
  }

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const pct = jobs.length ? Math.round(((i + 1) / jobs.length) * 100) : 100;
    reportProgress(
      5,
      6,
      pct,
      `رفع ${job.label}: ${job.index}/${job.total} (${job.part.length} سجل)`
    );
    await postJsonWithRetry('/api/sync/chunk', {
      syncId,
      kind: job.kind,
      rows: job.part,
      batch: job.index,
      totalBatches: job.total
    });
  }

  reportProgress(6, 6, 100, 'جاري إنهاء المزامنة...');
  return postJsonWithRetry('/api/sync/finish', { syncId, stats });
}

async function listEdariTrees() {
  const rows = await query(`SELECT Seq, Num, Name1, SubCount, Bal FROM File11n WHERE SubCount > 0 ORDER BY Num`);
  return rows.map((r) => ({
    seq: accountSeq(r),
    num: String(r.Num || ''),
    name1: r.Name1 || '',
    sub_count: Number(r.SubCount || 0),
    bal: Number(r.Bal || 0)
  }));
}

async function main() {
  const treeSeqs = parseTreeSeqs();
  if (!treeSeqs.length) {
    throw new Error('حدد شجرة واحدة على الأقل للرفع');
  }

  reportProgress(1, 6, 0, 'جاري قراءة الحسابات من EdariNX...');
  const allAccounts = await query(`SELECT ${ACCOUNT_COLS} FROM File11n ORDER BY Num`);
  const accounts = filterAccountsByTrees(allAccounts, treeSeqs);
  reportProgress(1, 6, 100, `تم: ${accounts.length} حساب (${treeSeqs.length} شجرة)`);

  const leafSeqs = accounts
    .filter((a) => Number(a.SubCount) === 0)
    .map((a) => accountSeq(a));

  reportProgress(1, 6, 50, 'جاري قراءة آخر مطابقة لكل حساب...');
  const lastMatchMap = await fetchLastMatchByAccount(leafSeqs);
  const accountsForUpload = enrichAccountsWithMatchInfo(accounts, lastMatchMap);

  reportProgress(2, 6, 0, `جاري قراءة كل حركات ${leafSeqs.length} حساب (مثل النظام الإداري)...`);
  const journal = await fetchAllJournal(leafSeqs);
  reportProgress(2, 6, 100, `تم: ${journal.length} حركة`);

  const billSeqs = await resolveBillSeqsFromJournal(journal);
  reportProgress(3, 6, 0, `جاري قراءة ${billSeqs.length} فاتورة بيع...`);
  const invoices = await fetchInvoices(billSeqs);
  reportProgress(3, 6, 100, `تم: ${invoices.length} فاتورة`);

  reportProgress(4, 6, 0, 'جاري قراءة بنود فواتير البيع...');
  const invoiceLines = await fetchInvoiceLines(billSeqs);
  reportProgress(4, 6, 100, `تم: ${invoiceLines.length} بند`);

  const allAccountSeqs = accounts.map((a) => accountSeq(a)).filter(Boolean);
  const result = await uploadChunked(
    { accounts: accountsForUpload, journal, invoices, invoiceLines },
    allAccountSeqs
  );
  console.log('✓ تمت المزامنة:', result.accounts, 'حساب،', result.journal, 'حركة،', result.invoices, 'فاتورة،', result.invoiceLines, 'بند');
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
} else {
  main().catch((e) => {
    console.error('✗', e.message);
    process.exit(1);
  });
}
