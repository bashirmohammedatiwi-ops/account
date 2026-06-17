const { queryEdariSalesReport, listMaterialTreeRoots } = require('./edari-sales-report');

(async () => {
  const trees = await listMaterialTreeRoots();
  const refs = trees.map((t) => t.num || t.seq).filter(Boolean);
  console.log('Tree roots:', refs.length);

  const result = await queryEdariSalesReport({
    treeSeqs: refs,
    dateFrom: '2026-06-14',
    dateTo: '2026-06-14',
    includeSales: true,
    includeReturns: true
  });

  const c = result.grandSummary?.categories || {};
  console.log('Expected Edari: sales qty 712 bonus 1406 amt 12676465 | gifts bonus 14 amt 164750');
  console.log('Got categories:', JSON.stringify(c, null, 2));
  console.log('Lines matched:', result.meta?.matchedLines, 'sections:', result.sections.length);
})().catch((e) => { console.error(e); process.exit(1); });
