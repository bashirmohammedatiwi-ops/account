const fs = require('fs');
const path = require('path');
const db = require('./db');
const { getSection } = require('./catalog');
const {
  resolveMaterialTree: resolveMaterialTreeInIndex,
  getMaterialDescendantLeafSeqs: getMaterialDescendantLeafSeqsFromNodes
} = require('./material-tree-utils');

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

/** سعر الجملة في Edari = SellPr1 (وليس SellPr2 نصف الجملة ولا SellPr3). */
function edariWholesalePrice(sellPr1, _sellPr2, _sellPr3, sellPr5) {
  const wholesale = Number(sellPr1);
  if (wholesale > 0) return wholesale;
  const alt = Number(sellPr5);
  if (alt > 0) return alt;
  return 0;
}

function wholesaleFromEdariRow(row) {
  if (!row || typeof row !== 'object') return 0;
  const sellPr1 = Number(row.SellPr1 ?? row.sell_pr1 ?? row.priceRetail ?? 0);
  const sellPr5 = Number(row.SellPr5 ?? row.sell_pr5 ?? 0);
  return edariWholesalePrice(sellPr1, 0, 0, sellPr5);
}

/**
 * Normalize File13n rows before catalog sync.
 * Clears SellPr2 in the payload so legacy servers (that used half-wholesale) pick SellPr1.
 */
function prepareEdariRowsForCatalogSync(rows = []) {
  return rows.map((row) => {
    const wholesale = wholesaleFromEdariRow(row);
    const sellPr3 = Number(row.SellPr3 ?? row.sell_pr3 ?? 0);
    const sellPr5 = Number(row.SellPr5 ?? row.sell_pr5 ?? 0);
    return {
      ...row,
      SellPr1: wholesale,
      sell_pr1: wholesale,
      SellPr2: 0,
      sell_pr2: 0,
      SellPr3: sellPr3,
      sell_pr3: sellPr3,
      SellPr5: sellPr5,
      sell_pr5: sellPr5
    };
  });
}

/** Force products.price from edari_materials.sell_pr1 (wholesale). */
function applyWholesalePricesFromMaterials() {
  const rows = db.prepare(`
    SELECT p.id, m.sell_pr1, m.sell_pr3
    FROM products p
    INNER JOIN edari_materials m ON (
      (p.edari_seq != '' AND p.edari_seq = m.seq)
      OR (p.barcode != '' AND (p.barcode = m.barcode OR p.barcode = m.num))
      OR (p.sku_num != '' AND (p.sku_num = m.num OR p.sku_num = m.barcode))
    )
  `).all();
  let updated = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const wholesale = edariWholesalePrice(row.sell_pr1, 0, row.sell_pr3, 0);
      if (wholesale <= 0) continue;
      const result = db.prepare(`
        UPDATE products
        SET price = ?, price_override = 0, updated_at = datetime('now')
        WHERE id = ?
      `).run(wholesale, row.id);
      updated += result.changes || 0;
    }
  });
  tx();
  return updated;
}

/** رصيد المخزون في Edari = وارد − صادر */
function edariStockQty(inTot, outTot) {
  return Number(inTot || 0) - Number(outTot || 0);
}

function mapEdariMaterial(row) {
  if (!row) return null;
  const sellPr1 = Number(row.sell_pr1 ?? row.SellPr1 ?? 0);
  const sellPr2 = Number(row.sell_pr2 ?? row.SellPr2 ?? 0);
  const sellPr3 = Number(row.sell_pr3 ?? row.SellPr3 ?? 0);
  const sellPr5 = Number(row.sell_pr5 ?? row.SellPr5 ?? 0);
  const inTot = Number(row.in_tot ?? row.InTot ?? 0);
  const outTot = Number(row.out_tot ?? row.OutTot ?? 0);
  const stockQty = edariStockQty(inTot, outTot);
  return {
    seq: String(row.seq || row.Seq || ''),
    num: String(row.num || row.Num || ''),
    barcode: String(row.barcode || row.Barcode || row.num || row.Num || '').trim(),
    name: String(row.name1 || row.Name1 || ''),
    name2: String(row.name2 || row.Name2 || ''),
    unit: String(row.unit || row.DefUnit || ''),
    priceRetail: sellPr1,
    wholesalePrice: edariWholesalePrice(sellPr1, sellPr2, sellPr3, sellPr5),
    price: edariWholesalePrice(sellPr1, sellPr2, sellPr3, sellPr5),
    bonus: Number(row.bonus ?? row.Bonus ?? 0),
    inTot,
    outTot,
    stockQty,
    qty: stockQty,
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
    unit: String(row.Unt1 ?? row.DefUnit ?? row.unit ?? '').trim().replace(/^0$/, ''),
    sellPr1: Number(row.SellPr1 ?? row.price ?? 0),
    sellPr2: Number(row.SellPr2 ?? row.sell_pr2 ?? 0),
    sellPr3: Number(row.SellPr3 ?? row.sell_pr3 ?? 0),
    sellPr5: Number(row.SellPr5 ?? row.sell_pr5 ?? 0),
    bonus: Number(row.Bonus ?? row.bonus ?? 0),
    inTot: Number(row.InTot ?? row.in_tot ?? 0),
    outTot: Number(row.OutTot ?? row.out_tot ?? 0),
    stockQty: edariStockQty(row.InTot ?? row.in_tot, row.OutTot ?? row.out_tot),
    remarks: String(row.Remarks ?? row.remarks ?? '').trim(),
    fatherNum: String(row.Father ?? row.father ?? row.father_num ?? '0').trim() || '0',
    subCount: Number(row.SubCount ?? row.sub_count ?? 0)
  };
}

