/**
 * Sync Edari purchase movements + consumer prices to price-app server.
 * Usage:
 *   node sync-client/price-app-sync.js --server URL [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--key KEY]
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

const DATE_FROM = process.argv.includes('--from')
  ? process.argv[process.argv.indexOf('--from') + 1]
  : (process.env.PRICE_SYNC_FROM || '');

const DATE_TO = process.argv.includes('--to')
  ? process.argv[process.argv.indexOf('--to') + 1]
  : (process.env.PRICE_SYNC_TO || '');

const UPLOAD_BATCH = 400;

async function query(sql, timeoutMs = 120000) {
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
  if (!dateFrom || !dateTo) return '1=1';
  const endExclusive = nextDayIso(dateTo);
  return `${column} >= ${sqlTimestampStart(dateFrom)} AND ${column} < ${sqlTimestampStart(endExclusive)}`;
}

function reportProgress(step, total, pct, msg) {
  const line = `@PROGRESS|${step}|${total}|${pct}|${msg || ''}`;
  console.log(line);
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

async function fetchPurchaseMovements(dateFrom, dateTo) {
  const dateSql = buildDateRangeSql(dateFrom, dateTo);
  const baseCols = 'l.BillSeq, l.BillNo, l.Mat, l.MatName, l.Quant, l.Price';
  const withSum = `${baseCols}, l.Sum`;
  const selectCols = withSum;

  let rows;
  try {
    rows = await query(`
      SELECT ${selectCols},
        i.Num AS InvNum, i."Date" AS InvDate, i.Two AS AccSeq, i.Kind AS InvKind,
        m.Barcode, m.Name1, m.SellPr4
      FROM file14n l
      INNER JOIN File15n i ON i.Seq = l.BillSeq
      INNER JOIN File13n m ON m.Seq = l.Mat
      WHERE i.Kind = 3 AND m.SubCount = 0 AND ${dateSql}
      ORDER BY i."Date" DESC, l.BillSeq, l.BillNo
    `, 180000);
  } catch {
    rows = await query(`
      SELECT ${baseCols},
        i.Num AS InvNum, i."Date" AS InvDate, i.Two AS AccSeq, i.Kind AS InvKind,
        m.Barcode, m.Name1, m.SellPr4
      FROM file14n l
      INNER JOIN File15n i ON i.Seq = l.BillSeq
      INNER JOIN File13n m ON m.Seq = l.Mat
      WHERE i.Kind = 3 AND m.SubCount = 0 AND ${dateSql}
      ORDER BY i."Date" DESC, l.BillSeq, l.BillNo
    `, 180000);
  }

  const accMap = await fetchAccountNames(rows.map((r) => r.AccSeq));
  const movements = [];
  const productMap = new Map();

  for (const row of rows) {
    const barcode = String(row.Barcode || '').trim();
    if (!barcode) continue;

    const quantity = Number(row.Quant || 0);
    const unitPrice = Number(row.Price || 0);
    let totalPrice = Number(row.Sum || 0);
    if (!totalPrice && quantity && unitPrice) totalPrice = quantity * unitPrice;

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
      edari_key: `${row.BillSeq}:${row.BillNo}`,
    });

    if (!productMap.has(barcode)) {
      productMap.set(barcode, { barcode, name, consumer_price: consumerPrice > 0 ? consumerPrice : null });
    } else if (consumerPrice > 0) {
      productMap.get(barcode).consumer_price = consumerPrice;
      if (name) productMap.get(barcode).name = name;
    }
  }

  return {
    movements,
    products: [...productMap.values()],
  };
}

async function fetchConsumerPrices() {
  const rows = await query(`
    SELECT Barcode, Name1, SellPr4
    FROM File13n
    WHERE SubCount = 0
      AND Barcode IS NOT NULL
      AND TRIM(Barcode) <> ''
      AND SellPr4 > 0
  `, 180000);

  return rows.map((row) => ({
    barcode: String(row.Barcode || '').trim(),
    name: String(row.Name1 || '').trim(),
    consumer_price: Number(row.SellPr4 || 0),
  })).filter((p) => p.barcode);
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
    reportProgress(2, 3, Math.round(((i + 1) / productParts.length) * 100), `منتجات: ${productsUpserted}`);
  }

  const movementParts = chunk(movements, UPLOAD_BATCH);
  for (let i = 0; i < movementParts.length; i++) {
    const part = movementParts[i];
    const result = await uploadBatch(serverUrl, syncKey, { products: [], movements: part });
    movementsUpserted += result.movements_upserted || 0;
    reportProgress(3, 3, Math.round(((i + 1) / movementParts.length) * 100), `حركات: ${movementsUpserted}`);
  }

  return { productsUpserted, consumerPricesUpdated, movementsUpserted };
}

async function main() {
  const serverUrl = String(SERVER || '').trim().replace(/\/$/, '');
  if (!serverUrl) throw new Error('عنوان سيرفر الأسعار غير مضبوط');

  reportProgress(1, 3, 0, 'قراءة حركة المشتريات من Edari...');
  const { movements, products: movementProducts } = await fetchPurchaseMovements(DATE_FROM, DATE_TO);
  reportProgress(1, 3, 100, `تم: ${movements.length} حركة`);

  reportProgress(2, 3, 0, 'قراءة أسعار المستهلك...');
  const consumerProducts = await fetchConsumerPrices();
  const products = mergeProducts(movementProducts, consumerProducts);
  reportProgress(2, 3, 100, `تم: ${products.length} منتج`);

  reportProgress(3, 3, 0, 'رفع البيانات إلى سيرفر الأسعار...');
  const uploadResult = await uploadAll(serverUrl, SYNC_KEY, products, movements);

  const summary = {
    ok: true,
    products: products.length,
    movements: movements.length,
    ...uploadResult,
  };

  console.log(`✓ تم رفع الأسعار: ${summary.productsUpserted} منتج، ${summary.movementsUpserted} حركة مشتريات، ${summary.consumerPricesUpdated} سعر مستهلك`);
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
