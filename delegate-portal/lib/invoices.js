const db = require('./db');
const { canAgentAccess } = require('./accounts');
const { invoiceKindLabel, isReturnInvoiceKind } = require('./invoice-kinds');

function normalizeBillSeq(value) {
  const s = String(value ?? '').trim();
  if (/^PY[0-9A-Za-z]+:/i.test(s)) return s;
  const seq = s.replace(/[^0-9]/g, '');
  return seq && seq !== '0' ? seq : '';
}

function pySeqSuffix(value) {
  const s = String(value ?? '').trim();
  const py = s.match(/^PY[0-9A-Za-z]+:(.+)$/i);
  if (py) {
    const n = String(py[1]).replace(/[^0-9]/g, '');
    return n && n !== '0' ? n : '';
  }
  const digits = s.replace(/[^0-9]/g, '');
  return digits && digits !== '0' ? digits : '';
}

/** مراجع الفاتورة كما يرسلها التطبيق: PY2025:99 أو 202599 بعد حذف الحروف. */
function invoiceSeqCandidates(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  const out = [];
  const add = (v) => {
    const s = String(v || '').trim();
    if (s && !out.includes(s)) out.push(s);
  };
  add(raw);
  if (/^PY[0-9A-Za-z]+:/i.test(raw)) {
    add(pySeqSuffix(raw));
    return out;
  }
  const digits = raw.replace(/[^0-9]/g, '');
  add(digits);
  const glued = digits.match(/^(20\d{2})(\d+)$/);
  if (glued) add(`PY${glued[1]}:${glued[2]}`);
  return out;
}

function looksLikeGluedPrevYearRef(value) {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  const glued = digits.match(/^(20\d{2})(\d+)$/);
  return Boolean(glued && glued[2]);
}

function journalYearScope(row) {
  const seq = String(row?.seq ?? row?.Seq ?? '').trim();
  const match = seq.match(/^(PY[0-9A-Za-z]+):/i);
  return match ? match[1] : '';
}

function yearScopeFromRef(ref) {
  const match = String(ref ?? '').trim().match(/^(PY[0-9A-Za-z]+):/i);
  return match ? match[1] : '';
}

function findInvoiceRowByRef(billSeq) {
  const raw = String(billSeq ?? '').trim();
  if (!raw) return null;
  if (/^PY[0-9A-Za-z]+:/i.test(raw)) {
    const exact = db.prepare('SELECT * FROM invoices WHERE seq = ?').get(raw);
    if (exact) return exact;
    const scope = yearScopeFromRef(raw);
    const suffix = pySeqSuffix(raw);
    if (!scope || !suffix) return null;
    return db.prepare('SELECT * FROM invoices WHERE seq = ?').get(`${scope}:${suffix}`) || null;
  }
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const current = db.prepare(`
    SELECT * FROM invoices WHERE seq = ? AND IFNULL(seq, '') NOT LIKE 'PY%'
  `).get(digits);
  if (current) return current;
  const glued = digits.match(/^(20\d{2})(\d+)$/);
  if (!glued) return null;
  return db.prepare('SELECT * FROM invoices WHERE seq = ?').get(`PY${glued[1]}:${glued[2]}`) || null;
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
    /(?:مبيعات\s*)?(?:بال)?(?:فات?[او]?رة?|فت?[او]?رة?)\s*(\d+)/i,
    /(?:invoice|bill)\s*#?\s*(\d+)/i
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return normalizeBillNum(m[1]);
  }
  return '';
}

function isInvoiceText(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  if (isSalesReturnText(s)) return true;
  if (/(?:مبيعات|فات?[او]?رة?|invoice|bill)/i.test(s)) return true;
  return false;
}

function isPaymentOrReconciliationText(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  if (isSalesReturnText(s)) return false;
  return /(?:سند|تسديد|تصغير|تصفير|مطابقة|ترصيد|دفعة|خصم|حسم)/i.test(s);
}

function resolveBillNum(row) {
  const fromField = normalizeBillNum(row.bill_num ?? row.BillNum);
  if (fromField) return fromField;
  const text = movementText(row);
  if (isPaymentOrReconciliationText(text) && !isSalesReturnText(text)) return '';
  if (!isInvoiceText(text)) return '';
  return extractBillNumFromText(text);
}

