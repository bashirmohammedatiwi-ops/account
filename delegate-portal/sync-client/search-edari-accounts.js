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

/** Exact lookup by account numbers — used to fill missing names in saved lists. */
async function resolveEdariAccountNames(nums = []) {
  const list = [...new Set(
    (Array.isArray(nums) ? nums : [nums])
      .map((n) => String(n || '').trim())
      .filter(Boolean)
  )].slice(0, 200);
  if (!list.length) return { ok: true, results: [], source: 'edari' };

  const inList = list.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
  const sql = `
    SELECT Seq, Num, Name1, SubCount
    FROM File11n
    WHERE Num IN (${inList})
  `.replace(/\s+/g, ' ').trim();

  const r = await odbcBridge.runQuery({ ...getEdariConnection(), sql });
  if (!r.ok) throw new Error(r.error || 'فشل قراءة أسماء الحسابات');
  return {
    ok: true,
    source: 'edari',
    results: (r.rows || []).map(mapRow).filter((a) => a.num)
  };
}

async function searchEdariAccounts({ q = '', kind = '', nums = null } = {}) {
  if (Array.isArray(nums) && nums.length) return resolveEdariAccountNames(nums);

  const query = String(q || '').trim();
  const like = sqlLike(query);
  const isCash = kind === 'cash' || kind === 'box';
  let where;

  if (isCash) {
    const cashName = `(Name1 LIKE N'%صندوق%' OR Name1 LIKE N'%صناديق%' OR Name1 LIKE N'%نقد%'
      OR Name1 LIKE N'%نقدية%' OR Name1 LIKE N'%خزينة%' OR Name1 LIKE N'%cash%' OR Name1 LIKE N'%Cash%'
      OR Name1 LIKE N'%تصفية%' OR Num LIKE '12104%')`;
    const vague = !query || query === 'صندوق' || query === 'الصندوق' || query === 'صناديق';
    where = vague
      ? cashName
      : `(${cashName} OR Num LIKE '%${like}%' OR Name1 LIKE N'%${like}%')`;
  } else if (kind === 'tree' || kind === 'account-tree') {
    where = query
      ? `(SubCount > 0) AND (Num LIKE '%${like}%' OR Name1 LIKE N'%${like}%')`
      : 'SubCount > 0';
  } else {
    if (query.length < 1) return { ok: true, results: [], source: 'edari' };
    where = `(Num LIKE '%${like}%' OR Name1 LIKE N'%${like}%' OR Name2 LIKE N'%${like}%')`;
  }

  const sql = `
    SELECT TOP 80 Seq, Num, Name1, SubCount
    FROM File11n
    WHERE ${where}
    ORDER BY Num
  `.replace(/\s+/g, ' ').trim();

  const r = await odbcBridge.runQuery({ ...getEdariConnection(), sql });
  if (!r.ok) throw new Error(r.error || 'فشل قراءة حسابات الإداري');
  const results = (r.rows || []).map(mapRow).filter((a) => a.seq);
  results.sort((a, b) => {
    const leafA = a.subCount === 0 ? 0 : 1;
    const leafB = b.subCount === 0 ? 0 : 1;
    if (leafA !== leafB) return leafA - leafB;
    return String(a.num).localeCompare(String(b.num), 'ar', { numeric: true });
  });
  return {
    ok: true,
    source: 'edari',
    results
  };
}

module.exports = { searchEdariAccounts, resolveEdariAccountNames };
