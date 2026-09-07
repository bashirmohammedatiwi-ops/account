const db = require('./db');
const { computePricing, pricingFromSyncItem, resolveStoredPricing } = require('./pos-pricing');
const { normalizeProductName, pickBestName, looksGarbled } = require('./product-name-text');

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

function initPriceCatalogSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_products (
      barcode TEXT PRIMARY KEY,
      name TEXT,
      product_code TEXT,
      product_num TEXT,
      original_price INTEGER DEFAULT 0,
      final_price INTEGER DEFAULT 0,
      discount_percent REAL,
      discount_value REAL,
      discount_type INTEGER,
      offer_name TEXT,
      pos_stock INTEGER,
      stock_balance REAL,
      edari_synced_at TEXT,
      pos_synced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_price_products_name ON price_products(name);
    CREATE INDEX IF NOT EXISTS idx_price_products_num ON price_products(product_num);

    CREATE TABLE IF NOT EXISTS price_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT NOT NULL,
      supplier TEXT,
      invoice TEXT,
      quantity REAL DEFAULT 0,
      unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      move_date TEXT,
      edari_key TEXT UNIQUE,
      synced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_price_movements_barcode ON price_movements(barcode);
    CREATE INDEX IF NOT EXISTS idx_price_movements_date ON price_movements(move_date);

    CREATE TABLE IF NOT EXISTS price_sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  if (!columnExists('price_products', 'edari_name')) {
    db.exec('ALTER TABLE price_products ADD COLUMN edari_name TEXT');
  }
}

initPriceCatalogSchema();

function normalizeBarcode(value) {
  const s = String(value ?? '').trim();
  return s && s !== '0' ? s : '';
}

const lookupNameByBarcode = db.prepare(`
  SELECT name1 FROM edari_materials
  WHERE barcode = ? AND trim(name1) != ''
  LIMIT 1
`);
const lookupNameByNum = db.prepare(`
  SELECT name1 FROM edari_materials
  WHERE num = ? AND trim(name1) != ''
  LIMIT 1
`);
const lookupProductNameByBarcode = db.prepare(`
  SELECT name FROM products
  WHERE barcode = ? AND trim(name) != ''
  LIMIT 1
`);
const selectPriceProductName = db.prepare('SELECT name, product_num FROM price_products WHERE barcode = ?');
const repairNameStmt = db.prepare('UPDATE price_products SET name = ? WHERE barcode = ?');
const upsertEdariMaterialCache = db.prepare(`
  INSERT INTO edari_materials (seq, num, barcode, name1, synced_at)
  VALUES (@seq, @num, @barcode, @name1, datetime('now'))
  ON CONFLICT(seq) DO UPDATE SET
    num = CASE WHEN trim(excluded.num) != '' THEN excluded.num ELSE edari_materials.num END,
    barcode = CASE WHEN trim(excluded.barcode) != '' THEN excluded.barcode ELSE edari_materials.barcode END,
    name1 = CASE WHEN trim(excluded.name1) != '' THEN excluded.name1 ELSE edari_materials.name1 END,
    synced_at = excluded.synced_at
`);

function cacheEdariMaterial({ barcode, product_num, name, edari_seq }) {
  const code = normalizeBarcode(barcode);
  const n = normalizeProductName(name);
  if (!code || !n) return;
  const num = String(product_num ?? '').trim();
  let seq = String(edari_seq ?? '').trim();
  if (!seq) {
    const byBarcode = db.prepare('SELECT seq FROM edari_materials WHERE barcode = ? LIMIT 1').get(code);
    const byNum = num ? db.prepare('SELECT seq FROM edari_materials WHERE num = ? LIMIT 1').get(num) : null;
    seq = byBarcode?.seq || byNum?.seq || `price:${code}`;
  }
  upsertEdariMaterialCache.run({
    seq,
    num: num || null,
    barcode: code,
    name1: n,
  });
}

function lookupCatalogName(barcode, productNum) {
  const code = normalizeBarcode(barcode);
  const num = String(productNum ?? '').trim();
  const tries = [];
  if (code) {
    tries.push(lookupNameByBarcode.get(code)?.name1);
    tries.push(lookupProductNameByBarcode.get(code)?.name);
  }
  if (num) tries.push(lookupNameByNum.get(num)?.name1);
  return pickBestName(...tries);
}

