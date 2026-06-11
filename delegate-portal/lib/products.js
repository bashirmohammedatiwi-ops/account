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
    ...extras
  };
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

function normalizeCode(code) {
  return String(code ?? '').trim();
}

function lookupByBarcode(code, { branchId, activeOnly = true } = {}) {
  const raw = normalizeCode(code);
  if (!raw) return null;

  let row = db.prepare(`
    SELECT p.* FROM products p
    JOIN catalog_sections s ON s.id = p.section_id
    WHERE (p.barcode = ? OR p.sku_num = ?)
    ${branchId ? 'AND s.branch_id = ?' : ''}
    ${activeOnly ? 'AND p.is_active = 1 AND s.is_active = 1' : ''}
    ORDER BY p.id
    LIMIT 1
  `).get(...(branchId ? [raw, raw, branchId] : [raw, raw]));

  if (!row) {
    row = db.prepare(`
      SELECT p.* FROM products p
      WHERE (p.barcode LIKE ? OR p.sku_num LIKE ? OR p.name LIKE ?)
      ${activeOnly ? 'AND p.is_active = 1' : ''}
      ORDER BY p.id LIMIT 1
    `).get(raw, raw, `%${raw}%`);
  }

  return row ? getProduct(row.id) : null;
}

function createProduct(data) {
  const r = db.prepare(`
    INSERT INTO products
      (section_id, edari_seq, sku_num, barcode, name, unit, price, bonus_default, is_active, sort_order, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
    data.sortOrder || 0
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

function importFromInvoiceLines(sectionId) {
  const rows = db.prepare(`
    SELECT DISTINCT mat_num, mat, mat_name, price
    FROM invoice_lines
    WHERE mat_name IS NOT NULL AND mat_name != ''
    ORDER BY mat_name
  `).all();

  const insert = db.prepare(`
    INSERT INTO products (section_id, sku_num, barcode, name, unit, price, is_active, sort_order, updated_at)
    SELECT ?, ?, ?, ?, '', ?, 1, 0, datetime('now')
    WHERE NOT EXISTS (
      SELECT 1 FROM products WHERE section_id = ? AND (barcode = ? OR sku_num = ? OR name = ?)
    )
  `);

  let imported = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const sku = String(row.mat_num || row.mat || '').trim();
      const barcode = sku;
      const name = String(row.mat_name || '').trim();
      if (!name) continue;
      const price = Number(row.price || 0);
      const r = insert.run(sectionId, sku, barcode, name, price, sectionId, barcode, sku, name);
      imported += r.changes;
    }
  });
  tx();
  return { imported, scanned: rows.length };
}

function upsertProductFromSync(row, sectionId) {
  const barcode = String(row.Barcode || row.barcode || row.Num || row.num || '').trim();
  const sku = String(row.Num || row.num || barcode).trim();
  const name = String(row.Name1 || row.name || '').trim();
  if (!name) return null;

  const existing = db.prepare(`
    SELECT id FROM products WHERE edari_seq = ? OR barcode = ? OR sku_num = ?
  `).get(String(row.Seq || row.seq || ''), barcode, sku);

  const payload = {
    sectionId,
    edariSeq: String(row.Seq || row.seq || ''),
    skuNum: sku,
    barcode: barcode || sku,
    name,
    unit: String(row.DefUnit || row.unit || ''),
    price: Number(row.SellPr1 || row.price || 0),
    isActive: true
  };

  if (existing) return updateProduct(existing.id, payload);
  return createProduct(payload);
}

function getDefaultSectionId() {
  const row = db.prepare(`
    SELECT s.id FROM catalog_sections s
    JOIN catalog_branches b ON b.id = s.branch_id
    WHERE s.is_active = 1 AND b.is_active = 1
    ORDER BY b.sort_order, s.sort_order, s.id
    LIMIT 1
  `).get();
  return row?.id || null;
}

function importProductsFromSync(rows = []) {
  const sectionId = getDefaultSectionId();
  if (!sectionId || !rows.length) return { imported: 0, scanned: rows.length };
  let imported = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      if (upsertProductFromSync(row, sectionId)) imported += 1;
    }
  });
  tx();
  return { imported, scanned: rows.length };
}

module.exports = {
  UPLOAD_ROOT,
  listProducts,
  getProduct,
  lookupByBarcode,
  createProduct,
  updateProduct,
  deleteProduct,
  saveProductImage,
  importFromInvoiceLines,
  upsertProductFromSync,
  importProductsFromSync
};
