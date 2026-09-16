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
const { getEdariConnection, getPreviousYearConnection } = require('./edari-connection');
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
  resolvePeriodOpeningBalance,
  rowsInDateRange,
  isValidFixDate,
  normalizeCarriedBalance
} = require('../lib/statement-utils');

const JOURNAL_CHUNK = 80;

function connOptions(conn) {
  return { ...(conn || getEdariConnection()) };
}

async function query(sql, timeoutMs = 60000, conn = null) {
  const pending = odbcBridge.runQuery({ ...connOptions(conn), sql });
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

function stripLeadingZeros(value) {
  const s = String(value || '').trim();
  const stripped = s.replace(/^0+(?=\d)/, '');
  return stripped || s;
}

function currentYearStartIso(alias, prevAlias) {
  const y = Number(String(alias || '').trim());
  if (Number.isInteger(y) && y >= 2000 && y <= 2100) return `${y}-01-01`;
  const glued = String(alias || '').trim().match(/^(20\d{2})(20\d{2})$/);
  if (glued) {
    const later = glued[1] > glued[2] ? glued[1] : glued[2];
    return `${later}-01-01`;
  }
  const py = Number(String(prevAlias || '').trim());
  if (Number.isInteger(py) && py >= 2000 && py <= 2100) return `${py + 1}-01-01`;
  const nowY = new Date().getFullYear();
  if (nowY >= 2000 && nowY <= 2100) return `${nowY}-01-01`;
  return '';
}

async function fetchAccounts(refs, conn = null, options = {}) {
  const variants = new Set();
  const seqs = new Set();
  for (const ref of refs) {
    const trimmed = String(ref || '').trim();
    if (!trimmed) continue;
    variants.add(trimmed);
    const noZeros = stripLeadingZeros(trimmed);
    if (noZeros) variants.add(noZeros);
    const n = sqlInt(trimmed);
    if (n > 0) seqs.add(n);
  }
  const nums = [...variants].map((r) => sqlQuote(r)).join(',');
  const seqList = options.numOnly ? '' : [...seqs].join(',');
  if (!nums && !seqList) return [];
  const where = [
    nums ? `Num IN (${nums})` : '',
    seqList ? `Seq IN (${seqList})` : ''
  ].filter(Boolean).join(' OR ');
  const rows = await query(`
    SELECT Seq, Num, Name1, Name2, Address, Bal, Tot1, Tot2, FixDate, FixBal, SubCount
    FROM File11n
    WHERE ${where}
  `, 30000, conn);
  return rows.map(mapAccount);
}

function toIsoDay(value) {
  const d = parseEdariDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoAddDays(iso, delta) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sqlTimestampStart(iso) {
  return `TIMESTAMP ${sqlQuote(`${iso} 00:00:00`)}`;
}

/**
 * أصغر نافذة تواريخ تكفي لبناء كشف الحساب — تُطبَّق في SQL بدل سحب كل
 * تاريخ الحساب (الفرق كبير جداً على صناديق فيها مئات آلاف الحركات).
 *
 * الحسابات المرتكزة على FixDate تحتاج ما بين تاريخ التثبيت وحدود الفترة.
 * الحسابات التراكمية (بلا تاريخ تثبيت) تحتاج كل ما قبل نهاية الفترة.
 */
function journalWindowFor(account, dateFrom, dateTo) {
  const fixDateIso = toIsoDay(account?.fix_date);
  const hasFix = isValidFixDate(account?.fix_date);
  const fixBal = hasFix && parseAmount(account?.fix_bal) !== 0
    ? normalizeCarriedBalance(parseAmount(account.fix_bal), account, { fromFixBal: true })
    : 0;

  if (hasFix && fixBal === 0) {
    return { from: dateFrom, to: dateTo };
  }
  if (hasFix && fixDateIso) {
    return {
      from: fixDateIso < dateFrom ? fixDateIso : dateFrom,
      to: fixDateIso > dateTo ? fixDateIso : dateTo
    };
  }
  return { from: '', to: dateTo };
}

function journalWhereForWindow(win) {
  const clauses = [];
  if (win.from) clauses.push(`"Date" >= ${sqlTimestampStart(win.from)}`);
  if (win.to) clauses.push(`"Date" < ${sqlTimestampStart(isoAddDays(win.to, 1))}`);
  return clauses.join(' AND ');
}

async function fetchJournalForWindow(seqs, win, conn = null) {
  const rows = [];
  const dateWhere = journalWhereForWindow(win);
  for (const part of chunk(seqs, JOURNAL_CHUNK)) {
    const ids = part.map((s) => sqlInt(s)).filter((s) => s > 0).join(',');
    if (!ids) continue;
    const where = [`Acc IN (${ids})`, dateWhere].filter(Boolean).join(' AND ');
    const chunkRows = await query(`
      SELECT Seq, Acc, "Date", Am, Dept, Exp1, Exp2, Remarks, BillNum, BillSeq, BillKind
      FROM File12n
      WHERE ${where}
      ORDER BY Acc, "Date", Seq
    `, 120000, conn);
    rows.push(...chunkRows);
  }
  return rows;
}

/** يجمع الحسابات ذات النافذة الزمنية نفسها في استعلام واحد. */
async function fetchJournalForAccounts(accounts, dateFrom, dateTo, conn = null) {
  const groups = new Map();
  for (const acc of accounts) {
    if (!acc.seq) continue;
    const win = journalWindowFor(acc, dateFrom, dateTo);
    const key = `${win.from}|${win.to}`;
    if (!groups.has(key)) groups.set(key, { win, seqs: [] });
    groups.get(key).seqs.push(acc.seq);
  }

  const byAcc = new Map();
  for (const { win, seqs } of groups.values()) {
    const rows = await fetchJournalForWindow(seqs, win, conn);
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
  return rowsInDateRange(rows, dateFrom, dateTo);
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
    const openingLine = buildOpeningLine(openingBalance, null, {
      note: account.prevYearAlias ? `رصيد مدور · سنة ${account.prevYearAlias}` : ''
    });
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
      prevYearAlias: account.prevYearAlias || null,
      prevYearBal: account.prevYearBal ?? null,
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

/**
 * يربط السنة السابقة: الرصيد المدور = نفس معادلة كشف السنة السابقة عند
 * بداية الفترة (وليس Bal الحالي، لأنه قد يشمل حركات بعد التحويل).
 * حركات السنة السابقة تظهر كسطور فقط إذا طُلب التاريخ الكامل أو الفترة
 * تبدأ قبل السنة الحالية.
 */
async function mergePreviousYearJournals(accounts, journalByAcc, options = {}) {
  const prev = getPreviousYearConnection();
  if (!prev) return;
  const current = getEdariConnection();
  if (prev.alias && current.alias && prev.alias === current.alias) return;

  const nums = accounts.map((a) => a.num).filter(Boolean);
  if (!nums.length) return;

  let prevAccounts = [];
  try {
    prevAccounts = await fetchAccounts(nums, prev, { numOnly: true });
  } catch (err) {
    console.warn('previous-year accounts', err.message);
    return;
  }
  if (!prevAccounts.length) return;

  const yearStart = currentYearStartIso(current.alias, prev.alias);
  const dateFrom = String(options.dateFrom || '').trim();
  const dateTo = String(options.dateTo || '').trim();
  const includeAllPrevious = options.includeAllPrevious === true
    || Boolean(dateFrom && yearStart && dateFrom < yearStart);

  const prevByNum = new Map();
  for (const acc of prevAccounts) {
    if (acc.num) prevByNum.set(acc.num, acc);
    prevByNum.set(stripLeadingZeros(acc.num), acc);
  }
  const matchedPrev = [];
  const prevSeqToCurrent = new Map();
  for (const acc of accounts) {
    const p = prevByNum.get(acc.num) || prevByNum.get(stripLeadingZeros(acc.num));
    if (!p) continue;
    prevSeqToCurrent.set(p.seq, acc.seq);
    acc.prevYearAlias = prev.alias;
    acc.prevYearBal = p.bal;
    acc.currentYearStart = yearStart;
    matchedPrev.push(p);
  }
  if (!matchedPrev.length) return;

  let prevJournalByAcc = new Map();
  try {
    prevJournalByAcc = includeAllPrevious
      ? (await (async () => {
        const byAcc = new Map();
        const rawRows = await fetchJournalForWindow(matchedPrev.map((a) => a.seq), { from: '', to: '' }, prev);
        for (const raw of rawRows) {
          const mapped = mapJournalRow(raw);
          if (!byAcc.has(mapped.acc_seq)) byAcc.set(mapped.acc_seq, []);
          byAcc.get(mapped.acc_seq).push(mapped);
        }
        return byAcc;
      })())
      : await fetchJournalForAccounts(matchedPrev, dateFrom || yearStart || '1990-01-01', dateTo || dateFrom || '2099-12-31', prev);
  } catch (err) {
    console.warn('previous-year journal', err.message);
    return;
  }

  const currentBySeq = new Map(accounts.map((a) => [a.seq, a]));
  for (const p of matchedPrev) {
    const currentAcc = currentBySeq.get(prevSeqToCurrent.get(p.seq));
    if (!currentAcc) continue;
    const prevRows = prevJournalByAcc.get(p.seq) || [];
    if (dateFrom && dateTo) {
      currentAcc.prevYearOpening = resolvePeriodOpeningBalance(p, prevRows, dateFrom, dateTo);
    }
    if (!includeAllPrevious) continue;
    for (const mapped of prevRows) {
      const row = {
        ...mapped,
        seq: `PY${prev.alias}:${mapped.seq}`,
        acc_seq: currentAcc.seq,
        sourceYear: prev.alias,
        exp2: mapped.exp2 || `سنة ${prev.alias}`
      };
      if (!journalByAcc.has(currentAcc.seq)) journalByAcc.set(currentAcc.seq, []);
      journalByAcc.get(currentAcc.seq).push(row);
    }
  }
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

  const journalByAcc = accounts.length
    ? await fetchJournalForAccounts(accounts, dateFrom, dateTo)
    : new Map();
  if (accounts.length) {
    await mergePreviousYearJournals(accounts, journalByAcc, { dateFrom, dateTo });
  }

  const statements = [];
  const missing = [];
  for (const ref of refs) {
    const key = String(ref).trim();
    const acc = byNum.get(key) || bySeq.get(key) || byNum.get(stripLeadingZeros(key));
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

async function queryEdariFullAccountStatement(ref) {
  const key = String(ref || '').trim();
  if (!key) return null;
  const accounts = await fetchAccounts([key]);
  if (!accounts.length) return null;
  const journalByAcc = new Map();
  const rawRows = await fetchJournalForWindow(accounts.map((a) => a.seq), { from: '', to: '' });
  for (const raw of rawRows) {
    const mapped = mapJournalRow(raw);
    if (!journalByAcc.has(mapped.acc_seq)) journalByAcc.set(mapped.acc_seq, []);
    journalByAcc.get(mapped.acc_seq).push(mapped);
  }
  await mergePreviousYearJournals(accounts, journalByAcc, { includeAllPrevious: true });
  const acc = accounts[0];
  return buildStatement(acc, journalByAcc.get(acc.seq) || [], {
    dateFrom: '1990-01-01',
    dateTo: '2099-12-31'
  });
}

module.exports = {
  queryEdariAccountStatements,
  queryEdariFullAccountStatement
};
