/**
 * Read POS SQL Server (articles + offer_details) and upload prices to price-api.
 */
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { computePricing } = require('../lib/pos-pricing');
const { resolveProductBarcode } = require('./pos-barcode');
const { normalizeProductName } = require('../lib/product-name-text');

const execFileAsync = promisify(execFile);
const COL_SEP = '|';
const UPLOAD_BATCH = 300;

const ACTIVE_OFFERS_CTE = `
ActiveOffers AS (
  SELECT
    od.item_id,
    od.discount,
    od.discount_type,
    od.offer_id,
    CONVERT(NVARCHAR(4000), o.name) AS offer_name,
    o.priority,
    ROW_NUMBER() OVER (
      PARTITION BY od.item_id
      ORDER BY o.priority DESC, od.discount DESC, od.offer_id
    ) AS rn
  FROM dbo.offer_details od
  INNER JOIN dbo.offers o ON od.offer_id = o.id
  WHERE o.enabled = 1
    AND od.discount > 0
    AND (
      od.Unlimited = 1
      OR (od.from_date IS NULL AND od.to_date IS NULL)
      OR (CAST(GETDATE() AS date) BETWEEN od.from_date AND od.to_date)
    )
)
`;

const TRIM = (col) => `LTRIM(RTRIM(COALESCE(${col}, '')))`;
const POS_TEXT = (col) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(${TRIM(`CONVERT(NVARCHAR(4000), ${col})`)}, '|', ' '), CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' ')`;

const ARTICLES_QUERY = `;WITH ${ACTIVE_OFFERS_CTE}
SELECT
  a.Seq AS productCode,
  ${TRIM('a.Num')} AS productNum,
  ${POS_TEXT('a.Name1')} AS name,
  ${TRIM('a.Barcode')} AS barcode,
  CAST(COALESCE(NULLIF(a.SellPr4, 0), NULLIF(a.SellPr5, 0), 0) AS bigint) AS originalPrice,
  CAST(COALESCE(NULLIF(a.SellPr4, 0), NULLIF(a.SellPr5, 0), 0) AS bigint) AS storedFinalPrice,
  CAST(COALESCE(a.CurTot1, 0) AS bigint) AS quantity,
  CAST(COALESCE(ao.discount, 0) AS float) AS discountValue,
  CAST(COALESCE(ao.discount_type, 0) AS int) AS discountType,
  ${POS_TEXT('ao.offer_name')} AS offerName
FROM dbo.articles a
LEFT JOIN ActiveOffers ao ON a.Seq = ao.item_id AND ao.rn = 1
WHERE COALESCE(NULLIF(a.SellPr4, 0), NULLIF(a.SellPr5, 0), 0) > 0
ORDER BY a.Seq`;

/**
 * الباركودات الثانوية (article_barcodes) — كل باركود بديل لنفس المنتج/السعر.
 * يُرفع كعنصر مستقل حتى يمكن إيجاد المنتج بأي باركود على الويب.
 */
const SECONDARY_BARCODES_QUERY = `;WITH ${ACTIVE_OFFERS_CTE}
SELECT
  a.Seq AS productCode,
  ${TRIM('a.Num')} AS productNum,
  ${POS_TEXT('a.Name1')} AS name,
  ${TRIM('b.barcode')} AS barcode,
  CAST(COALESCE(NULLIF(a.SellPr4, 0), NULLIF(a.SellPr5, 0), 0) AS bigint) AS originalPrice,
  CAST(COALESCE(NULLIF(a.SellPr4, 0), NULLIF(a.SellPr5, 0), 0) AS bigint) AS storedFinalPrice,
  CAST(COALESCE(a.CurTot1, 0) AS bigint) AS quantity,
  CAST(COALESCE(ao.discount, 0) AS float) AS discountValue,
  CAST(COALESCE(ao.discount_type, 0) AS int) AS discountType,
  ${POS_TEXT('ao.offer_name')} AS offerName
FROM dbo.article_barcodes b
INNER JOIN dbo.articles a ON a.Seq = b.article_id
LEFT JOIN ActiveOffers ao ON a.Seq = ao.item_id AND ao.rn = 1
WHERE COALESCE(NULLIF(a.SellPr4, 0), NULLIF(a.SellPr5, 0), 0) > 0
  AND ${TRIM('b.barcode')} <> ''
  AND ${TRIM('b.barcode')} <> ${TRIM('a.Barcode')}
