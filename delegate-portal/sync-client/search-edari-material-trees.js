/**
 * Live search material trees (File13n) for sales report picker.
 */
const path = require('path');

const edariRoot = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const { getEdariConnection } = require('./edari-connection');

function sqlLike(value) {
  return String(value || '').replace(/'/g, "''").replace(/[%_]/g, '');
}

function mapRow(row) {
  return {
    seq: String(row.Seq ?? row.seq ?? ''),
    num: String(row.Num ?? row.num ?? ''),
    name1: String(row.Name1 ?? row.name1 ?? row.name ?? ''),
    subCount: Number(row.SubCount ?? row.sub_count ?? 0),
    sub_count: Number(row.SubCount ?? row.sub_count ?? 0)
  };
}

async function searchEdariMaterialTrees({ q = '' } = {}) {
  const query = String(q || '').trim();
  const like = sqlLike(query);
  const where = query
    ? `(SubCount > 0) AND (Num LIKE '%${like}%' OR Name1 LIKE '%${like}%')`
    : 'SubCount > 0';

  const sql = `
    SELECT TOP 120 Seq, Num, Name1, SubCount
    FROM File13n
    WHERE ${where}
    ORDER BY Num
  `.replace(/\s+/g, ' ').trim();

  const r = await odbcBridge.runQuery({ ...getEdariConnection(), sql });
  if (!r.ok) throw new Error(r.error || 'فشل البحث في شجرات المواد');
  const trees = (r.rows || []).map(mapRow).filter((t) => t.seq || t.num);
  return { ok: true, source: 'edari', trees, results: trees };
}

module.exports = { searchEdariMaterialTrees };
