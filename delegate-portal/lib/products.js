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
    imagePath: row.image_path || '',
    imageUrl: row.image_path ? `/uploads/${row.image_path.replace(/\\/g, '/')}` : '',
    isActive: !!row.is_active,
    sortOrder: row.sort_order,
    syncedAt: row.synced_at || '',
    updatedAt: row.updated_at || '',
    ...extras
  };
}

function mapEdariMaterial(row) {
  if (!row) return null;
  return {
    seq: String(row.seq || row.Seq || ''),
    num: String(row.num || row.Num || ''),
    barcode: String(row.barcode || row.Barcode || row.num || row.Num || '').trim(),
    name: String(row.name1 || row.Name1 || ''),
    unit: String(row.unit || row.DefUnit || ''),
    price: Number(row.sell_pr1 ?? row.SellPr1 ?? 0),
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
  return { seq, num, barcode, name1, unit: String(row.DefUnit ?? row.unit ?? ''), sellPr1: Number(row.SellPr1 ?? row.price ?? 0) };
}

function listProducts(sectionId, { activeOnly = false } = {}) {
  const rows = db.prepare(`
    SELECT * FROM products
    WHERE section_id = ?
    ${activeOnly ? 'AND is_active = 1' : ''}
    ORDER BY sort_order, name
  `).all(sectionId);
  return rows.map((r) => mapProduct(r));
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
      (section_id, edari_seq, sku_num, barcode, name, unit, price, bonus_default, is_active, sort_order, synced_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    data.sectionId,
    data.edariSeq || '',
    data.skuNum || '',
    data.barcode || data.skuNum || '',
    data.name,
    data.unit || '',
    Number(data.price || 0),
    Number(data.bonusDefault || 0),
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
      price = ?, bonus_default = ?, is_active = ?, sort_order = ?,
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

function upsertEdariMaterial(row) {
  const parsed = parseEdariSyncRow(row);
  if (!parsed.seq || !parsed.name1) return null;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO edari_materials (seq, num, barcode, name1, unit, sell_pr1, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(seq) DO UPDATE SET
      num = excluded.num,
      barcode = excluded.barcode,
      name1 = excluded.name1,
      unit = excluded.unit,
      sell_pr1 = excluded.sell_pr1,
      synced_at = excluded.synced_at
  `).run(parsed.seq, parsed.num, parsed.barcode || parsed.num, parsed.name1, parsed.unit, parsed.sellPr1, now);
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
  for (const id of findRegisteredProductIds(parsed)) {
    updateProduct(id, {
      edariSeq: parsed.seq,
      skuNum: parsed.num,
      barcode: parsed.barcode || parsed.num,
      name: parsed.name1,
      unit: parsed.unit,
      price: parsed.sellPr1,
      syncedAt: now
    });
    updated += 1;
  }
  return updated;
}

function addProductByBarcode(sectionId, code) {
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
    name: material.name,
    unit: material.unit,
    price: material.price,
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

module.exports = {
  UPLOAD_ROOT,
  listProducts,
  getProduct,
  lookupByBarcode,
  findEdariMaterialByCode,
  addProductByBarcode,
  createProduct,
  updateProduct,
  deleteProduct,
  saveProductImage,
  syncMaterialsFromEdari
};
