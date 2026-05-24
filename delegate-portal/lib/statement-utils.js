function parseAmount(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function isDebitRow(row) {
  return row.is_debit === 1 || row.is_debit === true || row.Dept === 'True' || row.Dept === true;
}

function buildStatementLines(rows) {
  let balance = 0;
  const lines = rows.map((row) => {
    const am = parseAmount(row.am ?? row.Am);
    const debit = isDebitRow(row) ? am : 0;
    const credit = isDebitRow(row) ? 0 : am;
    balance = balance - debit + credit;
    return {
      seq: row.seq ?? row.Seq,
      debit,
      credit,
      description: row.exp1 || row.Exp1 || '',
      date: row.tx_date || row.Date || row.DtCreated,
      billNum: row.bill_num || row.BillNum,
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
  debtStatusFromBalance
};