function mergeProductName(barcode, productNum, ...incoming) {
  const existing = selectPriceProductName.get(barcode);
  const num = productNum || existing?.product_num;
  const catalog = lookupCatalogName(barcode, num);
  const merged = pickBestName(existing?.name, ...incoming, catalog);
  return merged || null;
}

function resolveProductDisplayName(row, { persist = false } = {}) {
  const stored = row?.name;
  const edariName = row?.edari_name ?? row?.edariName;
  const catalog = lookupCatalogName(row?.barcode, row?.productNum || row?.product_num);
  const finalName = pickBestName(edariName, catalog, stored) || '';

  if (persist && row?.barcode) {
    try {
      if (finalName && finalName !== stored) {
        repairNameStmt.run(finalName, row.barcode);
      } else if (!finalName && stored && looksGarbled(stored)) {
        repairNameStmt.run(null, row.barcode);
      }
    } catch {
      /* ignore */
    }
  }
  return finalName;
}

function readableProductName(row) {
  const name = resolveProductDisplayName(row, { persist: false });
  if (name && !looksGarbled(name)) return name;
  const catalog = lookupCatalogName(row?.barcode, row?.productNum || row?.product_num);
  if (catalog && !looksGarbled(catalog)) return catalog;
  return row?.barcode || '';
}

function repairPriceProductNames({ limit = 10000 } = {}) {
  const safeLimit = Math.min(50000, Math.max(1, Number(limit) || 10000));
  const rows = db.prepare(`
    SELECT barcode, name, edari_name, product_num FROM price_products
    ORDER BY barcode
    LIMIT ?
  `).all(safeLimit);
  let fixed = 0;
  let cleared = 0;
  for (const row of rows) {
    const resolved = pickBestName(
      row.edari_name,
      lookupCatalogName(row.barcode, row.product_num),
      row.name,
    );
    if (resolved && resolved !== row.name) {
      repairNameStmt.run(resolved, row.barcode);
      fixed += 1;
    } else if (!resolved && row.name && looksGarbled(row.name)) {
      repairNameStmt.run(null, row.barcode);
      cleared += 1;
    }
  }
  return { scanned: rows.length, fixed, cleared };
}

function upsertEdariProducts(products = []) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO price_products (barcode, name, edari_name, stock_balance, edari_synced_at)
    VALUES (@barcode, @name, @edari_name, @stock_balance, @edari_synced_at)
    ON CONFLICT(barcode) DO UPDATE SET
      edari_name = CASE
        WHEN excluded.edari_name IS NOT NULL AND trim(excluded.edari_name) != '' THEN excluded.edari_name
        ELSE price_products.edari_name
      END,
      name = CASE
        WHEN excluded.name IS NOT NULL AND trim(excluded.name) != '' THEN excluded.name
        ELSE price_products.name
      END,
      stock_balance = COALESCE(excluded.stock_balance, price_products.stock_balance),
      edari_synced_at = excluded.edari_synced_at
  `);

  let upserted = 0;
  const tx = db.transaction((rows) => {
    for (const row of rows) {
      const barcode = normalizeBarcode(row.barcode);
      if (!barcode) continue;
      const edariName = normalizeProductName(row.name) || null;
      const name = mergeProductName(barcode, row.product_num, edariName) || edariName;
      const stockBalance = row.stock_balance != null && Number.isFinite(Number(row.stock_balance))
        ? Number(row.stock_balance)
        : null;
      if (!name && !edariName && stockBalance == null) continue;
      if (edariName || name) {
        cacheEdariMaterial({ barcode, product_num: row.product_num, name: edariName || name });
      }
      stmt.run({
        barcode,
        name,
        edari_name: edariName || name,
        stock_balance: stockBalance,
        edari_synced_at: now,
      });
      upserted += 1;
    }
  });
  tx(products);
  return upserted;
}

function upsertEdariMovements(movements = []) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO price_movements
      (barcode, supplier, invoice, quantity, unit_price, total_price, move_date, edari_key, synced_at)
    VALUES
      (@barcode, @supplier, @invoice, @quantity, @unit_price, @total_price, @move_date, @edari_key, @synced_at)
    ON CONFLICT(edari_key) DO UPDATE SET
      supplier = excluded.supplier,
      invoice = excluded.invoice,
      quantity = excluded.quantity,
      unit_price = excluded.unit_price,
      total_price = excluded.total_price,
      move_date = excluded.move_date,
      synced_at = excluded.synced_at
  `);

  let upserted = 0;
  const tx = db.transaction((rows) => {
    for (const row of rows) {
      const barcode = normalizeBarcode(row.barcode);
      const edariKey = String(row.edari_key || '').trim();
      if (!barcode || !edariKey) continue;
      stmt.run({
        barcode,
        supplier: String(row.supplier || '').trim() || null,
        invoice: String(row.invoice || '').trim() || null,
        quantity: Number(row.quantity) || 0,
        unit_price: Number(row.unit_price) || 0,
        total_price: Number(row.total_price) || 0,
        move_date: row.date || null,
        edari_key: edariKey,
        synced_at: now,
      });
      upserted += 1;
    }
  });
  tx(movements);
  return upserted;
}

