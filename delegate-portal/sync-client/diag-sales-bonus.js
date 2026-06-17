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
  const dateSql = `i."Date" >= TIMESTAMP '2026-06-14 00:00:00' AND i."Date" < TIMESTAMP '2026-06-15 00:00:00'`;

  const bonusRows = await query(`
    SELECT TOP 10 l.Quant, l.OBonus, l.Price, l."Sum", l.Kind AS LineKind, i.Kind AS InvKind, l.MatName
    FROM file14n l
    INNER JOIN File15n i ON i.Seq = l.BillSeq
    WHERE ${dateSql} AND i.Kind <> 3 AND l.OBonus > 0
  `);
  console.log('Bonus lines sample:', bonusRows);

  const kinds = await query(`
    SELECT i.Kind, COUNT(*) AS c, SUM(l.Quant) AS q, SUM(l.OBonus) AS b
    FROM file14n l
    INNER JOIN File15n i ON i.Seq = l.BillSeq
    WHERE ${dateSql}
    GROUP BY i.Kind
  `);
  console.log('By invoice kind:', kinds);

  const lineKinds = await query(`
    SELECT l.Kind, COUNT(*) AS c, SUM(l.Quant) AS q, SUM(l.OBonus) AS b
    FROM file14n l
    INNER JOIN File15n i ON i.Seq = l.BillSeq
    WHERE ${dateSql} AND i.Kind <> 3
    GROUP BY l.Kind
  `);
  console.log('By line kind:', lineKinds);

  // Try filter sales kinds 0,1,4 only
  const salesOnly = await query(`
    SELECT SUM(l.Quant) AS q, SUM(l.OBonus) AS b, SUM(l."Sum") AS s
    FROM file14n l
    INNER JOIN File15n i ON i.Seq = l.BillSeq
    WHERE ${dateSql} AND CAST(i.Kind AS INTEGER) IN (0,1,4)
  `);
  console.log('Sales kinds 0,1,4 totals:', salesOnly);

  const giftOnly = await query(`
    SELECT SUM(l.OBonus) AS b, SUM(l."Sum") AS s, COUNT(*) AS c
    FROM file14n l
    INNER JOIN File15n i ON i.Seq = l.BillSeq
    WHERE ${dateSql} AND CAST(i.Kind AS INTEGER) IN (0,1,4) AND l.Quant = 0 AND l.OBonus > 0
  `);
  console.log('Pure gift lines (quant=0):', giftOnly);

  const giftQuant = await query(`
    SELECT SUM(l.OBonus) AS b, SUM(l."Sum") AS s, COUNT(*) AS c
    FROM file14n l
    INNER JOIN File15n i ON i.Seq = l.BillSeq
    WHERE ${dateSql} AND CAST(i.Kind AS INTEGER) IN (0,1,4) AND l.OBonus > 0 AND l.Quant = 0
  `);
  console.log('Gift quant=0 obonus>0:', giftQuant);
})().catch((e) => { console.error(e); process.exit(1); });
