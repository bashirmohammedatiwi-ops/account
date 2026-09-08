#!/usr/bin/env node
/**
 * رفع أسماء المواد من POS SQL إلى سيرفر الأسعار عبر /sync/edari
 * (السيرفر القديم لا يستبدل الاسم عند مزامنة الأسعار).
 *
 * Usage:
 *   node scripts/push-pos-names-to-price-api.js --server https://demaalhayaadelivery.online/price-api
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { fetchPosArticles, getPosConfig, rowToSyncItem } = require('../sync-client/pos-pricing-sync');
const { normalizeProductName } = require('../lib/product-name-text');

const SERVER = process.argv.includes('--server')
  ? process.argv[process.argv.indexOf('--server') + 1]
  : (process.env.PRICE_APP_SERVER || 'https://demaalhayaadelivery.online/price-api');

const SYNC_KEY = process.argv.includes('--key')
  ? process.argv[process.argv.indexOf('--key') + 1]
  : (process.env.PRICE_SYNC_KEY || process.env.SYNC_API_KEY || '');

const BATCH = 300;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function uploadBatch(products) {
  const headers = { 'Content-Type': 'application/json' };
  if (SYNC_KEY) headers['X-Sync-Key'] = SYNC_KEY;
  const res = await fetch(`${SERVER.replace(/\/$/, '')}/sync/edari`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ products, movements: [] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data;
}

async function main() {
  console.log('جلب أسماء المواد من POS...');
  const rows = await fetchPosArticles(getPosConfig());
  const seen = new Set();
  const products = [];
  for (const row of rows) {
    const item = rowToSyncItem(row);
    if (!item?.barcode) continue;
    if (seen.has(item.barcode)) continue;
    const name = normalizeProductName(item.name);
    if (!name) continue;
    seen.add(item.barcode);
    products.push({ barcode: item.barcode, name, product_num: item.productNum });
  }
  if (!products.length) throw new Error('لم تُقرأ أي أسماء صالحة من POS');

  let upserted = 0;
  const parts = chunk(products, BATCH);
  for (let i = 0; i < parts.length; i++) {
    const result = await uploadBatch(parts[i]);
    upserted += Number(result.products_upserted || 0);
    console.log(`رفع ${i + 1}/${parts.length} — ${upserted} منتج`);
  }

  console.log(JSON.stringify({
    ok: true,
    server: SERVER.replace(/\/$/, ''),
    posRows: rows.length,
    named: products.length,
    products_upserted: upserted,
  }, null, 2));
}

if (require.main === module) {
  main()
    .then(() => setImmediate(() => process.exit(0)))
    .catch((err) => {
      console.error(err.message || err);
      setImmediate(() => process.exit(1));
    });
}

module.exports = { main };