function upsertPosItems(items = []) {
  const now = new Date().toISOString();
  const updatePosStmt = db.prepare(`
    UPDATE price_products SET
      product_code = COALESCE(@product_code, product_code),
      product_num = COALESCE(@product_num, product_num),
      original_price = @original_price,
      final_price = @final_price,
      discount_percent = @discount_percent,
      discount_value = @discount_value,
      discount_type = @discount_type,
      offer_name = @offer_name,
      pos_stock = @pos_stock,
      pos_synced_at = @pos_synced_at
    WHERE barcode = @barcode
  `);
  const insertPosStmt = db.prepare(`
    INSERT INTO price_products (
      barcode, name, product_code, product_num,
      original_price, final_price, discount_percent, discount_value, discount_type,
      offer_name, pos_stock, pos_synced_at
    ) VALUES (
      @barcode, @name, @product_code, @product_num,
      @original_price, @final_price, @discount_percent, @discount_value, @discount_type,
      @offer_name, @pos_stock, @pos_synced_at
    )
  `);
  const existsStmt = db.prepare('SELECT 1 AS ok FROM price_products WHERE barcode = ?');

  let synced = 0;
  const tx = db.transaction((rows) => {
    for (const item of rows) {
      const barcode = normalizeBarcode(item.barcode);
      if (!barcode) continue;
      let pricing;
      if (item.discountValue != null && Number(item.discountValue) > 0) {
        pricing = computePricing({
          originalPrice: item.originalPrice,
          storedFinalPrice: item.price,
          discountValue: item.discountValue,
          discountType: item.discountType,
          offerName: item.offerName,
        });
      } else {
        pricing = pricingFromSyncItem(item);
      }
      const payload = {
        barcode,
        product_code: item.productCode?.trim() || null,
        product_num: item.productNum?.trim() || null,
        original_price: pricing.originalPrice,
        final_price: pricing.finalPrice,
        discount_percent: pricing.discountPercent,
        discount_value: pricing.discountValue,
        discount_type: pricing.discountType,
        offer_name: pricing.offerName,
        pos_stock: Math.max(0, Math.round(Number(item.stock) || 0)),
        pos_synced_at: now,
      };
      if (existsStmt.get(barcode)) {
        updatePosStmt.run(payload);
      } else {
        const insertName = mergeProductName(barcode, item.productNum)
          || lookupCatalogName(barcode, item.productNum)
          || null;
        insertPosStmt.run({ ...payload, name: insertName });
      }
      synced += 1;
    }
  });
  tx(items);
  setMeta('last_pos_sync_at', now);
  return synced;
}

