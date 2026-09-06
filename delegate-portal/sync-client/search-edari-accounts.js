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

function isAccountNumberQuery(query) {
  return /^\d{3,15}$/.test(String(query || '').trim());
}

function cashNameClause() {
  return `(Name1 LIKE N'%صندوق%' OR Name1 LIKE N'%صناديق%' OR Name1 LIKE N'%نقد%'
      OR Name1 LIKE N'%نقدية%' OR Name1 LIKE N'%خزينة%' OR Name1 LIKE N'%cash%' OR Name1 LIKE N'%Cash%'
      OR Name1 LIKE N'%تصفية%')`;
}

function cashBrowseWhere() {
  const prefixes = [
    "Num LIKE '12104%'",
    "Num LIKE '12110%'",
    "Num LIKE '12111%'",
    "Num LIKE '12112%'",
    "Num LIKE '121%04%'"
  ];
  return `(${prefixes.join(' OR ')} OR ${cashNameClause()})`;
}

function sortAccountResults(results, query = '') {
  const q = String(query || '').trim();
  return results.slice().sort((a, b) => {
    if (q) {
      const numA = String(a.num || '');
      const numB = String(b.num || '');
      const rank = (num) => {
        if (num === q) return 0;
        if (num.startsWith(q)) return 1;
        if (num.includes(q)) return 2;
        return 3;
      };
      const diff = rank(numA) - rank(numB);
      if (diff !== 0) return diff;
    }
    const leafA = a.subCount === 0 ? 0 : 1;
    const leafB = b.subCount === 0 ? 0 : 1;
    if (leafA !== leafB) return leafA - leafB;
    return String(a.num).localeCompare(String(b.num), 'ar', { numeric: true });
  });
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

async function searchEdariAccounts({ q = '', kind = '', nums = null, refresh = false, all = false } = {}) {
  if (Array.isArray(nums) && nums.length) return resolveEdariAccountNames(nums);

  const query = String(q || '').trim();
  const like = sqlLike(query);
  const isCash = kind === 'cash' || kind === 'box';
  const liveRefresh = refresh === true || refresh === '1' || all === true || all === '1';
  const numericQuery = isAccountNumberQuery(query);
  let rowLimit = isCash && liveRefresh ? 200 : 80;
  let where;

  if (isCash && numericQuery) {
    const exact = await resolveEdariAccountNames([query]);
    if (exact.results?.length) return exact;
    where = `(Num LIKE '${like}%' OR Num LIKE '%${like}%')`;
    rowLimit = 60;
  } else if (isCash) {
    const vague = !query || query === 'صندوق' || query === 'الصندوق' || query === 'صناديق';
    if (liveRefresh || vague) {
      where = cashBrowseWhere();
    } else {
      where = `(${cashBrowseWhere()} OR Num LIKE '%${like}%' OR Name1 LIKE N'%${like}%')`;
    }
  } else if (kind === 'tree' || kind === 'account-tree') {
    where = query
      ? `(SubCount > 0) AND (Num LIKE '%${like}%' OR Name1 LIKE N'%${like}%')`
      : 'SubCount > 0';
  } else {
    if (query.length < 1) return { ok: true, results: [], source: 'edari' };
    where = `(Num LIKE '%${like}%' OR Name1 LIKE N'%${like}%' OR Name2 LIKE N'%${like}%')`;
  }

  const sql = `
    SELECT TOP ${rowLimit} Seq, Num, Name1, SubCount
    FROM File11n
    WHERE ${where}
    ORDER BY Num
  `.replace(/\s+/g, ' ').trim();

  const r = await odbcBridge.runQuery({ ...getEdariConnection(), sql });
  if (!r.ok) throw new Error(r.error || 'فشل قراءة حسابات الإداري');
  const results = sortAccountResults(
    (r.rows || []).map(mapRow).filter((a) => a.seq),
    query
  );
  return {
    ok: true,
    source: 'edari',
    results
  };
}

module.exports = { searchEdariAccounts, resolveEdariAccountNames };
