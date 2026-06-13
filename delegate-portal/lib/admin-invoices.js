const db = require('./db');
const { getInvoiceByBillSeq, getInvoiceByNum, invoiceKindLabel } = require('./invoices');
const { sqlNormalizedEdariDate } = require('./date-utils');

const INV_DATE_SQL = sqlNormalizedEdariDate('i.inv_date');

function listInvoices({
  q = '',
  dateFrom = '',
  dateTo = '',
  limit = 50,
  offset = 0
} = {}) {
  const where = ['1=1'];
  const params = [];

  if (dateFrom) {
    where.push(`${INV_DATE_SQL} >= ?`);
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push(`${INV_DATE_SQL} <= ?`);
    params.push(dateTo);
  }
  if (q) {
    where.push(`(
      i.num LIKE ? OR a.name1 LIKE ? OR a.num LIKE ? OR
      EXISTS (
        SELECT 1 FROM invoice_lines l
        WHERE l.bill_seq = i.seq AND (l.mat_num LIKE ? OR l.mat_name LIKE ? OR l.mat LIKE ?)
      )
    )`);
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }

  const sql = `
    SELECT i.*, a.num AS account_num, a.name1 AS account_name,
      (SELECT COUNT(*) FROM invoice_lines l WHERE l.bill_seq = i.seq) AS line_count_actual
    FROM invoices i
    LEFT JOIN accounts a ON a.seq = i.acc_seq
    WHERE ${where.join(' AND ')}
    ORDER BY ${INV_DATE_SQL} DESC, i.num DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params);
  const total = db.prepare(`
    SELECT COUNT(*) AS c FROM invoices i
    LEFT JOIN accounts a ON a.seq = i.acc_seq
    WHERE ${where.join(' AND ')}
  `).get(...params.slice(0, -2)).c;

  return {
    total,
    invoices: rows.map((r) => ({
      seq: r.seq,
      num: r.num,
      kind: r.kind,
      kindLabel: invoiceKindLabel(r.kind),
      date: r.inv_date,
      total: Number(r.total || 0),
      discount: Number(r.discount || 0),
      netPay: Number(r.total || 0) - Number(r.discount || 0),
      lineCount: Number(r.line_count_actual || r.line_count || 0),
      remarks: r.remarks || '',
      accSeq: r.acc_seq,
      accountNum: r.account_num || '',
      accountName: r.account_name || '',
      syncedAt: r.synced_at
    }))
  };
}

function invoiceStats() {
  const total = db.prepare('SELECT COUNT(*) AS c FROM invoices').get().c;
  const today = db.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(total), 0) AS amount
    FROM invoices WHERE inv_date = date('now')
  `).get();
  const week = db.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(total), 0) AS amount
    FROM invoices WHERE inv_date >= date('now', '-7 days')
  `).get();
  return {
    total,
    todayCount: today?.c || 0,
    todayAmount: today?.amount || 0,
    weekCount: week?.c || 0,
    weekAmount: week?.amount || 0
  };
}

function getAdminInvoice(ref, accSeq) {
  const raw = String(ref || '').trim();
  if (db.prepare('SELECT 1 FROM invoices WHERE seq = ?').get(raw)) {
    return getInvoiceByBillSeq(raw);
  }
  return getInvoiceByNum(raw, accSeq);
}

module.exports = {
  listInvoices,
  invoiceStats,
  getAdminInvoice
};
