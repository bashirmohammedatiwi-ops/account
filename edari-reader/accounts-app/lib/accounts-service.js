const path = require('path');
const odbcBridge = require(path.join(__dirname, '..', '..', 'lib', 'odbc-bridge'));
const config = require(path.join(__dirname, '..', '..', 'lib', 'config'));
const {
  buildStatementLines,
  debtStatusFromBalance,
  balanceSummaryLabel,
  formatAccountTitle,
  sortJournalRows
} = require('./statement-utils');

const DEFAULT_CONN = {
  mode: 'tcp',
  alias: '2025',
  server: config.defaultServer,
  port: config.defaultPort
};

const ACCOUNT_COLUMNS = [
  'Seq', 'Num', 'Name1', 'Name2', 'Cod', 'Dest', 'Master', 'Remarks',
  'Bal', 'Tot1', 'Tot2', 'SubCount', 'BalSee', 'CloseAcc', 'CloseMatAcc',
  'HideSubs', 'HideDay', 'Address', 'Sufix', 'Dept', 'Prefix', 'FixDate',
  'FixBal', 'Cieling', 'Budjet', 'Acur', 'AEqua', 'FrstStck', 'CBal',
  'CTot1', 'CTot2', 'Exp', 'Idx', 'PrGrpN', 'AccGroup', 'Address2',
  'Agent', 'AgentComm', 'SelType', 'HideName', 'Extra1', 'Extra2', 'Extra3',
  'Thurs', 'PayTypeIdx', 'GatherTypeIdx', 'ExpectedPayment', 'Delay',
  'PrevYearNum', 'FixUser', 'FixTime', 'FixRems', 'OfficialName', 'Sub'
];
const ACCOUNT_SELECT = ACCOUNT_COLUMNS.map((c) => `"${c}"`).join(', ');
const JOURNAL_SELECT = 'Seq, Acc, "Date", DtCreated, Am, Dept, Exp1, Exp2, BillNum, BillSeq, Remarks';

async function query(sql, conn = {}) {
  const result = await odbcBridge.runQuery({ ...DEFAULT_CONN, ...conn, sql });
  if (!result.ok) throw new Error(result.error || 'Query failed');
  return result;
}

function getChildren(accounts, parentSeq) {
  return accounts.filter((a) => String(a.Master) === String(parentSeq));
}

function collectDescendants(accounts, parentSeq, depth = 1) {
  const children = getChildren(accounts, parentSeq);
  let all = [];
  for (const child of children) {
    all.push({ ...child, depth });
    if (Number(child.SubCount) > 0) {
      all = all.concat(collectDescendants(accounts, child.Seq, depth + 1));
    }
  }
  return all;
}

