function parseAmount(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function isDebitRow(row) {
  return row.is_debit === 1 || row.is_debit === true || row.Dept === 'True' || row.Dept === true;
}

function parseEdariDate(value) {
  const raw = String(value || '').trim().replace(' 00:00:00', '');
  if (!raw || raw.startsWith('12/30/1899')) return null;

  let d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;

  const parts = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (parts) {
    const first = Number(parts[1]);
    const second = Number(parts[2]);
    const year = Number(parts[3]);
    if (first > 12) d = new Date(year, second - 1, first);
    else if (second > 12) d = new Date(year, first - 1, second);
    else d = new Date(year, second - 1, first);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
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
    return normalizeCarriedBalance(fixBal, account);
  }

  const edariDebit = parseAmount(account?.tot1);
  const edariCredit = parseAmount(account?.tot2);
  if (edariDebit > 0) {
    const moveDebit = sumMovementAmount(movementRows, 'debit');
    const openingDebit = edariDebit - moveDebit;
    if (openingDebit > 0) {
      return normalizeCarriedBalance(openingDebit, account);
    }
  }
  if (edariCredit > 0) {
    const moveCredit = sumMovementAmount(movementRows, 'credit');
    const openingCredit = edariCredit - moveCredit;
    if (openingCredit > 0) {
      return normalizeCarriedBalance(openingCredit, account);
    }
  }
  return 0;
}

function normalizeCarriedBalance(balance, account = {}) {
  const b = parseAmount(balance);
  if (b === 0) return 0;
  const accountBal = parseAmount(account?.bal ?? account?.Bal);
  // FixBal في Edari غالباً موجب لكنه يُعرض في عمود المدين
  if (b > 0 && accountBal <= 0) return -Math.abs(b);
  if (b < 0 && accountBal > 0) return Math.abs(b);
  return b;
}

function computeOpeningBalance(rows, cutoff, account) {
  if (!cutoff) return 0;
  const fixBal = parseAmount(account?.fix_bal ?? account?.fixBal);
  if (cutoff.source === 'fix_date' && isValidFixDate(cutoff.date) && fixBal !== 0) {
    return normalizeCarriedBalance(fixBal, account);
  }
  if (cutoff.seq || isValidFixDate(cutoff.date)) {
    return normalizeCarriedBalance(computeBalanceThroughCutoff(rows, cutoff), account);
  }
  return normalizeCarriedBalance(fixBal, account);
}

/** رصيد افتتاحي — FixBal ثم Tot1/Tot2 ثم مجموع الحركات قبل FixDate */
function resolveOpeningBalance(account, allRows, movementRows, cutoff) {
  const fixBal = parseAmount(account?.fix_bal ?? account?.fixBal);
  if (fixBal !== 0) {
    return normalizeCarriedBalance(fixBal, account);
  }

  const fromTotals = deriveOpeningBalance(account, movementRows);
  if (fromTotals !== 0) {
    return fromTotals;
  }

  if (cutoff && (cutoff.seq || isValidFixDate(cutoff.date))) {
    const throughCutoff = computeBalanceThroughCutoff(allRows, cutoff);
    if (throughCutoff !== 0) {
      return normalizeCarriedBalance(throughCutoff, account);
    }
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
  if (!cutoff?.seq && !isValidFixDate(cutoff?.date)) return null;
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
    const isReturnInvoice = isSalesReturnMovement(row);
    const hasInvoice = (isInvoiceMovement(row) && debit > 0) || isReturnInvoice;
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
      isReconciliation: isReconciliationMovement(row),
      clickable: Boolean(hasInvoice && invoiceRef && (debit > 0 || credit > 0)),
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

/** صف الرصيد النهائي — Edari يضع مبلغ المدين في عمود الدائن */
function balanceSummaryLabel(balance, accountName = '') {
  const n = parseAmount(balance);
  const suffix = accountName ? ` ${String(accountName).trim()}` : '';
  if (n < 0) return { label: `رصيد مدين${suffix}`, amount: Math.abs(n), side: 'credit' };
  if (n > 0) return { label: `رصيد دائن${suffix}`, amount: n, side: 'debit' };
  return { label: 'متعادل', amount: 0, side: 'none' };
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

module.exports = {
  parseAmount,
  buildStatementLines,
  balanceSummaryLabel,
  debtStatusFromBalance,
  resolveDebtDisplayAmount,
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
  buildJournalDescription,
  resolveStatementPeriod,
  isBeforePeriodStart,
  isOnOrAfterPeriodStart,
  startOfCalendarDay,
  buildOpeningLine,
  normalizeCarriedBalance,
  deriveOpeningBalance,
  parseEdariDate,
  isValidFixDate,
  sortJournalRowsAsc,
  sortJournalRowsDesc,
  endOfCalendarDay
};
