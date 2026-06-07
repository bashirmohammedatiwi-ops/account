function parseAmount(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function isDebitRow(row) {
  return row.is_debit === 1 || row.is_debit === true || row.Dept === 'True' || row.Dept === true;
}

function journalSortKey(row) {
  const raw = row.tx_date || row.Date || row.date || '';
  const d = new Date(String(raw).replace(' 00:00:00', ''));
  const t = Number.isNaN(d.getTime()) ? 0 : d.getTime();
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
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('12/30/1899')) return false;
  const t = new Date(raw.replace(' 00:00:00', '')).getTime();
  return !Number.isNaN(t);
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
  const d = new Date(String(value).replace(' 00:00:00', ''));
  if (Number.isNaN(d.getTime())) return 0;
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function filterRowsSinceLastMatch(rows, cutoff) {
  if (!cutoff) return rows;
  if (cutoff.seq) {
    return rows.filter((row) => isJournalAfter(row, cutoff));
  }
  if (isValidFixDate(cutoff.date)) {
    const marker = endOfCalendarDay(cutoff.date);
    return rows.filter((row) => journalSortKey(row).t > marker);
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
    if (!rowAtOrBeforeCutoff(row, cutoff)) break;
    const am = parseAmount(row.am ?? row.Am);
    const debit = isDebitRow(row) ? am : 0;
    const credit = isDebitRow(row) ? 0 : am;
    balance = balance - debit + credit;
  }
  return balance;
}

function normalizeCarriedBalance(balance, account = {}) {
  const b = parseAmount(balance);
  if (b === 0) return 0;
  const accountBal = parseAmount(account?.bal ?? account?.Bal);
  // بعض حسابات Edari تخزّن FixBal موجباً رغم أن الرصيد مدين
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

function sumLineAmounts(lines, field) {
  return (lines || []).reduce((s, l) => s + parseAmount(l[field]), 0);
}

/** إجماليات الكشف — الرصيد المدور + الحركات، وإذا كان رصيد الحساب مديناً يُضمّ إلى الديون */
function resolveStatementTotals({
  lines = [],
  stmt = {},
  account = {},
  useSinceMatch = false,
  openingBalance = 0
} = {}) {
  const lineDebit = sumLineAmounts(lines, 'debit');
  const lineCredit = sumLineAmounts(lines, 'credit');
  const edariDebit = parseAmount(account.tot1);
  const edariCredit = parseAmount(account.tot2);
  const hasOpening = lines.some((l) => l.isOpening);
  const openBal = parseAmount(openingBalance);
  const openDebit = openBal < 0 ? Math.abs(openBal) : 0;
  const accountBal = parseAmount(account.bal);

  if (!useSinceMatch) {
    return {
      totalDebit: parseAmount(stmt.totalDebit),
      totalCredit: parseAmount(stmt.totalCredit)
    };
  }

  let totalDebit;
  let totalCredit;

  if (hasOpening && lines.length) {
    totalDebit = lineDebit;
    totalCredit = lineCredit;
  } else {
    totalDebit = edariDebit > 0 ? edariDebit : lineDebit;
    totalCredit = edariCredit > 0 ? edariCredit : lineCredit;
    if (openDebit > 0 && Math.abs(totalDebit - lineDebit) <= 1) {
      totalDebit = lineDebit + openDebit;
    }
  }

  // رصيد الحساب مدين — اجمع مع الديون حتى يطابق «لكم» في Edari
  if (accountBal < 0) {
    const debtFromBal = Math.abs(accountBal);
    const net = totalDebit - totalCredit;
    if (debtFromBal > net + 0.5) {
      totalDebit = totalCredit + debtFromBal;
    }
  }

  return { totalDebit, totalCredit };
}

function buildOpeningLine(openingBalance, cutoff) {
  if (!cutoff) return null;
  const balance = parseAmount(openingBalance);
  const debit = balance < 0 ? Math.abs(balance) : 0;
  const credit = balance > 0 ? balance : 0;
  return {
    seq: null,
    debit,
    credit,
    description: 'رصيد مدور',
    date: cutoff.date || '',
    billNum: null,
    billSeq: null,
    billKind: null,
    invoiceRef: null,
    hasInvoice: false,
    isReconciliation: false,
    isOpening: true,
    clickable: false,
    balance
  };
}

function buildStatementLines(rows, options = {}) {
  const { isInvoiceMovement, resolveBillSeq, resolveBillNum } = require('./invoices');
  const { isReconciliationMovement } = require('./reconciliation-utils');
  let balance = parseAmount(options.openingBalance);
  const lines = sortJournalRowsAsc(rows).map((row) => {
    const am = parseAmount(row.am ?? row.Am);
    const debit = isDebitRow(row) ? am : 0;
    const credit = isDebitRow(row) ? 0 : am;
    balance = balance - debit + credit;
    const billNum = resolveBillNum(row);
    const billSeq = resolveBillSeq(row) || null;
    const hasInvoice = isInvoiceMovement(row) && debit > 0;
    const invoiceRef = billNum || billSeq || null;
    const description = row.exp1 || row.Exp1 || row.remarks || row.Remarks || '';
    return {
      seq: row.seq ?? row.Seq,
      debit,
      credit,
      description,
      date: row.tx_date || row.Date || row.DtCreated,
      billNum: billNum || null,
      billSeq,
      billKind: row.bill_kind ?? row.BillKind ?? null,
      invoiceRef: hasInvoice ? invoiceRef : null,
      hasInvoice,
      isReconciliation: isReconciliationMovement(row),
      clickable: Boolean(hasInvoice && invoiceRef && debit > 0),
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

function balanceSummaryLabel(balance) {
  const n = parseAmount(balance);
  if (n < 0) return { label: 'لكم', amount: Math.abs(n), side: 'debit' };
  if (n > 0) return { label: 'عليكم', amount: n, side: 'credit' };
  return { label: 'متعادل', amount: 0, side: 'none' };
}

function debtStatusFromBalance(bal) {
  const n = parseAmount(bal);
  if (n > 0) return 'دائن (له)';
  return 'الديون';
}

/** مبلغ «الديون» — إجمالي مدين − دائن، أو رصيد الحساب إذا كان مديناً */
function resolveDebtDisplayAmount(data = {}) {
  const totalDebit = parseAmount(data.totalDebit);
  const totalCredit = parseAmount(data.totalCredit);
  const netFromTotals = totalDebit - totalCredit;
  if (netFromTotals > 0) return netFromTotals;

  const accountBal = parseAmount(data.finalBalance ?? data.account?.bal ?? data.bal);
  if (accountBal < 0) return Math.abs(accountBal);

  const lines = data.lines || [];
  const lastLineBal = lines.length ? parseAmount(lines[lines.length - 1].balance) : null;
  if (lastLineBal < 0) return Math.abs(lastLineBal);

  const stmtBal = parseAmount(data.stmtFinalBalance);
  if (stmtBal < 0) return Math.abs(stmtBal);

  return 0;
}

module.exports = {
  buildStatementLines,
  balanceSummaryLabel,
  debtStatusFromBalance,
  resolveDebtDisplayAmount,
  resolveStatementTotals,
  sumLineAmounts,
  journalSortKey,
  isJournalAfter,
  filterRowsSinceLastMatch,
  computeBalanceThroughCutoff,
  computeOpeningBalance,
  buildOpeningLine,
  normalizeCarriedBalance,
  isValidFixDate,
  sortJournalRowsAsc,
  sortJournalRowsDesc,
  endOfCalendarDay
};
