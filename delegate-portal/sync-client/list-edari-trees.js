/**
 * قائمة شجرات الحسابات (File11n) من Edari — للاختيار في صلاحيات المندوبين.
 */
const path = require('path');
const edariRoot = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const { getEdariConnection } = require('./edari-connection');

function accountSeq(row) {
  return String(row.Seq ?? row.seq ?? '').trim();
}

function fieldText(v) {
  if (v == null) return '';
  if (typeof v === 'object' && v !== null && 'value' in v) return String(v.value ?? '').trim();
  return String(v).trim();
}

async function query(sql, timeoutMs = 60000) {
  const conn = getEdariConnection();
  return odbcBridge.query(conn, sql, timeoutMs);
}

async function listEdariTrees() {
  const rows = await query(
    'SELECT Seq, Num, Name1, SubCount, Bal FROM File11n WHERE SubCount > 0 ORDER BY Num',
    90000
  );
  return rows.map((r) => ({
    seq: accountSeq(r),
    num: fieldText(r.Num ?? r.num),
    name1: fieldText(r.Name1 ?? r.name1),
    sub_count: Number(r.SubCount ?? r.sub_count ?? 0),
    bal: Number(r.Bal ?? r.bal ?? 0)
  }));
}

module.exports = { listEdariTrees };
