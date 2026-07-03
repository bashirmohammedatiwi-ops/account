/**
 * Sync Edari purchase movements + stock balance + product names + POS prices to price-app server.
 * Edari: names, stock, purchase movements. POS (SQL Server): original/discount/final prices.
 *
 * In this Edari install, supplier purchases are File15n.Kind = 1 (matches
 * «حركة مواد — مشتريات»). Stock balance = File13n.InTot - File13n.OutTot.
 *
 * Usage:
 *   node sync-client/price-app-sync.js --server URL [--full|--incremental] [--key KEY]
 *   POS SQL via env: POS_SQL_SERVER, POS_SQL_DATABASE, POS_SQL_USER, POS_SQL_PASSWORD
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const edariRoot = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const { getEdariConnection } = require('./edari-connection');
const { normalizeEdariDateIso } = require('../lib/date-utils');
const { syncPosPricing } = require('./pos-pricing-sync');

const SERVER = process.argv.includes('--server')
  ? process.argv[process.argv.indexOf('--server') + 1]
  : (process.env.PRICE_APP_SERVER || 'https://demaalhayaadelivery.online/price-api');

const SYNC_KEY = process.argv.includes('--key')
  ? process.argv[process.argv.indexOf('--key') + 1]
  : (process.env.PRICE_SYNC_KEY || '');

const FORCE_FULL = process.argv.includes('--full');
const FORCE_INCREMENTAL = process.argv.includes('--incremental');

const SYNC_STATE_FILE = process.env.PRICE_SYNC_STATE_FILE
  || path.join(__dirname, '..', 'data', 'price-sync-state.json');

/** Purchase invoice kinds: 1 = supplier purchases, 3 = purchase/stock invoices in Edari. */
const PURCHASE_KINDS = [1, 3];

const UPLOAD_BATCH = 300;
const QUERY_TIMEOUT_MS = 300000;
const PURCHASE_LINE_BATCH = 1200;
const INCREMENTAL_BATCH_LIMIT = 200;
const MAT_LOOKUP_CHUNK = 400;