ORDER BY a.Seq`;

function getPosConfig(options = {}) {
  return {
    server: String(options.server || process.env.POS_SQL_SERVER || 'localhost\\FOTSQLSERVER').trim(),
    database: String(options.database || process.env.POS_SQL_DATABASE || 'HAYAT2025.mdf').trim(),
    user: String(options.user || process.env.POS_SQL_USER || '').trim(),
    password: String(options.password || process.env.POS_SQL_PASSWORD || ''),
    encrypt: options.encrypt ?? (process.env.POS_SQL_ENCRYPT === '1'),
    trustServerCertificate: options.trustServerCertificate ?? (process.env.POS_SQL_TRUST_CERT !== '0'),
  };
}

function findSqlCmd() {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const candidates = [
    `${programFiles}\\Microsoft SQL Server\\Client SDK\\ODBC\\180\\Tools\\Binn\\SQLCMD.EXE`,
    `${programFiles}\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn\\SQLCMD.EXE`,
    `${programFiles}\\Microsoft SQL Server\\150\\Tools\\Binn\\SQLCMD.EXE`,
    `${programFiles}\\Microsoft SQL Server\\140\\Tools\\Binn\\SQLCMD.EXE`,
    'sqlcmd',
  ];
  for (const c of candidates) {
    if (c === 'sqlcmd') return c;
    if (fs.existsSync(c)) return c;
  }
  return 'sqlcmd';
}

function buildSqlCmdArgs(config, query, separator = COL_SEP) {
  const args = ['-S', config.server, '-d', config.database, '-Q', query, '-s', separator, '-W', '-h', '-1'];
  if (config.user) {
    args.push('-U', config.user, '-P', config.password || '');
  } else {
    args.push('-E');
  }
  if (config.trustServerCertificate) args.push('-C');
  return args;
}

function sqlValue(raw) {
  if (raw == null) return null;
  const v = String(raw).trim();
  if (!v || v.toUpperCase() === 'NULL') return null;
  return v;
}

function sqlNumber(raw) {
  const v = sqlValue(raw);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(raw) {
  return {
    productCode: Number(raw.productCode) || 0,
    productNum: raw.productNum != null ? String(raw.productNum).trim() : null,
    name: raw.name != null ? (normalizeProductName(String(raw.name).trim()) || null) : null,
    barcode: raw.barcode != null ? String(raw.barcode).trim() : null,
    originalPrice: Number(raw.originalPrice) || 0,
    storedFinalPrice: Number(raw.storedFinalPrice) || 0,
    quantity: Number(raw.quantity) || 0,
    discountValue: raw.discountValue != null ? Number(raw.discountValue) : null,
    discountType: raw.discountType != null ? Number(raw.discountType) : null,
    offerName: raw.offerName != null
      ? (normalizeProductName(String(raw.offerName).trim()) || null)
      : null,
  };
}

function parseTabOutput(stdout) {
  const rows = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /rows affected/i.test(trimmed)) continue;
    if (trimmed.startsWith('productCode') || trimmed.startsWith('---')) continue;

    const parts = trimmed.split(COL_SEP);
    if (parts.length < 10) continue;

    const [
      productCode,
      productNum,
      name,
      barcode,
      originalPrice,
      storedFinalPrice,
      quantity,
      discountValue,
      discountType,
      offerName,
    ] = parts;

    if (!productCode || productCode === 'productCode') continue;

    rows.push(normalizeRow({
      productCode,
      productNum: sqlValue(productNum),
      name: sqlValue(name),
      barcode: sqlValue(barcode),
      originalPrice,
      storedFinalPrice,
      quantity,
      discountValue: sqlNumber(discountValue),
      discountType: sqlNumber(discountType),
      offerName: sqlValue(offerName),
    }));
  }
  return rows;
}

async function runPosQuery(sqlcmd, config, query) {
  // sqlcmd عبر الأنبوب (pipe) يُفسد الأحرف العربية. الحل الموثوق: الكتابة لملف Unicode (UTF-16LE)
  // عبر -u -o ثم قراءته بترميز utf16le — يضمن نصاً عربياً سليماً على الويب.
  const outFile = path.join(
    os.tmpdir(),
    `pos-sync-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.dat`
  );
  const args = buildSqlCmdArgs(config, query).concat(['-u', '-o', outFile]);
  try {
    await execFileAsync(sqlcmd, args, {
      maxBuffer: 1024 * 1024 * 512,
      windowsHide: true,
    });
    const raw = fs.readFileSync(outFile, 'utf16le');
    return parseTabOutput(raw.replace(/^\uFEFF/, ''));
  } finally {
    try { fs.unlinkSync(outFile); } catch { /* ignore */ }
  }
}

async function fetchPosArticles(config) {
  const sqlcmd = findSqlCmd();
  const primary = await runPosQuery(sqlcmd, config, ARTICLES_QUERY);

  // الباركودات الثانوية — لا تُفشل المزامنة إن تعذّرت (الجدول قد لا يوجد في بعض التركيبات).
  let secondary = [];
  try {
    secondary = await runPosQuery(sqlcmd, config, SECONDARY_BARCODES_QUERY);
  } catch (err) {
    console.error(`تحذير: تعذّر جلب الباركودات الثانوية: ${err.message || err}`);
  }

  return primary.concat(secondary);
}

function rowToSyncItem(row) {
  const barcode = resolveProductBarcode({
    barcode: row.barcode,
    productNum: row.productNum,
    productCode: row.productCode,
  });
  if (!barcode) return null;

  const pricing = computePricing({
    originalPrice: row.originalPrice,
    storedFinalPrice: row.storedFinalPrice,
    discountValue: row.discountValue,
    discountType: row.discountType,
    offerName: row.offerName,
  });

  if (!pricing.originalPrice && !pricing.finalPrice) return null;

  const name = normalizeProductName(row.name);
  return {
    barcode,
    productCode: String(row.productCode),
    productNum: row.productNum || undefined,
    name: name || undefined,
    price: pricing.finalPrice,
    originalPrice: pricing.originalPrice,
    discountPercent: pricing.discountPercent,
    discountValue: pricing.discountValue,
    discountType: pricing.discountType,
    stock: Math.max(0, Math.round(row.quantity || 0)),
    offerName: pricing.offerName || row.offerName || undefined,
  };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function jsonHeaders(syncKey) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/json',
  };
  if (syncKey) headers['X-Sync-Key'] = syncKey;
  return headers;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(url, syncKey, body, errorPrefix) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: jsonHeaders(syncKey),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `${errorPrefix} (${res.status})`);
      }
      return data;
    } catch (err) {
      lastError = err;
      if (attempt < 3) await sleep(400 * attempt);
    }
  }
  throw lastError;
}

async function uploadPosBatch(serverUrl, syncKey, items) {
  const root = serverUrl.replace(/\/$/, '');
  try {
    return await postJson(`${root}/sync/inventory/bulk`, syncKey, { items }, 'POS upload failed');
  } catch (err) {
    // بعض النسخ القديمة تقبل المسار البديل فقط
    return postJson(`${root}/sync/pos/bulk`, syncKey, { items }, err.message || 'POS upload failed');
  }
}

function namesFromPosItems(items = []) {
  const products = [];
  for (const item of items) {
    const barcode = String(item?.barcode || '').trim();
    const name = normalizeProductName(item?.name);
    if (!barcode || !name) continue;
    products.push({
      barcode,
      name,
      product_num: item.productNum || undefined,
    });
  }
  return products;
}

/**
 * السيرفر الحي القديم: INSERT يأخذ الاسم من أول رفع، وUPDATE الأسعار لا يستبدل الاسم.
 * /sync/edari يستبدل الاسم — لذلك نرفع الأسماء قبل الأسعار وبعدها.
 */
async function uploadPosNames(serverUrl, syncKey, items) {
  const products = namesFromPosItems(items);
  if (!products.length) return { skipped: true, products_upserted: 0 };
  const data = await postJson(
    `${serverUrl.replace(/\/$/, '')}/sync/edari`,
    syncKey,
    { products, movements: [] },
    'POS name upload failed',
  );
  return data;
}

function buildPosBarcodeLookup(items = []) {
  const byBarcode = new Map();
  const byNum = new Map();
  for (const item of items) {
    const barcode = String(item?.barcode || '').trim();
    const num = String(item?.productNum || '').trim();
    if (barcode && !byBarcode.has(barcode)) byBarcode.set(barcode, item);
    if (num && !byNum.has(num)) byNum.set(num, item);
  }
  return { byBarcode, byNum };
}

async function loadPosSyncItems(posConfig) {
  const config = getPosConfig(posConfig || {});
  if (!config.server || !config.database) {
    throw new Error('إعدادات POS SQL غير مكتملة (server / database)');
  }
  const rows = await fetchPosArticles(config);
  if (!rows.length) {
    throw new Error('لم تُقرأ أي مادة من قاعدة POS — تحقق من SQL Server واسم القاعدة');
  }

  const items = [];
  const seenBarcodes = new Set();
  let posOffers = 0;
  for (const row of rows) {
    const item = rowToSyncItem(row);
    if (!item) continue;
    if (seenBarcodes.has(item.barcode)) continue;
    seenBarcodes.add(item.barcode);
    if (item.discountPercent != null && item.discountPercent > 0) posOffers += 1;
    items.push(item);
  }
  if (!items.length) {
    throw new Error('لا توجد مواد POS بباركود صالح');
  }
  return { items, rows, posOffers, config };
}

async function uploadLoadedPosItems(serverUrl, syncKey, items, {
  posOffers = 0,
  posRead = 0,
  onProgress,
} = {}) {
  const namedCount = namesFromPosItems(items).length;
  onProgress?.(10, `رفع ${items.length} منتج POS (${namedCount} باسم عربي، ${posOffers} بعرض)...`);

  let posSynced = 0;
  let posFailed = 0;
  let namesUpserted = 0;
  const parts = chunk(items, UPLOAD_BATCH);

  for (let i = 0; i < parts.length; i++) {
    const batch = parts[i];
    let namesOk = false;
    try {
      const named = await uploadPosNames(serverUrl, syncKey, batch);
      namesUpserted += Number(named.products_upserted || namesFromPosItems(batch).length);
      namesOk = true;
    } catch (err) {
      console.error(`تحذير: تعذّر رفع أسماء POS قبل الأسعار: ${err.message || err}`);
    }

    const result = await uploadPosBatch(serverUrl, syncKey, batch);
    posSynced += Number(result.synced || result.data?.synced || batch.length);
    posFailed += Number(result.failed || result.data?.failed || 0);

    if (!namesOk) {
      try {
        const named = await uploadPosNames(serverUrl, syncKey, batch);
        namesUpserted += Number(named.products_upserted || 0);
      } catch (err) {
        console.error(`تحذير: تعذّر تأكيد أسماء POS بعد الأسعار: ${err.message || err}`);
      }
    }

    const pct = 10 + Math.round(((i + 1) / parts.length) * 90);
    onProgress?.(pct, `رفع POS: ${posSynced}/${items.length}`);
  }

  return {
    posSynced,
    posFailed,
    posOffers,
    posTotal: items.length,
    posRead,
    posNames: namedCount,
    posNamesUpserted: namesUpserted,
    items,
  };
}

async function syncPosPricing({
  serverUrl,
  syncKey,
  posConfig,
  onProgress,
} = {}) {
  if (process.env.SKIP_POS_SYNC === '1') {
    return { posSynced: 0, posFailed: 0, posOffers: 0, posSkipped: true, items: [] };
  }

  onProgress?.(0, 'قراءة أسعار POS من SQL Server...');
  const loaded = await loadPosSyncItems(posConfig || {});
  const uploaded = await uploadLoadedPosItems(serverUrl, syncKey, loaded.items, {
    posOffers: loaded.posOffers,
    posRead: loaded.rows.length,
    onProgress,
  });
  return uploaded;
}

module.exports = {
  getPosConfig,
  fetchPosArticles,
  rowToSyncItem,
  namesFromPosItems,
  loadPosSyncItems,
  uploadLoadedPosItems,
  buildPosBarcodeLookup,
  syncPosPricing,
  ARTICLES_QUERY,
};
