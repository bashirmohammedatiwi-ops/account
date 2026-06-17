const path = require('path');
const edariRoot = process.env.EDARI_READER_ROOT || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const { getEdariConnection } = require('./edari-connection');
const { queryEdariSalesReport } = require('./edari-sales-report');

async function query(sql) {
  const r = await odbcBridge.runQuery({ ...getEdariConnection(), sql });
  if (!r.ok) throw new Error(r.error);
  return r.rows || [];
}

(async () => {
  const roots = await query(`SELECT Num FROM File13n WHERE Father = 0 AND SubCount > 0 ORDER BY Num`);
  const allNums = roots.map((r) => String(r.Num).trim()).filter(Boolean);
  console.log('Total Father=0 trees:', allNums.length);

  // Cumulative by numeric ranges
  for (const [label, filter] of [
    ['086-999', (n) => parseInt(n, 10) >= 86 && parseInt(n, 10) <= 999],
    ['001-999 all numeric', (n) => /^\d+$/.test(n)],
    ['001-085', (n) => /^\d+$/.test(n) && parseInt(n, 10) <= 85],
  ]) {
    const refs = allNums.filter(filter);
    if (!refs.length) continue;
    const result = await queryEdariSalesReport({ treeSeqs: refs, dateFrom: '2026-06-14', dateTo: '2026-06-14' });
    console.log(label, 'trees', refs.length, JSON.stringify(result.grandSummary?.categories));
  }
})().catch((e) => { console.error(e); process.exit(1); });
