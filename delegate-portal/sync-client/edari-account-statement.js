/**
 * Live account statements (كشف حساب) from EdariNX — queried directly via ODBC.
 * Mirrors lib/accounts.getStatementForAccount but DB-free (no better-sqlite3),
 * so it can run inside the Admin desktop process like edari-sales-report.js.
 *
 * Account ledger = File12n rows WHERE Acc = account.Seq (same as sync.js).
 */
const path = require('path');
const edariRoot = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const { getEdariConnection } = require('./edari-connection');
const {
  parseAmount,
  parseJournalAmount,
  isDebitRow,
  sortJournalRowsAsc,
  buildJournalDescription,
  resolveDebtDisplayAmount,
  balanceSummaryLabel,
  debtStatusFromBalance,
  buildOpeningLine,
  startOfCalendarDay,
  parseEdariDate,
  journalSortKey,
  resolvePeriodOpeningBalance
} = require('../lib/statement-utils');

const JOURNAL_CHUNK = 80;

function connOptions() {
  return { ...getEdariConnection() };
}

async function query(sql, timeoutMs = 60000) {
  const pending = odbcBridge.runQuery({ ...connOptions(), sql });
  const r = await Promise.race([
    pending,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('انتهت مهلة الاتصال بـ EdariNX')), timeoutMs);
    })
  ]);
  if (!r.ok) throw new Error(r.error || 'فشل الاستعلام من Edari');
  return r.rows || [];
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseAccountList(input) {
  if (Array.isArray(input)) return input.map(String).map((s) => s.trim()).filter(Boolean);
  return String(input || '')
    .split(/[,،\s\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sqlQuote(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

function sqlInt(value) {
  const n = Number(String(value ?? '').replace(/[^0-9-]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function mapAccount(a) {
  return {
    seq: String(a.Seq ?? '').trim(),
    num: String(a.Num ?? '').trim(),
    name1: a.Name1 ?? '',
    name2: a.Name2 ?? '',
    address: a.Address ?? '',
    bal: parseAmount(a.Bal ?? 0),
    tot1: parseAmount(a.Tot1 ?? 0),
    tot2: parseAmount(a.Tot2 ?? 0),
    fix_date: a.FixDate ?? '',
    fix_bal: parseAmount(a.FixBal ?? 0),
    sub_count: Number(a.SubCount ?? 0)
  };
}

function mapJournalRow(j) {
  const dept = j.Dept;
  const billSeqRaw = j.BillSeq;
  const billSeq = billSeqRaw != null && String(billSeqRaw).replace(/[^0-9]/g, '') !== '0'
    ? String(billSeqRaw).replace(/[^0-9]/g, '')
    : '';
  return {
    seq: String(j.Seq ?? '').replace(/[^0-9]/g, ''),
    acc_seq: String(j.Acc ?? '').replace(/[^0-9]/g, ''),
    tx_date: j.Date ?? j.DtCreated ?? '',
    am: parseJournalAmount(j.Am ?? 0),
    is_debit: dept === 'True' || dept === true || dept === 1 ? 1 : 0,
    exp1: String(j.Exp1 ?? j.Remarks ?? '').trim(),
    exp2: String(j.Exp2 ?? '').trim(),
    bill_num: String(j.BillNum ?? ''),
    bill_seq: billSeq,
    bill_kind: String(j.BillKind ?? '')
  };
}

async function fetchAccounts(refs) {
  const nums = refs.map((r) => sqlQuote(r)).join(',');
  const rows = await query(`
    SELECT Seq, Num, Name1, Name2, Address, Bal, Tot1, Tot2, FixDate, FixBal, SubCount
    FROM File11n
    WHERE Num IN (${nums})
  `, 30000);
  return rows.map(mapAccount);
}

async function fetchJournalForSeqs(seqs) {
  const byAcc = new Map();
  for (const part of chunk(seqs, JOURNAL_CHUNK)) {
    const ids = part.map((s) => sqlInt(s)).filter((s) => s > 0).join(',');
    if (!ids) continue;
    const rows = await query(`
      SELECT Seq, Acc, "Date", Am, Dept, Exp1, Exp2, Remarks, BillNum, BillSeq, BillKind
      FROM File12n
      WHERE Acc IN (${ids})
      ORDER BY Acc, "Date", Seq
    `, 120000);
    for (const raw of rows) {
      const mapped = mapJournalRow(raw);
      if (!byAcc.has(mapped.acc_seq)) byAcc.set(mapped.acc_seq, []);
      byAcc.get(mapped.acc_seq).push(mapped);
    }
  }
  return byAcc;
}

/** Build statement lines from journal rows (DB-free; no invoice linkage needed for PDF). */
function buildLines(rows, openingBalance) {
  let balance = parseAmount(openingBalance);
  const lines = sortJournalRowsAsc(rows).map((row) => {
    const am = parseAmount(row.am);
    const debit = isDebitRow(row) ? am : 0;
    const credit = isDebitRow(row) ? 0 : am;
    balance = balance - debit + credit;
    return {
      seq: row.seq,
      debit,
      credit,
      description: buildJournalDescription(row),
      branch2: String(row.exp2 || '').trim() || null,
      date: row.tx_date,
      billNum: row.bill_num || null,
      billSeq: row.bill_seq || null,
      isReconciliation: false,
      isOpening: false,
      balance
    };
  });
  const finalBalance = lines.length ? lines[lines.length - 1].balance : 0;
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  return { lines, totalDebit, totalCredit, finalBalance };
}

function parseIsoDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const d = parseEdariDate(raw);
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function filterRowsInDateRange(rows, dateFrom, dateTo) {
  const start = startOfCalendarDay(dateFrom);
  const endDate = parseIsoDate(dateTo);
  if (start == null || !endDate) return [];
  endDate.setHours(23, 59, 59, 999);
  const end = endDate.getTime();
  return rows.filter((row) => {
    const t = journalSortKey(row).t;
    return t >= start && t <= end;
  });
}

/**
 * Account statement for a selected date range.
 * Opening balance = ledger balance immediately before dateFrom.
 * Movements = rows dated from dateFrom through dateTo (inclusive).
 */
function buildStatement(account, allRows, period = {}) {
  const { dateFrom, dateTo } = period;
  const movementRows = filterRowsInDateRange(allRows, dateFrom, dateTo);
  const openingBalance = resolvePeriodOpeningBalance(account, allRows, dateFrom, dateTo);

  const stmt = buildLines(movementRows, openingBalance);

  if (openingBalance !== 0) {
    const openingLine = buildOpeningLine(openingBalance, null);
    if (openingLine) {
      openingLine.date = '';
      stmt.lines.unshift(openingLine);
    }
  }

  const totalDebit = stmt.lines.reduce((s, l) => s + parseAmount(l.debit), 0);
  const totalCredit = stmt.lines.reduce((s, l) => s + parseAmount(l.credit), 0);
  const finalBalance = stmt.lines.length
    ? stmt.lines[stmt.lines.length - 1].balance
    : openingBalance;

  const debtAmount = resolveDebtDisplayAmount({
    finalBalance,
    totalDebit,
    totalCredit,
    account: { bal: account.bal }
  });

  return {
    account: {
      seq: account.seq,
      num: account.num,
      name1: account.name1,
      name2: account.name2,
      address: account.address,
      bal: account.bal,
      tot1: account.tot1,
      tot2: account.tot2,
      fixDate: account.fix_date || null,
      fixBal: account.fix_bal ?? 0,
      debtStatus: debtStatusFromBalance(finalBalance)
    },
    lines: stmt.lines,
    totalDebit,
    totalCredit,
    finalBalance,
    debtAmount,
    summary: balanceSummaryLabel(finalBalance, account.name1),
    openingBalance,
    periodStart: dateFrom,
    periodEnd: dateTo,
    lineCount: stmt.lines.length
  };
}

async function queryEdariAccountStatements(params = {}) {
  const refs = parseAccountList(params.accounts || params.accountNums || []);
  if (!refs.length) throw new Error('يرجى إدخال رقم حساب واحد على الأقل');

  const dateFrom = String(params.dateFrom || params.period?.dateFrom || '').trim();
  const dateTo = String(params.dateTo || params.period?.dateTo || '').trim();
  if (!dateFrom || !dateTo) throw new Error('حدد تاريخ البداية والنهاية');
  if (!parseIsoDate(dateFrom) || !parseIsoDate(dateTo)) throw new Error('تاريخ غير صالح');
  if (startOfCalendarDay(dateFrom) > startOfCalendarDay(dateTo)) {
    throw new Error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
  }

  const period = { dateFrom, dateTo };
  const accounts = await fetchAccounts(refs);
  const bySeq = new Map(accounts.map((a) => [a.seq, a]));
  const byNum = new Map(accounts.map((a) => [a.num, a]));

  const seqs = accounts.map((a) => a.seq).filter(Boolean);
  const journalByAcc = seqs.length ? await fetchJournalForSeqs(seqs) : new Map();

  const statements = [];
  const missing = [];
  for (const ref of refs) {
    const acc = byNum.get(String(ref)) || bySeq.get(String(ref));
    if (!acc) {
      missing.push(ref);
      continue;
    }
    const rows = journalByAcc.get(acc.seq) || [];
    statements.push(buildStatement(acc, rows, period));
  }

  return {
    statements,
    missing,
    period,
    source: 'edari',
    meta: {
      requested: refs.length,
      resolved: statements.length,
      missing: missing.length,
      dateFrom,
      dateTo
    }
  };
}

module.exports = {
  queryEdariAccountStatements
};
