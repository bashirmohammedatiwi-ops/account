function readSyncNum(row, ...keys) {
  if (!row) return 0;
  const entries = Object.entries(row);
  for (const key of keys) {
    const lower = key.toLowerCase();
    const hit = entries.find(([name]) => String(name).toLowerCase() === lower);
    const value = hit ? hit[1] : row[key];
    if (value == null || value === '') continue;
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function billSeqOf(row) {
  return String(row.BillSeq ?? row.bill_seq ?? '').replace(/[^0-9]/g, '');
}

/**
 * Assign unique sequential bill_no per invoice.
 * Edari BillNo/LineIndex are unreliable — we preserve row order and never reuse numbers
 * already stored in the database (important for chunked sync uploads).
 */
function assignBillNosForLines(rows = [], { getMaxBillNo = () => 0, getUsedBillNos = null } = {}) {
  const grouped = new Map();
  rows.forEach((row, index) => {
    const billSeq = billSeqOf(row);
    if (!billSeq) return;
    if (!grouped.has(billSeq)) grouped.set(billSeq, []);
    grouped.get(billSeq).push({ row, index });
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
      out.push({ ...row, BillNo: next, bill_no: next, LineIndex: next });
    }
  }

  return out;
}

/** Keep invoice line batches intact — never split one bill across upload chunks. */
function chunkInvoiceLinesByBill(rows = [], maxSize = 1500) {
  if (!rows.length) return [];
  const groups = new Map();
  rows.forEach((row, index) => {
    const billSeq = billSeqOf(row);
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
  const total = Number(line.line_total ?? line.lineTotal ?? 0);
  const name = String(line.MatName ?? line.mat_name ?? '').trim();
  const mat = String(line.Mat ?? line.mat ?? '').trim();
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
  readSyncNum,
  billSeqOf,
  assignBillNosForLines,
  chunkInvoiceLinesByBill,
  isActiveInvoiceLineRow,
  resolveLineTotal
};
