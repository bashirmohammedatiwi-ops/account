const fs = require('fs');
const path = require('path');
const db = require('./db');
const { getSection } = require('./catalog');

const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));

function ensureUploadDir(sub = '') {
  const dir = path.join(UPLOAD_ROOT, sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function mapProduct(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    sectionId: row.section_id,
    edariSeq: row.edari_seq || '',
    skuNum: row.sku_num || '',
    barcode: row.barcode || row.sku_num || '',
    name: row.name,
    unit: row.unit || '',
    price: Number(row.price || 0),
    bonusDefault: Number(row.bonus_default || 0),
    priceOverride: !!row.price_override,
    description: row.description || '',
    minOrderQty: Number(row.min_order_qty || 0),
    imagePath: row.image_path || '',
    imageUrl: row.image_path ? `/uploads/${row.image_path.replace(/\\/g, '/')}` : '',
    isActive: !!row.is_active,
    sortOrder: row.sort_order,
    syncedAt: row.synced_at || '',
    updatedAt: row.updated_at || '',
    sectionName: row.section_name || extras.sectionName || '',
    branchId: row.branch_id ?? extras.branchId,
    branchName: row.branch_name || extras.branchName || '',
    ...extras
  };
}

function edariWholesalePrice(sellPr1, sellPr2) {
  const wholesale = Number(sellPr2);
  if (wholesale > 0) return wholesale;
  return Number(sellPr1) || 0;
}

function mapEdariMaterial(row) {
  if (!row) return null;
  const sellPr1 = Number(row.sell_pr1 ?? row.SellPr1 ?? 0);
  const sellPr2 = Number(row.sell_pr2 ?? row.SellPr2 ?? 0);
  const bonus = Number(row.bonus ?? row.Bonus ?? 0);
  return {
    seq: String(row.seq || row.Seq || ''),
    num: String(row.num || row.Num || ''),
    barcode: String(row.barcode || row.Barcode || row.num || row.Num || '').trim(),
    name: String(row.name1 || row.Name1 || ''),
    name2: String(row.name2 || row.Name2 || ''),
    unit: String(row.unit || row.DefUnit || ''),
    priceRetail: sellPr1,
    wholesalePrice: edariWholesalePrice(sellPr1, sellPr2),
    price: edariWholesalePrice(sellPr1, sellPr2),
    bonus,
    qty: bonus,
    remarks: String(row.remarks || row.Remarks || ''),
    syncedAt: row.synced_at || ''
  };
}

function normalizeCode(code) {
  return String(code ?? '').trim();
}

function parseEdariSyncRow(row) {
  const seq = String(row.Seq ?? row.seq ?? '').trim();
  const num = String(row.Num ?? row.num ?? '').trim();
  const barcode = String(row.Barcode ?? row.barcode ?? num).trim();
  const name1 = String(row.Name1 ?? row.name ?? '').trim();
  return {
    seq,
    num,
    barcode,
    name1,
    name2: String(row.Name2 ?? row.name2 ?? '').trim(),
    unit: String(row.DefUnit ?? row.unit ?? ''),
    sellPr1: Number(row.SellPr1 ?? row.price ?? 0),
    sellPr2: Number(row.SellPr2 ?? row.sell_pr2 ?? 0),
    bonus: Number(row.Bonus ?? row.bonus ?? 0),
    remarks: String(row.Remarks ?? row.remarks ?? '').trim()
  };
}

function edariMaterialStats() {
  const row = db.prepare('SELECT COUNT(*) AS total, MAX(synced_at) AS lastSync FROM edari_materials').get();
  return {
    total: row?.total || 0,
    lastSync: row?.lastSync || ''
  };
}

function listProducts(sectionId, { activeOnly = false } = {}) {
  const rows = db.prepare(`
    SELECT p.*, s.name AS section_name, s.branch_id, b.name AS branch_name
    FROM products p
    JOIN catalog_sections s ON s.id = p.section_id
    JOIN catalog_branches b ON b.id = s.branch_id
    WHERE p.section_id = ?
    ${activeOnly ? 'AND p.is_active = 1' : ''}
    ORDER BY p.sort_order, p.name
  `).all(sectionId);
  return rows.map((r) => mapProduct(r));
}

const SORT_COLUMNS = {
  name: 'p.name',
  price: 'p.price',
  sort_order: 'p.sort_order',
  updated_at: 'p.updated_at',
  synced_at: 'p.synced_at'
};

function queryProducts(filters = {}) {
  const {
    sectionId,
    branchId,
    q = '',
    activeOnly,
    inactiveOnly,
    noImage,
    priceOverride,
    sortBy = 'sort_order',
    sortDir = 'asc',
    limit = 200,
    offset = 0
  } = filters;

  const where = ['1=1'];
  const params = [];

  if (sectionId) {
    where.push('p.section_id = ?');
    params.push(sectionId);
  }
  if (branchId) {
    where.push('s.branch_id = ?');
    params.push(branchId);
  }
  if (q) {
    const like = `%${q}%`;
    where.push('(p.name LIKE ? OR p.barcode LIKE ? OR p.sku_num LIKE ? OR p.edari_seq LIKE ?)');
    params.push(like, like, like, like);
  }
  if (activeOnly) where.push('p.is_active = 1');
  if (inactiveOnly) where.push('p.is_active = 0');
  if (noImage) where.push("(p.image_path IS NULL OR p.image_path = '')");
  if (priceOverride === true) where.push('p.price_override = 1');
  if (priceOverride === false) where.push('(p.price_override IS NULL OR p.price_override = 0)');

  const orderCol = SORT_COLUMNS[sortBy] || SORT_COLUMNS.sort_order;
  const dir = String(sortDir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);

  const countRow = db.prepare(`
    SELECT COUNT(*) AS total FROM products p
    JOIN catalog_sections s ON s.id = p.section_id
    JOIN catalog_branches b ON b.id = s.branch_id
    WHERE ${where.join(' AND ')}
  `).get(...params);

  const rows = db.prepare(`
    SELECT p.*, s.name AS section_name, s.branch_id, b.name AS branch_name
    FROM products p
    JOIN catalog_sections s ON s.id = p.section_id
    JOIN catalog_branches b ON b.id = s.branch_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderCol} ${dir}, p.name ASC
    LIMIT ? OFFSET ?
  `).all(...params, lim, off);

  return {
    products: rows.map((r) => mapProduct(r)),
    total: countRow?.total || 0,
    limit: lim,
    offset: off
  };
}

function searchEdariMaterials(q, { limit = 30 } = {}) {
  const raw = String(q || '').trim();
  if (!raw) return [];
  const like = `%${raw}%`;
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const rows = db.prepare(`
    SELECT * FROM edari_materials
    WHERE name1 LIKE ? OR barcode LIKE ? OR num LIKE ? OR seq LIKE ?
    ORDER BY name1
    LIMIT ?
  `).all(like, like, like, like, lim);
  return rows.map((r) => mapEdariMaterial(r));
}

function productStats(filters = {}) {
  const { sectionId, branchId } = filters;
  const where = ['1=1'];
  const params = [];
  if (sectionId) {
    where.push('p.section_id = ?');
    params.push(sectionId);
  }
  if (branchId) {
    where.push('s.branch_id = ?');
    params.push(branchId);
  }
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN p.is_active = 1 THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN p.image_path IS NOT NULL AND p.image_path != '' THEN 1 ELSE 0 END) AS withImage,
      SUM(CASE WHEN p.price_override = 1 THEN 1 ELSE 0 END) AS priceOverride
    FROM products p
    JOIN catalog_sections s ON s.id = p.section_id
    WHERE ${where.join(' AND ')}
  `).get(...params);
  return {
    total: row?.total || 0,
    active: row?.active || 0,
    inactive: (row?.total || 0) - (row?.active || 0),
    withImage: row?.withImage || 0,
    withoutImage: (row?.total || 0) - (row?.withImage || 0),
    priceOverride: row?.priceOverride || 0
  };
}

function getProduct(id) {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!row) return null;
  const section = getSection(row.section_id);
  return mapProduct(row, {
    sectionName: section?.name || '',
    branchId: section?.branchId
  });
}

function findEdariMaterialByCode(code) {
  const raw = normalizeCode(code);
  if (!raw) return null;
  const row = db.prepare(`
    SELECT * FROM edari_materials
    WHERE seq = ? OR num = ? OR barcode = ?
    ORDER BY
      CASE
        WHEN barcode = ? THEN 0
        WHEN num = ? THEN 1
        WHEN seq = ? THEN 2
        ELSE 3
      END
    LIMIT 1
  `).get(raw, raw, raw, raw, raw, raw);
  return row ? mapEdariMaterial(row) : null;
}

function lookupByBarcode(code, { branchId, activeOnly = true } = {}) {
  const raw = normalizeCode(code);
  if (!raw) return null;

  let row = db.prepare(`
    SELECT p.* FROM products p
    JOIN catalog_sections s ON s.id = p.section_id
    WHERE (p.barcode = ? OR p.sku_num = ? OR p.edari_seq = ?)
    ${branchId ? 'AND s.branch_id = ?' : ''}
    ${activeOnly ? 'AND p.is_active = 1 AND s.is_active = 1' : ''}
    ORDER BY p.id
    LIMIT 1
  `).get(...(branchId ? [raw, raw, raw, branchId] : [raw, raw, raw]));

  return row ? getProduct(row.id) : null;
}

function createProduct(data) {
  const r = db.prepare(`
    INSERT INTO products
      (section_id, edari_seq, sku_num, barcode, name, unit, price, bonus_default,
       price_override, description, min_order_qty, is_active, sort_order, synced_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    data.sectionId,
    data.edariSeq || '',
    data.skuNum || '',
    data.barcode || data.skuNum || '',
    data.name,
    data.unit || '',
    Number(data.price || 0),
    Number(data.bonusDefault || 0),
    data.priceOverride ? 1 : 0,
    data.description || '',
    Number(data.minOrderQty || 0),
    data.isActive !== false ? 1 : 0,
    data.sortOrder || 0,
    data.syncedAt || new Date().toISOString()
  );
  return getProduct(r.lastInsertRowid);
}

