/**
 * Live sales report from EdariNX — invoice-first queries, BFS subtree by Father Seq/Num.
 */
const path = require('path');
const edariRoot = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const { getEdariConnection } = require('./edari-connection');
const { normalizeEdariDateIso } = require('../lib/date-utils');
const { invoiceKindLabel, invoiceKindShortLabel, isReturnInvoiceKind, isGiftInvoiceKind } = require('../lib/invoice-kinds');
const { normalizeMatNum } = require('../lib/material-tree-utils');
const { deriveBranchCode, deriveBranchLabel, parseBranchFilter, hasBranchMarker, sortBranchesForList, mergeStandardSalesBranches } = require('../lib/branch-utils');
const {
  resolveSalesLineTotal,
  computeCategorySummary,
  mergeCategorySummaries
} = require('../lib/sales-category-summary');

const SALES_KINDS = new Set([0, 1, 4]);
const RETURN_KINDS = new Set([2, 5]);
const GIFT_KINDS = new Set([6]);
const MAT_CHUNK_SIZE = 400;
const BATCH_QUERY_SIZE = 12;
const CACHE_TTL_MS = 30 * 60 * 1000;
const REPORT_CACHE_TTL_MS = 2 * 60 * 1000;
const SYSTEM_SUMMARY_CACHE_TTL_MS = 2 * 60 * 1000;

let treeRootsCache = null;
let treeRootsCacheAt = 0;
let matCatalogCache = null;
let matCatalogCacheAt = 0;
const treeResolveCache = new Map();
const systemSummaryCache = new Map();
const reportCache = new Map();

function cacheGet(map, key, ttlMs) {
  const hit = map.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttlMs) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(map, key, value, maxSize = 24) {
  map.set(key, { at: Date.now(), value });
  if (map.size <= maxSize) return;
  const oldest = [...map.entries()].sort((a, b) => a[1].at - b[1].at)[0];
  if (oldest) map.delete(oldest[0]);
}

function salesReportOptionsKey(options) {
  const branchSet = options.branchSet instanceof Set ? options.branchSet : new Set();
  return JSON.stringify({
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    includeSales: options.includeSales !== false,
    includeReturns: options.includeReturns !== false,
    onlyGifts: !!options.onlyGifts,
    branches: [...branchSet].sort()
  });
}

function salesReportParamsKey(params) {
  const branchSet = parseBranchFilter(params.branches);
  return JSON.stringify({
    treeSeqs: [...parseTreeList(params.treeSeqs || params.trees || [])].sort(),
    dateFrom: String(params.dateFrom || params.from || '').trim(),
    dateTo: String(params.dateTo || params.to || '').trim(),
    includeSales: params.includeSales !== false && params.includeSales !== '0',
    includeReturns: params.includeReturns !== false && params.includeReturns !== '0',
    onlyGifts: params.onlyGifts === true || params.onlyGifts === '1',
    branches: [...branchSet].sort()
  });
}

async function loadMatCatalog() {
  if (matCatalogCache && Date.now() - matCatalogCacheAt < CACHE_TTL_MS) return matCatalogCache;
  const matRows = await query('SELECT Seq, Num, Father, SellPr4 FROM File13n', 60000);
  const bySeq = new Map();
  for (const r of matRows) {
    bySeq.set(String(sqlInt(r.Seq)), {
      num: String(r.Num || '').trim(),
      father: String(sqlInt(r.Father)),
      sellPr4: Number(r.SellPr4 || 0)
    });
  }
  matCatalogCache = bySeq;
  matCatalogCacheAt = Date.now();
  return bySeq;
}

async function resolveSelectedTreesCached(treeRefs) {
  const key = [...parseTreeList(treeRefs)].sort().join(',');
  const hit = cacheGet(treeResolveCache, key, CACHE_TTL_MS);
  if (hit) return hit;
  const value = await resolveSelectedTrees(treeRefs);
  cacheSet(treeResolveCache, key, value, 48);
  return value;
}

const BRANCHES_LIST_CACHE_TTL_MS = 5 * 60 * 1000;
const branchesListCache = new Map();

let odbcChain = Promise.resolve();

function runOdbcExclusive(fn) {
  const task = odbcChain.then(fn, fn);
  odbcChain = task.catch(() => {});
  return task;
}

function connOptions() {
  return { ...getEdariConnection() };
}

