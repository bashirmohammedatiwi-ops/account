const { queryEdariSalesReport, listMaterialTreeRoots } = require('./edari-sales-report');

const TARGET = { qty: 777, amount: 8070933 };

function near(c, tolQty = 3, tolAmt = 5000) {
  const s = c?.sales || {};
  return Math.abs(s.qty - TARGET.qty) <= tolQty && Math.abs(s.amount - TARGET.amount) <= tolAmt;
}

(async () => {
  const trees = await listMaterialTreeRoots();
  const refs = trees.map((t) => t.num).filter(Boolean);

  // Try cumulative ranges of numeric trees 086-128
  const numeric = refs.filter((n) => /^\d+$/.test(n)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  for (let start = 86; start <= 128; start++) {
    for (let end = start; end <= 128; end++) {
      const subset = numeric.filter((n) => {
        const v = parseInt(n, 10);
        return v >= start && v <= end;
      });
      if (subset.length < 2) continue;
      const r = await queryEdariSalesReport({ treeSeqs: subset, dateFrom: '2026-06-14', dateTo: '2026-06-14' });
      const c = r.grandSummary?.categories;
      if (near(c)) console.log('MATCH range', start, '-', end, 'trees', subset.length, JSON.stringify(c));
    }
  }

  // Single trees with high qty
  for (const num of numeric) {
    const v = parseInt(num, 10);
    if (v < 86 || v > 999) continue;
    const r = await queryEdariSalesReport({ treeSeqs: [num], dateFrom: '2026-06-14', dateTo: '2026-06-14' });
    const c = r.grandSummary?.categories;
    if (near(c, 1, 1000)) console.log('MATCH single', num, JSON.stringify(c));
  }
})().catch((e) => { console.error(e); process.exit(1); });