function updateProduct(id, patch) {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!row) return null;
  db.prepare(`
    UPDATE products SET
      section_id = ?, edari_seq = ?, sku_num = ?, barcode = ?, name = ?, unit = ?,
      price = ?, bonus_default = ?, price_override = ?, description = ?, min_order_qty = ?,
      is_active = ?, sort_order = ?,
      synced_at = COALESCE(?, synced_at),
      image_path = COALESCE(?, image_path), updated_at = datetime('now')
    WHERE id = ?
  `).run(
    patch.sectionId ?? row.section_id,
    patch.edariSeq ?? row.edari_seq,
    patch.skuNum ?? row.sku_num,
    patch.barcode ?? row.barcode,
    patch.name ?? row.name,
    patch.unit ?? row.unit,
    patch.price ?? row.price,
    patch.bonusDefault ?? row.bonus_default,
    patch.priceOverride != null ? (patch.priceOverride ? 1 : 0) : row.price_override,
    patch.description ?? row.description,
    patch.minOrderQty ?? row.min_order_qty,
    patch.isActive != null ? (patch.isActive ? 1 : 0) : row.is_active,
    patch.sortOrder ?? row.sort_order,
    patch.syncedAt ?? null,
    patch.imagePath ?? null,
    id
  );
  return getProduct(id);
}

