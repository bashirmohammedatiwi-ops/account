/**
 * Sync Edari purchase movements + consumer prices to price-app server.
 * Usage:
 *   node sync-client/price-app-sync.js --server URL [--all] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--key KEY]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

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

const FETCH_ALL = process.argv.includes('--all')
  || process.env.PRICE_SYNC_ALL === '1'
  || process.env.PRICE_SYNC_ALL === 'true';

const DATE_FROM = process.argv.includes('--from')
  ? process.argv[process.argv.indexOf('--from') + 1]
  : (process.env.PRICE_SYNC_FROM || '');

const DATE_TO = process.argv.includes('--to')
  ? process.argv[process.argv.indexOf('--to') + 1]
  : (process.env.PRICE_SYNC_TO || '');

const UPLOAD_BATCH = 300;
const BILL_SEQ_CHUNK = 60;
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

function nextDayIso(iso) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return normalizeEdariDateIso(d);
}

function sqlTimestampStart(iso) {
  return `TIMESTAMP ${sqlQuote(`${iso} 00:00:00`)}`;
}

function buildDateRangeSql(dateFrom, dateTo, column = 'i."Date"') {
  if (FETCH_ALL || !dateFrom || !dateTo) return '1=1';
  const endExclusive = nextDayIso(dateTo);
  return `${column} >= ${sqlTimestampStart(dateFrom)} AND ${column} < ${sqlTimestampStart(endExclusive)}`;
}

function reportProgress(step, total, pct, msg) {
  const line = `@PROGRESS|${step}|${total}|${pct}|${msg || ''}`;
  console.log(line);
}

function resolveMaterialBarcode(row) {
  const barcode = String(row.Barcode ?? '').trim();
  if (barcode && barcode !== '0') return barcode;
  const num = String(row.Num ?? row.MatNum ?? '').trim();
  if (num && num !== '0') return num;
  return '';
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

async function fetchPurchaseBillSeqs(dateFrom, dateTo) {
  const dateSql = buildDateRangeSql(dateFrom, dateTo);
  const rows = await query(`
    SELECT Seq
    FROM File15n i
    WHERE i.Kind = 3 AND ${dateSql}
    ORDER BY i."Date" ASC, i.Seq ASC
  `);
  return [...new Set(rows.map((r) => String(r.Seq)).filter(Boolean))];
}

async function fetchPurchaseLinesChunk(billSeqs) {
  if (!billSeqs.length) return [];

  const ids = billSeqs.join(',');
  const baseCols = 'l.Seq AS LineSeq, l.BillSeq, l.BillNo, l.Mat, l.MatName, l.Quant, l.Price';
  const selectWithSum = `${baseCols}, l.Sum`;
  const joinSql = `
    FROM file14n l
    INNER JOIN File15n i ON i.Seq = l.BillSeq
    INNER JOIN File13n m ON m.Seq = l.Mat
    WHERE l.BillSeq IN (${ids})
      AND i.Kind = 3
      AND m.SubCount = 0
  `;

  try {
    return await query(`
      SELECT ${selectWithSum},
        i.Num AS InvNum, i."Date" AS InvDate, i.Two AS AccSeq, i.Kind AS InvKind,
        m.Barcode, m.Num, m.Name1, m.SellPr4
      ${joinSql}
      ORDER BY i."Date" ASC, l.BillSeq ASC, l.BillNo ASC
    `);
  } catch {
    try {
      return await query(`
        SELECT l.BillSeq, l.BillNo, l.Mat, l.MatName, l.Quant, l.Price, l.Sum,
          i.Num AS InvNum, i."Date" AS InvDate, i.Two AS AccSeq, i.Kind AS InvKind,
          m.Barcode, m.Num, m.Name1, m.SellPr4
        ${joinSql}
        ORDER BY i."Date" ASC, l.BillSeq ASC, l.BillNo ASC
      `);
    } catch {
      return await query(`
        SELECT ${baseCols},
          i.Num AS InvNum, i."Date" AS InvDate, i.Two AS AccSeq, i.Kind AS InvKind,
          m.Barcode, m.Num, m.Name1, m.SellPr4
        ${joinSql}
        ORDER BY i."Date" ASC, l.BillSeq ASC, l.BillNo ASC
      `);
    }
  }
}

function mapRowsToMovements(rows, accMap) {
  const movements = [];
  const productMap = new Map();
  const seenKeys = new Set();

  for (const row of rows) {
    const barcode = resolveMaterialBarcode(row);
    if (!barcode) continue;

    const quantity = Number(row.Quant || 0);
    const unitPrice = Number(row.Price || 0);
    let totalPrice = Number(row.Sum || 0);
    if (!totalPrice && quantity && unitPrice) totalPrice = quantity * unitPrice;

    const lineSeq = String(row.LineSeq ?? row.Seq ?? '').trim();
    const edariKey = lineSeq
      ? `L:${lineSeq}`
      : `${row.BillSeq}:${row.BillNo}:${row.Mat}`;

    if (seenKeys.has(edariKey)) continue;
    seenKeys.add(edariKey);

    const supplier = accMap.get(String(sqlInt(row.AccSeq))) || '';
    const date = normalizeEdariDateIso(row.InvDate);
    const name = String(row.Name1 || row.MatName || '').trim();
    const consumerPrice = Number(row.SellPr4 || 0);

    movements.push({
      barcode,
      supplier,
      invoice: String(row.InvNum || '').trim(),
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

  return { movements, products: [...productMap.values()] };
}

async function fetchPurchaseMovements(dateFrom, dateTo) {
  reportProgress(1, 4, 0, FETCH_ALL ? 'جلب كل فواتير المشتريات...' : 'جلب فواتير المشتريات للفترة...');
  const billSeqs = await fetchPurchaseBillSeqs(dateFrom, dateTo);
  reportProgress(1, 4, 15, `فواتير مشتريات: ${billSeqs.length}`);

  if (!billSeqs.length) {
    return { movements: [], products: [], bills: 0, rawLines: 0 };
  }

  const allRows = [];
  const parts = chunk(billSeqs, BILL_SEQ_CHUNK);
  for (let i = 0; i < parts.length; i++) {
    const rows = await fetchPurchaseLinesChunk(parts[i]);
    allRows.push(...rows);
    const pct = 15 + Math.round(((i + 1) / parts.length) * 55);
    reportProgress(1, 4, pct, `بنود: ${allRows.length} (${i + 1}/${parts.length})`);
  }

  reportProgress(1, 4, 75, 'جلب أسماء الموردين...');
  const accMap = await fetchAccountNames(allRows.map((r) => r.AccSeq));
  const mapped = mapRowsToMovements(allRows, accMap);

  reportProgress(1, 4, 100, `تم: ${mapped.movements.length} حركة من ${billSeqs.length} فاتورة`);
  return {
    ...mapped,
    bills: billSeqs.length,
    rawLines: allRows.length,
  };
}

async function fetchConsumerPrices() {
  const rows = await query(`
    SELECT Barcode, Num, Name1, SellPr4
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
  let movementsUpserted = 0;

  const productParts = chunk(products, UPLOAD_BATCH);
  for (let i = 0; i < productParts.length; i++) {
    const part = productParts[i];
    const result = await uploadBatch(serverUrl, syncKey, { products: part, movements: [] });
    productsUpserted += result.products_upserted || 0;
    consumerPricesUpdated += result.consumer_prices_updated || 0;
    reportProgress(3, 4, Math.round(((i + 1) / Math.max(productParts.length, 1)) * 40), `رفع منتجات: ${i + 1}/${productParts.length}`);
  }

  const movementParts = chunk(movements, UPLOAD_BATCH);
  for (let i = 0; i < movementParts.length; i++) {
    const part = movementParts[i];
    const result = await uploadBatch(serverUrl, syncKey, { products: [], movements: part });
    movementsUpserted += result.movements_upserted || 0;
    reportProgress(3, 4, 40 + Math.round(((i + 1) / Math.max(movementParts.length, 1)) * 60), `رفع حركات: ${movementsUpserted}/${movements.length}`);
  }

  return { productsUpserted, consumerPricesUpdated, movementsUpserted };
}

async function main() {
  const serverUrl = String(SERVER || '').trim().replace(/\/$/, '');
  if (!serverUrl) throw new Error('عنوان سيرفر الأسعار غير مضبوط');

  const dateFrom = FETCH_ALL ? '' : DATE_FROM;
  const dateTo = FETCH_ALL ? '' : DATE_TO;

  if (!FETCH_ALL && (!dateFrom || !dateTo)) {
    throw new Error('حدد تاريخ البداية والنهاية، أو فعّل «جلب كل الحركات»');
  }

  const purchaseData = await fetchPurchaseMovements(dateFrom, dateTo);

  reportProgress(2, 4, 0, 'قراءة أسعار المستهلك...');
  const consumerProducts = await fetchConsumerPrices();
  const products = mergeProducts(purchaseData.products, consumerProducts);
  reportProgress(2, 4, 100, `منتجات: ${products.length}`);

  reportProgress(3, 4, 0, 'رفع البيانات إلى سيرفر الأسعار...');
  const uploadResult = await uploadAll(serverUrl, SYNC_KEY, products, purchaseData.movements);

  const summary = {
    ok: true,
    fetchAll: FETCH_ALL,
    bills: purchaseData.bills || 0,
    rawLines: purchaseData.rawLines || 0,
    products: products.length,
    movements: purchaseData.movements.length,
    ...uploadResult,
  };

  console.log(
    `✓ تم رفع الأسعار: ${summary.productsUpserted} منتج، ${summary.movementsUpserted} حركة مشتريات (${summary.bills} فاتورة)، ${summary.consumerPricesUpdated} سعر مستهلك`
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

module.exports = { main, fetchPurchaseMovements, fetchConsumerPrices };
