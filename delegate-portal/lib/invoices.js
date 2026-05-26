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

function normalizeBillNum(value) {
  const num = String(value ?? '').replace(/[^0-9]/g, '');
  return num && num !== '0' ? num : '';
}

function extractBillNumFromText(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  const patterns = [
    /(?:فات?[او]?رة?|فت?[او]?رة?)\s*(\d+)/i,
    /(?:invoice|bill)\s*#?\s*(\d+)/i,
    /(\d+)\s*[-–—]?\s*$/
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return normalizeBillNum(m[1]);
  }
  return '';
}

function resolveBillNum(row) {
  const fromField = normalizeBillNum(row.bill_num ?? row.BillNum);
  if (fromField) return fromField;
  return extractBillNumFromText(row.exp1 ?? row.Exp1 ?? row.description);
}

function normalizeAccSeq(value) {
  const seq = String(value ?? '').replace(/[^0-9]/g, '');
  return seq && seq !== '0' ? seq : '';
}

function lookupBillSeqByNum(billNum, accSeq) {
  const num = normalizeBillNum(billNum);
  if (!num) return '';
  const acc = normalizeAccSeq(accSeq);
  if (acc) {
    const scoped = db.prepare(
      'SELECT seq FROM invoices WHERE num = ? AND acc_seq = ? LIMIT 1'
    ).get(num, acc);
    if (scoped) return String(scoped.seq);
  }
  const hit = db.prepare('SELECT seq FROM invoices WHERE num = ? LIMIT 1').get(num);
  return hit ? String(hit.seq) : '';
}

function isInvoiceMovement(row) {
  if (normalizeBillSeq(row.bill_seq ?? row.billSeq)) return true;
  if (normalizeBillNum(row.bill_num ?? row.BillNum)) return true;
  return Boolean(extractBillNumFromText(row.exp1 ?? row.Exp1 ?? row.description));
}

function resolveBillSeq(row) {
  const direct = normalizeBillSeq(row.bill_seq ?? row.billSeq);
  if (direct) return direct;
  const accSeq = normalizeAccSeq(row.acc_seq ?? row.Acc ?? row.accSeq);
  return lookupBillSeqByNum(resolveBillNum(row), accSeq);
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

function getInvoiceByNum(billNum, accSeq) {
  const num = normalizeBillNum(billNum);
  if (!num) return null;
  const acc = normalizeAccSeq(accSeq);
  let invoice = null;
  if (acc) {
    invoice = db.prepare(
      'SELECT seq FROM invoices WHERE num = ? AND acc_seq = ? LIMIT 1'
    ).get(num, acc);
  }
  if (!invoice) {
    invoice = db.prepare('SELECT seq FROM invoices WHERE num = ? LIMIT 1').get(num);
  }
  if (!invoice) return null;
  return getInvoiceByBillSeq(invoice.seq);
}

function getInvoiceByRef(ref) {
  return getInvoiceForExport(ref, 'auto');
}

function getInvoiceForExport(ref, mode = 'auto', accSeq) {
  const raw = String(ref ?? '').trim();
  if (!raw) return null;
  if (mode === 'seq') return getInvoiceByBillSeq(raw);
  if (mode === 'num') return getInvoiceByNum(raw, accSeq);

  if (db.prepare('SELECT 1 FROM invoices WHERE seq = ?').get(raw)) {
    return getInvoiceByBillSeq(raw);
  }
  const byNum = getInvoiceByNum(raw, accSeq);
  if (byNum) return byNum;
  return getInvoiceByBillSeq(raw);
}

function canAgentAccessInvoice(agentId, ref, options = {}) {
  const raw = String(ref ?? '').trim();
  if (!raw) return false;
  const accHint = normalizeAccSeq(options.accSeq);
  const by = String(options.by || 'auto').trim();

  const seq = normalizeBillSeq(raw);
  if (seq && (by === 'auto' || by === 'seq')) {
    const journalBySeq = accHint
      ? db.prepare(
        'SELECT acc_seq FROM journal WHERE bill_seq = ? AND acc_seq = ? LIMIT 1'
      ).get(seq, accHint)
      : db.prepare(
        'SELECT acc_seq FROM journal WHERE bill_seq = ? LIMIT 1'
      ).get(seq);
    if (journalBySeq && canAgentAccess(agentId, journalBySeq.acc_seq)) return true;

    const invoice = db.prepare('SELECT acc_seq FROM invoices WHERE seq = ?').get(seq);
    if (invoice?.acc_seq && canAgentAccess(agentId, invoice.acc_seq)) return true;
  }

  const num = normalizeBillNum(raw);
  if (num && (by === 'auto' || by === 'num')) {
    const journalByNum = accHint
      ? db.prepare(
        'SELECT acc_seq FROM journal WHERE bill_num = ? AND acc_seq = ? LIMIT 1'
      ).get(num, accHint)
      : db.prepare(
        'SELECT acc_seq FROM journal WHERE bill_num = ? LIMIT 1'
      ).get(num);
    if (journalByNum && canAgentAccess(agentId, journalByNum.acc_seq)) return true;

    const invoice = accHint
      ? db.prepare(
        'SELECT acc_seq FROM invoices WHERE num = ? AND acc_seq = ? LIMIT 1'
      ).get(num, accHint)
      : db.prepare('SELECT acc_seq FROM invoices WHERE num = ? LIMIT 1').get(num);
    if (invoice?.acc_seq && canAgentAccess(agentId, invoice.acc_seq)) return true;
  }

  return false;
}

module.exports = {
  invoiceKindLabel,
  normalizeBillSeq,
  normalizeBillNum,
  normalizeAccSeq,
  extractBillNumFromText,
  resolveBillNum,
  isInvoiceMovement,
  resolveBillSeq,
  getInvoiceByBillSeq,
  getInvoiceByNum,
  getInvoiceByRef,
  getInvoiceForExport,
  canAgentAccessInvoice,
  mapInvoiceRow,
  mapInvoiceLineRow
};