function upsertMaterialNode(row) {
  const parsed = parseEdariSyncRow(row);
  if (!parsed.seq || !parsed.num) return null;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO edari_material_nodes (seq, num, name1, name2, father_num, sub_count, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(seq) DO UPDATE SET
      num = excluded.num,
      name1 = excluded.name1,
      name2 = excluded.name2,
      father_num = excluded.father_num,
      sub_count = excluded.sub_count,
      synced_at = excluded.synced_at
  `).run(
    parsed.seq,
    parsed.num,
    parsed.name1,
    parsed.name2,
    parsed.fatherNum,
    parsed.subCount,
    now
  );
  return parsed;
}

function listMaterialTreeRoots() {
  return db.prepare(`
    SELECT seq, num, name1, sub_count, father_num
    FROM edari_material_nodes
    WHERE CAST(sub_count AS INTEGER) > 0
    ORDER BY CAST(num AS INTEGER), num
  `).all().map((t) => ({
    seq: t.seq,
    num: t.num || '',
    name1: t.name1 || '',
    subCount: Number(t.sub_count || 0),
    fatherNum: t.father_num || '0'
  }));
}

function loadMaterialNodesFromDb() {
  return db.prepare(`
    SELECT seq, num, name1, father_num, sub_count
    FROM edari_material_nodes
  `).all().map((n) => ({
    seq: n.seq,
    num: n.num,
    name1: n.name1,
    father_num: n.father_num,
    sub_count: n.sub_count
  }));
}

function resolveMaterialTree(ref) {
  const nodes = loadMaterialNodesFromDb();
  const index = require('./material-tree-utils').buildMaterialIndex(nodes);
  const hit = resolveMaterialTreeInIndex(ref, index);
  if (!hit) return null;
  return {
    seq: hit.seq,
    num: hit.num,
    name1: hit.name1,
    sub_count: hit.subCount,
    father_num: hit.fatherNum
  };
}

function getMaterialDescendantLeafSeqs(rootRef) {
  return getMaterialDescendantLeafSeqsFromNodes(rootRef, loadMaterialNodesFromDb());
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

function detachProductFromOrders(productId) {
  try {
    db.prepare('UPDATE order_lines SET product_id = NULL WHERE product_id = ?').run(productId);
  } catch {
    /* order_lines table may be absent on very old databases */
  }
}

function removeProductFiles(imagePath) {
  if (!imagePath) return;
  const full = path.join(UPLOAD_ROOT, imagePath);
  if (fs.existsSync(full)) fs.unlinkSync(full);
}

function removeProductRecord(id, imagePath = null) {
  const row = imagePath != null
    ? { image_path: imagePath }
    : db.prepare('SELECT image_path FROM products WHERE id = ?').get(id);
  if (!row) return false;
  removeProductFiles(row.image_path);
  detachProductFromOrders(id);
  return db.prepare('DELETE FROM products WHERE id = ?').run(id).changes > 0;
}

function deleteProduct(id) {
  return removeProductRecord(id);
}

function deleteProductsBySectionId(sectionId) {
  const rows = db.prepare('SELECT id, image_path FROM products WHERE section_id = ?').all(sectionId);
  if (!rows.length) return 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      removeProductRecord(row.id, row.image_path);
    }
  });
  tx();
  return rows.length;
}

function deleteProductsByBranchId(branchId) {
  const rows = db.prepare(`
    SELECT p.id, p.image_path FROM products p
    INNER JOIN catalog_sections s ON s.id = p.section_id
    WHERE s.branch_id = ?
  `).all(branchId);
  if (!rows.length) return 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      removeProductRecord(row.id, row.image_path);
    }
  });
  tx();
  return rows.length;
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
      (seq, num, barcode, name1, name2, unit, sell_pr1, sell_pr2, sell_pr3, bonus, in_tot, out_tot, remarks, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(seq) DO UPDATE SET
      num = excluded.num,
      barcode = excluded.barcode,
      name1 = excluded.name1,
      name2 = excluded.name2,
      unit = excluded.unit,
      sell_pr1 = excluded.sell_pr1,
      sell_pr2 = excluded.sell_pr2,
      sell_pr3 = excluded.sell_pr3,
      bonus = excluded.bonus,
      in_tot = excluded.in_tot,
      out_tot = excluded.out_tot,
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
    parsed.sellPr3,
    parsed.bonus,
    parsed.inTot,
    parsed.outTot,
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

/** Refresh catalog products linked to this Edari material (name, stock qty, wholesale price). */
function refreshRegisteredProductFromEdari(parsed) {
  const now = new Date().toISOString();
  let updated = 0;
  const wholesale = edariWholesalePrice(parsed.sellPr1, parsed.sellPr2, parsed.sellPr3, parsed.sellPr5);
  for (const id of findRegisteredProductIds(parsed)) {
    updateProduct(id, {
      edariSeq: parsed.seq,
      skuNum: parsed.num,
      barcode: parsed.barcode || parsed.num,
      name: parsed.name1,
      unit: parsed.unit,
      price: wholesale,
      minOrderQty: Number(parsed.stockQty) || 0,
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
    minOrderQty: Number(material.stockQty ?? material.qty) || 0,
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

function materialRowToParsed(row) {
  return {
    seq: row.seq,
    num: row.num,
    barcode: row.barcode,
    name1: row.name1,
    name2: row.name2 || '',
    unit: row.unit || '',
    sellPr1: Number(row.sell_pr1 ?? 0),
    sellPr2: Number(row.sell_pr2 ?? 0),
    sellPr3: Number(row.sell_pr3 ?? 0),
    sellPr5: Number(row.sell_pr5 ?? 0),
    bonus: Number(row.bonus ?? 0),
    inTot: Number(row.in_tot ?? 0),
    outTot: Number(row.out_tot ?? 0),
    stockQty: edariStockQty(row.in_tot, row.out_tot),
    remarks: row.remarks || ''
  };
}

/** Re-apply SellPr1 wholesale + stock to every catalog product linked in edari_materials. */
function refreshAllProductsFromEdariCache() {
  const materials = db.prepare('SELECT * FROM edari_materials').all();
  let productsUpdated = 0;
  const tx = db.transaction(() => {
    for (const row of materials) {
      productsUpdated += refreshRegisteredProductFromEdari(materialRowToParsed(row));
    }
  });
  tx();
  const pricesApplied = applyWholesalePricesFromMaterials();
  const total = db.prepare('SELECT COUNT(*) AS c FROM products').get()?.c || 0;
  return { updated: productsUpdated, pricesApplied, total, materials: materials.length, errors: [] };
}

function refreshCatalogPricesFromCache({ sectionId, branchId } = {}) {
  if (!sectionId && !branchId) {
    return refreshAllProductsFromEdariCache();
  }
  let sql = 'SELECT id FROM products WHERE 1=1';
  const params = [];
  if (sectionId) {
    sql += ' AND section_id = ?';
    params.push(sectionId);
  } else if (branchId) {
    sql += ' AND section_id IN (SELECT id FROM catalog_sections WHERE branch_id = ?)';
    params.push(branchId);
  }
  const rows = db.prepare(sql).all(...params);
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

function listCatalogRefreshCodes({ sectionId, branchId } = {}) {
  let sql = 'SELECT edari_seq, barcode, sku_num FROM products WHERE 1=1';
  const params = [];
  if (sectionId) {
    sql += ' AND section_id = ?';
    params.push(sectionId);
  } else if (branchId) {
    sql += ' AND section_id IN (SELECT id FROM catalog_sections WHERE branch_id = ?)';
    params.push(branchId);
  }
  const rows = db.prepare(sql).all(...params);
  const codes = new Set();
  for (const row of rows) {
    for (const value of [row.edari_seq, row.barcode, row.sku_num]) {
      const code = String(value || '').trim();
      if (code) codes.add(code);
    }
  }
  return { codes: [...codes], productCount: rows.length };
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

function normalizeClientMaterial(material, code = '') {
  if (!material?.seq) return null;
  const inTot = Number(material.inTot ?? 0);
  const outTot = Number(material.outTot ?? 0);
  const sellPr1 = Number(material.priceRetail ?? material.sellPr1 ?? 0);
  const sellPr2 = Number(material.sellPr2 ?? 0);
  const sellPr3 = Number(material.sellPr3 ?? 0);
  const sellPr5 = Number(material.sellPr5 ?? 0);
  const stockQty = Number(material.stockQty ?? material.qty ?? edariStockQty(inTot, outTot));
  const wholesale = edariWholesalePrice(sellPr1, sellPr2, sellPr3, sellPr5);
  return {
    seq: String(material.seq),
    num: String(material.num || ''),
    barcode: String(material.barcode || material.num || code).trim(),
    name: String(material.name || material.name1 || ''),
    name2: String(material.name2 || ''),
    unit: String(material.unit || ''),
    priceRetail: sellPr1,
    wholesalePrice: wholesale,
    price: wholesale,
    bonus: Number(material.bonus || 0),
    inTot,
    outTot,
    stockQty,
    qty: stockQty,
    remarks: String(material.remarks || ''),
    syncedAt: material.syncedAt || new Date().toISOString()
  };
}

function addProductByBarcode(sectionId, code, options = {}) {
  const raw = normalizeCode(code);
  if (!raw) throw new Error('الباركود مطلوب');

  const section = getSection(sectionId);
  if (!section) throw new Error('القسم غير موجود');

  if (options.material?.seq) cacheEdariMaterial(options.material);

  const material = normalizeClientMaterial(options.material, raw) || findEdariMaterialByCode(raw);
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

  const resolvedPrice = Number(options.price) > 0
    ? Number(options.price)
    : Number(material.wholesalePrice ?? material.price ?? 0);
  const resolvedQty = Number(options.minOrderQty) > 0
    ? Number(options.minOrderQty)
    : Number(material.stockQty ?? material.qty ?? 0);

  return createProduct({
    sectionId,
    edariSeq: material.seq,
    skuNum: material.num,
    barcode: material.barcode || material.num,
    name: String(options.name || '').trim() || material.name,
    unit: material.unit,
    price: resolvedPrice,
    bonusDefault: Number(material.bonus) || 0,
    priceOverride: false,
    description: material.remarks || '',
    minOrderQty: resolvedQty,
    sortOrder: Number(options.sortOrder || 0),
    isActive: options.isActive !== false,
    syncedAt: material.syncedAt || new Date().toISOString()
  });
}

/** Upsert one Edari material into local cache (from live ODBC lookup or API). */
function cacheEdariMaterial(material) {
  if (!material?.seq) return null;
  const wholesale = wholesaleFromEdariRow(material)
    || Number(material.wholesalePrice ?? material.price ?? 0);
  upsertEdariMaterial({
    Seq: material.seq,
    Num: material.num,
    Barcode: material.barcode || material.num,
    Name1: material.name,
    Name2: material.name2,
    Unt1: material.unit,
    DefUnit: material.unit,
    SellPr1: wholesale,
    SellPr2: 0,
    SellPr3: material.sellPr3 ?? 0,
    SellPr5: material.sellPr5 ?? 0,
    Bonus: material.bonus,
    InTot: material.inTot,
    OutTot: material.outTot,
    Remarks: material.remarks
  });
  return findEdariMaterialByCode(material.barcode || material.num || material.seq);
}

/** Sync File13n cache + refresh catalog products registered by barcode (no auto-import). */
function syncMaterialsFromEdari(rows = []) {
  if (!rows.length) return { materials: 0, nodes: 0, productsUpdated: 0, scanned: 0, pricesApplied: 0 };

  const prepared = prepareEdariRowsForCatalogSync(rows);
  let materials = 0;
  let nodes = 0;
  let productsUpdated = 0;
  const tx = db.transaction(() => {
    for (const row of prepared) {
      const parsed = parseEdariSyncRow(row);
      if (!parsed?.seq) continue;
      if (Number(parsed.subCount || 0) > 0) {
        if (upsertMaterialNode(row)) nodes += 1;
        continue;
      }
      const material = upsertEdariMaterial(row);
      if (!material) continue;
      materials += 1;
      productsUpdated += refreshRegisteredProductFromEdari(material);
    }
  });
  tx();
  const pricesApplied = applyWholesalePricesFromMaterials();
  return { materials, nodes, productsUpdated, pricesApplied, scanned: rows.length };
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
  cacheEdariMaterial,
  addProductByBarcode,
  bulkAddByBarcode,
  bulkProductsAction,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteProductsBySectionId,
  deleteProductsByBranchId,
  deleteProductImage,
  saveProductImage,
  syncProductFromEdari,
  syncSectionFromEdari,
  syncMaterialsFromEdari,
  listMaterialTreeRoots,
  resolveMaterialTree,
  getMaterialDescendantLeafSeqs,
  refreshCatalogPricesFromCache,
  refreshAllProductsFromEdariCache,
  listCatalogRefreshCodes,
  purgeAllCatalogProducts,
  reorderProducts,
  importProductsRows,
  exportProductsCsv
};
