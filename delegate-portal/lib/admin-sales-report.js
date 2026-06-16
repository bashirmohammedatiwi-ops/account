const db = require('./db');
const { listMaterialTreeRoots, getMaterialDescendantLeafSeqs } = require('./products');
const { invoiceKindLabel, isReturnInvoiceKind, isGiftInvoiceKind } = require('./invoice-kinds');
const { sqlNormalizedEdariDate } = require('./date-utils');
const { deriveBranchCode, deriveBranchLabel, parseBranchFilter, hasBranchMarker, sortBranchesForList, mergeStandardSalesBranches } = require('./branch-utils');
const {
  resolveSalesLineTotal,
  computeCategorySummary,
  mergeCategorySummaries
} = require('./sales-category-summary');

const INV_DATE_SQL = sqlNormalizedEdariDate('i.inv_date');

const SALES_KINDS = new Set([0, 1, 4]);
const RETURN_KINDS = new Set([2, 5]);
const GIFT_KINDS = new Set([6]);

function parseTreeSeqList(input) {
  if (Array.isArray(input)) return input.map(String).map((s) => s.trim()).filter(Boolean);
  return String(input || '')
    .split(/[,،\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveKindFilter({ includeSales = true, includeReturns = true } = {}) {
  const kinds = [];
  if (includeSales) {
    SALES_KINDS.forEach((k) => kinds.push(k));
    GIFT_KINDS.forEach((k) => kinds.push(k));
  }
  if (includeReturns) RETURN_KINDS.forEach((k) => kinds.push(k));
  if (!kinds.length) SALES_KINDS.forEach((k) => kinds.push(k));
  return kinds;
}

function mapLineRow(r) {
  const isGift = isGiftInvoiceKind(r.inv_kind);
  const isReturn = !isGift && isReturnInvoiceKind(r.inv_kind);
  const quant = Number(r.quant || 0);
  const bonus = Number(r.bonus || 0);
  const unitPrice = Number(r.price || 0);
  const sellPr4 = Number(r.sell_pr4 || r.sell_pr3 || r.sell_pr1 || 0);
  let lineTotal = resolveSalesLineTotal({
    quant,
    bonus,
    unitPrice,
    sellPr4,
    line_total: r.line_total,
    equa: r.equa
  });
  if (isReturn) lineTotal = -Math.abs(lineTotal);
  const branchCode = deriveBranchCode(r.inv_remarks, r.account_num);

  return {
    date: r.inv_date,
    invNum: r.inv_num || '',
    kind: r.inv_kind,
    kindLabel: invoiceKindLabel(r.inv_kind),
    isReturn,
    isGift,
    branchCode,
    branchNum: branchCode || r.account_num || '',
    accountNum: r.account_num || '',
    accountName: r.account_name || '',
    matNum: r.mat_num || r.mat || '',
    barcode: r.mat_num || r.mat || '',
    matName: r.mat_name || '',
    quant,
    bonus,
    equa: Number(r.equa || 0),
    unitPrice,
    sellPr4,
    lineTotal,
    absTotal: Math.abs(lineTotal)
  };
}

function computeTreeSummary(lines) {
  let qtySum = 0;
  let bonusSum = 0;
  let salesAmount = 0;
  let returnsAmount = 0;
  let giftsAmount = 0;

  for (const line of lines) {
    const net = Number(line.lineTotal || 0);
    if (line.isGift) {
      bonusSum += Math.abs(Number(line.quant || 0));
      giftsAmount += Math.abs(net);
      continue;
    }
    if (line.isReturn) {
      returnsAmount += Math.abs(net);
      continue;
    }
    qtySum += Number(line.quant || 0);
    bonusSum += Number(line.bonus || 0);
    salesAmount += net;
  }

  return {
    lineCount: lines.length,
    qtySum,
    bonusSum,
    salesAmount,
    returnsAmount,
    giftsAmount,
    netAmount: salesAmount - returnsAmount,
    categories: computeCategorySummary(lines)
  };
}

function queryTreeLines(treeRef, options = {}) {
  const { tree, matSeqs, matNums } = getMaterialDescendantLeafSeqs(treeRef);
  if (!tree) return null;

  const treeInfo = {
    seq: tree.seq,
    num: tree.num || '',
    name1: tree.name1 || '',
    subCount: Number(tree.subCount ?? tree.sub_count ?? 0)
  };

  if (!matSeqs.length && !matNums.length) {
    return { tree: treeInfo, lines: [], summary: computeTreeSummary([]) };
  }

  const kinds = resolveKindFilter(options);
  const matClauses = [];
  const params = [];

  if (matSeqs.length) {
    matClauses.push(`l.mat IN (${matSeqs.map(() => '?').join(',')})`);
    params.push(...matSeqs);
  }
  if (matNums.length) {
    matClauses.push(`l.mat_num IN (${matNums.map(() => '?').join(',')})`);
    params.push(...matNums);
  }

  const where = [
    `(${matClauses.join(' OR ')})`,
    'CAST(i.kind AS INTEGER) != 3',
    `CAST(i.kind AS INTEGER) IN (${kinds.map(() => '?').join(',')})`
  ];
  params.push(...kinds);

  const { dateFrom = '', dateTo = '' } = options;
  if (dateFrom) {
    where.push(`${INV_DATE_SQL} >= ?`);
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push(`${INV_DATE_SQL} <= ?`);
    params.push(dateTo);
  }

  if (options.onlyGifts) {
    where.push('(CAST(i.kind AS INTEGER) = 6 OR COALESCE(l.bonus, 0) > 0)');
  }

  const sql = `
    SELECT
      l.*,
      m.sell_pr3,
      m.sell_pr1,
      i.num AS inv_num,
      i.kind AS inv_kind,
      i.inv_date,
      i.remarks AS inv_remarks,
      a.num AS account_num,
      a.name1 AS account_name
    FROM invoice_lines l
    JOIN invoices i ON i.seq = l.bill_seq
    LEFT JOIN accounts a ON a.seq = i.acc_seq
    LEFT JOIN edari_materials m ON m.seq = l.mat OR m.num = l.mat_num
    WHERE ${where.join(' AND ')}
    ORDER BY ${INV_DATE_SQL} ASC, CAST(i.num AS INTEGER) ASC, i.num ASC, l.bill_no ASC
  `;

  const rows = db.prepare(sql).all(...params);
  let lines = rows.map(mapLineRow);
  if (options.branchSet instanceof Set && options.branchSet.size) {
    lines = lines.filter((ln) => options.branchSet.has(ln.branchCode));
  }

  return {
    tree: treeInfo,
    lines,
    summary: computeTreeSummary(lines)
  };
}

/**
 * ملخص إجمالي لكل مواد الفروع المحددة من القاعدة المحلية — مطابق لطريقة الإداري.
 * يمرّ على كل بنود الفترة (بلا تقييد بالشجرات) ويصنّف حسب نوع الفاتورة + فلتر الفروع.
 */
function fetchLocalSystemCategorySummary(options = {}) {
  const { dateFrom = '', dateTo = '', branchSet } = options;
  const kinds = resolveKindFilter(options);
  const where = [
    'CAST(i.kind AS INTEGER) != 3',
    `CAST(i.kind AS INTEGER) IN (${kinds.map(() => '?').join(',')})`
  ];
  const params = [...kinds];
  if (dateFrom) { where.push(`${INV_DATE_SQL} >= ?`); params.push(dateFrom); }
  if (dateTo) { where.push(`${INV_DATE_SQL} <= ?`); params.push(dateTo); }

  const sql = `
    SELECT
      l.quant, l.bonus, l.price, l.line_total,
      m.sell_pr3, m.sell_pr1, m.sell_pr4,
      i.kind AS inv_kind,
      i.remarks AS inv_remarks,
      a.num AS account_num
    FROM invoice_lines l
    JOIN invoices i ON i.seq = l.bill_seq
    LEFT JOIN accounts a ON a.seq = i.acc_seq
    LEFT JOIN edari_materials m ON m.seq = l.mat OR m.num = l.mat_num
    WHERE ${where.join(' AND ')}
  `;

  const rows = db.prepare(sql).all(...params);
  const active = branchSet instanceof Set && branchSet.size;
  const mapped = [];
  for (const r of rows) {
    if (active) {
      const code = deriveBranchCode(r.inv_remarks, r.account_num);
      if (!branchSet.has(code)) continue;
    }
    const isGift = isGiftInvoiceKind(r.inv_kind);
    const isReturn = !isGift && isReturnInvoiceKind(r.inv_kind);
    const quant = Number(r.quant || 0);
    const bonus = Number(r.bonus || 0);
    const unitPrice = Number(r.price || 0);
    const sellPr4 = Number(r.sell_pr4 || r.sell_pr3 || r.sell_pr1 || 0);
    const total = resolveSalesLineTotal({ quant, bonus, unitPrice, sellPr4, line_total: r.line_total });
    mapped.push({
      quant,
      bonus,
      unitPrice,
      sellPr4,
      kind: r.inv_kind,
      lineTotal: isReturn ? -Math.abs(total) : total,
      isReturn,
      isGift
    });
  }
  return computeCategorySummary(mapped);
}

/** قائمة الفروع المتاحة ضمن فترة من القاعدة المحلية. */
function listSalesBranches({ dateFrom = '', dateTo = '' } = {}) {
  const where = ['CAST(i.kind AS INTEGER) != 3'];
  const params = [];
  if (dateFrom) { where.push(`${INV_DATE_SQL} >= ?`); params.push(dateFrom); }
  if (dateTo) { where.push(`${INV_DATE_SQL} <= ?`); params.push(dateTo); }

  const rows = db.prepare(`
    SELECT i.remarks AS inv_remarks, a.num AS account_num, a.name1 AS account_name
    FROM invoices i
    LEFT JOIN accounts a ON a.seq = i.acc_seq
    WHERE ${where.join(' AND ')}
  `).all(...params);

  const branches = new Map();
  for (const r of rows) {
    if (!hasBranchMarker(r.inv_remarks)) continue;
    const code = deriveBranchCode(r.inv_remarks, r.account_num);
    if (!code) continue;
    if (!branches.has(code)) {
      branches.set(code, {
        code,
        label: deriveBranchLabel(r.inv_remarks, r.account_num, r.account_name),
        remarks: String(r.inv_remarks || '').trim(),
        invoiceCount: 0
      });
    }
    branches.get(code).invoiceCount += 1;
  }
  return mergeStandardSalesBranches([...branches.values()]);
}

function queryAdminSalesReport({
  treeSeqs = [],
  dateFrom = '',
  dateTo = '',
  includeSales = true,
  includeReturns = true,
  onlyGifts = false,
  branches = []
} = {}) {
  const seqs = parseTreeSeqList(treeSeqs);
  if (!seqs.length) throw new Error('يرجى اختيار شجرة مواد واحدة على الأقل');
  if (!dateFrom || !dateTo) throw new Error('يرجى تحديد تاريخ البداية والنهاية');

  const nodeCount = db.prepare('SELECT COUNT(*) AS c FROM edari_material_nodes').get()?.c || 0;
  if (!nodeCount) {
    throw new Error('لا توجد شجرات مواد على السيرفر — استخدم تطبيق Edari Admin للقراءة المباشرة من EdariNX');
  }

  const branchSet = parseBranchFilter(branches);
  const options = { dateFrom, dateTo, includeSales, includeReturns, onlyGifts, branchSet };
  const sections = [];
  const missing = [];

  for (const treeRef of seqs) {
    const block = queryTreeLines(treeRef, options);
    if (!block) {
      missing.push(treeRef);
      continue;
    }
    sections.push(block);
  }

  if (!sections.length) throw new Error('لم يتم العثور على شجرات المواد المحددة (086، 087، …)');

  const grand = sections.reduce((acc, s) => {
    acc.lineCount += s.summary.lineCount;
    acc.qtySum += s.summary.qtySum;
    acc.bonusSum += s.summary.bonusSum;
    acc.salesAmount += s.summary.salesAmount;
    acc.returnsAmount += s.summary.returnsAmount;
    acc.netAmount += s.summary.netAmount;
    mergeCategorySummaries(acc.categories, s.summary.categories);
    return acc;
  }, {
    lineCount: 0,
    qtySum: 0,
    bonusSum: 0,
    salesAmount: 0,
    returnsAmount: 0,
    netAmount: 0,
    categories: {
      sales: { qty: 0, bonus: 0, amount: 0 },
      gifts: { qty: 0, bonus: 0, amount: 0 },
      returns: { qty: 0, bonus: 0, amount: 0 }
    }
  });

  const systemCategories = fetchLocalSystemCategorySummary(options);

  return {
    period: { dateFrom, dateTo },
    filters: {
      includeSales: !!includeSales,
      includeReturns: !!includeReturns,
      onlyGifts: !!onlyGifts,
      branches: [...branchSet]
    },
    sections,
    grandSummary: grand,
    systemSummary: { categories: systemCategories },
    missingTrees: missing
  };
}

function listReportTrees() {
  return listMaterialTreeRoots();
}

module.exports = {
  parseTreeSeqList,
  listReportTrees,
  listSalesBranches,
  queryAdminSalesReport,
  queryTreeLines
};
