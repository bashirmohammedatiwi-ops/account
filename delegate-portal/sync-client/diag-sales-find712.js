const path = require('path');
const edariRoot = process.env.EDARI_READER_ROOT || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const { getEdariConnection } = require('./edari-connection');
const { computeCategorySummary } = require('../lib/sales-category-summary');

async function query(sql) {
  const r = await odbcBridge.runQuery({ ...getEdariConnection(), sql });
  if (!r.ok) throw new Error(r.error);
  return r.rows || [];
}

function mapRaw(r) {
  const quant = Number(r.Quant || 0);
  const bonus = Number(r.OBonus || 0);
  const price = Number(r.Price || 0);
  const kind = Number(r.InvKind);
  const isReturn = kind === 2 || kind === 5;
  let lineTotal = Number(r.Sum || 0);
  if (!lineTotal && quant) lineTotal = Math.round(quant * price);
  else if (!lineTotal && bonus) lineTotal = Math.round(bonus * price);
  if (isReturn) lineTotal = -Math.abs(lineTotal);
  return { quant, bonus, unitPrice: price, lineTotal, isReturn };
}

function catsForWhere(extra) {
  return query(`
    SELECT l.Quant, l.Price, l.OBonus, l."Sum", i.Kind AS InvKind
    FROM file14n l
    INNER JOIN File15n i ON i.Seq = l.BillSeq
    WHERE i."Date" >= TIMESTAMP '2026-06-14 00:00:00' AND i."Date" < TIMESTAMP '2026-06-15 00:00:00'
    AND i.Kind <> 3 ${extra}
  `).then((rows) => computeCategorySummary(rows.map(mapRaw)));
}

(async () => {
  const targets = [
    ['kind 4 only', 'AND CAST(i.Kind AS INTEGER) = 4'],
    ['kind 1 only', 'AND CAST(i.Kind AS INTEGER) = 1'],
    ['kind 1,4', 'AND CAST(i.Kind AS INTEGER) IN (1,4)'],
    ['line kind 4', 'AND CAST(l.Kind AS INTEGER) = 4'],
    ['returns kind 2,5', 'AND CAST(i.Kind AS INTEGER) IN (2,5)']
  ];
  for (const [label, sql] of targets) {
    const c = await catsForWhere(sql);
    console.log(label, JSON.stringify(c));
  }

  // Find tree roots with Father=0 and SubCount>0 (real top trees)
  const roots = await query(`SELECT Seq, Num, Name1, SubCount FROM File13n WHERE Father = 0 AND SubCount > 0 ORDER BY Num`);
  console.log('Father=0 roots count:', roots.length, 'sample:', roots.slice(0, 15).map((r) => r.Num));

  // Test each root's leaf sales totals - sample first 20 roots
  for (const root of roots.slice(0, 25)) {
    const seq = String(root.Seq).replace(/[^0-9]/g, '');
    const rows = await query(`
      SELECT l.Quant, l.Price, l.OBonus, l."Sum", i.Kind AS InvKind
      FROM file14n l
      INNER JOIN File15n i ON i.Seq = l.BillSeq
      INNER JOIN File13n m ON m.Seq = l.Mat
      WHERE i."Date" >= TIMESTAMP '2026-06-14 00:00:00' AND i."Date" < TIMESTAMP '2026-06-15 00:00:00'
      AND CAST(i.Kind AS INTEGER) IN (0,1,4)
      AND (m.Seq = ${seq} OR m.Father = ${seq} OR m.Num = '${String(root.Num).replace(/'/g, "''")}')
    `).catch(() => []);
    if (!rows.length) continue;
    const c = computeCategorySummary(rows.map(mapRaw));
    if (c.sales.qty > 50) console.log('Root', root.Num, root.Name1?.slice(0, 30), c.sales);
  }
})().catch((e) => { console.error(e); process.exit(1); });
