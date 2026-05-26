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

function filterRowsSinceLastMatch(rows, cutoff, fixDate) {
  if (cutoff?.seq) {
    return rows.filter((row) => isJournalAfter(row, cutoff));
  }
  if (isValidFixDate(fixDate)) {
    const marker = new Date(String(fixDate).replace(' 00:00:00', '')).getTime();
    return rows.filter((row) => journalSortKey(row).t > marker);
  }
  return rows;
}

function buildStatementLines(rows) {
  const { isInvoiceMovement, resolveBillSeq, resolveBillNum } = require('./invoices');
  const reconText = /مطابقة|تصفير|ترصيد|دفعة|خصم|حسم/i;
  let balance = 0;
  const lines = rows.map((row) => {
    const am = parseAmount(row.am ?? row.Am);
    const debit = isDebitRow(row) ? am : 0;
    const credit = isDebitRow(row) ? 0 : am;
    balance = balance - debit + credit;
    const billNum = resolveBillNum(row);
    const billSeq = resolveBillSeq(row) || null;
    const hasInvoice = isInvoiceMovement(row) && debit > 0;
    const invoiceRef = billSeq || billNum || null;
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
      isReconciliation: !isDebitRow(row) && reconText.test(description),
      clickable: Boolean(hasInvoice && invoiceRef && debit > 0),
      balance
    };
  });
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  return {
    lines,
    totalDebit,
    totalCredit,
    finalBalance: lines.length ? lines[lines.length - 1].balance : 0
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
  isValidFixDate
};