async function query(sql, timeoutMs = QUERY_TIMEOUT_MS) {
  const r = await odbcBridge.runQuery({ ...getEdariConnection(), sql, timeoutMs });
  if (!r.ok) throw new Error(r.error || 'Query failed');
  return r.rows || [];
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function sqlTimestamp(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const normalized = s.includes(' ') && !s.includes('T') ? s : s.replace('T', ' ').slice(0, 19);
  return `TIMESTAMP ${sqlQuote(normalized)}`;
}

function purchaseKindSql(alias = 'i') {
  return PURCHASE_KINDS.map((k) => `${alias}.Kind = ${k}`).join(' OR ');
}

function reportProgress(step, total, pct, msg) {
  console.log(`@PROGRESS|${step}|${total}|${pct}|${msg || ''}`);
}

/** Edari final stock = inbound − outbound */
function edariStockQty(inTot, outTot) {
  return Number(inTot || 0) - Number(outTot || 0);
}

function resolveMaterialBarcode(row) {
  const barcode = String(row.Barcode ?? '').trim();
  if (barcode && barcode !== '0') return barcode;
  const num = String(row.Num ?? row.MatNum ?? '').trim();
  if (num && num !== '0') return num;
  const mat = sqlInt(row.Mat);
  if (mat > 0) return `M:${mat}`;
  return '';
}

function buildEdariLineKey(row) {
  const lineSeq = String(row.LineSeq ?? row.Seq ?? '').trim();
  if (lineSeq) return `L:${lineSeq}`;
  return [
    'F',
    row.BillSeq,
    row.BillNo,
    row.Mat,
    row.Quant,
    row.Price,
    normalizeEdariDateIso(row.InvDate) || '',
    row.AccSeq ?? '',
  ].join('|');
}

function loadSyncState() {
  try {
    if (!fs.existsSync(SYNC_STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(SYNC_STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveSyncState(state) {
  const file = SYNC_STATE_FILE;
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
}

async function fetchAccountNames(accSeqs) {
  const map = new Map();
  const ids = [...new Set(accSeqs.map((s) => sqlInt(s)).filter((s) => s > 0))];
  for (const part of chunk(ids, 300)) {
    if (!part.length) continue;
    const rows = await query(`SELECT Seq, Num, Name1 FROM File11n WHERE Seq IN (${part.join(',')})`);
    for (const row of rows) {
      map.set(String(sqlInt(row.Seq)), String(row.Name1 || row.Num || '').trim());
    }
  }
  return map;
}

async function fetchMatInfoBySeq(matSeqs) {
  const map = new Map();
  const ids = [...new Set((matSeqs || []).map(sqlInt).filter((s) => s > 0))];
  for (const part of chunk(ids, MAT_LOOKUP_CHUNK)) {
    if (!part.length) continue;
    const rows = await query(`
      SELECT Seq, Barcode, Num, Name1, SellPr4
      FROM File13n
      WHERE Seq IN (${part.join(',')})
    `);
    for (const row of rows) {
      map.set(String(sqlInt(row.Seq)), row);
    }
  }
  return map;
}

function attachMatInfo(rows, matMap) {
  return rows.map((row) => {
    const mat = matMap.get(String(sqlInt(row.Mat))) || {};
    return {
      ...row,
      Barcode: mat.Barcode ?? row.Barcode,
      Num: mat.Num ?? row.Num,
      Name1: mat.Name1 ?? row.Name1,
      SellPr4: mat.SellPr4 ?? row.SellPr4,
    };
  });
}

/** Hot path: file14n ⋈ File15n only — File13n lookup is batched afterward (JOIN times out on nxServer). */
async function queryPurchaseLineBatch(extraWhere, afterSeq, limit) {
  const kindSql = purchaseKindSql('i');
  const baseCols = 'l.Seq AS LineSeq, l.BillSeq, l.BillNo, l.Mat, l.MatName, l.Quant, l.Price';
  const topSql = limit > 0 ? `TOP ${limit} ` : '';
  const cursorSql = afterSeq > 0 ? `AND l.Seq > ${afterSeq}` : '';
  const extra = String(extraWhere || '').trim();

  let rows;
  try {
    rows = await query(`
      SELECT ${topSql}${baseCols}, l."Sum" AS line_sum,
        i.Num AS InvNum, i."Date" AS InvDate, i.Two AS AccSeq, i.Kind AS InvKind
      FROM file14n l
      INNER JOIN File15n i ON i.Seq = l.BillSeq
      WHERE (${kindSql}) ${extra} ${cursorSql}
      ORDER BY l.Seq ASC
    `);
  } catch {
    rows = await query(`
      SELECT ${topSql}${baseCols},
        i.Num AS InvNum, i."Date" AS InvDate, i.Two AS AccSeq, i.Kind AS InvKind
      FROM file14n l
      INNER JOIN File15n i ON i.Seq = l.BillSeq
      WHERE (${kindSql}) ${extra} ${cursorSql}
      ORDER BY l.Seq ASC
    `);
  }

  if (!rows.length) return rows;
  const matMap = await fetchMatInfoBySeq(rows.map((r) => r.Mat));
  return attachMatInfo(rows, matMap);
}

function mergePurchaseLineBatch(target, batch, seenSeq) {
  for (const row of batch) {
    const seq = sqlInt(row.LineSeq ?? row.Seq);
    if (seq && seenSeq.has(seq)) continue;
    if (seq) seenSeq.add(seq);
    target.push(row);
  }
}

async function fetchPurchaseLines({ incremental = false, syncState = null, onProgress = null } = {}) {
  const rows = [];
  const seenSeq = new Set();

  const notify = (msg) => {
    if (typeof onProgress === 'function') onProgress(rows.length, msg);
  };

  if (incremental && syncState?.lastSyncAt) {
    const lastLineSeq = sqlInt(syncState.lastLineSeq);
    const sinceTs = sqlTimestamp(syncState.lastSyncAt);

    if (lastLineSeq > 0) {
      let cursor = lastLineSeq;
      let batchNum = 0;
      notify('جلب بنود المشتريات الجديدة...');
      while (true) {
        batchNum += 1;
        const batch = await queryPurchaseLineBatch('', cursor, PURCHASE_LINE_BATCH);
        if (!batch.length) break;
        mergePurchaseLineBatch(rows, batch, seenSeq);
        notify(`جلب بنود جديدة... ${rows.length}`);
        const maxSeq = Math.max(...batch.map((r) => sqlInt(r.LineSeq ?? r.Seq)));
        if (maxSeq <= cursor) break;
        cursor = maxSeq;
        if (batch.length < PURCHASE_LINE_BATCH) break;
        if (batchNum >= INCREMENTAL_BATCH_LIMIT) {
          throw new Error('تحديثات كثيرة جداً — استخدم «مزامنة كاملة»');
        }
      }
    } else if (sinceTs) {
      notify('جلب التحديثات من Edari...');
      mergePurchaseLineBatch(
        rows,
        await queryPurchaseLineBatch(`AND l.DtModified >= ${sinceTs}`, 0, PURCHASE_LINE_BATCH),
        seenSeq,
      );
    }

    return rows;
  }

  notify('جلب حركات المشتريات...');
  let cursor = 0;
  let batchNum = 0;
  while (true) {
    batchNum += 1;
    const batch = await queryPurchaseLineBatch('', cursor, PURCHASE_LINE_BATCH);
    if (!batch.length) break;
    mergePurchaseLineBatch(rows, batch, seenSeq);
    notify(`جلب حركات المشتريات... ${rows.length} بند`);
    const maxSeq = Math.max(...batch.map((r) => sqlInt(r.LineSeq ?? r.Seq)));
    if (maxSeq <= cursor) break;
    cursor = maxSeq;
    if (batch.length < PURCHASE_LINE_BATCH) break;
    reportProgress(1, 4, Math.min(92, 8 + batchNum), `جلب حركات المشتريات... ${rows.length} بند`);
  }
  return rows;
}

function mapRowsToMovements(rows, accMap) {
  const movements = [];
  const productMap = new Map();
  const billSeqs = new Set();
  const seenKeys = new Set();
  let skippedNoBarcode = 0;
  let skippedDedupe = 0;
  let maxLineSeq = 0;

  for (const row of rows) {
    const lineSeqNum = sqlInt(row.LineSeq ?? row.Seq);
    if (lineSeqNum > maxLineSeq) maxLineSeq = lineSeqNum;

    const barcode = resolveMaterialBarcode(row);
    if (!barcode) {
      skippedNoBarcode += 1;
      continue;
    }

    const edariKey = buildEdariLineKey(row);
    if (seenKeys.has(edariKey)) {
      skippedDedupe += 1;
      continue;
    }
    seenKeys.add(edariKey);

    const quantity = Number(row.Quant || 0);
    const unitPrice = Number(row.Price || 0);
    let totalPrice = Number(row.line_sum ?? row.Sum ?? 0);
    if (!totalPrice && quantity && unitPrice) totalPrice = quantity * unitPrice;

    const supplier = accMap.get(String(sqlInt(row.AccSeq))) || '';
    const date = normalizeEdariDateIso(row.InvDate);
    const name = String(row.Name1 || row.MatName || '').trim();

    billSeqs.add(String(row.BillSeq));

    movements.push({
      barcode,
      supplier,
      invoice: String(row.InvNum || row.BillNo || '').trim(),
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
      date: date || null,
      edari_key: edariKey,
    });

    if (!productMap.has(barcode)) {
      productMap.set(barcode, { barcode, name });
    } else {
      const existing = productMap.get(barcode);
      if (name) existing.name = name;
    }
  }

  return {
    movements,
    products: [...productMap.values()],
    bills: billSeqs.size,
    rawLines: rows.length,
    maxLineSeq,
    skippedNoBarcode,
    skippedDedupe,
  };
}

async function fetchPurchaseMovements({ incremental = false, syncState = null } = {}) {
  const modeLabel = incremental ? 'جلب التحديثات الجديدة...' : 'جلب كل حركات المشتريات...';
  reportProgress(1, 4, 5, modeLabel);

  const allRows = await fetchPurchaseLines({
    incremental,
    syncState,
    onProgress: (count, msg) => {
      reportProgress(1, 4, Math.min(88, 12 + Math.round(count / 80)), msg || modeLabel);
    },
  });
  reportProgress(1, 4, 40, `بنود خام: ${allRows.length}`);

  reportProgress(1, 4, 55, 'جلب أسماء الموردين...');
  const accMap = await fetchAccountNames(allRows.map((r) => r.AccSeq));
  const mapped = mapRowsToMovements(allRows, accMap);
  mapped.matSeqs = [...new Set(allRows.map((r) => sqlInt(r.Mat)).filter((s) => s > 0))];

  reportProgress(
    1,
    4,
    100,
    `تم: ${mapped.movements.length} حركة من ${mapped.bills} فاتورة (${mapped.rawLines} بند خام)`,
  );

  return mapped;
}

/** Materials with PurchaseTot but no invoice lines in the current DB (common after year rollover). */
async function fetchAggregatePurchaseMovements() {
  const kindList = PURCHASE_KINDS.join(', ');
  const rows = await query(`
    SELECT m.Seq, m.Barcode, m.Num, m.Name1, m.PurchaseTot, m.PurchaseAm, m.SellPr4
    FROM File13n m
    WHERE m.SubCount = 0 AND m.PurchaseTot > 0
      AND NOT EXISTS (
        SELECT 1 FROM file14n l
        INNER JOIN File15n i ON i.Seq = l.BillSeq
        WHERE l.Mat = m.Seq AND i.Kind IN (${kindList})
      )
  `);

  const movements = [];
  const products = [];
  for (const row of rows) {
    const barcode = resolveMaterialBarcode(row);
    if (!barcode) continue;
    const qty = Number(row.PurchaseTot || 0);
    if (qty <= 0) continue;
    const total = Number(row.PurchaseAm || 0);
    const unit = total > 0 ? total / qty : 0;

    movements.push({
      barcode,
      supplier: 'مشتريات مسجّلة (بدون تفاصيل فواتير)',
      invoice: '—',
      quantity: qty,
      unit_price: unit,
      total_price: total > 0 ? total : qty * unit,
      date: null,
      edari_key: `AGG:${row.Seq}`,
    });

    products.push({
      barcode,
      name: String(row.Name1 || '').trim(),
    });
  }

  return { movements, products, count: movements.length };
}

async function fetchProductCatalog() {
  const rows = await query(`
    SELECT Barcode, Num, Name1, SellPr4, InTot, OutTot
    FROM File13n
    WHERE SubCount = 0
  `);
  return mapCatalogRows(rows);
}

/** Incremental sync — only materials touched by new purchase lines (not all 47k+ items). */
async function fetchProductCatalogForMats(matSeqs) {
  const ids = [...new Set((matSeqs || []).map(sqlInt).filter((s) => s > 0))];
  if (!ids.length) return [];
  const rows = [];
  for (const part of chunk(ids, 400)) {
    if (!part.length) continue;
    const batch = await query(`
      SELECT Seq, Barcode, Num, Name1, SellPr4, InTot, OutTot
      FROM File13n
      WHERE Seq IN (${part.join(',')})
    `);
    rows.push(...batch);
  }
  return mapCatalogRows(rows);
}

function mapCatalogRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const barcode = resolveMaterialBarcode(row);
    if (!barcode) continue;
    map.set(barcode, {
      barcode,
      name: String(row.Name1 || '').trim(),
      stock_balance: edariStockQty(row.InTot, row.OutTot),
    });
  }
  return [...map.values()];
}

function mergeProducts(primary = [], extra = []) {
  const map = new Map();
  for (const p of [...primary, ...extra]) {
    const barcode = String(p.barcode || '').trim();
    if (!barcode) continue;
    const existing = map.get(barcode);
    if (!existing) {
      map.set(barcode, { ...p, barcode });
      continue;
    }
    if (p.name) existing.name = p.name;
    if (p.stock_balance != null && Number.isFinite(Number(p.stock_balance))) {
      existing.stock_balance = Number(p.stock_balance);
    }
  }
  return [...map.values()];
}

async function uploadBatch(serverUrl, syncKey, payload) {
  const headers = { 'Content-Type': 'application/json' };
  if (syncKey) headers['X-Sync-Key'] = syncKey;

  const res = await fetch(`${serverUrl.replace(/\/$/, '')}/sync/edari`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  return data;
}

async function uploadAll(serverUrl, syncKey, products, movements) {
  let productsUpserted = 0;
  let consumerPricesUpdated = 0;
  let stockBalancesUpdated = 0;
  let movementsUpserted = 0;

  const productParts = chunk(products, UPLOAD_BATCH);
  for (let i = 0; i < productParts.length; i++) {
    const part = productParts[i];
    const result = await uploadBatch(serverUrl, syncKey, { products: part, movements: [] });
    productsUpserted += result.products_upserted || 0;
    consumerPricesUpdated += result.consumer_prices_updated || 0;
    stockBalancesUpdated += result.stock_balances_updated || 0;
    reportProgress(3, 4, Math.round(((i + 1) / Math.max(productParts.length, 1)) * 40), `رفع منتجات: ${i + 1}/${productParts.length}`);
  }

  const movementParts = chunk(movements, UPLOAD_BATCH);
  for (let i = 0; i < movementParts.length; i++) {
    const part = movementParts[i];
    const result = await uploadBatch(serverUrl, syncKey, { products: [], movements: part });
    movementsUpserted += result.movements_upserted || 0;
    reportProgress(3, 4, 40 + Math.round(((i + 1) / Math.max(movementParts.length, 1)) * 60), `رفع حركات: ${movementsUpserted}/${movements.length}`);
  }

  return { productsUpserted, consumerPricesUpdated, stockBalancesUpdated, movementsUpserted };
}

async function runPosPricingUpload(serverUrl, syncKey, options = {}) {
  return syncPosPricing({
    serverUrl,
    syncKey,
    posConfig: {
      server: options.posSqlServer,
      database: options.posSqlDatabase,
      user: options.posSqlUser,
      password: options.posSqlPassword,
    },
    onProgress: (pct, msg) => reportProgress(4, 4, pct, msg),
  });
}

async function main(options = {}) {
  const serverUrl = String(options.serverUrl || SERVER || '').trim().replace(/\/$/, '');
  const syncKey = String(options.syncKey ?? SYNC_KEY ?? '').trim();
  if (!serverUrl) throw new Error('عنوان سيرفر الأسعار غير مضبوط');

  const prevState = loadSyncState();
  const incremental = options.incremental != null
    ? Boolean(options.incremental)
    : (!FORCE_FULL && (FORCE_INCREMENTAL || Boolean(prevState?.lastSyncAt)));

  if (incremental && !prevState?.lastSyncAt) {
    throw new Error('لا توجد مزامنة سابقة — نفّذ مزامنة كاملة أولاً');
  }

  const purchaseData = await fetchPurchaseMovements({ incremental, syncState: prevState });

  if (!incremental) {
    reportProgress(1, 4, 92, 'جلب مشتريات بدون تفاصيل فواتير...');
    try {
      const aggregate = await fetchAggregatePurchaseMovements();
      if (aggregate.movements.length) {
        purchaseData.movements.push(...aggregate.movements);
        purchaseData.products = mergeProducts(purchaseData.products || [], aggregate.products);
        purchaseData.aggregateMovements = aggregate.count;
      }
    } catch (err) {
      console.error(`تحذير: تعذر جلب مشتريات مجمّعة: ${err.message || err}`);
    }
  }

  reportProgress(2, 4, 0, incremental ? 'تحديث أسعار المواد المتأثرة...' : 'قراءة الأسعار والرصيد...');
  const catalogProducts = incremental
    ? await fetchProductCatalogForMats(purchaseData.matSeqs)
    : await fetchProductCatalog();
  const products = mergeProducts(purchaseData.products, catalogProducts);
  reportProgress(2, 4, 100, `منتجات: ${products.length}`);

  if (!purchaseData.movements.length && !products.length) {
    reportProgress(3, 4, 100, 'لا تحديثات Edari — الانتقال إلى POS...');
    let posResult = { posSynced: 0, posFailed: 0, posOffers: 0 };
    try {
      posResult = await runPosPricingUpload(serverUrl, syncKey, options);
      console.log(`✓ POS: ${posResult.posSynced} منتج (${posResult.posOffers || 0} بعرض)`);
    } catch (err) {
      posResult.posError = err.message || String(err);
      console.error(`تحذير POS: ${posResult.posError}`);
    }

    const summary = {
      ok: true,
      posOk: !posResult.posError,
      mode: incremental ? 'incremental' : 'full',
      bills: 0,
      rawLines: 0,
      products: 0,
      movements: 0,
      productsUpserted: 0,
      consumerPricesUpdated: 0,
      stockBalancesUpdated: 0,
      movementsUpserted: 0,
      ...posResult,
      message: posResult.posError
        ? `Edari: لا تحديثات — تحذير POS: ${posResult.posError}`
        : `Edari: لا تحديثات — POS: ${posResult.posSynced} سعر (${posResult.posOffers || 0} عرض)`,
    };
    console.log(`@SYNC_RESULT|${JSON.stringify(summary)}`);
    return summary;
  }

  reportProgress(3, 4, 0, 'رفع بيانات Edari إلى سيرفر الأسعار...');
  const uploadResult = await uploadAll(serverUrl, syncKey, products, purchaseData.movements);

  let posResult = { posSynced: 0, posFailed: 0, posOffers: 0 };
  try {
    posResult = await runPosPricingUpload(serverUrl, syncKey, options);
    console.log(`✓ POS: ${posResult.posSynced} منتج (${posResult.posOffers || 0} بعرض)`);
  } catch (err) {
    posResult.posError = err.message || String(err);
    console.error(`تحذير POS: ${posResult.posError}`);
  }

  const now = new Date().toISOString();
  const nextState = {
    lastSyncAt: now,
    lastLineSeq: Math.max(sqlInt(prevState?.lastLineSeq), purchaseData.maxLineSeq || 0),
    lastFullSyncAt: incremental ? (prevState?.lastFullSyncAt || null) : now,
    stats: {
      bills: purchaseData.bills,
      movements: purchaseData.movements.length,
    },
  };
  try {
    saveSyncState(nextState);
  } catch (err) {
    console.error(`تحذير: تعذر حفظ حالة المزامنة: ${err.message || err}`);
  }

  const summary = {
    ok: true,
    posOk: !posResult.posError,
    mode: incremental ? 'incremental' : 'full',
    bills: purchaseData.bills || 0,
    rawLines: purchaseData.rawLines || 0,
    skippedNoBarcode: purchaseData.skippedNoBarcode || 0,
    skippedDedupe: purchaseData.skippedDedupe || 0,
    aggregateMovements: purchaseData.aggregateMovements || 0,
    products: products.length,
    movements: purchaseData.movements.length,
    ...uploadResult,
    ...posResult,
    message: posResult.posError
      ? `Edari: ${uploadResult.productsUpserted || 0} منتج، ${uploadResult.movementsUpserted || 0} حركة — تحذير POS: ${posResult.posError}`
      : `Edari: ${uploadResult.productsUpserted || 0} منتج، ${uploadResult.movementsUpserted || 0} حركة | POS: ${posResult.posSynced || 0} سعر (${posResult.posOffers || 0} عرض)`,
  };

  console.log(
    `✓ ${incremental ? 'تحديث' : 'مزامنة كاملة'}: Edari ${summary.productsUpserted} منتج، ${summary.movementsUpserted} حركة | POS ${summary.posSynced || 0} سعر (${summary.posOffers || 0} عرض)`,
  );
  console.log(`@SYNC_RESULT|${JSON.stringify(summary)}`);
  return summary;
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}

module.exports = {
  main,
  fetchPurchaseMovements,
  fetchAggregatePurchaseMovements,
  fetchProductCatalog,
  fetchProductCatalogForMats,
  loadSyncState,
  saveSyncState,
  runPosPricingUpload,
};
