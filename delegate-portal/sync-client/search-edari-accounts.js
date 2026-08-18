/**
 * Search Edari File11n accounts for receipt posting (cash boxes, GLs).
 * SELECT only — used from the admin desktop.
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
    name: String(row.Name1 ?? row.name1 ?? row.name ?? ''),
    subCount: Number(row.SubCount ?? row.sub_count ?? 0)
  };
}

async function searchEdariAccounts({ q = '', kind = '' } = {}) {
  const query = String(q || '').trim();
  const like = sqlLike(query);
  const isCash = kind === 'cash' || kind === 'box';
  let where;

  if (isCash) {
    const cashName = `(Name1 LIKE '%صندوق%' OR Name1 LIKE '%صناديق%')`;
    const vague = !query || query === 'صندوق' || query === 'الصندوق' || query === 'صناديق';
    where = vague
      ? cashName
      : `(${cashName} OR Num LIKE '%${like}%' OR Name1 LIKE '%${like}%')`;
  } else {
    if (query.length < 1) return { ok: true, results: [], source: 'edari' };
    where = `(Num LIKE '%${like}%' OR Name1 LIKE '%${like}%')`;
  }

  const sql = `
    SELECT TOP 80 Seq, Num, Name1, SubCount
    FROM File11n
    WHERE ${where}
    ORDER BY CASE WHEN SubCount = 0 THEN 0 ELSE 1 END, Num
  `.replace(/\s+/g, ' ').trim();

  const r = await odbcBridge.runQuery({ ...getEdariConnection(), sql });
  if (!r.ok) throw new Error(r.error || 'فشل قراءة حسابات الإداري');
  return {
    ok: true,
    source: 'edari',
    results: (r.rows || []).map(mapRow).filter((a) => a.seq)
  };
}

module.exports = { searchEdariAccounts };
