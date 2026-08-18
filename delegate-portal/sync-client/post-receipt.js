/**
 * Post a receipt voucher to Edari as File12n journal lines (سند قيد).
 * Receipt number is stored in Exp2 / Remarks as R.V {receiptNo} (سند قبض).
 */
const path = require('path');

const edariRoot = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const { getEdariConnection } = require('./edari-connection');
const {
  buildFile12nInsertSql,
  formatEdariDate,
  sqlQuote
} = require('../lib/receipt-posting');

async function query(sql) {
  const r = await odbcBridge.runQuery({ ...getEdariConnection(), sql });
  if (!r.ok) throw new Error(r.error || 'فشل قراءة Edari');
  return r.rows || [];
}

async function execSql(sql) {
  const r = await odbcBridge.runExec({ ...getEdariConnection(), sql });
  if (!r.ok) throw new Error(r.error || 'فشل الكتابة إلى Edari');
  return r;
}

function maxNum(rows, field) {
  let mx = 0;
  for (const row of rows || []) {
    const n = Number(row[field] ?? row[String(field).toUpperCase()] ?? 0);
    if (Number.isFinite(n) && n > mx) mx = n;
  }
  return mx;
}

async function resolveAccSeq(acc) {
  const seq = Number(acc?.accSeq || acc?.seq);
  if (Number.isFinite(seq) && seq > 0) return seq;
  const num = String(acc?.accNum || acc?.num || '').trim();
  if (!num) throw new Error(`حساب غير مكتمل: ${acc?.accName || acc?.name || ''}`);
  const rows = await query(`SELECT TOP 1 Seq, Num, Name1 FROM File11n WHERE Num = ${sqlQuote(num)}`);
  const found = rows[0];
  if (!found) throw new Error(`الحساب ${num} غير موجود في Edari`);
  return Number(found.Seq);
}

async function postReceiptToEdari(payload = {}) {
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (!lines.length) throw new Error('لا توجد بنود للترحيل');
  const dateStr = formatEdariDate(payload.receiptDate || payload.date);

  const resolved = [];
  for (const ln of lines) {
    resolved.push({
      ...ln,
      accSeq: await resolveAccSeq(ln)
    });
  }

  const maxSeqRows = await query('SELECT MAX(Seq) AS mx FROM File12n');
  const maxNumRows = await query('SELECT MAX(Num) AS mx FROM File12n');
  let nextSeq = maxNum(maxSeqRows, 'mx') + 1;
  const journalNum = maxNum(maxNumRows, 'mx') + 1;

  const inserted = [];
  for (const ln of resolved) {
    const sql = buildFile12nInsertSql({
      seq: nextSeq,
      num: journalNum,
      line: ln,
      dateStr
    });
    await execSql(sql);
    inserted.push({ seq: nextSeq, num: journalNum, ...ln });
    nextSeq += 1;
  }

  return {
    ok: true,
    journalNum: String(journalNum),
    receiptNum: String(payload.receiptNo || payload.receipt_no || ''),
    date: dateStr,
    lines: inserted
  };
}

module.exports = { postReceiptToEdari };

if (require.main === module) {
  const raw = process.argv[2];
  const payload = raw ? JSON.parse(raw) : {};
  postReceiptToEdari(payload)
    .then((r) => {
      console.log(JSON.stringify(r));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
