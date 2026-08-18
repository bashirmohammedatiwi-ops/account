/**
 * Post a receipt voucher to Edari using the same File12n method as shorja_app:
 * AUTOINC Seq, TIMESTAMP date, paired debit/credit with Two, then repair AUTOINC.
 */
const path = require('path');

const edariRoot = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const nxscriptBridge = require(path.join(edariRoot, 'lib', 'nxscript-bridge'));
const { getEdariConnection } = require('./edari-connection');
const {
  buildFile12nInsertSql,
  toIsoDate,
  sqlQuote
} = require('../lib/receipt-posting');

function conn() {
  return getEdariConnection();
}

function firstVal(row, ...keys) {
  if (!row) return undefined;
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') return row[key];
    const upper = String(key).toUpperCase();
    if (row[upper] != null && row[upper] !== '') return row[upper];
  }
  return undefined;
}

async function query(sql) {
  const r = await odbcBridge.runQuery({ ...conn(), sql });
  if (!r.ok) throw new Error(r.error || 'فشل قراءة Edari');
  return r.rows || [];
}

async function execSql(sql) {
  const r = await odbcBridge.runExec({ ...conn(), sql });
  if (!r.ok) throw new Error(r.error || 'فشل الكتابة إلى Edari');
  return r;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function maxJournalSeq() {
  const rows = await query('SELECT MAX(Seq) AS mx FROM File12n');
  return Number(firstVal(rows[0], 'mx', 'MX', 'maxSeq') || 0);
}

async function nextJournalBondNum() {
  const rows = await query('SELECT MAX(Num) AS mx FROM File12n WHERE Num IS NOT NULL AND Num > 0');
  return Number(firstVal(rows[0], 'mx', 'MX', 'maxNum') || 0) + 1;
}

async function syncFile12nAutoInc() {
  const maxSeq = await maxJournalSeq();
  const r = await nxscriptBridge.runFile12nAutoIncViaNxscript({
    ...conn(),
    autoinc: maxSeq
  });
  if (!r.ok) throw new Error(r.error || 'فشل ضبط AUTOINC لـ File12n');
  return maxSeq;
}

async function resolveAccSeq(acc) {
  const seq = Number(acc?.accSeq || acc?.seq);
  if (Number.isFinite(seq) && seq > 0) return seq;
  const num = String(acc?.accNum || acc?.num || '').trim();
  if (!num) throw new Error(`حساب غير مكتمل: ${acc?.accName || acc?.name || ''}`);
  const rows = await query(`SELECT TOP 1 Seq, Num, Name1 FROM File11n WHERE Num = ${sqlQuote(num)}`);
  const found = rows[0];
  if (!found) throw new Error(`الحساب ${num} غير موجود في Edari`);
  return Number(firstVal(found, 'Seq', 'seq'));
}

function journalRowMatches(row, { acc, amount, isDebit }) {
  if (!row) return false;
  if (Number(firstVal(row, 'Acc', 'acc')) !== Number(acc)) return false;
  if (Number(firstVal(row, 'Am', 'am')) !== Math.round(Number(amount || 0))) return false;
  const dept = String(firstVal(row, 'Dept', 'dept')).toLowerCase() === 'true';
  return dept === !!isDebit;
}

async function readJournalRow(seq) {
  const rows = await query(`SELECT Seq, Acc, Am, Dept, Num FROM File12n WHERE Seq = ${Number(seq)}`);
  return rows[0] || null;
}

async function lookupJournalSeq({ acc, amount, isDebit, bondNum }) {
  const deptLit = isDebit ? 'True' : 'False';
  const am = Math.round(Number(amount || 0));
  const attempts = [
    `SELECT TOP 1 Seq, Acc, Am, Dept, Num FROM File12n WHERE Num = ${Number(bondNum)} AND Acc = ${Number(acc)} AND Am = ${am} AND Dept = ${deptLit} ORDER BY Seq DESC`,
    `SELECT TOP 1 Seq, Acc, Am, Dept, Num FROM File12n WHERE Acc = ${Number(acc)} AND Am = ${am} AND Dept = ${deptLit} ORDER BY Seq DESC`
  ];
  for (const sql of attempts) {
    const rows = await query(sql);
    const row = rows[0];
    if (journalRowMatches(row, { acc, amount: am, isDebit })) {
      return Number(firstVal(row, 'Seq', 'seq'));
    }
  }
  return 0;
}

async function insertJournalLine(ln, bondNum, dateStr) {
  const args = {
    acc: Number(ln.accSeq),
    amount: ln.amount,
    isDebit: ln.isDebit
  };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const before = await maxJournalSeq();
    await execSql(buildFile12nInsertSql({
      num: bondNum,
      line: ln,
      dateStr
    }));
    await syncFile12nAutoInc();
    const after = await maxJournalSeq();
    if (after > before) {
      const row = await readJournalRow(after);
      if (journalRowMatches(row, args)) {
        return { seq: after, ...ln, accSeq: args.acc, num: bondNum };
      }
    }
    if (attempt < 3) await sleep(120);
  }
  const seq = await lookupJournalSeq({ ...args, bondNum });
  if (seq > 0) return { seq, ...ln, accSeq: args.acc, num: bondNum };
  throw new Error(`لم يُعثر على قيد اليومية بعد الإدراج (${ln.accNum || ln.accSeq})`);
}

async function postReceiptToEdari(payload = {}) {
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (!lines.length) throw new Error('لا توجد بنود للترحيل');
  const dateStr = toIsoDate(payload.receiptDate || payload.date);

  const resolved = [];
  for (const ln of lines) {
    const accSeq = await resolveAccSeq(ln);
    let oppositeAccSeq = Number(ln.oppositeAccSeq || ln.oppositeAcc || 0);
    if (!oppositeAccSeq && ln.oppositeAcc) {
      oppositeAccSeq = await resolveAccSeq(ln.oppositeAcc);
    }
    resolved.push({ ...ln, accSeq, oppositeAccSeq: oppositeAccSeq || 0 });
  }

  await syncFile12nAutoInc();
  const journalNum = await nextJournalBondNum();
  const inserted = [];
  for (const ln of resolved) {
    inserted.push(await insertJournalLine(ln, journalNum, dateStr));
  }
  await syncFile12nAutoInc();

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
