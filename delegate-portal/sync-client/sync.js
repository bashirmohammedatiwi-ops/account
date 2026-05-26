/**
 * Local sync client — reads EdariNX via ODBC and pushes to delegate portal server.
 * Usage: node sync-client/sync.js [--server URL] [--key KEY]
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

const ACCOUNT_COLS = [
  'Seq', 'Num', 'Name1', 'Name2', 'Master', 'SubCount', 'Bal', 'Tot1', 'Tot2',
  'Address', 'Remarks', 'OfficialName'
].map((c) => `"${c}"`).join(', ');

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

async function fetchAllJournal(accSeqs) {
  const all = [];
  const parts = chunk(accSeqs, 40);
  let done = 0;
  for (const part of parts) {
    const ids = part.join(',');
    const rows = await query(
      `SELECT Seq, Acc, "Date", Am, Dept, Exp1, BillNum, BillSeq, BillKind FROM File12n WHERE Acc IN (${ids}) ORDER BY Acc, "Date", Seq`
    );
    all.push(...rows);
    done += part.length;
    process.stdout.write(`\rحركات: ${all.length} (${done}/${accSeqs.length} حساب)`);
  }
  console.log('');
  return all;
}

function collectBillSeqs(journal) {
  const seqs = new Set();
  for (const row of journal) {
    const seq = String(row.BillSeq ?? '').replace(/[^0-9]/g, '');
    if (seq && seq !== '0') seqs.add(seq);
  }
  return [...seqs];
}

async function fetchInvoices(billSeqs) {
  if (!billSeqs.length) return [];
  const all = [];
  for (const part of chunk(billSeqs, 80)) {
    const ids = part.join(',');
    const rows = await query(
      `SELECT Seq, Num, Kind, "Date", Total, Payment, DisCnt, "count", Two, remarks FROM File15n WHERE Seq IN (${ids})`
    );
    all.push(...rows);
    process.stdout.write(`\rفواتير: ${all.length}/${billSeqs.length}`);
  }
  console.log('');
  return all;
}

async function fetchInvoiceLines(billSeqs) {
  if (!billSeqs.length) return [];
  const all = [];
  for (const part of chunk(billSeqs, 40)) {
    const ids = part.join(',');
    const rows = await query(
      `SELECT BillSeq, BillNo, Mat, MatName, Quant, Price, OBonus, MatRem, Kind FROM file14n WHERE BillSeq IN (${ids}) ORDER BY BillSeq, BillNo`
    );
    all.push(...rows);
    process.stdout.write(`\rبنود الفواتير: ${all.length}`);
  }
  console.log('');
  return enrichInvoiceLines(all);
}

async function fetchMaterialMap(matSeqs) {
  const map = new Map();
  if (!matSeqs.length) return map;
  for (const part of chunk(matSeqs, 80)) {
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

async function enrichInvoiceLines(lines) {
  const matSeqs = [...new Set(lines.map((l) => String(l.Mat || '').replace(/[^0-9]/g, '')).filter(Boolean))];
  console.log(`جاري جلب أسماء ${matSeqs.length} مادة...`);
  const materials = await fetchMaterialMap(matSeqs);
  return lines.map((line) => {
    const mat = materials.get(String(line.Mat));
    const quant = Number(line.Quant || 0);
    const price = Number(line.Price || 0);
    return {
      ...line,
      MatNum: mat?.num || '',
      MatName: (line.MatName || '').trim() || mat?.name1 || '',
      line_total: quant * price
    };
  });
}

async function main() {
  console.log('Edari Sync Client');
  console.log('Server:', SERVER);
  console.log('DB:', CONN.alias);

  console.log('جاري قراءة الحسابات...');
  const accounts = await query(`SELECT ${ACCOUNT_COLS} FROM File11n ORDER BY Num`);
  console.log(`تم: ${accounts.length} حساب`);

  const leafSeqs = accounts
    .filter((a) => Number(a.SubCount) === 0)
    .map((a) => String(a.Seq).replace(/[^0-9]/g, ''));

  console.log(`جاري قراءة حركات ${leafSeqs.length} حساب نهائي...`);
  const journal = await fetchAllJournal(leafSeqs);
  console.log(`تم: ${journal.length} حركة`);

  const billSeqs = collectBillSeqs(journal);
  console.log(`جاري قراءة ${billSeqs.length} فاتورة مرتبطة...`);
  const invoices = await fetchInvoices(billSeqs);
  console.log(`تم: ${invoices.length} فاتورة`);

  const invoiceLines = await fetchInvoiceLines(billSeqs);
  console.log(`تم: ${invoiceLines.length} بند`);

  console.log('جاري الرفع إلى السيرفر...');
  const res = await fetch(`${SERVER}/api/sync/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sync-Key': SYNC_KEY
    },
    body: JSON.stringify({ accounts, journal, invoices, invoiceLines })
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  console.log('✓ تمت المزامنة:', data.accounts, 'حساب،', data.journal, 'حركة،', data.invoices, 'فاتورة');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
