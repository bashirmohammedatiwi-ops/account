const db = require('./db');
const { computePricing, pricingFromSyncItem, resolveStoredPricing } = require('./pos-pricing');

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
}

initPriceCatalogSchema();

function normalizeBarcode(value) {
  const s = String(value ?? '').trim();
  return s && s !== '0' ? s : '';
}

function upsertEdariProducts(products = []) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO price_products (barcode, name, stock_balance, edari_synced_at)
    VALUES (@barcode, @name, @stock_balance, @edari_synced_at)
    ON CONFLICT(barcode) DO UPDATE SET
      name = COALESCE(excluded.name, price_products.name),
      stock_balance = COALESCE(excluded.stock_balance, price_products.stock_balance),
      edari_synced_at = excluded.edari_synced_at
  `);

  let upserted = 0;
  const tx = db.transaction((rows) => {
    for (const row of rows) {
      const barcode = normalizeBarcode(row.barcode);
      if (!barcode) continue;
      const name = String(row.name || '').trim() || null;
      const stockBalance = row.stock_balance != null && Number.isFinite(Number(row.stock_balance))
        ? Number(row.stock_balance)
        : null;
      if (!name && stockBalance == null) continue;
      stmt.run({
        barcode,
        name,
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
  const stmt = db.prepare(`
    INSERT INTO price_products (
      barcode, name, product_code, product_num,
      original_price, final_price, discount_percent, discount_value, discount_type,
      offer_name, pos_stock, pos_synced_at
    ) VALUES (
      @barcode, @name, @product_code, @product_num,
      @original_price, @final_price, @discount_percent, @discount_value, @discount_type,
      @offer_name, @pos_stock, @pos_synced_at
    )
    ON CONFLICT(barcode) DO UPDATE SET
      product_code = COALESCE(excluded.product_code, price_products.product_code),
      product_num = COALESCE(excluded.product_num, price_products.product_num),
      name = COALESCE(price_products.name, excluded.name),
      original_price = excluded.original_price,
      final_price = excluded.final_price,
      discount_percent = excluded.discount_percent,
      discount_value = excluded.discount_value,
      discount_type = excluded.discount_type,
      offer_name = excluded.offer_name,
      pos_stock = excluded.pos_stock,
      pos_synced_at = excluded.pos_synced_at
  `);

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
      const posName = String(item.name || '').trim() || null;
      stmt.run({
        barcode,
        name: posName,
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
      });
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
      (SELECT COUNT(*) FROM price_products WHERE original_price > 0) AS pricedProducts,
      (SELECT COUNT(*) FROM price_products WHERE discount_percent IS NOT NULL AND discount_percent > 0) AS productsOnOffer,
      (SELECT COUNT(*) FROM price_movements) AS totalMovements
  `).get();
  return {
    totalProducts: row.totalProducts || 0,
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
    where += ' AND (p.name LIKE @q OR p.barcode LIKE @q OR p.product_num LIKE @q OR p.product_code LIKE @q)';
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

  const products = rows.map((r) => {
    const hasPos = r.posSyncedAt != null && String(r.posSyncedAt).trim() !== '';
    const pricing = hasPos
      ? resolveStoredPricing({
          original_price: r.originalPrice,
          final_price: r.finalPrice,
          discount_percent: r.discountPercent,
          discount_value: r.discountValue,
          discount_type: r.discountType,
          offer_name: r.offerName,
          pos_synced_at: r.posSyncedAt,
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
    return {
      ...r,
      originalPrice: pricing.originalPrice,
      finalPrice: pricing.finalPrice,
      discountPercent: pricing.discountPercent,
      discountValue: pricing.discountValue,
      discountType: pricing.discountType,
      offerName: pricing.offerName || r.offerName,
      hasOffer: pricing.hasOffer,
      quantity: r.posStock ?? r.stockBalance ?? 0,
    };
  });

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
  getProductMovements,
  getMeta,
};
