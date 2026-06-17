/**
 * Sync Edari purchase movements + consumer prices + stock balance to price-app server.
 *
 * In this Edari install, supplier purchases are File15n.Kind = 1 (matches
 * «حركة مواد — مشتريات»). Stock balance = File13n.InTot - File13n.OutTot.
 *
 * Usage:
 *   node sync-client/price-app-sync.js --server URL [--full|--incremental] [--key KEY]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const edariRoot = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const { getEdariConnection } = require('./edari-connection');
const { normalizeEdariDateIso } = require('../lib/date-utils');

const SERVER = process.argv.includes('--server')
  ? process.argv[process.argv.indexOf('--server') + 1]
  : (process.env.PRICE_APP_SERVER || 'http://187.124.23.65:5000');

const SYNC_KEY = process.argv.includes('--key')
  ? process.argv[process.argv.indexOf('--key') + 1]
  : (process.env.PRICE_SYNC_KEY || '');

const FORCE_FULL = process.argv.includes('--full');
const FORCE_INCREMENTAL = process.argv.includes('--incremental');

const SYNC_STATE_FILE = path.join(__dirname, '..', 'data', 'price-sync-state.json');

/** Supplier purchase invoices in Edari (matches material movement «مشتريات»). */
const PURCHASE_KINDS = [1];

const UPLOAD_BATCH = 300;
const QUERY_TIMEOUT_MS = 300000;

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
  const dir = path.dirname(SYNC_STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
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

async function fetchPurchaseLines({ incremental = false, syncState = null } = {}) {
  const kindSql = purchaseKindSql('i');
  let filterSql = '';

  if (incremental && syncState?.lastSyncAt) {
    const sinceTs = sqlTimestamp(syncState.lastSyncAt);
    const lastLineSeq = sqlInt(syncState.lastLineSeq);
    const parts = [];
    if (sinceTs) parts.push(`l.DtModified >= ${sinceTs}`);
    if (lastLineSeq > 0) parts.push(`l.Seq > ${lastLineSeq}`);
    if (parts.length) filterSql = `AND (${parts.join(' OR ')})`;
  }

  const baseCols = 'l.Seq AS LineSeq, l.BillSeq, l.BillNo, l.Mat, l.MatName, l.Quant, l.Price';
  const joinSql = `
    FROM file14n l
    INNER JOIN File15n i ON i.Seq = l.BillSeq
    LEFT JOIN File13n m ON m.Seq = l.Mat
    WHERE (${kindSql})
      ${filterSql}
  `;

  const selectWithSum = `${baseCols}, l.Sum`;
  try {
    return await query(`
      SELECT ${selectWithSum},
        i.Num AS InvNum, i."Date" AS InvDate, i.Two AS AccSeq, i.Kind AS InvKind,
        m.Barcode, m.Num, m.Name1, m.SellPr4
      ${joinSql}
      ORDER BY l.Seq ASC
    `);
  } catch {
    try {
      return await query(`
        SELECT l.BillSeq, l.BillNo, l.Mat, l.MatName, l.Quant, l.Price, l.Sum,
          i.Num AS InvNum, i."Date" AS InvDate, i.Two AS AccSeq, i.Kind AS InvKind,
          m.Barcode, m.Num, m.Name1, m.SellPr4
        ${joinSql}
        ORDER BY l.BillSeq ASC, l.BillNo ASC
      `);
    } catch {
      return await query(`
        SELECT ${baseCols},
          i.Num AS InvNum, i."Date" AS InvDate, i.Two AS AccSeq, i.Kind AS InvKind,
          m.Barcode, m.Num, m.Name1, m.SellPr4
        ${joinSql}
        ORDER BY l.BillSeq ASC, l.BillNo ASC
      `);
    }
  }
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
    let totalPrice = Number(row.Sum || 0);
    if (!totalPrice && quantity && unitPrice) totalPrice = quantity * unitPrice;

    const supplier = accMap.get(String(sqlInt(row.AccSeq))) || '';
    const date = normalizeEdariDateIso(row.InvDate);
    const name = String(row.Name1 || row.MatName || '').trim();
    const consumerPrice = Number(row.SellPr4 || 0);

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
      productMap.set(barcode, {
        barcode,
        name,
        consumer_price: consumerPrice > 0 ? consumerPrice : null,
      });
    } else {
      const existing = productMap.get(barcode);
      if (name) existing.name = name;
      if (consumerPrice > 0) existing.consumer_price = consumerPrice;
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

  const allRows = await fetchPurchaseLines({ incremental, syncState });
  reportProgress(1, 4, 40, `بنود خام: ${allRows.length}`);

  reportProgress(1, 4, 55, 'جلب أسماء الموردين...');
  const accMap = await fetchAccountNames(allRows.map((r) => r.AccSeq));
  const mapped = mapRowsToMovements(allRows, accMap);

  reportProgress(
    1,
    4,
    100,
    `تم: ${mapped.movements.length} حركة من ${mapped.bills} فاتورة (${mapped.rawLines} بند خام)`,
  );

  return mapped;
}

async function fetchProductCatalog() {
  const rows = await query(`
    SELECT Barcode, Num, Name1, SellPr4, InTot, OutTot
    FROM File13n
    WHERE SubCount = 0
  `);

  const map = new Map();
  for (const row of rows) {
    const barcode = resolveMaterialBarcode(row);
    if (!barcode) continue;
    const sellPr4 = Number(row.SellPr4 || 0);
    map.set(barcode, {
      barcode,
      name: String(row.Name1 || '').trim(),
      consumer_price: sellPr4 > 0 ? sellPr4 : null,
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
    if (p.consumer_price > 0) existing.consumer_price = p.consumer_price;
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

  reportProgress(2, 4, 0, 'قراءة الأسعار والرصيد...');
  const catalogProducts = await fetchProductCatalog();
  const products = mergeProducts(purchaseData.products, catalogProducts);
  reportProgress(2, 4, 100, `منتجات: ${products.length}`);

  if (!purchaseData.movements.length && !products.length) {
    const summary = {
      ok: true,
      mode: incremental ? 'incremental' : 'full',
      bills: 0,
      rawLines: 0,
      products: 0,
      movements: 0,
      productsUpserted: 0,
      consumerPricesUpdated: 0,
      stockBalancesUpdated: 0,
      movementsUpserted: 0,
      message: 'لا توجد تحديثات جديدة',
    };
    console.log('✓ لا توجد تحديثات جديدة');
    console.log(`@SYNC_RESULT|${JSON.stringify(summary)}`);
    return summary;
  }

  reportProgress(3, 4, 0, 'رفع البيانات إلى سيرفر الأسعار...');
  const uploadResult = await uploadAll(serverUrl, syncKey, products, purchaseData.movements);

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
  saveSyncState(nextState);

  const summary = {
    ok: true,
    mode: incremental ? 'incremental' : 'full',
    bills: purchaseData.bills || 0,
    rawLines: purchaseData.rawLines || 0,
    skippedNoBarcode: purchaseData.skippedNoBarcode || 0,
    skippedDedupe: purchaseData.skippedDedupe || 0,
    products: products.length,
    movements: purchaseData.movements.length,
    ...uploadResult,
  };

  console.log(
    `✓ ${incremental ? 'تحديث' : 'مزامنة كاملة'}: ${summary.productsUpserted} منتج، ${summary.movementsUpserted} حركة، ${summary.stockBalancesUpdated} رصيد (${summary.bills} فاتورة)`,
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

module.exports = { main, fetchPurchaseMovements, fetchProductCatalog, loadSyncState, saveSyncState };