function deleteProduct(id) {
  const row = db.prepare('SELECT image_path FROM products WHERE id = ?').get(id);
  if (row?.image_path) {
    const full = path.join(UPLOAD_ROOT, row.image_path);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  return db.prepare('DELETE FROM products WHERE id = ?').run(id).changes > 0;
}

function saveProductImage(id, dataUrl) {
  const product = db.prepare('SELECT id, image_path FROM products WHERE id = ?').get(id);
  if (!product) return null;

  const match = String(dataUrl || '').match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) throw new Error('صيغة الصورة غير صالحة');

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw new Error('حجم الصورة أكبر من 3MB');

  ensureUploadDir('products');
  const rel = `products/${id}.${ext}`;
  const full = path.join(UPLOAD_ROOT, rel);
  fs.writeFileSync(full, buf);

  if (product.image_path && product.image_path !== rel) {
    const old = path.join(UPLOAD_ROOT, product.image_path);
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }

  db.prepare('UPDATE products SET image_path = ?, updated_at = datetime(\'now\') WHERE id = ?').run(rel, id);
  return getProduct(id);
}

function deleteProductImage(id) {
  const product = db.prepare('SELECT id, image_path FROM products WHERE id = ?').get(id);
  if (!product) return null;
  if (product.image_path) {
    const full = path.join(UPLOAD_ROOT, product.image_path);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  db.prepare('UPDATE products SET image_path = \'\', updated_at = datetime(\'now\') WHERE id = ?').run(id);
  return getProduct(id);
}

function upsertEdariMaterial(row) {
  const parsed = parseEdariSyncRow(row);
  if (!parsed.seq || !parsed.name1) return null;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO edari_materials
      (seq, num, barcode, name1, name2, unit, sell_pr1, sell_pr2, bonus, remarks, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(seq) DO UPDATE SET
      num = excluded.num,
      barcode = excluded.barcode,
      name1 = excluded.name1,
      name2 = excluded.name2,
      unit = excluded.unit,
      sell_pr1 = excluded.sell_pr1,
      sell_pr2 = excluded.sell_pr2,
      bonus = excluded.bonus,
      remarks = excluded.remarks,
      synced_at = excluded.synced_at
  `).run(
    parsed.seq,
    parsed.num,
    parsed.barcode || parsed.num,
    parsed.name1,
    parsed.name2,
    parsed.unit,
    parsed.sellPr1,
    parsed.sellPr2,
    parsed.bonus,
    parsed.remarks,
    now
  );
  return parsed;
}

function findRegisteredProductIds(parsed) {
  const ids = new Set();
  const stmt = db.prepare(`
    SELECT id FROM products WHERE
      (edari_seq != '' AND edari_seq = ?)
      OR (barcode != '' AND barcode = ?)
      OR (sku_num != '' AND sku_num = ?)
      OR (barcode != '' AND barcode = ?)
      OR (sku_num != '' AND sku_num = ?)
  `);
  for (const row of stmt.all(parsed.seq, parsed.barcode, parsed.num, parsed.num, parsed.barcode)) {
    ids.add(row.id);
  }
  return [...ids];
}

function refreshRegisteredProductFromEdari(parsed) {
  const now = new Date().toISOString();
  let updated = 0;
  const wholesale = edariWholesalePrice(parsed.sellPr1, parsed.sellPr2);
  for (const id of findRegisteredProductIds(parsed)) {
    updateProduct(id, {
      edariSeq: parsed.seq,
      skuNum: parsed.num,
      barcode: parsed.barcode || parsed.num,
      name: parsed.name1,
      unit: parsed.unit,
      price: wholesale,
      minOrderQty: Number(parsed.bonus) || 0,
      priceOverride: false,
      syncedAt: now
    });
    updated += 1;
  }
  return updated;
}

function syncProductFromEdari(id) {
  const product = getProduct(id);
  if (!product) throw new Error('المنتج غير موجود');
  const material = findEdariMaterialByCode(product.edariSeq || product.barcode || product.skuNum);
  if (!material?.seq) throw new Error('المادة غير موجودة في Edari — نفّذ مزامنة كاملة أولاً');
  return updateProduct(id, {
    edariSeq: material.seq,
    skuNum: material.num,
    barcode: material.barcode || material.num,
    name: material.name,
    unit: material.unit,
    price: material.wholesalePrice ?? material.price,
    minOrderQty: Number(material.bonus) || 0,
    priceOverride: false,
    syncedAt: new Date().toISOString()
  });
}

function syncSectionFromEdari(sectionId) {
  const rows = db.prepare('SELECT id FROM products WHERE section_id = ?').all(sectionId);
  let updated = 0;
  const errors = [];
  for (const row of rows) {
    try {
      syncProductFromEdari(row.id);
      updated += 1;
    } catch (err) {
      errors.push({ id: row.id, error: err.message });
    }
  }
  return { updated, total: rows.length, errors };
}

function bulkAddByBarcode(sectionId, codes = []) {
  const added = [];
  const skipped = [];
  const errors = [];
  for (const code of codes) {
    const raw = normalizeCode(code);
    if (!raw) continue;
    try {
      const product = addProductByBarcode(sectionId, raw);
      added.push(product);
    } catch (err) {
      if (String(err.message).includes('مُسجَّل مسبقاً')) {
        skipped.push({ code: raw, reason: err.message });
      } else {
        errors.push({ code: raw, error: err.message });
      }
    }
  }
  return { added: added.length, skipped, errors, products: added };
}

function bulkProductsAction(ids = [], action, payload = {}) {
  const uniqueIds = [...new Set(ids.map(Number).filter(Boolean))];
  if (!uniqueIds.length) return { affected: 0 };

  let affected = 0;
  const tx = db.transaction(() => {
    for (const id of uniqueIds) {
      switch (action) {
        case 'activate':
          if (updateProduct(id, { isActive: true })) affected += 1;
          break;
        case 'deactivate':
          if (updateProduct(id, { isActive: false })) affected += 1;
          break;
        case 'delete':
          if (deleteProduct(id)) affected += 1;
          break;
        case 'move':
          if (payload.sectionId && updateProduct(id, { sectionId: Number(payload.sectionId) })) {
            affected += 1;
          }
          break;
        case 'set_bonus':
          if (updateProduct(id, { bonusDefault: Number(payload.bonusDefault || 0) })) affected += 1;
          break;
        case 'sync_edari':
          try {
            syncProductFromEdari(id);
            affected += 1;
          } catch { /* skip failed */ }
          break;
        default:
          break;
      }
    }
  });
  tx();
  return { affected, action, ids: uniqueIds };
}

function addProductByBarcode(sectionId, code, options = {}) {
  const raw = normalizeCode(code);
  if (!raw) throw new Error('الباركود مطلوب');

  const section = getSection(sectionId);
  if (!section) throw new Error('القسم غير موجود');

  const material = findEdariMaterialByCode(raw);
  if (!material?.seq) {
    throw new Error('المادة غير موجودة في Edari — نفّذ مزامنة كاملة أولاً');
  }

  const duplicate = db.prepare(`
    SELECT id FROM products
    WHERE section_id = ? AND (
      edari_seq = ? OR barcode = ? OR sku_num = ?
    )
  `).get(sectionId, material.seq, material.barcode || raw, material.num || raw);

  if (duplicate) throw new Error('هذا المنتج مُسجَّل مسبقاً في هذا القسم');

  return createProduct({
    sectionId,
    edariSeq: material.seq,
    skuNum: material.num,
    barcode: material.barcode || material.num,
    name: String(options.name || '').trim() || material.name,
    unit: material.unit,
    price: material.wholesalePrice ?? material.price,
    bonusDefault: Number(material.bonus) || 0,
    priceOverride: false,
    description: material.remarks || '',
    minOrderQty: Number(material.bonus) || 0,
    sortOrder: Number(options.sortOrder || 0),
    isActive: options.isActive !== false,
    syncedAt: material.syncedAt || new Date().toISOString()
  });
}

/** Sync File13n cache + refresh catalog products registered by barcode (no auto-import). */
function syncMaterialsFromEdari(rows = []) {
  if (!rows.length) return { materials: 0, productsUpdated: 0, scanned: 0 };

  let materials = 0;
  let productsUpdated = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const parsed = upsertEdariMaterial(row);
      if (!parsed) continue;
      materials += 1;
      productsUpdated += refreshRegisteredProductFromEdari(parsed);
    }
  });
  tx();
  return { materials, productsUpdated, scanned: rows.length };
}

function purgeAllCatalogProducts() {
  const rows = db.prepare('SELECT id, image_path FROM products').all();
  let deleted = 0;
  const tx = db.transaction(() => {
    db.prepare('UPDATE order_lines SET product_id = NULL WHERE product_id IS NOT NULL').run();
    deleted = db.prepare('DELETE FROM products').run().changes;
  });
  tx();

  let imagesRemoved = 0;
  for (const row of rows) {
    if (!row.image_path) continue;
    const full = path.join(UPLOAD_ROOT, row.image_path);
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      imagesRemoved += 1;
    }
  }

  return { deleted, imagesRemoved };
}

function reorderProducts(sectionId, orderedIds = []) {
  const ids = [...new Set(orderedIds.map(Number).filter(Boolean))];
  if (!ids.length) return { reordered: 0 };
  const tx = db.transaction(() => {
    ids.forEach((id, index) => {
      db.prepare(`
        UPDATE products SET sort_order = ?, updated_at = datetime('now')
        WHERE id = ? AND section_id = ?
      `).run(index + 1, id, sectionId);
    });
  });
  tx();
  return { reordered: ids.length };
}

function parseImportRow(row = {}) {
  const barcode = normalizeCode(row.barcode || row.Barcode || row.num || row.Num || row.sku || row.SKU);
  const name = String(row.name || row.Name || row.name1 || '').trim();
  const sectionId = row.sectionId || row.section_id ? Number(row.sectionId || row.section_id) : null;
  return {
    sectionId,
    barcode,
    name,
    unit: String(row.unit || row.Unit || '').trim(),
    price: row.price != null && row.price !== '' ? Number(row.price) : null,
    bonusDefault: row.bonus != null && row.bonus !== '' ? Number(row.bonus) : null,
    sortOrder: row.sort_order != null && row.sort_order !== '' ? Number(row.sort_order) : null,
    isActive: row.active != null && row.active !== ''
      ? ['1', 'true', 'yes', 'نعم', 'نشط'].includes(String(row.active).toLowerCase())
      : null,
    priceOverride: row.price_override != null && row.price_override !== ''
      ? ['1', 'true', 'yes'].includes(String(row.price_override).toLowerCase())
      : null,
    description: String(row.description || row.desc || '').trim()
  };
}

function importProductsRows(defaultSectionId, rows = []) {
  const results = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const raw of rows) {
    const row = parseImportRow(raw);
    const sectionId = row.sectionId || defaultSectionId;
    if (!sectionId) {
      results.errors.push({ row: raw, error: 'القسم مطلوب' });
      continue;
    }

    try {
      if (!row.barcode) {
        results.errors.push({ row: raw, error: 'الباركود مطلوب — البيانات تُجلب من Edari فقط' });
        continue;
      }

      const existing = db.prepare(`
        SELECT id FROM products WHERE section_id = ? AND (
          barcode = ? OR sku_num = ? OR edari_seq = ?
        ) LIMIT 1
      `).get(sectionId, row.barcode, row.barcode, row.barcode);

      if (existing) {
        results.skipped += 1;
        continue;
      }

      addProductByBarcode(sectionId, row.barcode, {
        bonusDefault: row.bonusDefault,
        sortOrder: row.sortOrder,
        isActive: row.isActive !== false,
        priceOverride: row.priceOverride,
        price: row.price,
        description: row.description
      });
      results.created += 1;
    } catch (err) {
      results.errors.push({ row: raw, error: err.message });
    }
  }

  return results;
}

function exportProductsCsv(filters = {}) {
  const { products } = queryProducts({ ...filters, limit: 5000, offset: 0 });
  const header = ['id', 'section', 'branch', 'barcode', 'name', 'unit', 'price', 'bonus', 'sort_order', 'active', 'price_override', 'description'];
  const lines = [header.join(',')];
  for (const p of products) {
    const cols = [
      p.id,
      csvCell(p.sectionName),
      csvCell(p.branchName),
      csvCell(p.barcode || p.skuNum),
      csvCell(p.name),
      csvCell(p.unit),
      p.price,
      p.bonusDefault,
      p.sortOrder,
      p.isActive ? 1 : 0,
      p.priceOverride ? 1 : 0,
      csvCell(p.description)
    ];
    lines.push(cols.join(','));
  }
  return lines.join('\n');
}

function csvCell(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

module.exports = {
  UPLOAD_ROOT,
  listProducts,
  queryProducts,
  searchEdariMaterials,
  productStats,
  getProduct,
  lookupByBarcode,
  findEdariMaterialByCode,
  edariMaterialStats,
  addProductByBarcode,
  bulkAddByBarcode,
  bulkProductsAction,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteProductImage,
  saveProductImage,
  syncProductFromEdari,
  syncSectionFromEdari,
  syncMaterialsFromEdari,
  purgeAllCatalogProducts,
  reorderProducts,
  importProductsRows,
  exportProductsCsv
};
