function unwrapSyncValue(value, depth = 0) {
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const s = value.trim();
    return (!s || s === '[object Object]') ? '' : s;
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return value.toString('utf8').trim();
  }
  if (typeof value === 'object' && depth < 5) {
    if (Array.isArray(value)) return unwrapSyncValue(value[0], depth + 1);
    return unwrapSyncValue(
      value.value ?? value.Value ?? value.data ?? value.Data
        ?? value.Seq ?? value.seq ?? value.Num ?? value.num
        ?? value.name ?? value.Name ?? value.text ?? value.Text,
      depth + 1
    );
  }
  return '';
}

function fieldKey(name) {
  return String(name || '').toLowerCase().replace(/[_-\s]/g, '');
}

function pickRaw(row, ...keys) {
  if (!row || typeof row !== 'object') return undefined;
  const entries = Object.entries(row);
  for (const key of keys) {
    const want = fieldKey(key);
    const hit = entries.find(([name]) => fieldKey(name) === want);
    if (!hit) continue;
    const unwrapped = unwrapSyncValue(hit[1]);
    if (unwrapped !== '' && unwrapped != null) return unwrapped;
  }
  return undefined;
}

function pickText(row, ...keys) {
  return String(pickRaw(row, ...keys) ?? '').trim();
}

function readSyncNum(row, ...keys) {
  if (!row) return 0;
  const value = keys.length ? pickRaw(row, ...keys) : undefined;
  if (value == null || value === '') {
    if (keys.length) return 0;
    return 0;
  }
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

function preserveBillSeq(value) {
  const s = String(unwrapSyncValue(value) ?? '').trim();
  if (/^PY[0-9A-Za-z]+:/i.test(s)) return s;
  const n = s.replace(/[^0-9]/g, '');
  return n && n !== '0' ? n : '';
}

function billSeqOf(row) {
  return preserveBillSeq(pickRaw(row, 'BillSeq', 'bill_seq', 'BILLSEQ') ?? row?.BillSeq ?? row?.bill_seq);
}

function edariSeqOf(value) {
  const s = String(unwrapSyncValue(value) ?? '').trim();
  if (/^PY[0-9A-Za-z]+:/i.test(s)) {
    const n = s.replace(/^PY[0-9A-Za-z]+:/i, '').replace(/[^0-9]/g, '');
    return n && n !== '0' ? n : '';
  }
  const n = s.replace(/[^0-9]/g, '');
  return n && n !== '0' ? n : '';
}

function normalizeInvoiceLineRow(row = {}) {
  const billSeq = billSeqOf(row);
  return {
    ...row,
    BillSeq: billSeq,
    bill_seq: billSeq,
    BillNo: readSyncNum(row, 'BillNo', 'bill_no', 'LineIndex', 'lineIndex', 'Seq'),
    bill_no: readSyncNum(row, 'BillNo', 'bill_no', 'LineIndex', 'lineIndex', 'Seq'),
    Mat: pickText(row, 'Mat', 'mat'),
    mat: pickText(row, 'Mat', 'mat'),
    MatNum: pickText(row, 'MatNum', 'mat_num', 'Num'),
    mat_num: pickText(row, 'MatNum', 'mat_num', 'Num'),
    MatName: pickText(row, 'MatName', 'mat_name', 'Name1', 'name1'),
    mat_name: pickText(row, 'MatName', 'mat_name', 'Name1', 'name1'),
    Quant: readSyncNum(row, 'Quant', 'quant'),
    quant: readSyncNum(row, 'Quant', 'quant'),
    Price: readSyncNum(row, 'Price', 'price'),
    price: readSyncNum(row, 'Price', 'price'),
    OBonus: readSyncNum(row, 'OBonus', 'obonus', 'Bonus', 'bonus'),
    bonus: readSyncNum(row, 'OBonus', 'obonus', 'Bonus', 'bonus'),
    Sum: readSyncNum(row, 'Sum', 'sum', 'line_total', 'lineTotal'),
    line_total: readSyncNum(row, 'Sum', 'sum', 'line_total', 'lineTotal'),
    MatRem: pickText(row, 'MatRem', 'remarks', 'Remarks'),
    remarks: pickText(row, 'MatRem', 'remarks', 'Remarks'),
    Kind: pickText(row, 'Kind', 'kind'),
    kind: pickText(row, 'Kind', 'kind')
  };
}

/**
 * Assign unique sequential bill_no per invoice.
 * Edari BillNo/LineIndex are unreliable — we preserve row order and never reuse numbers
 * already stored in the database (important for chunked sync uploads).
 */
function assignBillNosForLines(rows = [], { getMaxBillNo = () => 0, getUsedBillNos = null } = {}) {
  const grouped = new Map();
  rows.forEach((row, index) => {
    const normalized = normalizeInvoiceLineRow(row);
    const billSeq = billSeqOf(normalized);
    if (!billSeq) return;
    if (!grouped.has(billSeq)) grouped.set(billSeq, []);
    grouped.get(billSeq).push({ row: normalized, index });
  });

  const out = [];
  for (const [billSeq, items] of grouped) {
    items.sort((a, b) => {
      const ba = readSyncNum(a.row, 'BillNo', 'bill_no');
      const bb = readSyncNum(b.row, 'BillNo', 'bill_no');
      if (ba > 0 && bb > 0 && ba !== bb) return ba - bb;
      return a.index - b.index;
    });

    const used = new Set(
      (typeof getUsedBillNos === 'function' ? getUsedBillNos(billSeq) : [])
        .map((n) => Number(n))
        .filter((n) => n > 0)
    );
    let next = Math.max(Number(getMaxBillNo(billSeq) || 0), 0, ...used);

    for (const { row } of items) {
      do {
        next += 1;
      } while (used.has(next));
      used.add(next);
      out.push({
        ...row,
        BillSeq: billSeq,
        bill_seq: billSeq,
        BillNo: next,
        bill_no: next,
        LineIndex: next
      });
    }
  }

  return out;
}

/** Keep invoice line batches intact — never split one bill across upload chunks. */
function chunkInvoiceLinesByBill(rows = [], maxSize = 1500) {
  if (!rows.length) return [];
  const groups = new Map();
  rows.forEach((row, index) => {
    const billSeq = billSeqOf(row) || preserveBillSeq(row.BillSeq ?? row.bill_seq);
    if (!billSeq) return;
    if (!groups.has(billSeq)) groups.set(billSeq, []);
    groups.get(billSeq).push({ row, index });
  });

  const orderedGroups = [...groups.values()].sort(
    (a, b) => Math.min(...a.map((item) => item.index)) - Math.min(...b.map((item) => item.index))
  );

  const chunks = [];
  let current = [];

  for (const group of orderedGroups) {
    const lines = group.map((item) => item.row);
    if (lines.length > maxSize) {
      if (current.length) {
        chunks.push(current);
        current = [];
      }
      for (let i = 0; i < lines.length; i += maxSize) {
        chunks.push(lines.slice(i, i + maxSize));
      }
      continue;
    }
    if (current.length && current.length + lines.length > maxSize) {
      chunks.push(current);
      current = [];
    }
    current.push(...lines);
  }

  if (current.length) chunks.push(current);
  return chunks;
}

function isActiveInvoiceLineRow(line) {
  const quant = readSyncNum(line, 'Quant', 'quant');
  const bonus = readSyncNum(line, 'OBonus', 'bonus');
  const price = readSyncNum(line, 'Price', 'price');
  const total = Number(line.line_total ?? line.lineTotal ?? line.Sum ?? 0);
  const name = pickText(line, 'MatName', 'mat_name');
  const mat = pickText(line, 'Mat', 'mat');
  return quant !== 0 || bonus !== 0 || price !== 0 || total !== 0 || Boolean(name) || Boolean(mat);
}

function resolveLineTotal(line) {
  const quant = readSyncNum(line, 'Quant', 'quant');
  const price = readSyncNum(line, 'Price', 'price');
  const stored = readSyncNum(line, 'Sum', 'sum', 'line_total', 'lineTotal');
  const computed = quant * price;
  if (stored > 0 && computed > 0 && Math.abs(stored - computed) > 1) {
    return computed;
  }
  if (stored > 0) return stored;
  return computed;
}

module.exports = {
  unwrapSyncValue,
  pickRaw,
  pickText,
  readSyncNum,
  preserveBillSeq,
  billSeqOf,
  edariSeqOf,
  normalizeInvoiceLineRow,
  assignBillNosForLines,
  chunkInvoiceLinesByBill,
  isActiveInvoiceLineRow,
  resolveLineTotal
};