function enrichAccount(row, bySeq) {
  const bal = Number(row.Bal || 0);
  const parent = bySeq.get(String(row.Master));
  const parentLabel = parent ? `${parent.Name1 || ''} (${parent.Num})`.trim() : '—';
  return {
    ...row,
    ParentName: parentLabel,
    MasterName: parentLabel,
    ParentSeq: row.Master,
    DebtStatus: debtStatusFromBalance(bal),
    AccountTitle: formatAccountTitle(row)
  };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

class AccountsService {
  constructor() {
    this.conn = { ...DEFAULT_CONN };
    this.accounts = null;
    this.bySeq = new Map();
    this.byNum = new Map();
    this.statementCache = new Map();
  }

  async loadAccounts(onProgress) {
    onProgress?.({ phase: 'loading', message: 'جاري تحميل دليل الحسابات...' });
    const result = await query(`SELECT ${ACCOUNT_SELECT} FROM File11n ORDER BY Num`, this.conn);
    this.bySeq = new Map(result.rows.map((r) => [String(r.Seq), r]));
    this.byNum = new Map(result.rows.map((r) => [String(r.Num), r]));
    this.accounts = result.rows.map((r) => enrichAccount(r, this.bySeq));
    this.statementCache.clear();
    onProgress?.({ phase: 'done', count: this.accounts.length });
    return this.accounts;
  }

  getAccount(seq) {
    const raw = this.bySeq.get(String(seq));
    return raw ? enrichAccount(raw, this.bySeq) : null;
  }

  getAccountByNum(num) {
    const raw = this.byNum.get(String(num));
    return raw ? enrichAccount(raw, this.bySeq) : null;
  }

  getAccountPath(seq) {
    const pathRows = [];
    let current = this.getAccount(seq);
    while (current) {
      pathRows.unshift({ Seq: current.Seq, Num: current.Num, Name1: current.Name1 });
      if (!current.Master || current.Master === '0' || current.Master === 0) break;
      current = this.getAccount(current.Master);
    }
    return pathRows;
  }

  getChildren(parentSeq) {
    return getChildren(this.accounts || [], parentSeq)
      .map((r) => enrichAccount(r, this.bySeq))
      .sort((a, b) => String(a.Num).localeCompare(String(b.Num), undefined, { numeric: true }));
  }

  mapChildMeta(child) {
    return {
      ...child,
      summary: balanceSummaryLabel(Number(child.Bal || 0))
    };
  }

  getChildrenMeta(parentSeq) {
    return this.getChildren(parentSeq).map((child) => this.mapChildMeta(child));
  }

  /** Optional background enrichment — not used on initial load */
  async fetchMovementCounts(accSeqs) {
    const counts = new Map();
    for (const part of chunk(accSeqs, 50)) {
      const ids = part.map((s) => String(s).replace(/[^0-9]/g, '')).filter(Boolean).join(',');
      if (!ids) continue;
      try {
        const result = await query(
          `SELECT Acc, COUNT(*) AS cnt FROM File12n WHERE Acc IN (${ids}) GROUP BY Acc`,
          this.conn
        );
        for (const row of result.rows) counts.set(String(row.Acc), Number(row.cnt || 0));
      } catch {
        break;
      }
    }
    return counts;
  }

  getDescendants(parentSeq) {
    return collectDescendants(this.accounts || [], parentSeq);
  }

  getRoots() {
    return (this.accounts || []).filter((a) => !a.Master || a.Master === '0' || a.Master === 0);
  }

  filterAccounts(search) {
    if (!this.accounts) return [];
    const q = search.trim().toLowerCase();
    if (!q) return this.accounts;
    return this.accounts.filter((a) =>
      String(a.Name1 || '').toLowerCase().includes(q) ||
      String(a.Name2 || '').toLowerCase().includes(q) ||
      String(a.Num || '').includes(q) ||
      String(a.OfficialName || '').toLowerCase().includes(q) ||
      String(a.Remarks || '').toLowerCase().includes(q) ||
      String(a.Address || '').toLowerCase().includes(q)
    );
  }

  getStats() {
    if (!this.accounts) return null;
    let totalDebit = 0;
    let totalCredit = 0;
    for (const a of this.accounts) {
      const b = Number(a.Bal || 0);
      if (b < 0) totalDebit += Math.abs(b);
      else if (b > 0) totalCredit += b;
    }
    return {
      total: this.accounts.length,
      roots: this.getRoots().length,
      leaves: this.accounts.filter((a) => Number(a.SubCount) === 0).length,
      totalDebit,
      totalCredit
    };
  }

  buildStatementFromRows(account, rows) {
    const sorted = sortJournalRows(rows);
    const statement = buildStatementLines(sorted);
    return {
      account: {
        Seq: account.Seq,
        Num: account.Num,
        Name1: account.Name1,
        Name2: account.Name2,
        Address: account.Address,
        Bal: account.Bal,
        DebtStatus: account.DebtStatus || debtStatusFromBalance(account.Bal)
      },
      accountTitle: formatAccountTitle(account),
      lines: statement.lines,
      totalDebit: statement.totalDebit,
      totalCredit: statement.totalCredit,
      finalBalance: statement.finalBalance,
      summary: balanceSummaryLabel(statement.finalBalance)
    };
  }

  async getStatement(accSeq, useCache = true) {
    const seq = String(accSeq).replace(/[^0-9]/g, '');
    if (useCache && this.statementCache.has(seq)) return this.statementCache.get(seq);

    const account = this.getAccount(seq);
    if (!account) return null;

    const result = await query(
      `SELECT ${JOURNAL_SELECT} FROM File12n WHERE Acc = ${seq} ORDER BY "Date", Seq`,
      this.conn
    );

    const statement = this.buildStatementFromRows(account, result.rows);
    this.statementCache.set(seq, statement);
    return statement;
  }

  getGroupSummary(parentSeq) {
    const parent = this.getAccount(parentSeq);
    if (!parent) return null;
    const children = this.getChildrenMeta(parentSeq);
    let totalDebit = 0;
    let totalCredit = 0;
    let withBalance = 0;
    for (const child of children) {
      const b = Number(child.Bal || 0);
      if (b < 0) { totalDebit += Math.abs(b); withBalance++; }
      else if (b > 0) { totalCredit += b; withBalance++; }
    }
    return {
      parent,
      reportTitle: `كشف حساب ${(parent.Name1 || '').trim()} / ${parent.Num}`,
      customerCount: children.length,
      withBalance,
      totalDebit,
      totalCredit,
      children
    };
  }

  clearStatementCache() {
    this.statementCache.clear();
  }

  async getStatus() {
    const drivers = await odbcBridge.detectDrivers();
    return { ok: true, drivers, conn: this.conn, loaded: this.accounts?.length || 0 };
  }
}

module.exports = new AccountsService();