async function queryDirect(sql, timeoutMs = 60000) {
  const pending = odbcBridge.runQuery({ ...connOptions(), sql });
  const r = await Promise.race([
    pending,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('انتهت مهلة الاتصال بـ EdariNX')), timeoutMs);
    })
  ]);
  if (!r.ok) throw new Error(r.error || 'فشل الاستعلام من Edari');
  return r.rows || [];
}

async function query(sql, timeoutMs = 60000) {
  return runOdbcExclusive(() => queryDirect(sql, timeoutMs));
}

async function batchQueryDirect(queries, timeoutMs = 120000) {
  if (!queries.length) return {};
  const out = {};

  for (const part of chunk(queries, BATCH_QUERY_SIZE)) {
    if (part.length === 1) {
      out[part[0].id] = await queryDirect(part[0].sql, timeoutMs);
      continue;
    }
    if (typeof odbcBridge.runBatchQuery === 'function') {
      const pending = odbcBridge.runBatchQuery({ ...connOptions(), queries: part });
      const r = await Promise.race([
        pending,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('انتهت مهلة الاستعلام')), timeoutMs);
        })
      ]);
      if (!r.ok) throw new Error(r.error || 'فشل الاستعلام من Edari');
      for (const [id, block] of Object.entries(r.results || {})) {
        out[id] = block.rows || [];
      }
      continue;
    }
    for (const item of part) {
      out[item.id] = await queryDirect(item.sql, timeoutMs);
    }
  }

  return out;
}