function normalizeAccSeq(value) {
  const seq = String(value ?? '').replace(/[^0-9]/g, '');
  return seq && seq !== '0' ? seq : '';
}

function lookupBillSeqByNum(billNum, accSeq, scopePrefix = '') {
  const num = normalizeBillNum(billNum);
  if (!num) return '';
  const acc = normalizeAccSeq(accSeq);
  const yearSql = scopePrefix
    ? `seq LIKE ?`
    : `IFNULL(seq, '') NOT LIKE 'PY%'`;
  const pick = (row) => (row ? String(row.seq) : '');
  if (acc) {
    const scoped = scopePrefix
      ? db.prepare(`SELECT seq FROM invoices WHERE num = ? AND acc_seq = ? AND ${yearSql} LIMIT 1`).get(num, acc, `${scopePrefix}:%`)
      : db.prepare(`SELECT seq FROM invoices WHERE num = ? AND acc_seq = ? AND ${yearSql} LIMIT 1`).get(num, acc);
    if (scoped) return pick(scoped);
  }
  const hit = scopePrefix
    ? db.prepare(`SELECT seq FROM invoices WHERE num = ? AND ${yearSql} LIMIT 1`).get(num, `${scopePrefix}:%`)
    : db.prepare(`SELECT seq FROM invoices WHERE num = ? AND ${yearSql} LIMIT 1`).get(num);
  return pick(hit);
}

function isInvoiceMovement(row) {
  const text = movementText(row);
  if (isPaymentOrReconciliationText(text) && !isSalesReturnText(text)) return false;

  if (normalizeBillSeq(row.bill_seq ?? row.billSeq)) {
    if (isPaymentOrReconciliationText(text) && !/(?:فات|مبيع)/i.test(text)) return false;
    return true;
  }
  if (normalizeBillNum(row.bill_num ?? row.BillNum)) return true;
  if (!isInvoiceText(text)) return false;
  return Boolean(extractBillNumFromText(text));
}

function isDebitJournalRow(row) {
  const dept = row?.is_debit ?? row?.Dept;
  return dept === 1 || dept === true || dept === 'True' || dept === '1';
}

