const db = require('./db');
const { canAgentAccess, getDescendantSeqs } = require('./accounts');
const { invoiceKindLabel, isReturnInvoiceKind } = require('./invoices');

function mapInvoiceRow(r) {
  const netPay = Number(r.total || 0) - Number(r.discount || 0);
  const isReturn = isReturnInvoiceKind(r.kind);
  return {
    seq: r.seq,
    num: r.num,
    kind: r.kind,
    kindLabel: invoiceKindLabel(r.kind),
    isReturn,
    date: r.inv_date,
    total: Number(r.total || 0),
    discount: Number(r.discount || 0),
    netPay: isReturn ? -Math.abs(netPay) : netPay,
    accSeq: r.acc_seq,
    accountNum: r.account_num || '',
    accountName: r.account_name || ''
  };
}

function computeSummary(rows) {
  let salesCount = 0;
  let returnCount = 0;
  let salesAmount = 0;
  let returnsAmount = 0;

  for (const r of rows) {
    const net = Number(r.total || 0) - Number(r.discount || 0);
    if (isReturnInvoiceKind(r.kind)) {
      returnCount += 1;
      returnsAmount += Math.abs(net);
    } else {
      salesCount += 1;
      salesAmount += net;
    }
  }

  return {
    salesCount,
    returnCount,
    invoiceCount: rows.length,
    salesAmount,
    returnsAmount,
    netSales: salesAmount - returnsAmount
  };
}

function queryAgentSalesReport(agentId, {
  treeSeq = '',
  dateFrom = '',
  dateTo = '',
  limit = 100,
  offset = 0
} = {}) {
  const tree = String(treeSeq || '').trim();
  if (!tree) throw new Error('يرجى اختيار الشجرة');
  if (!canAgentAccess(agentId, tree)) throw new Error('لا تملك صلاحية هذه الشجرة');

  const seqs = getDescendantSeqs(tree);
  if (!seqs.length) {
    return { summary: computeSummary([]), invoices: [], total: 0 };
  }

  const where = [
    `i.acc_seq IN (${seqs.map(() => '?').join(',')})`,
    'CAST(i.kind AS INTEGER) != 3'
  ];
  const params = [...seqs];

  if (dateFrom) {
    where.push('i.inv_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push('i.inv_date <= ?');
    params.push(dateTo);
  }

  const baseSql = `
    FROM invoices i
    LEFT JOIN accounts a ON a.seq = i.acc_seq
    WHERE ${where.join(' AND ')}
  `;

  const rows = db.prepare(`
    SELECT i.*, a.num AS account_num, a.name1 AS account_name
    ${baseSql}
    ORDER BY i.inv_date DESC, CAST(i.num AS INTEGER) DESC, i.num DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const total = db.prepare(`SELECT COUNT(*) AS c ${baseSql}`).get(...params).c;
  const summaryRows = db.prepare(`SELECT i.kind, i.total, i.discount ${baseSql}`).all(...params);

  return {
    summary: computeSummary(summaryRows),
    invoices: rows.map(mapInvoiceRow),
    total
  };
}

module.exports = {
  queryAgentSalesReport
};
