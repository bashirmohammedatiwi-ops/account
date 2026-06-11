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

/** Assign unique bill_no per invoice — handles duplicate/missing BillNo from Edari */
function assignBillNosForLines(rows = [], { getMaxBillNo = () => 0 } = {}) {
  const grouped = new Map();
  for (const row of rows) {
    const billSeq = String(row.BillSeq ?? row.bill_seq ?? '').replace(/[^0-9]/g, '');
    if (!billSeq) continue;
    if (!grouped.has(billSeq)) grouped.set(billSeq, []);
    grouped.get(billSeq).push(row);
  }

  const out = [];
  for (const [billSeq, lines] of grouped) {
    lines.sort((a, b) => {
      const ba = readSyncNum(a, 'BillNo', 'bill_no', 'LineIndex', 'lineIndex');
      const bb = readSyncNum(b, 'BillNo', 'bill_no', 'LineIndex', 'lineIndex');
      if (ba !== bb) return ba - bb;
      return readSyncNum(a, 'Mat', 'mat') - readSyncNum(b, 'Mat', 'mat');
    });

    const used = new Set();
    let fallback = Number(getMaxBillNo(billSeq) || 0);

    for (const line of lines) {
      let billNo = readSyncNum(line, 'BillNo', 'bill_no', 'LineIndex', 'lineIndex');
      if (billNo > 0 && used.has(billNo)) billNo = 0;
      if (!billNo) {
        do {
          fallback += 1;
          billNo = fallback;
        } while (used.has(billNo));
      }
      used.add(billNo);
      out.push({ ...line, BillNo: billNo, bill_no: billNo, LineIndex: billNo });
    }
  }

  return out;
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
  assignBillNosForLines,
  isActiveInvoiceLineRow,
  resolveLineTotal
};
