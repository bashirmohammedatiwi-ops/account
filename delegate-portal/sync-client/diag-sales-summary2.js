const path = require('path');
const edariRoot = process.env.EDARI_READER_ROOT || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const { getEdariConnection } = require('./edari-connection');
const { queryEdariSalesReport } = require('./edari-sales-report');
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

(async () => {
  const dateSql = `i."Date" >= TIMESTAMP '2026-06-14 00:00:00' AND i."Date" < TIMESTAMP '2026-06-15 00:00:00'`;
  const rows = await query(`
    SELECT l.Quant, l.Price, l.OBonus, l."Sum", i.Kind AS InvKind
    FROM file14n l
    INNER JOIN File15n i ON i.Seq = l.BillSeq
    WHERE ${dateSql} AND i.Kind <> 3
  `);
  const mapped = rows.map(mapRaw);
  const cats = computeCategorySummary(mapped);
  console.log('ALL lines (no tree filter), with Sum:', JSON.stringify(cats));

  for (const trees of [['086', '087', '126'], ['086'], ['086', '087', '088', '089', '126', '127', '128']]) {
    const result = await queryEdariSalesReport({
      treeSeqs: trees,
      dateFrom: '2026-06-14',
      dateTo: '2026-06-14'
    });
    console.log('Trees', trees.join(','), '=>', JSON.stringify(result.grandSummary?.categories));
  }
})().catch((e) => { console.error(e); process.exit(1); });
