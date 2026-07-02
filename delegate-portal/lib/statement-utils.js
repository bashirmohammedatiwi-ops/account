function parseAmount(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/,/g, '');
  if (!s) return 0;
  let neg = false;
  if (/^-/.test(s)) {
    neg = true;
    s = s.slice(1).trim();
  } else if (s.endsWith('-')) {
    neg = true;
    s = s.slice(0, -1).trim();
  }
  const n = Number(s);
  if (Number.isNaN(n)) return 0;
  return neg ? -Math.abs(n) : n;
}

/** مبالغ حركات اليومية — Edari يعرضها كأعداد صحيحة */
function parseJournalAmount(v) {
  return Math.round(parseAmount(v));
}

function isDebitRow(row) {
  return row.is_debit === 1 || row.is_debit === true || row.Dept === 'True' || row.Dept === true;
}

function buildLocalDate(year, month, day) {
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

function parseSlashDateParts(raw) {
  const parts = String(raw || '').trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (!parts) return null;
  return { a: Number(parts[1]), b: Number(parts[2]), y: Number(parts[3]) };
}

/** Edari slash dates = DD/MM/YYYY (يوم/شهر/سنة) — لا MM/DD الأمريكية. */
function parseEdariSlashDate(raw) {
  const slash = parseSlashDateParts(raw);
  if (!slash) return null;
  const { a, b, y } = slash;
  let day;
  let month;
  if (a > 12) {
    day = a;
    month = b;
  } else if (b > 12) {
    day = b;
    month = a;
  } else {
    day = a;
    month = b;
  }
  return buildLocalDate(y, month, day);
}

function edariCalendarDayStart(value) {
  const raw = String(value || '').trim().replace(' 00:00:00', '');
  if (!raw || raw.startsWith('12/30/1899')) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = buildLocalDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (!d) return null;
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  const slash = parseEdariSlashDate(raw);
  if (slash) {
    slash.setHours(0, 0, 0, 0);
    return slash.getTime();
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function parseEdariDate(value) {
  const t = edariCalendarDayStart(value);
  if (t == null) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function rowMatchesCalendarRange(row, rangeStart, rangeEnd) {
  const raw = row?.tx_date ?? row?.Date ?? row?.date ?? '';
  const dayStart = edariCalendarDayStart(raw);
  if (dayStart == null) return false;
  return dayStart >= rangeStart && dayStart <= rangeEnd;
}

function journalSortKey(row) {
  const raw = row.tx_date || row.Date || row.date || '';
  const d = parseEdariDate(raw);
  const t = d ? d.getTime() : 0;
  const seq = Number(row.seq ?? row.Seq ?? 0);
  return { t, seq };
}

function isJournalAfter(row, cutoff) {
  if (!cutoff?.seq) return true;
  const current = journalSortKey(row);
  const marker = journalSortKey({ tx_date: cutoff.date, seq: cutoff.seq });
  if (current.t !== marker.t) return current.t > marker.t;
  return current.seq > marker.seq;
}

function isValidFixDate(value) {
  return parseEdariDate(value) !== null;
}

function sortJournalRowsAsc(rows) {
  return [...rows].sort((a, b) => {
    const ka = journalSortKey(a);
    const kb = journalSortKey(b);
    if (ka.t !== kb.t) return ka.t - kb.t;
    return ka.seq - kb.seq;
  });
}

function sortJournalRowsDesc(rows) {
  return sortJournalRowsAsc(rows).reverse();
}

function endOfCalendarDay(value) {
  const d = parseEdariDate(value);
  if (!d) return 0;
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function startOfCalendarDay(value) {
  const d = parseEdariDate(value);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isBeforePeriodStart(row, cutoff) {
  if (cutoff?.seq) {
    return rowAtOrBeforeCutoff(row, cutoff);
  }
  const start = startOfCalendarDay(cutoff?.date);
  if (start == null) return false;
  return journalSortKey(row).t < start;
}

function isOnOrAfterPeriodStart(row, cutoff) {
  if (!cutoff) return true;
  if (cutoff.seq) {
    return isJournalAfter(row, cutoff);
  }
  const start = startOfCalendarDay(cutoff?.date);
  if (start == null) return true;
  return journalSortKey(row).t >= start;
}

function filterRowsSinceLastMatch(rows, cutoff) {
  if (!cutoff) return rows;
  if (cutoff.seq) {
    return rows.filter((row) => isJournalAfter(row, cutoff));
  }
  if (isValidFixDate(cutoff.date)) {
    return rows.filter((row) => isOnOrAfterPeriodStart(row, cutoff));
  }
  return rows;
}

function rowAtOrBeforeCutoff(row, cutoff) {
  if (!cutoff?.seq) {
    if (!isValidFixDate(cutoff?.date)) return false;
    return journalSortKey(row).t <= endOfCalendarDay(cutoff.date);
  }
  const current = journalSortKey(row);
  const marker = journalSortKey({ tx_date: cutoff.date, seq: cutoff.seq });
  if (current.t !== marker.t) return current.t < marker.t;
  return current.seq <= marker.seq;
}

function computeBalanceThroughCutoff(rows, cutoff) {
  if (!cutoff) return 0;
  let balance = 0;
  for (const row of sortJournalRowsAsc(rows)) {
    if (cutoff.seq) {
      if (!rowAtOrBeforeCutoff(row, cutoff)) break;
    } else if (isValidFixDate(cutoff.date)) {
      if (!isBeforePeriodStart(row, cutoff)) break;
    } else {
      break;
    }
    const am = parseAmount(row.am ?? row.Am);
    const debit = isDebitRow(row) ? am : 0;
    const credit = isDebitRow(row) ? 0 : am;
    balance = balance - debit + credit;
  }
  return balance;
}

/** تنسيق حركة الرصيد كما في Edari: 4,701,950- للمدين */
function formatRunningBalance(balance, { isOpening = false } = {}) {
  if (isOpening) return '';
  const n = parseAmount(balance);
  if (n === 0) return '0';
  const abs = Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n < 0 ? `${abs}-` : abs;
}

function sumMovementAmount(rows, field) {
  let total = 0;
  for (const row of rows) {
    const am = parseAmount(row.am ?? row.Am);
    if (field === 'debit' && isDebitRow(row)) total += am;
    if (field === 'credit' && !isDebitRow(row)) total += am;
  }
  return total;
}

/** رصيد مدور — من FixBal أو من Tot1/Tot2 ناقص حركات الفترة */
function deriveOpeningBalance(account, movementRows = []) {
  const fixBal = parseAmount(account?.fix_bal ?? account?.fixBal);
  if (fixBal !== 0) {
    return normalizeCarriedBalance(fixBal, account, { fromFixBal: true });
  }
  return resolveAccountNetBalance(account) - netMovementAmount(movementRows);
}

function netMovementAmount(rows) {
  let net = 0;
  for (const row of rows || []) {
    const am = parseAmount(row.am ?? row.Am);
    net += isDebitRow(row) ? -am : am;
  }
  return net;
}

/** الرصيد الحالي من Edari — موجب = دائن، سالب = مدين */
function resolveAccountNetBalance(account = {}) {
  return parseAmount(account.bal ?? account.Bal);
}

function normalizeCarriedBalance(balance, account = {}, { fromFixBal = false } = {}) {
  const b = parseAmount(balance);
  if (b === 0) return 0;
  // FixBal في Edari قد يُخزَّن بإشارة معاكسة لـ Bal — نعكس فقط عند تعارض واضح
  if (fromFixBal) {
    const accountBal = parseAmount(account?.bal ?? account?.Bal);
    if (b > 0 && accountBal < 0) return -Math.abs(b);
    if (b < 0 && accountBal > 0) return Math.abs(b);
  }
  return b;
}

function computeOpeningBalance(rows, cutoff, account) {
  if (!cutoff) return 0;
  const fixBal = parseAmount(account?.fix_bal ?? account?.fixBal);
  if (cutoff.source === 'fix_date' && isValidFixDate(cutoff.date) && fixBal !== 0) {
    return normalizeCarriedBalance(fixBal, account, { fromFixBal: true });
  }
  if (cutoff.seq || isValidFixDate(cutoff.date)) {
    return computeBalanceThroughCutoff(rows, cutoff);
  }
  return normalizeCarriedBalance(fixBal, account, { fromFixBal: true });
}

/** رصيد افتتاحي — FixBal أو مجموع الحركات قبل FixDate فقط (مثل Edari) */
function resolveOpeningBalance(account, allRows, movementRows, cutoff) {
  const fixBal = parseAmount(account?.fix_bal ?? account?.fixBal);
  if (fixBal !== 0) {
    return normalizeCarriedBalance(fixBal, account, { fromFixBal: true });
  }

  if (cutoff && (cutoff.seq || isValidFixDate(cutoff.date))) {
    const throughCutoff = computeBalanceThroughCutoff(allRows, cutoff);
    if (throughCutoff !== 0) return throughCutoff;
  }

  return 0;
}

function buildJournalDescription(row) {
  const parts = [];
  for (const value of [row.exp1, row.Exp1, row.exp2, row.Exp2, row.remarks, row.Remarks]) {
    const text = String(value || '').trim();
    if (!text || parts.includes(text)) continue;
    parts.push(text);
  }
  return parts.join(' · ');
}

function resolveStatementPeriod(movementRows, cutoff) {
  const datedRows = sortJournalRowsAsc(movementRows || []);
  const firstDated = datedRows.find((row) => parseEdariDate(row.tx_date || row.Date || row.date));
  const lastDated = [...datedRows].reverse().find((row) => parseEdariDate(row.tx_date || row.Date || row.date));

  let periodStart = null;
  if (cutoff?.date && isValidFixDate(cutoff.date)) {
    periodStart = cutoff.date;
  } else if (firstDated) {
    periodStart = firstDated.tx_date || firstDated.Date || firstDated.date || null;
  }

  let periodEnd = null;
  if (lastDated) {
    periodEnd = lastDated.tx_date || lastDated.Date || lastDated.date || null;
  }
  if (cutoff?.date && isValidFixDate(cutoff.date)) {
    periodEnd = new Date().toISOString();
  }

  return { periodStart, periodEnd };
}

function sumLineAmounts(lines, field) {
  return (lines || []).reduce((s, l) => s + parseAmount(l[field]), 0);
}

/** إجماليات الكشف — Tot1/Tot2 من Edari (تشمل رصيد مدور) أو مجموع الأسطر */
function resolveStatementTotals({ lines = [], stmt = {}, account = {} } = {}) {
  const lineDebit = sumLineAmounts(lines, 'debit');
  const lineCredit = sumLineAmounts(lines, 'credit');
  const edariDebit = parseAmount(account.tot1);
  const edariCredit = parseAmount(account.tot2);

  if (edariDebit > 0) {
    return {
      totalDebit: edariDebit,
      totalCredit: edariCredit > 0 ? edariCredit : lineCredit
    };
  }

  return {
    totalDebit: lineDebit || parseAmount(stmt.totalDebit),
    totalCredit: lineCredit || parseAmount(stmt.totalCredit)
  };
}

function resolveFinalBalance({ accountBal, totalDebit, totalCredit, stmtFinalBalance }) {
  const net = parseAmount(totalDebit) - parseAmount(totalCredit);
  const fromTotals = net > 0 ? -net : (net < 0 ? Math.abs(net) : 0);
  const acc = parseAmount(accountBal);
  const stmt = parseAmount(stmtFinalBalance);

  if (acc !== 0 && Math.abs(Math.abs(acc) - Math.abs(fromTotals)) <= 1) return acc;
  if (stmt !== 0 && Math.abs(Math.abs(stmt) - Math.abs(fromTotals)) <= 1) return stmt;
  return fromTotals;
}

function buildOpeningLine(openingBalance, cutoff) {
  const balance = parseAmount(openingBalance);
  const debit = balance < 0 ? Math.abs(balance) : 0;
  const credit = balance > 0 ? balance : 0;
  if (!debit && !credit) return null;
  return {
    seq: null,
    debit,
    credit,
    description: 'رصيد مدور',
    date: '',
    billNum: null,
    billSeq: null,
    billKind: null,
    invoiceRef: null,
    hasInvoice: false,
    isReconciliation: false,
    isOpening: true,
    clickable: false,
    balance,
    runningBalance: null
  };
}

function buildStatementLines(rows, options = {}) {
  const {
    isInvoiceMovement,
    isSalesInvoiceMovement,
    isSalesReturnMovement,
    resolveBillSeq,
    resolveBillNum
  } = require('./invoices');
  const { isReconciliationMovement } = require('./reconciliation-utils');
  let balance = parseAmount(options.openingBalance);
  const lines = sortJournalRowsAsc(rows).map((row) => {
    const am = parseAmount(row.am ?? row.Am);
    const debit = isDebitRow(row) ? am : 0;
    const credit = isDebitRow(row) ? 0 : am;
    balance = balance - debit + credit;
    const billNum = resolveBillNum(row);
    const billSeq = resolveBillSeq(row) || null;
    const isRecon = isReconciliationMovement(row);
    const isReturnInvoice = !isRecon && isSalesReturnMovement(row);
    const isSalesInvoice = !isRecon && isSalesInvoiceMovement(row);
    const hasInvoice = !isRecon && (isSalesInvoice || isReturnInvoice);
    const invoiceRef = billNum || billSeq || null;
    const description = buildJournalDescription(row);
    const branch2 = String(row.exp2 || row.Exp2 || '').trim() || null;
    return {
      seq: row.seq ?? row.Seq,
      debit,
      credit,
      description,
      branch2,
      date: row.tx_date || row.Date || row.DtCreated,
      billNum: billNum || null,
      billSeq,
      billKind: row.bill_kind ?? row.BillKind ?? null,
      invoiceRef: hasInvoice ? invoiceRef : null,
      hasInvoice,
      isReturnInvoice,
      isReconciliation: isRecon,
      clickable: Boolean(!isRecon && hasInvoice && invoiceRef && (debit > 0 || credit > 0)),
      balance
    };
  });
  const finalBalance = lines.length ? lines[lines.length - 1].balance : 0;
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  return {
    lines,
    totalDebit,
    totalCredit,
    finalBalance
  };
}

/** صف الرصيد النهائي — Edari: الرصيد الحالي / رصيد مدين / رصيد دائن */
function balanceSummaryLabel(balance, accountName = '') {
  const n = parseAmount(balance);
  const suffix = accountName ? ` ${String(accountName).trim()}` : '';
  if (n < 0) return { label: `رصيد مدين${suffix}`, amount: Math.abs(n), side: 'debit' };
  if (n > 0) return { label: `رصيد دائن${suffix}`, amount: n, side: 'credit' };
  return { label: `الرصيد الحالي${suffix}`, amount: 0, side: 'credit' };
}

function debtStatusFromBalance(bal) {
  const n = parseAmount(bal);
  if (n > 0) return 'دائن (له)';
  return 'الديون';
}

/** مبلغ الديون = مجموع المدين − مجموع الدائن (يشمل رصيد مدور في Tot1) */
function resolveDebtDisplayAmount(data = {}) {
  const net = parseAmount(data.totalDebit) - parseAmount(data.totalCredit);
  if (net > 0) return net;
  const bal = parseAmount(data.finalBalance ?? data.account?.bal);
  if (bal < 0) return Math.abs(bal);
  return 0;
}

/** مبلغ الديون من حقول الحساب (Tot1/Tot2/Bal) — للقوائم بدون بناء كشف كامل */
function resolveDebtFromAccount(account = {}) {
  return resolveDebtDisplayAmount({
    totalDebit: account.tot1 ?? account.Tot1,
    totalCredit: account.tot2 ?? account.Tot2,
    finalBalance: account.bal ?? account.Bal,
    account: { bal: account.bal ?? account.Bal }
  });
}

function rowsInDateRange(rows, dateFrom, dateTo) {
  const start = startOfCalendarDay(dateFrom);
  const end = endOfCalendarDay(dateTo || dateFrom);
  if (start == null || !end) return [];
  return (rows || []).filter((row) => rowMatchesCalendarRange(row, start, end));
}

function rowsAfterDate(rows, dateTo) {
  const end = endOfCalendarDay(dateTo);
  if (!end) return [];
  return (rows || []).filter((row) => journalSortKey(row).t > end);
}

/** رصيد افتتاح الفترة = مجموع حركات اليومية قبل dateFrom (من الصفر) */
function computeBalanceBeforePeriod(allRows, dateFrom) {
  const periodStart = startOfCalendarDay(dateFrom);
  if (periodStart == null) return 0;
  let balance = 0;
  for (const row of sortJournalRowsAsc(allRows || [])) {
    const t = journalSortKey(row).t;
    if (t <= 0 || t >= periodStart) continue;
    const am = parseAmount(row.am ?? row.Am);
    balance += isDebitRow(row) ? -am : am;
  }
  return balance;
}

/** صافي حركات بين بداية rangeFrom (شامل) وبداية rangeTo (غير شامل) */
function computeNetMovementBetween(allRows, rangeFrom, rangeToExclusive) {
  const from = startOfCalendarDay(rangeFrom);
  const to = startOfCalendarDay(rangeToExclusive);
  if (from == null || to == null) return 0;
  let net = 0;
  for (const row of sortJournalRowsAsc(allRows || [])) {
    const t = journalSortKey(row).t;
    if (t <= 0 || t < from || t >= to) continue;
    const am = parseAmount(row.am ?? row.Am);
    net += isDebitRow(row) ? -am : am;
  }
  return net;
}

function isoDateAddDays(dateInput, deltaDays) {
  const d = parseEdariDate(dateInput);
  if (!d || Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + deltaDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** صافي حركات يوم التقويم السابق مباشرةً */
function previousDayNet(allRows, dateFrom) {
  const prev = isoDateAddDays(dateFrom, -1);
  if (!prev) return 0;
  return netMovementAmount(rowsInDateRange(allRows, prev, prev));
}

/**
 * رصيد بداية الفترة انطلاقاً من FixBal (الرصيد المُدقّق في نهاية FixDate).
 * - الفترة بعد FixDate: نُقدّم بإضافة الحركات بين نهاية FixDate وبداية الفترة.
 * - الفترة عند/قبل FixDate: نُرجِع بطرح الحركات من بداية الفترة حتى نهاية FixDate.
 * هذا يطابق Edari الذي يعتمد FixBal كنقطة تثبيت وليس إعادة حساب من الصفر.
 */
function balanceAtPeriodStartFromFix(allRows, fixBal, fixDayEnd, periodStart) {
  let balance = fixBal;
  const forward = periodStart > fixDayEnd;
  for (const row of sortJournalRowsAsc(allRows || [])) {
    const t = journalSortKey(row).t;
    if (t <= 0) continue;
    const am = parseAmount(row.am ?? row.Am);
    const mv = isDebitRow(row) ? -am : am;
    if (forward) {
      if (t > fixDayEnd && t < periodStart) balance += mv;
    } else if (t >= periodStart && t <= fixDayEnd) {
      balance -= mv;
    }
  }
  return balance;
}

/**
 * Opening balance at the start of dateFrom (رصيد مدور) — matches Edari box statements.
 *
 * Main boxes (FixBal ≠ 0): anchor on FixBal at FixDate (forward/backward through movements).
 * Cashier boxes (FixBal = 0, valid FixDate): daily independent report — opening always 0.
 * No valid FixDate: cumulative accounts — sum all journal movements before period.
 */
function resolvePeriodOpeningBalance(account, allRows, dateFrom, dateTo) {
  const periodStart = startOfCalendarDay(dateFrom);
  if (periodStart == null) return 0;

  const fixDateRaw = account?.fix_date ?? account?.fixDate ?? '';
  const fixBalRaw = parseAmount(account?.fix_bal ?? account?.fixBal);
  const hasValidFixDate = isValidFixDate(fixDateRaw);

  if (!hasValidFixDate) {
    // حسابات تراكمية (مثل زيادة ونقص 31209) — FixDate فارغ، الرصيد من الحركات السابقة
    return computeBalanceBeforePeriod(allRows, dateFrom);
  }

  const fixBal = fixBalRaw !== 0
    ? normalizeCarriedBalance(fixBalRaw, account, { fromFixBal: true })
    : 0;

  // صناديق الكاشير (FixBal = 0): كشف يومي مستقل — رصيد مدور صفر دائماً
  if (fixBal === 0) {
    return 0;
  }

  const fixDayEnd = endOfCalendarDay(fixDateRaw);
  return balanceAtPeriodStartFromFix(allRows, fixBal, fixDayEnd, periodStart);
}

module.exports = {
  parseAmount,
  parseJournalAmount,
  isDebitRow,
  buildStatementLines,
  balanceSummaryLabel,
  debtStatusFromBalance,
  resolveDebtDisplayAmount,
  resolveDebtFromAccount,
  resolveStatementTotals,
  resolveFinalBalance,
  formatRunningBalance,
  sumLineAmounts,
  journalSortKey,
  isJournalAfter,
  filterRowsSinceLastMatch,
  computeBalanceThroughCutoff,
  computeOpeningBalance,
  resolveOpeningBalance,
  resolvePeriodOpeningBalance,
  buildJournalDescription,
  resolveStatementPeriod,
  isBeforePeriodStart,
  isOnOrAfterPeriodStart,
  startOfCalendarDay,
  buildOpeningLine,
  normalizeCarriedBalance,
  deriveOpeningBalance,
  resolveAccountNetBalance,
  netMovementAmount,
  parseEdariDate,
  edariCalendarDayStart,
  rowMatchesCalendarRange,
  rowsInDateRange,
  isValidFixDate,
  sortJournalRowsAsc,
  sortJournalRowsDesc,
  endOfCalendarDay
};
