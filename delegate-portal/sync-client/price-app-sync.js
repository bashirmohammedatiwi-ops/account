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
const { normalizeProductName, pickBestName } = require('../lib/product-name-text');
const {
  loadPosSyncItems,
  uploadLoadedPosItems,
  buildPosBarcodeLookup,
} = require('./pos-pricing-sync');
const { normalizeBarcode: normalizePosBarcode } = require('./pos-barcode');

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

/** أقصى وقت لجلب ورفع حركات Edari — لا يشمل رفع POS الذي يعمل بالتوازي. */
const EDARI_PHASE_TIMEOUT_MS = Number(process.env.PRICE_EDARI_TIMEOUT_MS) || 12 * 60 * 1000;

/** ينفّذ عملية مع مهلة قصوى؛ يرمي خطأ عند تجاوزها بدل التعليق للأبد. */
function withTimeout(factory, ms, label) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(label || `انتهت المهلة (${Math.round(ms / 1000)} ثانية)`));
    }, ms);
    Promise.resolve()
      .then(factory)
      .then((v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); })
      .catch((e) => { if (done) return; done = true; clearTimeout(timer); reject(e); });
  });
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

function lookupPosItem(posLookup, ...codes) {
  if (!posLookup) return null;
  for (const raw of codes) {
    const code = normalizePosBarcode(raw) || String(raw ?? '').trim();
    if (!code || code === '0') continue;
    const hit = posLookup.byBarcode.get(code) || posLookup.byNum.get(code);
    if (hit) return hit;
  }
  return null;
}

