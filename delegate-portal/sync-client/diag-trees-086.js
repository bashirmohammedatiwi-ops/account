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
  for (const num of ['086', '087', '126', '001', '100']) {
    const rows = await query(`SELECT Seq, Num, Name1, Father, SubCount FROM File13n WHERE Num = '${num}' OR Num = '${num.padStart(3, '0')}'`);
    console.log('Node', num, rows);
  }

  const common = ['086', '087', '088', '089', '090', '091', '092', '093', '094', '095', '096', '097', '098', '099', '100', '126', '127', '128'];
  const result = await queryEdariSalesReport({ treeSeqs: common, dateFrom: '2026-06-14', dateTo: '2026-06-14' });
  console.log('Common trees summary:', JSON.stringify(result.grandSummary?.categories));
  console.log('Sections with lines:', result.sections.filter((s) => s.lines.length).map((s) => [s.tree.num, s.summary.qtySum, s.summary.salesAmount]));
})().catch((e) => { console.error(e); process.exit(1); });
