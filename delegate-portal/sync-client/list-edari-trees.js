/**
 * قائمة شجرات الحسابات (File11n) من Edari — صلاحيات المندوبين ورفع البيانات.
 * تشمل المجلدات الفارغة (مثل شجرة زبائن جديدة بلا حسابات بعد).
 */
const path = require('path');
const edariRoot = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const { getEdariConnection } = require('./edari-connection');

function accountSeq(row) {
  return String(row.Seq ?? row.seq ?? '').replace(/[^0-9]/g, '');
}

function fieldText(v) {
  if (v == null) return '';
  if (typeof v === 'object' && v !== null && 'value' in v) return String(v.value ?? '').trim();
  return String(v).trim();
}

function looksBroken(name) {
  const s = String(name || '');
  return !s.trim() || s.includes('\uFFFD') || s.includes('�') || /[\u4e00-\u9fff]/.test(s);
}

function classifyTree(row) {
  const num = fieldText(row.Num ?? row.num);
  const name = fieldText(row.Name1 ?? row.name1);
  const master = String(row.Master ?? row.master ?? '0').replace(/[^0-9]/g, '') || '0';
  const isCustomer = master === '13'
    || /^121/.test(num)
    || /زبائن|زبون/.test(name);
  return { isCustomer, master };
}

function mapTree(row) {
  const extra = classifyTree(row);
  return {
    seq: accountSeq(row),
    num: fieldText(row.Num ?? row.num),
    name1: fieldText(row.Name1 ?? row.name1),
    sub_count: Number(row.SubCount ?? row.sub_count ?? 0),
    bal: Number(row.Bal ?? row.bal ?? 0),
    master: extra.master,
    isCustomer: extra.isCustomer
  };
}

function sortTrees(trees) {
  return trees.slice().sort((a, b) => {
    if (!!b.isCustomer !== !!a.isCustomer) return a.isCustomer ? -1 : 1;
    const seqDiff = Number(b.seq || 0) - Number(a.seq || 0);
    if (seqDiff) return seqDiff;
    return String(a.num || '').localeCompare(String(b.num || ''), 'ar', { numeric: true });
  });
}

async function query(sql) {
  const r = await odbcBridge.runQuery({ ...getEdariConnection(), sql });
  if (!r.ok) throw new Error(r.error || 'فشل قراءة الشجرات من Edari');
  return r.rows || [];
}

async function fetchTreeRows() {
  try {
    return await query(`
      SELECT Seq, Num, Name1, SubCount, Bal, Master
      FROM File11n
      WHERE SubCount > 0
         OR Master = 13
         OR Name1 LIKE N'%زبائن%'
         OR Name1 LIKE N'%شجرة%'
      ORDER BY Seq DESC
    `);
  } catch (_) {
    return query(`
      SELECT Seq, Num, Name1, SubCount, Bal
      FROM File11n
      WHERE SubCount > 0
         OR Name1 LIKE N'%زبائن%'
         OR Name1 LIKE N'%شجرة%'
      ORDER BY Seq DESC
    `);
  }
}

async function listEdariTrees() {
  const rows = await fetchTreeRows();
  return sortTrees(rows.map(mapTree).filter((t) => t.seq));
}

function treeMatchesQuery(tree, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return true;
  const hay = `${tree.num || ''} ${tree.name1 || ''} ${tree.seq || ''}`.toLowerCase();
  return hay.includes(needle);
}

async function searchEdariAccountTrees(q = '') {
  const trees = await listEdariTrees();
  const needle = String(q || '').trim();
  if (!needle) return trees;
  return trees.filter((t) => treeMatchesQuery(t, needle));
}

module.exports = {
  listEdariTrees,
  searchEdariAccountTrees,
  classifyTree,
  sortTrees,
  looksBroken,
  treeMatchesQuery
};
