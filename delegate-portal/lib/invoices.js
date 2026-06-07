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
    /(?:مردود|مرتجع)\s*(?:مبيعات\s*)?(?:بال)?(?:فات?[او]?رة?\s*)?(\d+)/i,
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

function isDebitJournalRow(row) {
  const dept = row?.is_debit ?? row?.Dept;
  return dept === 1 || dept === true || dept === 'True' || dept === '1';
}

function movementText(row) {
  return String(row?.exp1 ?? row?.Exp1 ?? row?.description ?? row?.remarks ?? row?.Remarks ?? '').trim();
}

function isReturnInvoiceKind(kind) {
  const k = Number(kind);
  return k === 2 || k === 5;
}

function isSalesReturnText(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  if (/مردود|مرتجع/i.test(s) && /(?:فات|مبيع)/i.test(s)) return true;
  return /مردود\s*مبيعات/i.test(s);
}

function lookupInvoiceKind(billSeq) {
  const seq = normalizeBillSeq(billSeq);
  if (!seq) return null;
  const row = db.prepare('SELECT kind FROM invoices WHERE seq = ?').get(seq);
  return row?.kind ?? null;
}

/** مردود مبيعات — حركة دائن مرتبطة بفاتورة */
function isSalesReturnMovement(row) {
  if (isDebitJournalRow(row)) return false;
  if (!isInvoiceMovement(row)) return false;

  const text = movementText(row);
  if (isSalesReturnText(text)) return true;

  const billKind = row.bill_kind ?? row.BillKind;
  if (isReturnInvoiceKind(billKind)) return true;

  const billSeq = normalizeBillSeq(row.bill_seq ?? row.billSeq) || resolveBillSeq(row);
  const invKind = lookupInvoiceKind(billSeq);
  if (isReturnInvoiceKind(invKind)) return true;

  return false;
}

function isSalesInvoiceMovement(row) {
  return isDebitJournalRow(row) && isInvoiceMovement(row) && !isSalesReturnText(movementText(row));
}

function resolveBillSeq(row) {
  const direct = normalizeBillSeq(row.bill_seq ?? row.billSeq);
  if (direct) return direct;
  const accSeq = normalizeAccSeq(row.acc_seq ?? row.Acc ?? row.accSeq);
  return lookupBillSeqByNum(resolveBillNum(row), accSeq);
}

function roundAmount(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return 0;
  return Math.round(x * 100) / 100;
}

/** مبلغ السطر: الكمية × السعر، مع تصحيح إن كان المخزّن في Edari مختلفاً */
function lineTotal(quant, price, stored) {
  const q = Number(quant || 0);
  const p = Number(price || 0);
  const computed = roundAmount(q * p);
  const storedN = roundAmount(stored);
  if (storedN > 0 && computed > 0) {
    if (Math.abs(storedN - computed) <= 1) return storedN;
    return computed;
  }
  if (storedN > 0) return storedN;
  return computed;
}

/**
 * إجمالي الفاتورة من مجموع البنود؛ الصافي = الإجمالي − الحسومات.
 * لا نستخدم Payment كصافي إلا إن طابق (إجمالي − خصم) لتجنب أخطاء Edari.
 */
function resolveInvoiceTotals(header, lines = []) {
  const discount = roundAmount(Math.max(0, Number(header?.discount ?? 0)));
  const headerTotal = roundAmount(Math.max(0, Number(header?.total ?? 0)));
  const headerPayment = roundAmount(Math.max(0, Number(header?.payment ?? 0)));

  const linesSum = roundAmount(
    lines.reduce((s, l) => s + roundAmount(l.lineTotal ?? 0), 0)
  );

  let total = headerTotal;
  if (lines.length > 0 && linesSum > 0) {
    total = linesSum;
  } else if (!total && linesSum > 0) {
    total = linesSum;
  }

  const netFromFormula = roundAmount(Math.max(0, total - discount));
  let netPay = netFromFormula;
  if (headerPayment > 0 && Math.abs(headerPayment - netFromFormula) <= 1) {
    netPay = headerPayment;
  }

  return { total, discount, netPay, payment: headerPayment, linesSum };
}

function mapInvoiceRow(row, account, totals) {
  if (!row) return null;
  const t = totals || resolveInvoiceTotals(row, []);
  return {
    seq: row.seq,
    num: row.num,
    kind: row.kind,
    kindLabel: invoiceKindLabel(row.kind),
    date: row.inv_date,
    total: t.total,
    payment: t.payment,
    discount: t.discount,
    netPay: t.netPay,
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
  const totals = resolveInvoiceTotals(invoice, mappedLines);
  const mappedInvoice = mapInvoiceRow(invoice, account, totals);
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

  const seq = normalizeBillSeq(raw);
  if (seq) {
    if (accHint) {
      const journalScoped = db.prepare(
        'SELECT acc_seq FROM journal WHERE bill_seq = ? AND acc_seq = ? LIMIT 1'
      ).get(seq, accHint);
      if (journalScoped && canAgentAccess(agentId, journalScoped.acc_seq)) return true;
    }
    const journalRows = db.prepare(
      'SELECT DISTINCT acc_seq FROM journal WHERE bill_seq = ?'
    ).all(seq);
    for (const row of journalRows) {
      if (row?.acc_seq && canAgentAccess(agentId, row.acc_seq)) return true;
    }

    const invoice = db.prepare('SELECT acc_seq FROM invoices WHERE seq = ?').get(seq);
    if (invoice?.acc_seq && canAgentAccess(agentId, invoice.acc_seq)) return true;
  }

  const num = normalizeBillNum(raw);
  if (num) {
    if (accHint) {
      const journalScoped = db.prepare(
        'SELECT acc_seq FROM journal WHERE bill_num = ? AND acc_seq = ? LIMIT 1'
      ).get(num, accHint);
      if (journalScoped && canAgentAccess(agentId, journalScoped.acc_seq)) return true;

      const invoiceScoped = db.prepare(
        'SELECT acc_seq FROM invoices WHERE num = ? AND acc_seq = ? LIMIT 1'
      ).get(num, accHint);
      if (invoiceScoped?.acc_seq && canAgentAccess(agentId, invoiceScoped.acc_seq)) return true;
    }

    const journalRows = db.prepare(
      'SELECT DISTINCT acc_seq FROM journal WHERE bill_num = ?'
    ).all(num);
    for (const row of journalRows) {
      if (row?.acc_seq && canAgentAccess(agentId, row.acc_seq)) return true;
    }

    const invoiceRows = db.prepare(
      'SELECT DISTINCT acc_seq FROM invoices WHERE num = ?'
    ).all(num);
    for (const row of invoiceRows) {
      if (row?.acc_seq && canAgentAccess(agentId, row.acc_seq)) return true;
    }
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
  isSalesInvoiceMovement,
  isSalesReturnMovement,
  isSalesReturnText,
  isReturnInvoiceKind,
  resolveBillSeq,
  getInvoiceByBillSeq,
  getInvoiceByNum,
  getInvoiceByRef,
  getInvoiceForExport,
  canAgentAccessInvoice,
  mapInvoiceRow,
  mapInvoiceLineRow,
  resolveInvoiceTotals,
  lineTotal,
  roundAmount
};