/** الباركودات التي يظهر بها المنتج في تطبيق الأسعار (POS أولاً ثم Edari). */
function movementBarcodesForRow(row, posLookup) {
  const edariBarcode = resolveMaterialBarcode(row);
  const num = String(row.Num ?? row.MatNum ?? '').trim();
  const pos = lookupPosItem(posLookup, edariBarcode, num, row.Barcode);
  const aliases = [];
  const add = (value) => {
    const code = String(value || '').trim();
    if (!code || code === '0' || aliases.includes(code)) return;
    aliases.push(code);
  };
  if (pos?.barcode) add(pos.barcode);
  add(edariBarcode);
  add(num);
  if (pos?.productNum) add(pos.productNum);
  return aliases;
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

async function getMaxPurchaseLineSeq() {
  try {
    const rows = await query(`
      SELECT MAX(l.Seq) AS mx
      FROM file14n l
      INNER JOIN File15n i ON i.Seq = l.BillSeq
      WHERE (${purchaseKindSql('i')})
    `);
    const row = rows[0] || {};
    return sqlInt(row.mx ?? row.MX ?? row.Mx);
  } catch {
    return 0;
  }
}

async function fetchPagedPurchaseLines({ extraWhere = '', startSeq = 0, limitBatches = INCREMENTAL_BATCH_LIMIT, notify = null } = {}) {
  const rows = [];
  const seenSeq = new Set();
  let cursor = startSeq;
  let batchNum = 0;
  while (true) {
    batchNum += 1;
    const batch = await queryPurchaseLineBatch(extraWhere, cursor, PURCHASE_LINE_BATCH);
    if (!batch.length) break;
    mergePurchaseLineBatch(rows, batch, seenSeq);
    notify?.(rows.length);
    const maxSeq = Math.max(...batch.map((r) => sqlInt(r.LineSeq ?? r.Seq)));
    if (maxSeq <= cursor) break;
    cursor = maxSeq;
    if (batch.length < PURCHASE_LINE_BATCH) break;
    if (limitBatches > 0 && batchNum >= limitBatches) {
      throw new Error('تحديثات كثيرة جداً — استخدم «مزامنة كاملة»');
    }
  }
  return { rows, seenSeq };
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
  const notify = (msg) => {
    if (typeof onProgress === 'function') onProgress(0, msg);
  };
  const notifyCount = (count, msg) => {
    if (typeof onProgress === 'function') onProgress(count, msg);
  };

  if (incremental && syncState?.lastSyncAt) {
    const lastLineSeq = sqlInt(syncState.lastLineSeq);
    const sinceTs = sqlTimestamp(syncState.lastSyncAt);
    const merged = [];
    const seenSeq = new Set();

    let seqReset = false;
    if (lastLineSeq > 0) {
      const maxSeq = await getMaxPurchaseLineSeq();
      let startSeq = lastLineSeq;
      let extraWhere = '';
      if (maxSeq > 0 && lastLineSeq > maxSeq) {
        seqReset = true;
        console.error('تحذير: تسلسل بنود المشتريات أُعيد — جلب الحركات الجديدة بتاريخ آخر مزامنة');
        startSeq = 0;
        extraWhere = sinceTs ? `AND i."Date" >= ${sinceTs}` : '';
      }
      notify('جلب بنود المشتريات الجديدة...');
      const paged = await fetchPagedPurchaseLines({
        extraWhere,
        startSeq,
        notify: (count) => notifyCount(count, `جلب بنود جديدة... ${count}`),
      });
      mergePurchaseLineBatch(merged, paged.rows, seenSeq);
    } else if (sinceTs) {
      notify('جلب التحديثات من Edari...');
      const paged = await fetchPagedPurchaseLines({
        extraWhere: `AND i."Date" >= ${sinceTs}`,
        startSeq: 0,
        notify: (count) => notifyCount(count, `جلب التحديثات... ${count}`),
      });
      mergePurchaseLineBatch(merged, paged.rows, seenSeq);
    }

    if (sinceTs && merged.length === 0 && !seqReset) {
      try {
        const dated = await fetchPagedPurchaseLines({
          extraWhere: `AND i."Date" >= ${sinceTs}`,
          startSeq: 0,
          notify: (count) => notifyCount(count, `جلب فواتير بتاريخ أحدث... ${count}`),
        });
        mergePurchaseLineBatch(merged, dated.rows, seenSeq);
      } catch (err) {
        console.error(`تحذير: تعذر جلب المشتريات بالتاريخ: ${err.message || err}`);
      }
    }

    return merged;
  }

  notify('جلب حركات المشتريات...');
  const full = await fetchPagedPurchaseLines({
    extraWhere: '',
    startSeq: 0,
    limitBatches: 0,
    notify: (count) => {
      notifyCount(count, `جلب حركات المشتريات... ${count} بند`);
      reportProgress(1, 4, Math.min(92, 8 + Math.round(count / 800)), `جلب حركات المشتريات... ${count} بند`);
    },
  });
  return full.rows;
}

function mapRowsToMovements(rows, accMap, posLookup = null) {
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

    const barcodes = movementBarcodesForRow(row, posLookup);
    if (!barcodes.length) {
      skippedNoBarcode += 1;
      continue;
    }

    const quantity = Number(row.Quant || 0);
    const unitPrice = Number(row.Price || 0);
    let totalPrice = Number(row.line_sum ?? row.Sum ?? 0);
    if (!totalPrice && quantity && unitPrice) totalPrice = quantity * unitPrice;

    const supplier = accMap.get(String(sqlInt(row.AccSeq))) || '';
    const date = normalizeEdariDateIso(row.InvDate);
    const name = normalizeProductName(String(row.Name1 || row.MatName || '').trim());
    const productNum = String(row.Num ?? row.MatNum ?? '').trim() || undefined;
    const baseKey = buildEdariLineKey(row);

    billSeqs.add(String(row.BillSeq));

    for (const barcode of barcodes) {
      const edariKey = `${baseKey}#${barcode}`;
      if (seenKeys.has(edariKey)) {
        skippedDedupe += 1;
        continue;
      }
      seenKeys.add(edariKey);

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
        productMap.set(barcode, { barcode, name, product_num: productNum });
      } else {
        const existing = productMap.get(barcode);
        if (name) existing.name = name;
        if (productNum && !existing.product_num) existing.product_num = productNum;
      }
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

async function fetchPurchaseMovements({ incremental = false, syncState = null, posLookup = null } = {}) {
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
  const mapped = mapRowsToMovements(allRows, accMap, posLookup);
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
async function fetchAggregatePurchaseMovements(posLookup = null) {
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
    const qty = Number(row.PurchaseTot || 0);
    if (qty <= 0) continue;
    const total = Number(row.PurchaseAm || 0);
    const unit = total > 0 ? total / qty : 0;
    const barcodes = movementBarcodesForRow(row, posLookup);
    if (!barcodes.length) continue;
    const name = normalizeProductName(String(row.Name1 || '').trim());

    for (const barcode of barcodes) {
      movements.push({
        barcode,
        supplier: 'مشتريات مسجّلة (بدون تفاصيل فواتير)',
        invoice: '—',
        quantity: qty,
        unit_price: unit,
        total_price: total > 0 ? total : qty * unit,
        date: null,
        edari_key: `AGG:${row.Seq}#${barcode}`,
      });
      products.push({
        barcode,
        name,
        product_num: String(row.Num || '').trim() || undefined,
      });
    }
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
      product_num: String(row.Num || '').trim() || undefined,
      name: normalizeProductName(String(row.Name1 || '').trim()),
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
    const incomingName = normalizeProductName(p.name);
    const existing = map.get(barcode);
    if (!existing) {
      map.set(barcode, {
        ...p,
        barcode,
        name: incomingName || undefined,
      });
      continue;
    }
    const best = pickBestName(existing.name, incomingName);
    if (best) existing.name = best;
    if (p.stock_balance != null && Number.isFinite(Number(p.stock_balance))) {
      existing.stock_balance = Number(p.stock_balance);
    }
    if (p.product_num && !existing.product_num) existing.product_num = p.product_num;
  }
  return [...map.values()];
}

function sanitizeEdariProducts(products = []) {
  return products.map((p) => {
    const barcode = String(p.barcode || '').trim();
    if (!barcode) return null;
    const name = normalizeProductName(p.name);
    const out = { barcode };
    if (p.product_num) out.product_num = p.product_num;
    if (name) out.name = name;
    if (p.stock_balance != null && Number.isFinite(Number(p.stock_balance))) {
      out.stock_balance = Number(p.stock_balance);
    }
    if (!out.name && out.stock_balance == null) return null;
    return out;
  }).filter(Boolean);
}

async function uploadBatch(serverUrl, syncKey, payload) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' };
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

  const productParts = chunk(sanitizeEdariProducts(products), UPLOAD_BATCH);
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

async function runPosPricingUpload(serverUrl, syncKey, options = {}, progress = { step: 4, total: 4 }) {
  const loaded = await loadPosSyncItems({
    server: options.posSqlServer,
    database: options.posSqlDatabase,
    user: options.posSqlUser,
    password: options.posSqlPassword,
  });
  const uploaded = await uploadLoadedPosItems(serverUrl, syncKey, loaded.items, {
    posOffers: loaded.posOffers,
    posRead: loaded.rows.length,
    onProgress: (pct, msg) => reportProgress(progress.step, progress.total, pct, msg),
  });
  return { ...uploaded, items: loaded.items };
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

  const posConfig = {
    server: options.posSqlServer,
    database: options.posSqlDatabase,
    user: options.posSqlUser,
    password: options.posSqlPassword,
  };

  reportProgress(1, 2, 0, 'قراءة أسعار POS من SQL Server...');
  let posLookup = null;
  let posItems = [];
  let posResult = { posSynced: 0, posFailed: 0, posOffers: 0 };
  let posUploadPromise = null;

  try {
    const loaded = await loadPosSyncItems(posConfig);
    posItems = loaded.items;
    posLookup = buildPosBarcodeLookup(posItems);
    posUploadPromise = uploadLoadedPosItems(serverUrl, syncKey, posItems, {
      posOffers: loaded.posOffers,
      posRead: loaded.rows.length,
      onProgress: (pct, msg) => reportProgress(1, 2, pct, msg),
    });
  } catch (err) {
    posResult.posError = err.message || String(err);
    console.error(`تحذير POS: ${posResult.posError}`);
  }

  let edariError = null;
  let edariHadUpdates = false;
  let uploadResult = { productsUpserted: 0, consumerPricesUpdated: 0, stockBalancesUpdated: 0, movementsUpserted: 0 };
  let products = [];
  let purchaseData = {
    movements: [], products: [], bills: 0, rawLines: 0, maxLineSeq: 0, matSeqs: [],
    skippedNoBarcode: 0, skippedDedupe: 0, aggregateMovements: 0,
  };

  try {
    await withTimeout(async () => {
      reportProgress(2, 2, 0, 'جلب تفاصيل المشتريات من Edari...');
      purchaseData = await fetchPurchaseMovements({ incremental, syncState: prevState, posLookup });

      if (!incremental) {
        reportProgress(2, 2, 40, 'جلب مشتريات بدون تفاصيل فواتير...');
        try {
          const aggregate = await fetchAggregatePurchaseMovements(posLookup);
          if (aggregate.movements.length) {
            purchaseData.movements.push(...aggregate.movements);
            purchaseData.products = mergeProducts(purchaseData.products || [], aggregate.products);
            purchaseData.aggregateMovements = aggregate.count;
          }
        } catch (err) {
          console.error(`تحذير: تعذر جلب مشتريات مجمّعة: ${err.message || err}`);
        }
      }

      reportProgress(2, 2, 55, incremental ? 'تحديث أسعار المواد المتأثرة...' : 'قراءة الأسعار والرصيد...');
      const catalogProducts = incremental
        ? await fetchProductCatalogForMats(purchaseData.matSeqs)
        : await fetchProductCatalog();
      products = mergeProducts(purchaseData.products, catalogProducts);

      if (posUploadPromise) {
        try {
          posResult = await posUploadPromise;
          posUploadPromise = null;
          console.log(`✓ POS: ${posResult.posSynced} منتج (${posResult.posOffers || 0} بعرض، ${posResult.posNames || 0} اسم)`);
        } catch (err) {
          posResult.posError = err.message || String(err);
          console.error(`تحذير POS: ${posResult.posError}`);
        }
      }

      if (purchaseData.movements.length || products.length) {
        edariHadUpdates = true;
        reportProgress(2, 2, 75, 'رفع حركات المشتريات إلى سيرفر الأسعار...');
        uploadResult = await uploadAll(serverUrl, syncKey, products, purchaseData.movements);
      }
      reportProgress(2, 2, 100, 'اكتمل Edari');
    }, EDARI_PHASE_TIMEOUT_MS, 'تجاوزت مرحلة Edari المهلة — تم رفع أسعار POS، وتفاصيل المشتريات ستُكمَل لاحقاً');
  } catch (err) {
    edariError = err.message || String(err);
    console.error(`تحذير Edari: ${edariError}`);
    reportProgress(2, 2, 100, `تعذّر Edari — ${edariError}`);
  }

  if (posUploadPromise) {
    try {
      posResult = await posUploadPromise;
      console.log(`✓ POS: ${posResult.posSynced} منتج (${posResult.posOffers || 0} بعرض، ${posResult.posNames || 0} اسم)`);
    } catch (err) {
      posResult.posError = err.message || String(err);
      console.error(`تحذير POS: ${posResult.posError}`);
    }
  }

  if (!edariError) {
    const now = new Date().toISOString();
    let nextLastSeq = Math.max(sqlInt(prevState?.lastLineSeq), purchaseData.maxLineSeq || 0);
    try {
      const dbMax = await getMaxPurchaseLineSeq();
      if (dbMax > 0 && nextLastSeq > dbMax) nextLastSeq = dbMax;
    } catch {
      if (purchaseData.maxLineSeq > 0) nextLastSeq = purchaseData.maxLineSeq;
    }
    const nextState = {
      lastSyncAt: now,
      lastLineSeq: nextLastSeq,
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
  }

  const edariMsg = edariError
    ? `تحذير Edari: ${edariError}`
    : (edariHadUpdates
        ? `Edari: ${uploadResult.productsUpserted || 0} منتج، ${uploadResult.movementsUpserted || 0} حركة`
        : 'Edari: لا تحديثات');
  const posMsg = posResult.posError
    ? `تحذير POS: ${posResult.posError}`
    : `POS: ${posResult.posSynced || 0} سعر (${posResult.posOffers || 0} عرض)`;

  const { items: _posItems, ...posSummary } = posResult || {};
  const summary = {
    ok: !edariError || !posResult.posError,
    edariOk: !edariError,
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
    ...posSummary,
    edariError: edariError || undefined,
    message: `${edariMsg} | ${posMsg}`,
  };

  console.log(`✓ ${incremental ? 'تحديث' : 'مزامنة كاملة'}: ${edariMsg} | ${posMsg}`);
  console.log(`@SYNC_RESULT|${JSON.stringify(summary)}`);
  return summary;
}

if (require.main === module) {
  main()
    .then(() => {
      // إنهاء فوري — بعض عمليات ODBC/POS على Windows تُبقي event loop نشطاً بعد الانتهاء.
      setImmediate(() => process.exit(0));
    })
    .catch((err) => {
      console.error(err.message || err);
      setImmediate(() => process.exit(1));
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
