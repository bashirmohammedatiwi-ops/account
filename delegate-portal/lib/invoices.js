const db = require('./db');
const { canAgentAccess } = require('./accounts');

function invoiceKindLabel(kind) {
  const map = {
    0: 'مبيعات',
    1: 'مشتريات',
    2: 'مرتجع مبيعات',
    3: 'مرتجع مشتريات'
  };
  const k = Number(kind);
  return map[k] ?? (kind != null && kind !== '' ? `نوع ${kind}` : '—');
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

function mapInvoiceRow(row) {
  if (!row) return null;
  return {
    seq: row.seq,
    num: row.num,
    kind: row.kind,
    kindLabel: invoiceKindLabel(row.kind),
    date: row.inv_date,
    total: row.total,
    payment: row.payment,
    discount: row.discount,
    lineCount: row.line_count,
    remarks: row.remarks,
    accSeq: row.acc_seq
  };
}

function mapInvoiceLineRow(row) {
  return {
    billNo: row.bill_no,
    mat: row.mat,
    matName: row.mat_name,
    quant: row.quant,
    price: row.price,
    lineTotal: Number(row.quant || 0) * Number(row.price || 0),
    kind: row.kind
  };
}

function getInvoiceByBillSeq(billSeq) {
  const seq = normalizeBillSeq(billSeq);
  if (!seq) return null;
  const invoice = db.prepare('SELECT * FROM invoices WHERE seq = ?').get(seq);
  if (!invoice) return null;
  const lines = db.prepare(`
    SELECT * FROM invoice_lines WHERE bill_seq = ? ORDER BY bill_no
  `).all(seq);
  return {
    invoice: mapInvoiceRow(invoice),
    lines: lines.map(mapInvoiceLineRow)
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
