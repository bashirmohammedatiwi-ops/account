const db = require('./db');
const { canAgentAccess } = require('./accounts');

function invoiceKindLabel(kind) {
  const map = {
    0: 'فاتورة',
    1: 'فاتورة مبيعات',
    2: 'مرتجع مبيعات',
    3: 'فاتورة مشتريات',
    4: 'فاتورة مبيعات',
    5: 'مرتجع'
  };
  const k = Number(kind);
  return map[k] ?? (kind != null && kind !== '' ? `فاتورة (${kind})` : 'فاتورة مبيعات');
}

function normalizeBillSeq(value) {
  const seq = String(value ?? '').replace(/[^0-9]/g, '');
  return seq && seq !== '0' ? seq : '';
}

function isInvoiceMovement(row) {
  if (normalizeBillSeq(row.bill_seq ?? row.billSeq)) return true;
  return Boolean(String(row.bill_num ?? row.billNum ?? '').trim());
}

function resolveBillSeq(row) {
  const direct = normalizeBillSeq(row.bill_seq ?? row.billSeq);
  if (direct) return direct;
  const billNum = String(row.bill_num ?? row.billNum ?? '').trim();
  if (!billNum) return '';
  const hit = db.prepare('SELECT seq FROM invoices WHERE num = ? LIMIT 1').get(billNum);
  return hit ? String(hit.seq) : '';
}

function lineTotal(quant, price, stored) {
  const total = Number(stored);
  if (!Number.isNaN(total) && total > 0) return total;
  return Number(quant || 0) * Number(price || 0);
}

function mapInvoiceRow(row, account) {
  if (!row) return null;
  const total = Number(row.total || 0);
  const discount = Number(row.discount || 0);
  const payment = Number(row.payment || 0);
  const netPay = payment > 0 ? payment : Math.max(total - discount, 0);
  return {
    seq: row.seq,
    num: row.num,
    kind: row.kind,
    kindLabel: invoiceKindLabel(row.kind),
    date: row.inv_date,
    total,
    payment,
    discount,
    netPay,
    lineCount: row.line_count,
    remarks: row.remarks,
    accSeq: row.acc_seq,
    accountNum: account?.num || '',
    accountName: account?.name1 || ''
  };
}

function mapInvoiceLineRow(row) {
  const quant = Number(row.quant || 0);
  const price = Number(row.price || 0);
  const bonus = Number(row.bonus || 0);
  return {
    billNo: row.bill_no,
    mat: row.mat,
    matNum: row.mat_num || row.mat || '',
    matName: row.mat_name || '',
    quant,
    bonus,
    price,
    lineTotal: lineTotal(quant, price, row.line_total),
    remarks: row.remarks || '',
    kind: row.kind
  };
}

function getInvoiceByBillSeq(billSeq) {
  const seq = normalizeBillSeq(billSeq);
  if (!seq) return null;
  const invoice = db.prepare('SELECT * FROM invoices WHERE seq = ?').get(seq);
  if (!invoice) return null;
  const account = invoice.acc_seq
    ? db.prepare('SELECT seq, num, name1 FROM accounts WHERE seq = ?').get(String(invoice.acc_seq))
    : null;
  const lines = db.prepare(`
    SELECT * FROM invoice_lines WHERE bill_seq = ? ORDER BY bill_no
  `).all(seq);
  const mappedLines = lines.map(mapInvoiceLineRow);
  const computedTotal = mappedLines.reduce((s, l) => s + l.lineTotal, 0);
  const mappedInvoice = mapInvoiceRow(invoice, account);
  if (!mappedInvoice.total && computedTotal) mappedInvoice.total = computedTotal;
  if (!mappedInvoice.netPay && mappedInvoice.total) {
    mappedInvoice.netPay = Math.max(mappedInvoice.total - mappedInvoice.discount, 0);
  }
  return {
    invoice: mappedInvoice,
    lines: mappedLines
  };
}

function canAgentAccessInvoice(agentId, billSeq) {
  const seq = normalizeBillSeq(billSeq);
  if (!seq) return false;

  const journalHit = db.prepare(
    'SELECT acc_seq FROM journal WHERE bill_seq = ? LIMIT 1'
  ).get(seq);
  if (journalHit && canAgentAccess(agentId, journalHit.acc_seq)) return true;

  const invoice = db.prepare('SELECT acc_seq FROM invoices WHERE seq = ?').get(seq);
  if (invoice?.acc_seq && canAgentAccess(agentId, invoice.acc_seq)) return true;

  return false;
}

module.exports = {
  invoiceKindLabel,
  normalizeBillSeq,
  isInvoiceMovement,
  resolveBillSeq,
  getInvoiceByBillSeq,
  canAgentAccessInvoice,
  mapInvoiceRow,
  mapInvoiceLineRow
};
