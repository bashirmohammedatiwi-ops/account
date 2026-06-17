const path = require('path');
const edariRoot = process.env.EDARI_READER_ROOT || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const { getEdariConnection } = require('./edari-connection');

async function query(sql) {
  const r = await odbcBridge.runQuery({ ...getEdariConnection(), sql });
  if (!r.ok) throw new Error(r.error);
  return r.rows || [];
}

(async () => {
  const sample = await query(`
    SELECT TOP 1 * FROM file14n l
    INNER JOIN File15n i ON i.Seq = l.BillSeq
    WHERE i."Date" >= TIMESTAMP '2026-06-14 00:00:00' AND i."Date" < TIMESTAMP '2026-06-15 00:00:00'
  `);
  console.log('file14n columns:', Object.keys(sample[0] || {}));

  // Try Bonus field if exists
  try {
    const bonusField = await query(`
      SELECT SUM(l.Quant) AS q, SUM(l.OBonus) AS ob, SUM(l.Bonus) AS b, SUM(l."Sum") AS s
      FROM file14n l
      INNER JOIN File15n i ON i.Seq = l.BillSeq
      WHERE i."Date" >= TIMESTAMP '2026-06-14 00:00:00' AND i."Date" < TIMESTAMP '2026-06-15 00:00:00'
      AND CAST(i.Kind AS INTEGER) IN (0,1,4)
    `);
    console.log('Bonus fields:', bonusField);
  } catch (e) {
    console.log('Bonus field error:', e.message);
  }

  // Gift value = sum(bonus * price) on all sales lines
  const giftCalc = await query(`
    SELECT SUM(l.OBonus * l.Price) AS giftVal, SUM(l.OBonus) AS obSum, SUM(l.Quant) AS qSum,
           SUM(l.Quant * l.Price) AS salesVal
    FROM file14n l
    INNER JOIN File15n i ON i.Seq = l.BillSeq
    WHERE i."Date" >= TIMESTAMP '2026-06-14 00:00:00' AND i."Date" < TIMESTAMP '2026-06-15 00:00:00'
    AND CAST(i.Kind AS INTEGER) IN (0,1,4)
  `);
  console.log('Calc from quant*price and obonus*price:', giftCalc);

  // Only materials under tree 086 subtree
  const tree086 = await query(`
    WITH RECURSIVE sub AS (
      SELECT Seq FROM File13n WHERE Num = '086'
      UNION ALL
      SELECT c.Seq FROM File13n c INNER JOIN sub p ON c.Father = p.Seq
    )
    SELECT SUM(l.Quant) AS q, SUM(l.OBonus) AS ob, SUM(l.Quant * l.Price) AS salesVal,
           SUM(CASE WHEN l.Quant = 0 AND l.OBonus > 0 THEN l.OBonus * l.Price ELSE 0 END) AS pureGift
    FROM file14n l
    INNER JOIN File15n i ON i.Seq = l.BillSeq
    WHERE i."Date" >= TIMESTAMP '2026-06-14 00:00:00' AND i."Date" < TIMESTAMP '2026-06-15 00:00:00'
    AND CAST(i.Kind AS INTEGER) IN (0,1,4)
    AND l.Mat IN (SELECT Seq FROM sub)
  `).catch((e) => ({ err: e.message }));
  console.log('Tree 086 recursive:', tree086);
})().catch((e) => { console.error(e); process.exit(1); });
