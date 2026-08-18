/**
 * Post a new customer (File11n leaf) under the selected tree — Shorja method:
 * AUTOINC Seq, INSERT without Seq, then rebuild parent Sub/SubCount.
 */
const path = require('path');

const edariRoot = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const nxscriptBridge = require(path.join(edariRoot, 'lib', 'nxscript-bridge'));
const { getEdariConnection } = require('./edari-connection');
const { sqlQuote } = require('../lib/receipt-posting');
const {
  normalizeName,
  normalizePhone,
  normalizeAddress,
  buildEdariAccountName,
  buildFile11nInsertSql,
  nextChildNumFromRows,
  bumpChildNum,
  buildSubHex
} = require('../lib/customer-posting');

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

async function maxAccountSeq() {
  const rows = await query('SELECT MAX(Seq) AS mx FROM File11n');
  return Number(firstVal(rows[0], 'mx', 'MX', 'maxSeq') || 0);
}

async function syncFile11nAutoInc() {
  const maxSeq = await maxAccountSeq();
  const r = await nxscriptBridge.runFile12nAutoIncViaNxscript({
    ...conn(),
    table: 'File11n',
    autoinc: maxSeq
  });
  if (!r.ok) throw new Error(r.error || 'فشل ضبط AUTOINC لـ File11n');
  return maxSeq;
}

async function resolveParent({ treeAccSeq, treeNum, treeName }) {
  const seq = Number(treeAccSeq);
  if (Number.isFinite(seq) && seq > 0) {
    const rows = await query(`SELECT TOP 1 Seq, Num, Name1 FROM File11n WHERE Seq = ${seq}`);
    const found = rows[0];
    if (found) {
      return {
        seq: Number(firstVal(found, 'Seq', 'seq')),
        num: String(firstVal(found, 'Num', 'num') || '').trim(),
        name: String(firstVal(found, 'Name1', 'name1') || treeName || '')
      };
    }
  }
  const num = String(treeNum || '').trim();
  if (!num) throw new Error(`الشجرة غير مكتملة: ${treeName || treeAccSeq || ''}`);
  const rows = await query(`SELECT TOP 1 Seq, Num, Name1 FROM File11n WHERE Num = ${sqlQuote(num)}`);
  const found = rows[0];
  if (!found) throw new Error(`الشجرة ${num} غير موجودة في Edari`);
  return {
    seq: Number(firstVal(found, 'Seq', 'seq')),
    num: String(firstVal(found, 'Num', 'num') || num).trim(),
    name: String(firstVal(found, 'Name1', 'name1') || treeName || '')
  };
}

async function childNums(parentSeq) {
  const rows = await query(`SELECT Num FROM File11n WHERE Master = ${Number(parentSeq)}`);
  return rows.map((row) => String(firstVal(row, 'Num', 'num') || '').trim()).filter(Boolean);
}

async function accountNumExists(num) {
  const rows = await query(`SELECT TOP 1 Seq FROM File11n WHERE Num = ${sqlQuote(num)}`);
  return rows.length > 0;
}

async function reserveChildNum(parent) {
  let num = nextChildNumFromRows(parent.num, await childNums(parent.seq));
  for (let i = 0; i < 30; i += 1) {
    if (!(await accountNumExists(num))) return num;
    num = bumpChildNum(num, parent.num);
  }
  throw new Error('تعذر حجز رقم حساب فرعي فريد');
}

async function rebuildParentSub(parentSeq) {
  const rows = await query(`SELECT Seq FROM File11n WHERE Master = ${Number(parentSeq)} ORDER BY Seq`);
  const kids = rows
    .map((row) => Number(firstVal(row, 'Seq', 'seq')))
    .filter((n) => Number.isFinite(n) && n > 0);
  const r = await nxscriptBridge.runTreeRepairViaNxscript({
    ...conn(),
    seq: Number(parentSeq),
    subCount: kids.length,
    subHex: kids.length ? buildSubHex(kids) : ''
  });
  if (!r.ok) throw new Error(r.error || 'فشل تحديث فروع الشجرة في الإداري');
  return { subCount: kids.length };
}

async function postCustomerToEdari(payload = {}) {
  const name = normalizeName(payload.name);
  if (!name) throw new Error('اسم الزبون مطلوب');
  const phone = normalizePhone(payload.phone);
  const address = normalizeAddress(payload.address, phone);
  const notes = normalizeName(payload.notes);
  const parent = await resolveParent(payload);
  const num = await reserveChildNum(parent);
  const name1 = buildEdariAccountName({ name, phone, address });

  await syncFile11nAutoInc();
  await execSql(buildFile11nInsertSql({
    num,
    name1,
    parentSeq: parent.seq,
    address,
    remarks: notes
  }));

  const createdRows = await query(
    `SELECT TOP 1 Seq, Num, Name1 FROM File11n WHERE Num = ${sqlQuote(num)} AND Master = ${Number(parent.seq)} ORDER BY Seq DESC`
  );
  const created = createdRows[0];
  if (!created) throw new Error('لم يُعثر على الحساب بعد الإنشاء في الإداري');
  const seq = Number(firstVal(created, 'Seq', 'seq'));
  if (!Number.isFinite(seq) || seq <= 0) throw new Error('Seq الحساب الجديد غير صالح');

  await rebuildParentSub(parent.seq);
  await syncFile11nAutoInc();

  return {
    seq,
    num: String(firstVal(created, 'Num', 'num') || num),
    name1: String(firstVal(created, 'Name1', 'name1') || name1),
    address,
    remarks: notes,
    parentSeq: parent.seq,
    parentNum: parent.num,
    parentName: parent.name
  };
}

module.exports = { postCustomerToEdari };