function setMeta(key, value) {
  db.prepare(`
    INSERT INTO price_sync_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function getMeta(key) {
  const row = db.prepare('SELECT value FROM price_sync_meta WHERE key = ?').get(key);
  return row?.value ?? null;
}

function getStats() {
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM price_products) AS totalProducts,
      (SELECT COUNT(*) FROM price_products WHERE pos_synced_at IS NOT NULL AND trim(pos_synced_at) != '') AS productsPosSynced,
      (SELECT COUNT(*) FROM price_products WHERE original_price > 0) AS pricedProducts,
      (SELECT COUNT(*) FROM price_products WHERE discount_percent IS NOT NULL AND discount_percent > 0) AS productsOnOffer,
      (SELECT COUNT(*) FROM price_movements) AS totalMovements
  `).get();
  return {
    totalProducts: row.totalProducts || 0,
    productsPosSynced: row.productsPosSynced || 0,
    totalArticles: row.totalProducts || 0,
    totalWithPrice: row.pricedProducts || 0,
    productsOnOffer: row.productsOnOffer || 0,
    totalMovements: row.totalMovements || 0,
    lastEdariSyncAt: getMeta('last_edari_sync_at'),
    lastPosSyncAt: getMeta('last_pos_sync_at'),
  };
}

function listProducts({ page = 1, limit = 50, search = '', offersOnly = false } = {}) {
  const safeLimit = Math.min(200, Math.max(10, Number(limit) || 50));
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;
  const q = String(search || '').trim();
  const params = { limit: safeLimit, offset };
  let where = 'WHERE 1=1';

  if (q) {
    where += ` AND (
      p.name LIKE @q OR p.barcode LIKE @q OR p.product_num LIKE @q OR p.product_code LIKE @q
      OR EXISTS (
        SELECT 1 FROM edari_materials m
        WHERE trim(m.name1) != ''
          AND (m.barcode = p.barcode OR m.num = p.product_num)
          AND m.name1 LIKE @q
      )
      OR EXISTS (
        SELECT 1 FROM products pr
        WHERE trim(pr.name) != ''
          AND pr.barcode = p.barcode
          AND pr.name LIKE @q
      )
    )`;
    params.q = `%${q}%`;
  }
  if (offersOnly) {
    where += ' AND p.discount_percent IS NOT NULL AND p.discount_percent > 0';
  }

  const total = db.prepare(`
    SELECT COUNT(*) AS c FROM price_products p ${where}
  `).get(params).c;

  const rows = db.prepare(`
    SELECT
      p.barcode,
      p.name,
      p.edari_name AS edariName,
      p.product_code AS productCode,
      p.product_num AS productNum,
      p.original_price AS originalPrice,
      p.final_price AS finalPrice,
      p.discount_percent AS discountPercent,
      p.discount_value AS discountValue,
      p.discount_type AS discountType,
      p.offer_name AS offerName,
      p.pos_stock AS posStock,
      p.stock_balance AS stockBalance,
      p.edari_synced_at AS edariSyncedAt,
      p.pos_synced_at AS posSyncedAt,
      (
        SELECT COUNT(*) FROM price_movements m WHERE m.barcode = p.barcode
      ) AS movementCount,
      (
        SELECT m.unit_price FROM price_movements m
        WHERE m.barcode = p.barcode
        ORDER BY m.move_date DESC, m.id DESC LIMIT 1
      ) AS lastPurchasePrice,
      (
        SELECT m.move_date FROM price_movements m
        WHERE m.barcode = p.barcode
        ORDER BY m.move_date DESC, m.id DESC LIMIT 1
      ) AS lastPurchaseDate
    FROM price_products p
    ${where}
    ORDER BY
      CASE WHEN p.discount_percent IS NOT NULL AND p.discount_percent > 0 THEN 0 ELSE 1 END,
      p.name COLLATE NOCASE
    LIMIT @limit OFFSET @offset
  `).all(params);

  const products = rows.map((r) => mapProductRow(r));

  return {
    products,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

function mapProductRow(row) {
  const hasPos = row.posSyncedAt != null && String(row.posSyncedAt).trim() !== '';
  const pricing = hasPos
    ? resolveStoredPricing({
        original_price: row.originalPrice,
        final_price: row.finalPrice,
        discount_percent: row.discountPercent,
        discount_value: row.discountValue,
        discount_type: row.discountType,
        offer_name: row.offerName,
        pos_synced_at: row.posSyncedAt,
      })
    : {
        originalPrice: null,
        finalPrice: null,
        discountPercent: null,
        discountValue: null,
        discountType: null,
        offerName: null,
        hasOffer: false,
      };
  const name = resolveProductDisplayName(row, { persist: true });
  return {
    ...row,
    name,
    originalPrice: pricing.originalPrice,
    finalPrice: pricing.finalPrice,
    discountPercent: pricing.discountPercent,
    discountValue: pricing.discountValue,
    discountType: pricing.discountType,
    offerName: pricing.offerName || row.offerName,
    hasOffer: pricing.hasOffer,
    quantity: row.posStock ?? row.stockBalance ?? 0,
  };
}

function selectProductRow(barcode) {
  const code = normalizeBarcode(barcode);
  if (!code) return null;
  return db.prepare(`
    SELECT
      p.barcode,
      p.name,
      p.edari_name AS edariName,
      p.product_code AS productCode,
      p.product_num AS productNum,
      p.original_price AS originalPrice,
      p.final_price AS finalPrice,
      p.discount_percent AS discountPercent,
      p.discount_value AS discountValue,
      p.discount_type AS discountType,
      p.offer_name AS offerName,
      p.pos_stock AS posStock,
      p.stock_balance AS stockBalance,
      p.edari_synced_at AS edariSyncedAt,
      p.pos_synced_at AS posSyncedAt
    FROM price_products p
    WHERE p.barcode = ?
  `).get(code);
}

function getProductByBarcode(barcode) {
  const row = selectProductRow(barcode);
  if (!row) return null;
  const mapped = mapProductRow(row);
  const displayName = readableProductName({ ...row, ...mapped });
  if (displayName && displayName !== row.name && !looksGarbled(displayName)) {
    try {
      repairNameStmt.run(displayName, row.barcode);
    } catch {
      /* ignore */
    }
  } else if (row.name && looksGarbled(row.name) && !displayName) {
    try {
      repairNameStmt.run(null, row.barcode);
    } catch {
      /* ignore */
    }
  }
  const movements = getProductMovements(mapped.barcode, { limit: 30 });
  return {
    barcode: mapped.barcode,
    name: displayName || mapped.barcode,
    original_price: mapped.originalPrice,
    final_price: mapped.finalPrice,
    discount_percent: mapped.discountPercent,
    discount_value: mapped.discountValue,
    discount_type: mapped.discountType,
    offer_name: mapped.offerName,
    pos_stock: mapped.posStock,
    pos_synced_at: mapped.posSyncedAt,
    has_offer: mapped.hasOffer,
    consumer_price: mapped.finalPrice ?? mapped.originalPrice,
    stock_balance: mapped.stockBalance,
    product_num: mapped.productNum,
    product_code: mapped.productCode,
    sources: [],
    movements: movements.map((m) => ({
      supplier: m.supplier,
      invoice: m.invoice,
      quantity: m.quantity,
      unit_price: m.unitPrice,
      total_price: m.totalPrice,
      date: m.date,
    })),
  };
}

function getProductMovements(barcode, { limit = 50 } = {}) {
  const code = normalizeBarcode(barcode);
  if (!code) return [];
  return db.prepare(`
    SELECT supplier, invoice, quantity, unit_price AS unitPrice,
           total_price AS totalPrice, move_date AS date
    FROM price_movements
    WHERE barcode = ?
    ORDER BY move_date DESC, id DESC
    LIMIT ?
  `).all(code, Math.min(200, Math.max(1, Number(limit) || 50)));
}

function importEdariBatch({ products = [], movements = [] } = {}) {
  const productsUpserted = upsertEdariProducts(products);
  const movementsUpserted = upsertEdariMovements(movements);
  if (products.length || movements.length) {
    setMeta('last_edari_sync_at', new Date().toISOString());
  }
  return {
    products_upserted: productsUpserted,
    consumer_prices_updated: 0,
    stock_balances_updated: products.filter((p) => p.stock_balance != null).length,
    movements_upserted: movementsUpserted,
  };
}

module.exports = {
  upsertEdariProducts,
  upsertEdariMovements,
  upsertPosItems,
  importEdariBatch,
  getStats,
  listProducts,
  getProductByBarcode,
  getProductMovements,
  getMeta,
  repairPriceProductNames,
  resolveProductDisplayName,
  readableProductName,
  lookupCatalogName,
};