function movementText(row) {
  return String(row?.exp1 ?? row?.Exp1 ?? row?.description ?? row?.remarks ?? row?.Remarks ?? '').trim();
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

/** مردود مبيعات — حركة دائن صريحة فقط (لا سند/خصm/تصفير) */
function isSalesReturnMovement(row) {
  if (isDebitJournalRow(row)) return false;

  const text = movementText(row);
  if (isPaymentOrReconciliationText(text) && !isSalesReturnText(text)) return false;
  if (isSalesReturnText(text)) return true;

  const billKind = row.bill_kind ?? row.BillKind;
  if (isReturnInvoiceKind(billKind) && isSalesReturnText(text)) return true;

  const billSeq = resolveBillSeq(row);
  if (billSeq && isSalesReturnText(text)) {
    const invKind = lookupInvoiceKind(billSeq);
    if (isReturnInvoiceKind(invKind)) return true;
  }

  return false;
}

function isSalesInvoiceMovement(row) {
  return isDebitJournalRow(row) && isInvoiceMovement(row) && !isSalesReturnText(movementText(row));
}

function resolveBillSeq(row) {
  const scope = journalYearScope(row);
  let direct = normalizeBillSeq(row.bill_seq ?? row.billSeq);
  if (scope) {
    if (direct && !/^PY/i.test(direct)) {
      const suffix = pySeqSuffix(direct);
      direct = suffix ? `${scope}:${suffix}` : '';
    }
    if (direct) return direct;
    const accSeq = normalizeAccSeq(row.acc_seq ?? row.Acc ?? row.accSeq);
    return lookupBillSeqByNum(resolveBillNum(row), accSeq, scope);
  }
  if (direct && !/^PY/i.test(direct)) return direct;
  const accSeq = normalizeAccSeq(row.acc_seq ?? row.Acc ?? row.accSeq);
  return lookupBillSeqByNum(resolveBillNum(row), accSeq, '');
}

function roundAmount(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return 0;
  return Math.round(x * 100) / 100;
}

/** مبلغ السطر — نثق بقيمة Edari إلا إذا خالفت الكمية × السعر */
function lineTotal(quant, price, stored) {
  const q = Number(quant || 0);
  const p = Number(price || 0);
  const computed = roundAmount(q * p);
  const storedN = roundAmount(stored);
  if (storedN > 0 && computed > 0 && Math.abs(storedN - computed) > 1) {
    return computed;
  }
  if (storedN > 0) return storedN;
  return computed;
}

function isActiveInvoiceLine(line) {
  const quant = Number(line?.quant ?? 0);
  const bonus = Number(line?.bonus ?? 0);
  const price = Number(line?.price ?? 0);
  const total = Number(line?.lineTotal ?? line?.line_total ?? 0);
  const name = String(line?.matName ?? line?.mat_name ?? '').trim();
  const mat = String(line?.mat ?? '').trim();
  return quant !== 0 || bonus !== 0 || price !== 0 || total !== 0 || Boolean(name) || Boolean(mat);
}

function filterActiveInvoiceLines(lines = []) {
  return (lines || []).filter(isActiveInvoiceLine);
}

/**
 * إجمالي الفاتورة من مجموع البنود؛ الصافي = الإجمالي − الحسومات.
 * لا نستخدم Payment كصافي إلا إن طابق (إجمالي − خصم) لتجنب أخطاء Edari.
 */
function resolveInvoiceTotals(header, lines = []) {
  const discount = roundAmount(Math.max(0, Number(header?.discount ?? 0)));
  const headerTotal = roundAmount(Math.max(0, Number(header?.total ?? 0)));
  const headerPayment = roundAmount(Math.max(0, Number(header?.payment ?? 0)));
  const headerLineCount = Number(header?.line_count ?? 0);

  const activeLines = filterActiveInvoiceLines(lines);
  const linesSum = roundAmount(
    activeLines.reduce((s, l) => s + roundAmount(l.lineTotal ?? 0), 0)
  );

  let total = headerTotal;
  if (linesSum > 0) {
    total = linesSum;
    if (
      headerTotal > 0
      && headerLineCount > 0
      && activeLines.length < headerLineCount
      && headerTotal > linesSum
    ) {
      total = headerTotal;
    } else if (headerTotal > 0 && Math.abs(headerTotal - linesSum) <= Math.max(1, headerTotal * 0.002)) {
      total = headerTotal;
    }
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
    year: (String(row.seq || '').match(/^PY(20\d{2}):/i) || [])[1] || '',
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

function prepareInvoiceLinesFromDb(rows = []) {
  return [...rows].sort((a, b) => {
    const ba = Number(a.bill_no || 0);
    const bb = Number(b.bill_no || 0);
    if (ba !== bb) return ba - bb;
    return Number(a.id || 0) - Number(b.id || 0);
  });
}

function repairInvoiceLineBillNumbers(billSeq) {
  const seq = normalizeBillSeq(billSeq);
  if (!seq) return;

  const rows = db.prepare(`
    SELECT id, bill_no FROM invoice_lines WHERE bill_seq = ? ORDER BY id
  `).all(seq);
  if (rows.length < 2) return;

  const billNos = rows.map((row) => Number(row.bill_no || 0));
  const zeroCount = billNos.filter((n) => !n).length;
  const uniqueCount = new Set(billNos.filter((n) => n > 0)).size;
  const needsRepair = zeroCount > 0 || uniqueCount < rows.length;
  if (!needsRepair) return;

  const update = db.prepare('UPDATE invoice_lines SET bill_no = ? WHERE id = ?');
  const tx = db.transaction(() => {
    rows.forEach((row, index) => update.run(index + 1, row.id));
  });
  tx();
}

function loadInvoiceDetail(invoice) {
  if (!invoice) return null;
  const seq = String(invoice.seq);
  const account = invoice.acc_seq
    ? db.prepare('SELECT seq, num, name1 FROM accounts WHERE seq = ?').get(String(invoice.acc_seq))
    : null;
  repairInvoiceLineBillNumbers(seq);
  const rawLines = db.prepare(`
    SELECT * FROM invoice_lines WHERE bill_seq = ? ORDER BY bill_no, id
  `).all(seq);
  const mappedLines = filterActiveInvoiceLines(
    prepareInvoiceLinesFromDb(rawLines).map(mapInvoiceLineRow)
  );
  const totals = resolveInvoiceTotals(invoice, mappedLines);
  return {
    invoice: mapInvoiceRow(invoice, account, totals),
    lines: mappedLines
  };
}

function getInvoiceByBillSeq(billSeq) {
  const invoice = findInvoiceRowByRef(billSeq);
  if (!invoice) return null;
  return loadInvoiceDetail(invoice);
}

function getInvoiceByNum(billNum, accSeq, scopePrefix = '') {
  const num = normalizeBillNum(billNum);
  if (!num) return null;
  const acc = normalizeAccSeq(accSeq);
  const yearSql = scopePrefix
    ? `seq LIKE ?`
    : `IFNULL(seq, '') NOT LIKE 'PY%'`;
  const rows = [];
  if (acc) {
    rows.push(...(scopePrefix
      ? db.prepare(`SELECT * FROM invoices WHERE num = ? AND acc_seq = ? AND ${yearSql}`).all(num, acc, `${scopePrefix}:%`)
      : db.prepare(`SELECT * FROM invoices WHERE num = ? AND acc_seq = ? AND ${yearSql}`).all(num, acc)));
  }
  if (!rows.length) {
    rows.push(...(scopePrefix
      ? db.prepare(`SELECT * FROM invoices WHERE num = ? AND ${yearSql}`).all(num, `${scopePrefix}:%`)
      : db.prepare(`SELECT * FROM invoices WHERE num = ? AND ${yearSql}`).all(num)));
  }
  if (!rows.length) return null;
  let fallback = null;
  for (const row of rows) {
    const detail = loadInvoiceDetail(row);
    if (!fallback) fallback = detail;
    if (detail?.lines?.length) return detail;
  }
  return fallback;
}

function getInvoiceByRef(ref) {
  return getInvoiceForExport(ref, 'auto');
}

function getInvoiceForExport(ref, mode = 'auto', accSeq) {
  const raw = String(ref ?? '').trim();
  if (!raw) return null;
  if (mode === 'seq') return getInvoiceByBillSeq(raw);
  if (mode === 'num') return getInvoiceByNum(raw, accSeq, yearScopeFromRef(raw));

  if (findInvoiceRowByRef(raw)) {
    return getInvoiceByBillSeq(raw);
  }
  const byNum = getInvoiceByNum(raw, accSeq, yearScopeFromRef(raw));
  if (byNum) return byNum;
  return getInvoiceByBillSeq(raw);
}

function canAgentAccessInvoice(agentId, ref, options = {}) {
  const raw = String(ref ?? '').trim();
  if (!raw) return false;
  const accHint = normalizeAccSeq(options.accSeq);
  const seqKeys = invoiceSeqCandidates(raw);
  const suffix = pySeqSuffix(raw);
  if (suffix && !seqKeys.includes(suffix)) seqKeys.push(suffix);

  for (const seq of seqKeys) {
    if (accHint) {
      const journalScoped = db.prepare(
        'SELECT acc_seq FROM journal WHERE bill_seq = ? AND acc_seq = ? LIMIT 1'
      ).get(seq, accHint);
      if (journalScoped && canAgentAccess(agentId, journalScoped.acc_seq)) return true;
      const journalPy = db.prepare(
        `SELECT acc_seq FROM journal WHERE acc_seq = ? AND (bill_seq = ? OR bill_seq LIKE 'PY%:' || ?) LIMIT 1`
      ).get(accHint, seq, suffix || seq);
      if (journalPy && canAgentAccess(agentId, journalPy.acc_seq)) return true;
    }
    const journalRows = db.prepare(
      `SELECT DISTINCT acc_seq FROM journal WHERE bill_seq = ? OR bill_seq LIKE 'PY%:' || ?`
    ).all(seq, suffix || seq);
    for (const row of journalRows) {
      if (row?.acc_seq && canAgentAccess(agentId, row.acc_seq)) return true;
    }

    const invoice = findInvoiceRowByRef(seq);
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
  invoiceSeqCandidates,
  journalYearScope,
  yearScopeFromRef,
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
  isActiveInvoiceLine,
  filterActiveInvoiceLines,
  roundAmount
};