async function batchQuery(queries, timeoutMs = 120000) {
  return runOdbcExclusive(() => batchQueryDirect(queries, timeoutMs));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function parseTreeList(input) {
  const list = Array.isArray(input)
    ? input.map(String).map((s) => s.trim())
    : String(input || '').split(/[,،\s]+/).map((s) => s.trim());
  return [...new Set(list.filter(Boolean))];
}

function sqlQuote(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

function sqlInt(value) {
  const n = Number(String(value ?? '').replace(/[^0-9-]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function kindAllowed(kind, options) {
  const k = Number(kind);
  if (k === 3) return false;
  if (GIFT_KINDS.has(k)) return options.includeSales !== false;
  if (SALES_KINDS.has(k)) return options.includeSales !== false;
  if (RETURN_KINDS.has(k)) return options.includeReturns !== false;
  return options.includeSales !== false || options.includeReturns !== false;
}

function nextDayIso(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** File15n."Date" is DateTime — range compare with TIMESTAMP literals. */
function sqlTimestampStart(iso) {
  return `TIMESTAMP ${sqlQuote(`${iso} 00:00:00`)}`;
}

function buildInvoiceDateRangeSql(dateFrom, dateTo, column = 'i."Date"') {
  const endExclusive = nextDayIso(dateTo);
  return `${column} >= ${sqlTimestampStart(dateFrom)} AND ${column} < ${sqlTimestampStart(endExclusive)}`;
}

const SUBTREE_PARENT_CHUNK = 400;

/**
 * Resolve every requested tree reference to its File13n root row in ONE query.
 * Matches by Num (raw + zero-padded) and by Seq (digits), then maps each ref
 * back to its best-matching row in JS.
 */
async function resolveRootNodes(treeRefs) {
  const nums = new Set();
  const seqs = new Set();
  for (const ref of treeRefs) {
    const raw = String(ref || '').trim();
    if (!raw) continue;
    nums.add(raw);
    if (/^\d+$/.test(raw)) nums.add(raw.padStart(3, '0'));
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits) seqs.add(sqlInt(digits));
  }

  const clauses = [];
  if (nums.size) clauses.push(`Num IN (${[...nums].map(sqlQuote).join(',')})`);
  if (seqs.size) clauses.push(`Seq IN (${[...seqs].filter((s) => s > 0).join(',')})`);
  if (!clauses.length) return new Map();

  const rows = await query(`
    SELECT Seq, Num, Name1, Father, SubCount, Barcode
    FROM File13n
    WHERE ${clauses.join(' OR ')}
  `, 20000);

  const byNum = new Map();
  const bySeq = new Map();
  for (const r of rows) {
    byNum.set(String(r.Num || '').trim(), r);
    bySeq.set(String(sqlInt(r.Seq)), r);
  }

  const resolved = new Map();
  for (const ref of treeRefs) {
    const raw = String(ref || '').trim();
    if (!raw || resolved.has(raw)) continue;
    let row = byNum.get(raw);
    if (!row && /^\d+$/.test(raw)) row = byNum.get(raw.padStart(3, '0'));
    if (!row) {
      const digits = raw.replace(/[^0-9]/g, '');
      if (digits) row = bySeq.get(String(sqlInt(digits)));
    }
    if (row) resolved.set(raw, row);
  }
  return resolved;
}

/**
 * Combined BFS over File13n for ALL selected trees at once.
 * File13n.Father stores the parent Seq; file14n.Mat == File13n.Seq, so leaf Seqs
 * are exactly what we match against sales lines. Each depth level is one batched
 * round-trip shared across every tree (instead of one BFS per tree), so the number
 * of ODBC round-trips depends on tree depth — not on how many trees were selected.
 */
function rememberMatInfo(matInfo, seqStr, row) {
  matInfo.set(seqStr, {
    num: String(row.Num || '').trim(),
    barcode: String(row.Barcode || '').trim(),
    name: String(row.Name1 || '').trim(),
    sellPr4: Number(row.SellPr4 || 0)
  });
}

/** Trees excluded from report picker (commissions, write-offs, accounting groups). */
function isExcludedReportTree(row) {
  const num = String(row.Num || row.num || '').trim();
  const name = String(row.Name1 || row.name1 || '').trim();
  if (/عمولات|موظف|مواد\s*مجرود|مجموعة\s*محاسب|لغرض\s*التصفير/i.test(name)) return true;
  if (/^(1001|1002|1003|1004|1005|1006|1007|1010|1111|1984|6565|7441)$/.test(num)) return true;
  return false;
}

/** Any material subtree usable in the sales report picker. */
function isSelectableReportTree(row) {
  return Number(row.SubCount || row.subCount || row.sub_count || 0) > 0
    && !isExcludedReportTree(row);
}

/** Skip commission / non-merchandise roots from system-wide totals. */
function isSystemSalesTreeRoot(row) {
  const num = String(row.Num || row.num || '').trim();
  const name = String(row.Name1 || row.name1 || '').trim();
  if (/^\d+$/.test(num) && parseInt(num, 10) >= 1000) return false;
  if (/عمولات|موظف/i.test(name)) return false;
  return Number(row.SubCount || row.subCount || row.sub_count || 0) > 0;
}

async function resolveSelectedTrees(treeRefs) {
  const rootByRef = await resolveRootNodes(treeRefs);
  const treeMeta = new Map();
  const matToTree = new Map();
  const matInfo = new Map();    // leaf Seq (str) -> { num, barcode, name }
  const missing = [];

  const nodeRoot = new Map();   // node Seq (str) -> tree key
  const leafByKey = new Map();  // tree key -> Set of leaf Seq (str)
  const seen = new Set();
  let frontier = [];

  for (const ref of treeRefs) {
    const root = rootByRef.get(String(ref || '').trim());
    if (!root) {
      missing.push(ref);
      continue;
    }
    const key = String(root.Num || root.Seq);
    if (treeMeta.has(key)) continue;
    treeMeta.set(key, {
      tree: {
        seq: String(root.Seq ?? ''),
        num: String(root.Num || ''),
        name1: root.Name1 || '',
        subCount: Number(root.SubCount || 0)
      },
      leafSeqs: []
    });
    leafByKey.set(key, new Set());

    const rootSeq = sqlInt(root.Seq);
    const rootSeqStr = String(rootSeq);
    nodeRoot.set(rootSeqStr, key);
    seen.add(rootSeqStr);
    if (Number(root.SubCount || 0) === 0) {
      leafByKey.get(key).add(rootSeqStr);
      rememberMatInfo(matInfo, rootSeqStr, root);
    } else {
      frontier.push(rootSeq);
    }
  }

  while (frontier.length) {
    const queries = [];
    let qIdx = 0;
    for (const part of chunk(frontier, SUBTREE_PARENT_CHUNK)) {
      const ids = part.filter((s) => s > 0).join(',');
      if (!ids) continue;
      queries.push({
        id: `b${qIdx++}`,
        sql: `SELECT Seq, Father, SubCount, Num, Barcode, Name1, SellPr4 FROM File13n WHERE Father IN (${ids})`
      });
    }

    const result = await batchQuery(queries, 120000);
    const next = [];
    for (const rows of Object.values(result)) {
      for (const row of rows) {
        const seq = sqlInt(row.Seq);
        if (!seq) continue;
        const seqStr = String(seq);
        if (seen.has(seqStr)) continue;
        const key = nodeRoot.get(String(sqlInt(row.Father)));
        if (!key) continue;
        seen.add(seqStr);
        nodeRoot.set(seqStr, key);
        if (Number(row.SubCount || 0) > 0) {
          next.push(seq);
        } else {
          leafByKey.get(key).add(seqStr);
          rememberMatInfo(matInfo, seqStr, row);
        }
      }
    }
    frontier = next;
  }

  let totalMats = 0;
  for (const [key, meta] of treeMeta) {
    const leaves = [...(leafByKey.get(key) || [])];
    meta.leafSeqs = leaves;
    totalMats += leaves.length;
    for (const seq of leaves) matToTree.set(String(sqlInt(seq)), key);
  }

  return { treeMeta, matToTree, matInfo, missing, totalMats };
}

function pickMaterialTreeRoots(rows) {
  if (!rows.length) return [];
  const bySeq = new Map();
  const byNum = new Map();

  for (const r of rows) {
    bySeq.set(String(r.Seq), r);
    byNum.set(String(r.Num), r);
    byNum.set(normalizeMatNum(r.Num), r);
  }

  function parentIsRoot(fatherRef) {
    const f = String(fatherRef ?? '0').trim();
    if (!f || f === '0') return true;
    const bySeqParent = bySeq.get(f);
    if (bySeqParent) {
      const pf = String(bySeqParent.Father ?? '0').trim();
      return !pf || pf === '0';
    }
    const byNumParent = byNum.get(f) || byNum.get(normalizeMatNum(f));
    if (byNumParent) {
      const pf = String(byNumParent.Father ?? '0').trim();
      return !pf || pf === '0';
    }
    return true;
  }

  return rows
    .filter((r) => parentIsRoot(r.Father) && isSystemSalesTreeRoot(r))
    .sort((a, b) => String(a.Num).localeCompare(String(b.Num), undefined, { numeric: true }));
}

/**
 * Hot path: a single INNER JOIN (file14n ⋈ File15n on indexed Seq) with the date +
 * kind + Mat filter. Material/account/seller details are resolved afterwards via small
 * lookup maps — dropping 3 JOINs (incl. the unindexed FileCrMst.Num join) from the
 * query that scans the largest table.
 */
const LINE_SELECT_SQL = `
  SELECT
    l.Seq AS LineSeq, l.BillSeq, l.BillNo, l.Mat, l.MatName, l.Quant, l.Price, l.OBonus, l.Equa,
    l."sum" AS line_sum, l.person AS Person,
    i.Num AS InvNum, i.Kind AS InvKind, i."Date" AS InvDate, i.Two AS AccSeq, i.remarks AS InvRemarks
  FROM file14n l
  INNER JOIN File15n i ON i.Seq = l.BillSeq
`;

/**
 * file14n.Mat == File13n.Seq, so matching leaf Seqs alone is complete.
 * One query per ~400 leaf Seqs (batched), each with the date range — fast.
 */
function buildLineFetchQueries(leafSeqs, options) {
  const dateSql = buildInvoiceDateRangeSql(options.dateFrom, options.dateTo);
  const baseWhere = `${dateSql} AND i.Kind <> 3`;
  const seqs = [...new Set(leafSeqs.map((s) => sqlInt(s)).filter((s) => s > 0))];
  const queries = [];
  let qIdx = 0;

  for (const part of chunk(seqs, MAT_CHUNK_SIZE)) {
    if (!part.length) continue;
    queries.push({
      id: `q${qIdx++}`,
      sql: `${LINE_SELECT_SQL} WHERE ${baseWhere} AND l.Mat IN (${part.join(',')})`
    });
  }

  return queries;
}

function dedupeLineRows(rows) {
  // Dedupe only on the real line primary key (file14n.Seq). A single invoice can
  // legitimately contain the same material on several lines (different sellers,
  // prices, bonus/discount), so we must NOT collapse by (BillSeq, Mat).
  const seen = new Set();
  return rows.filter((row) => {
    const key = row.LineSeq != null && String(row.LineSeq) !== ''
      ? `L:${row.LineSeq}`
      : `F:${row.BillSeq}|${row.BillNo}|${row.Mat}|${row.Quant}|${row.Price}|${row.OBonus}|${row.person ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchLinesForTreeAndDate(leafSeqs, options) {
  const queries = buildLineFetchQueries(leafSeqs, options);
  if (!queries.length) {
    return { lines: [], rawCount: 0, queryCount: 0 };
  }

  const batchResult = await batchQuery(queries, 180000);
  const rows = [];
  for (const part of Object.values(batchResult)) rows.push(...part);
  const deduped = dedupeLineRows(rows);
  const filtered = filterLineRows(deduped, options);

  return {
    lines: sortLines(filtered),
    rawCount: deduped.length,
    queryCount: queries.length
  };
}

function filterLineRows(rows, options) {
  return rows.filter((row) => {
    if (!kindAllowed(row.InvKind, options)) return false;
    if (options.onlyGifts && !isGiftInvoiceKind(row.InvKind) && Number(row.OBonus || 0) <= 0) return false;
    return true;
  });
}

function sortLines(rows) {
  rows.sort((a, b) => {
    const da = normalizeEdariDateIso(a.InvDate) || '';
    const db = normalizeEdariDateIso(b.InvDate) || '';
    if (da !== db) return da.localeCompare(db);
    return String(a.InvNum || '').localeCompare(String(b.InvNum || ''), undefined, { numeric: true });
  });
  return rows;
}

/** File15n.remarks holds the branch label, e.g. "الفرع 138" / "الفرع دلفري". */
function parseBranchLabel(remarks) {
  const raw = String(remarks || '').trim();
  if (!raw) return '';
  return raw.replace(/^\s*الفرع\s*[:\-]?\s*/u, '').trim() || raw;
}


function mapLineRow(r, treeNum, lookups) {
  const isGift = isGiftInvoiceKind(r.InvKind);
  const isReturn = !isGift && isReturnInvoiceKind(r.InvKind);
  const quant = Number(r.Quant || 0);
  const bonus = Number(r.OBonus || 0);
  const unitPrice = Number(r.Price || 0);
  const mat = lookups.matInfo.get(String(sqlInt(r.Mat))) || {};
  const sellPr4 = Number(mat.sellPr4 || 0);
  const lineTotal = resolveSalesLineTotal({
    quant,
    bonus,
    unitPrice,
    sellPr4,
    line_sum: r.line_sum,
    isReturn
  });
  const signedTotal = isReturn ? -Math.abs(lineTotal) : lineTotal;
  const acc = lookups.accInfo.get(String(sqlInt(r.AccSeq))) || {};
  const accNum = acc.num || '';
  const accName = acc.name || '';
  const sellerName = lookups.sellerInfo.get(String(r.Person || '').trim()) || '';

  const branchLabel = parseBranchLabel(r.InvRemarks);
  const branchCode = deriveBranchCode(r.InvRemarks, accNum);
  return {
    date: r.InvDate,
    invNum: r.InvNum || '',
    kind: r.InvKind,
    kindLabel: invoiceKindShortLabel(r.InvKind),
    kindFullLabel: invoiceKindLabel(r.InvKind),
    isReturn,
    isGift,
    branchLabel,
    branchCode,
    branchNum: branchLabel || accNum,
    branchName: branchLabel || accName,
    accountNum: accNum,
    accountName: accName,
    sectionNum: treeNum || '',
    person: String(r.Person || '').trim(),
    userLabel: '',
    sellerLabel: sellerName,
    matNum: mat.num || '',
    barcode: mat.barcode || mat.num || String(r.Mat || ''),
    matName: String(r.MatName || '').trim() || mat.name || '',
    quant,
    bonus,
    equa: Number(r.Equa || 0),
    unitPrice,
    sellPr4,
    lineTotal: signedTotal,
    absTotal: Math.abs(lineTotal)
  };
}

/** Resolve account (File11n) + seller (FileCrMst Type=3) names for the raw lines in one batch. */
async function fetchLineLookups(rawLines, matInfo) {
  const accSeqs = new Set();
  const persons = new Set();
  for (const r of rawLines) {
    const accSeq = sqlInt(r.AccSeq);
    if (accSeq > 0) accSeqs.add(accSeq);
    const person = String(r.Person || '').trim();
    if (person && person !== '0') persons.add(person);
  }

  const queries = [];
  for (const [i, part] of chunk([...accSeqs], MAT_CHUNK_SIZE).entries()) {
    if (part.length) {
      queries.push({ id: `a${i}`, sql: `SELECT Seq, Num, Name1 FROM File11n WHERE Seq IN (${part.join(',')})` });
    }
  }
  for (const [i, part] of chunk([...persons], MAT_CHUNK_SIZE).entries()) {
    const vals = part.map((p) => sqlInt(p)).filter((p) => p > 0).join(',');
    if (vals) {
      queries.push({ id: `s${i}`, sql: `SELECT Num, Name FROM FileCrMst WHERE Type = 3 AND Num IN (${vals})` });
    }
  }

  const accInfo = new Map();
  const sellerInfo = new Map();
  if (queries.length) {
    const result = await batchQuery(queries, 60000);
    for (const [id, rows] of Object.entries(result)) {
      if (id.startsWith('a')) {
        for (const row of rows) {
          accInfo.set(String(sqlInt(row.Seq)), {
            num: String(row.Num || '').trim(),
            name: String(row.Name1 || '').trim()
          });
        }
      } else {
        for (const row of rows) {
          const seller = String(row.Name || '').trim();
          if (seller) sellerInfo.set(String(row.Num || '').trim(), seller);
        }
      }
    }
  }

  return { matInfo, accInfo, sellerInfo };
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

function emptyCategorySummary() {
  return {
    sales: { qty: 0, bonus: 0, amount: 0 },
    gifts: { qty: 0, bonus: 0, amount: 0 },
    returns: { qty: 0, bonus: 0, amount: 0 }
  };
}

/**
 * ملخص إجمالي لكل شجرات النظام — استعلام واحد مباشر بدون تتبّع كل شجرة على حدة.
 * نبني خريطة الجذور من File13n مرة واحدة، ثم نمرّ على كل بنود الفترة لحساب
 * المبيعات/الهدايا/المردود بسعر البيع (SellPr4)، ونستثني جذور العمولات/غير المخزنية.
 */
async function fetchSystemCategorySummary(options) {
  const cacheKey = salesReportOptionsKey(options);
  const hit = cacheGet(systemSummaryCache, cacheKey, SYSTEM_SUMMARY_CACHE_TTL_MS);
  if (hit) return hit;

  const bySeq = await loadMatCatalog();
  const rootCache = new Map();
  function rootNumOf(seq) {
    const key = String(sqlInt(seq));
    if (rootCache.has(key)) return rootCache.get(key);
    let cur = bySeq.get(key);
    let guard = 0;
    while (cur && cur.father && cur.father !== '0' && guard++ < 40) {
      const parent = bySeq.get(cur.father);
      if (!parent) break;
      cur = parent;
    }
    const num = cur?.num || '';
    rootCache.set(key, num);
    return num;
  }

  const branchSet = options.branchSet instanceof Set ? options.branchSet : null;
  const dateSql = buildInvoiceDateRangeSql(options.dateFrom, options.dateTo);
  const rows = await query(`
    SELECT l.Mat, l.Quant, l.OBonus, l.Price, l.Equa, l."sum" AS line_sum,
           i.Kind AS InvKind, i.Two AS AccSeq, i.remarks AS InvRemarks
    FROM file14n l
    INNER JOIN File15n i ON i.Seq = l.BillSeq
    WHERE ${dateSql} AND i.Kind <> 3
  `, 120000);

  // Resolve account numbers only when a branch filter is active (delivery branches key off acc Num).
  let accNumBySeq = new Map();
  if (branchSet && branchSet.size) {
    const accSeqs = [...new Set(rows.map((r) => sqlInt(r.AccSeq)).filter((s) => s > 0))];
    for (const part of chunk(accSeqs, MAT_CHUNK_SIZE)) {
      if (!part.length) continue;
      const accRows = await query(`SELECT Seq, Num FROM File11n WHERE Seq IN (${part.join(',')})`, 60000);
      for (const a of accRows) accNumBySeq.set(String(sqlInt(a.Seq)), String(sqlInt(a.Num)));
    }
  }

  const branchActive = !!(branchSet && branchSet.size);
  const mapped = [];
  for (const r of rows) {
    if (branchActive) {
      const accNum = accNumBySeq.get(String(sqlInt(r.AccSeq))) || '';
      const code = deriveBranchCode(r.InvRemarks, accNum);
      if (!branchSet.has(code)) continue;
    } else {
      // بدون فلتر فروع: استثنِ جذور العمولات/غير المخزنية من الإجمالي العام فقط
      const rootNum = rootNumOf(r.Mat);
      if (/^\d+$/.test(rootNum) && parseInt(rootNum, 10) >= 1000) continue;
    }
    const mat = bySeq.get(String(sqlInt(r.Mat))) || {};
    const isGift = isGiftInvoiceKind(r.InvKind);
    const isReturn = !isGift && isReturnInvoiceKind(r.InvKind);
    const quant = Number(r.Quant || 0);
    const bonus = Number(r.OBonus || 0);
    const unitPrice = Number(r.Price || 0);
    const sellPr4 = Number(mat.sellPr4 || 0);
    const total = resolveSalesLineTotal({
      quant,
      bonus,
      unitPrice,
      sellPr4,
      line_sum: r.line_sum,
      isReturn
    });
    mapped.push({
      quant,
      bonus,
      equa: Number(r.Equa || 0),
      unitPrice,
      sellPr4,
      kind: r.InvKind,
      lineTotal: isReturn ? -Math.abs(total) : total,
      isReturn,
      isGift
    });
  }

  const summary = computeCategorySummary(mapped);
  cacheSet(systemSummaryCache, cacheKey, summary, 32);
  return summary;
}

async function fetchCategorySummaryForTrees(treeRefs, options) {
  if (!treeRefs.length) return emptyCategorySummary();

  const { treeMeta, matToTree, matInfo, missing } = await resolveSelectedTrees(treeRefs);
  if (!treeMeta.size) return emptyCategorySummary();

  const allLeafSeqs = [];
  for (const meta of treeMeta.values()) allLeafSeqs.push(...meta.leafSeqs);
  if (!allLeafSeqs.length) return emptyCategorySummary();

  const { lines: rawLines } = await fetchLinesForTreeAndDate(allLeafSeqs, options);
  const lookups = await fetchLineLookups(rawLines, matInfo);
  const mapped = [];

  for (const row of rawLines) {
    const treeKey = resolveTreeKey(row, matToTree);
    if (!treeKey || !treeMeta.has(treeKey)) continue;
    const treeNum = treeMeta.get(treeKey)?.tree?.num || treeKey;
    mapped.push(mapLineRow(row, treeNum, lookups));
  }

  return computeCategorySummary(mapped);
}

function resolveTreeKey(row, matToTree) {
  return matToTree.get(String(sqlInt(row.Mat))) || '';
}

async function listMaterialTreeRoots() {
  if (treeRootsCache && Date.now() - treeRootsCacheAt < CACHE_TTL_MS) {
    return treeRootsCache;
  }

  const rows = await query(`
    SELECT Seq, Num, Name1, SubCount, Father
    FROM File13n
    WHERE SubCount > 0
    ORDER BY Num
  `, 90000);

  treeRootsCache = rows
    .filter(isSelectableReportTree)
    .map((r) => ({
      seq: String(r.Seq ?? ''),
      num: String(r.Num || ''),
      name1: r.Name1 || '',
      subCount: Number(r.SubCount || 0),
      sub_count: Number(r.SubCount || 0),
      father_num: String(r.Father ?? '0')
    }));
  treeRootsCacheAt = Date.now();
  return treeRootsCache;
}

async function listSystemSalesTreeRefs() {
  const roots = await listMaterialTreeRoots();
  return roots
    .filter((t) => String(t.father_num || '0') === '0')
    .filter((t) => isSystemSalesTreeRoot({ Num: t.num, Name1: t.name1, SubCount: t.subCount }))
    .map((t) => t.num || t.seq)
    .filter(Boolean);
}

/**
 * قائمة الفروع المتاحة ضمن فترة — لاختيارها في الفلتر.
 * نشتق كود الفرع من remarks + رقم حساب الفاتورة، ونجمع عدد الفواتير لكل فرع.
 */
async function listSalesBranches(params = {}) {
  const dateFrom = String(params.dateFrom || params.from || '').trim();
  const dateTo = String(params.dateTo || params.to || '').trim();
  if (!dateFrom || !dateTo) throw new Error('يرجى تحديد تاريخ البداية والنهاية');

  const cacheKey = `${dateFrom}|${dateTo}`;
  const cached = cacheGet(branchesListCache, cacheKey, BRANCHES_LIST_CACHE_TTL_MS);
  if (cached) return cached.map((b) => ({ ...b }));

  const dateSql = buildInvoiceDateRangeSql(dateFrom, dateTo);
  const bills = await query(`
    SELECT i.Two AS AccSeq, i.remarks AS InvRemarks
    FROM File15n i
    WHERE ${dateSql} AND i.Kind <> 3
  `, 120000);

  const accSeqs = [...new Set(bills.map((b) => sqlInt(b.AccSeq)).filter((s) => s > 0))];
  const accInfo = new Map();
  for (const part of chunk(accSeqs, MAT_CHUNK_SIZE)) {
    if (!part.length) continue;
    const accRows = await query(`SELECT Seq, Num, Name1 FROM File11n WHERE Seq IN (${part.join(',')})`, 60000);
    for (const a of accRows) {
      accInfo.set(String(sqlInt(a.Seq)), {
        num: String(sqlInt(a.Num)),
        name: String(a.Name1 || '').trim()
      });
    }
  }

  const branches = new Map();
  for (const b of bills) {
    // فقط الفواتير التي تحمل "الفرع" في الملاحظات — لا نعرض حسابات الزبائن كفروع
    if (!hasBranchMarker(b.InvRemarks)) continue;
    const acc = accInfo.get(String(sqlInt(b.AccSeq))) || {};
    const code = deriveBranchCode(b.InvRemarks, acc.num);
    if (!code) continue;
    if (!branches.has(code)) {
      branches.set(code, {
        code,
        label: deriveBranchLabel(b.InvRemarks, acc.num, acc.name),
        remarks: String(b.InvRemarks || '').trim(),
        invoiceCount: 0
      });
    }
    branches.get(code).invoiceCount += 1;
  }

  const result = mergeStandardSalesBranches([...branches.values()]);
  cacheSet(branchesListCache, cacheKey, result, 48);
  return result.map((b) => ({ ...b }));
}

async function queryEdariSalesReport(params = {}) {
  const cacheKey = salesReportParamsKey(params);
  const cached = cacheGet(reportCache, cacheKey, REPORT_CACHE_TTL_MS);
  if (cached) return { ...cached, meta: { ...(cached.meta || {}), cached: true } };

  const treeRefs = parseTreeList(params.treeSeqs || params.trees || []);
  const dateFrom = String(params.dateFrom || params.from || '').trim();
  const dateTo = String(params.dateTo || params.to || '').trim();
  const includeSales = params.includeSales !== false && params.includeSales !== '0';
  const includeReturns = params.includeReturns !== false && params.includeReturns !== '0';
  const onlyGifts = params.onlyGifts === true || params.onlyGifts === '1';
  const branchSet = parseBranchFilter(params.branches);

  if (!treeRefs.length) throw new Error('يرجى اختيار شجرة مواد واحدة على الأقل');
  if (!dateFrom || !dateTo) throw new Error('يرجى تحديد تاريخ البداية والنهاية');

  const options = { dateFrom, dateTo, includeSales, includeReturns, onlyGifts, branchSet };

  const { treeMeta, matToTree, matInfo, missing } = await resolveSelectedTreesCached(treeRefs);

  if (!treeMeta.size) {
    throw new Error('لم يتم العثور على شجرات المواد — تحقق من الأرقام (086، 087، …)');
  }

  const allLeafSeqs = [];
  for (const meta of treeMeta.values()) {
    allLeafSeqs.push(...meta.leafSeqs);
  }

  if (!allLeafSeqs.length) {
    throw new Error('الشجرة لا تحتوي مواد فرعية — تحقق من رقم الشجرة');
  }

  const { lines: rawLines, rawCount, queryCount } = await fetchLinesForTreeAndDate(
    allLeafSeqs,
    options
  );
  const systemCategories = await fetchSystemCategorySummary(options);

  const invoiceSeqs = new Set(rawLines.map((r) => String(r.BillSeq || '')).filter(Boolean));
  const lookups = await fetchLineLookups(rawLines, matInfo);

  const linesByTree = new Map();
  for (const key of treeMeta.keys()) linesByTree.set(key, []);

  for (const row of rawLines) {
    const treeKey = resolveTreeKey(row, matToTree);
    if (!treeKey || !linesByTree.has(treeKey)) continue;
    const treeNum = treeMeta.get(treeKey)?.tree?.num || treeKey;
    const mappedLine = mapLineRow(row, treeNum, lookups);
    if (branchSet.size && !branchSet.has(mappedLine.branchCode)) continue;
    linesByTree.get(treeKey).push(mappedLine);
  }

  const sections = [];
  for (const [key, meta] of treeMeta) {
    const lines = linesByTree.get(key) || [];
    sections.push({
      tree: meta.tree,
      lines,
      summary: computeTreeSummary(lines)
    });
  }

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

  const result = {
    period: { dateFrom, dateTo },
    filters: { includeSales, includeReturns, onlyGifts, branches: [...branchSet] },
    sections,
    grandSummary: grand,
    systemSummary: {
      categories: systemCategories
    },
    missingTrees: missing,
    source: 'edari',
    meta: {
      matSeqs: allLeafSeqs.length,
      leafSeqs: allLeafSeqs.length,
      sqlLines: rawCount,
      matchedLines: rawLines.length,
      queryCount,
      invoicesInRange: invoiceSeqs.size
    }
  };

  cacheSet(reportCache, cacheKey, result, 16);
  return result;
}

module.exports = {
  listMaterialTreeRoots,
  listSystemSalesTreeRefs,
  listSalesBranches,
  queryEdariSalesReport
};
