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

function buildStatementLines(rows) {
  const { isInvoiceMovement, resolveBillSeq, resolveBillNum } = require('./invoices');
  const { isReconciliationMovement } = require('./reconciliation-utils');
  let balance = 0;
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
  lines.reverse();
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
  if (n < 0) return { label: 'رصيد مدين', amount: Math.abs(n), side: 'credit' };
  if (n > 0) return { label: 'رصيد دائن', amount: n, side: 'debit' };
  return { label: 'رصيد دائن', amount: 0, side: 'none' };
}

function debtStatusFromBalance(bal) {
  const n = parseAmount(bal);
  if (n > 0) return 'دائن (له)';
  return 'الديون';
}

module.exports = {
  buildStatementLines,
  balanceSummaryLabel,
  debtStatusFromBalance,
  journalSortKey,
  isJournalAfter,
  filterRowsSinceLastMatch,
  isValidFixDate,
  sortJournalRowsAsc,
  sortJournalRowsDesc,
  endOfCalendarDay
};
