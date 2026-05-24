function parseAmount(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function isDebitRow(row) {
  return row.Dept === 'True' || row.Dept === true || row.Dept === 1 || row.Dept === '1';
}

function buildStatementLines(rows) {
  let balance = 0;
  const lines = rows.map((row) => {
    const am = parseAmount(row.Am);
    const debit = isDebitRow(row) ? am : 0;
    const credit = isDebitRow(row) ? 0 : am;
    balance = balance - debit + credit;
    return {
      Seq: row.Seq,
      debit,
      credit,
      description: row.Exp1 || row.Remarks || '',
      date: row.Date || row.DtCreated,
      billNum: row.BillNum,
      balance
    };
  });

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const finalBalance = lines.length ? lines[lines.length - 1].balance : 0;

  return {
    lines,
    totalDebit,
    totalCredit,
    finalBalance
  };
}

function debtStatusFromBalance(bal) {
  const n = parseAmount(bal);
  if (n < 0) return 'مدين (عليه)';
  if (n > 0) return 'دائن (له)';
  return 'متزن';
}

function balanceSummaryLabel(balance) {
  const n = parseAmount(balance);
  if (n < 0) return { label: 'رصيد مدين', amount: Math.abs(n), side: 'credit' };
  if (n > 0) return { label: 'رصيد دائن', amount: n, side: 'debit' };
  return { label: 'رصيد دائن', amount: 0, side: 'none' };
}

function formatAccountTitle(account) {
  const num = String(account.Num || '').trim();
  const name = `${account.Name1 || ''}${account.Name2 ? ` ${account.Name2}` : ''}`.trim();
  const address = String(account.Address || '').trim();
  let title = `${num}       ${name}`;
  if (address) title += `    العنوان : ${address}`;
  return title;
}

function sortJournalRows(rows) {
  return [...rows].sort((a, b) => {
    const da = new Date(String(a.Date || a.DtCreated || 0)).getTime();
    const db = new Date(String(b.Date || b.DtCreated || 0)).getTime();
    if (da !== db) return da - db;
    return parseAmount(a.Seq) - parseAmount(b.Seq);
  });
}

module.exports = {
  parseAmount,
  isDebitRow,
  buildStatementLines,
  debtStatusFromBalance,
  balanceSummaryLabel,
  formatAccountTitle,
  sortJournalRows
};
