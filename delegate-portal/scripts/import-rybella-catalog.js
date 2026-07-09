/**
 * Import Rybella catalog into portal.db
 * - brand → catalog_branches
 * - categories → catalog_sections (as-is)
 * - each variant barcode → product (Edari wholesale + stock when available)
 * - multi-shade products share group_key + shade_name/color_code
 *
 * Usage:
 *   node scripts/import-rybella-catalog.js
 *   node scripts/import-rybella-catalog.js --dry-run
 *   node scripts/import-rybella-catalog.js --purge-branch
 */
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const ROOT = path.join(__dirname, '..');
const CATALOG_JSON = path.join(ROOT, '_rybella-backup-tmp', 'catalog.json');
const BACKUP_UPLOADS = path.join(ROOT, '_rybella-backup-tmp', 'uploads');
const PORTAL_UPLOADS = path.join(ROOT, 'uploads');
const DB_PATH = path.resolve(process.env.DATABASE_PATH || path.join(ROOT, 'data', 'portal.db'));

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const PURGE = args.has('--purge-branch');

function slugify(name) {
  return String(name || 'brand')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u0600-\u06ff-]/gi, '')
    || 'brand';
}

function extFromUrl(url) {
  const m = String(url || '').match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

function resolveBackupImage(url) {
  if (!url) return null;
  const rel = String(url).replace(/^\/uploads\//, '').replace(/^\//, '');
  const full = path.join(BACKUP_UPLOADS, rel);
  if (fs.existsSync(full)) return full;
  const flat = path.join(BACKUP_UPLOADS, path.basename(rel));
  return fs.existsSync(flat) ? flat : null;
}

function copyProductImage(productId, sourceUrl) {
  const src = resolveBackupImage(sourceUrl);
  if (!src) return '';
  const ext = extFromUrl(src);
  const destDir = path.join(PORTAL_UPLOADS, 'products');
  fs.mkdirSync(destDir, { recursive: true });
  const rel = `products/${productId}.${ext}`;
  if (!DRY) fs.copyFileSync(src, path.join(PORTAL_UPLOADS, rel));
  return rel;
}

function edariWholesale(row) {
  const p1 = Number(row.sell_pr1 || 0);
  if (p1 > 0) return p1;
  const p5 = Number(row.sell_pr5 || 0);
  return p5 > 0 ? p5 : 0;
}

function edariStock(row) {
  return Number(row.in_tot || 0) - Number(row.out_tot || 0);
}

function findMaterial(db, barcode) {
  const code = String(barcode || '').trim();
  if (!code) return null;
  const stmt = db.prepare(`
    SELECT * FROM edari_materials
    WHERE barcode = $c OR num = $c OR seq = $c
    LIMIT 1
  `);
  stmt.bind({ $c: code });
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return row;
}

function getScalar(db, sql, params = {}) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const ok = stmt.step();
  const row = ok ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function run(db, sql, params = {}) {
  db.run(sql, params);
}

function tableExists(db, name) {
  return !!getScalar(db, "SELECT name FROM sqlite_master WHERE type='table' AND name=$n", { $n: name });
}

function ensureShadeColumns(db) {
  if (!tableExists(db, 'products')) return;
  const cols = [];
  const stmt = db.prepare('PRAGMA table_info(products)');
  while (stmt.step()) cols.push(stmt.getAsObject().name);
  stmt.free();
  const need = [
    ['shade_name', "TEXT DEFAULT ''"],
    ['color_code', "TEXT DEFAULT ''"],
    ['group_key', "TEXT DEFAULT ''"],
    ['price_override', 'INTEGER DEFAULT 0'],
    ['description', "TEXT DEFAULT ''"],
    ['min_order_qty', 'REAL DEFAULT 0']
  ];
  for (const [col, type] of need) {
    if (!cols.includes(col)) {
      run(db, `ALTER TABLE products ADD COLUMN ${col} ${type}`);
      console.log('Added column', col);
    }
  }
  run(db, 'CREATE INDEX IF NOT EXISTS idx_products_group_key ON products(group_key)');
}

function ensureCommerceSchema(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS catalog_branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      image_path TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS catalog_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_catalog_sections_branch ON catalog_sections(branch_id)`,
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      edari_seq TEXT,
      sku_num TEXT,
      barcode TEXT,
      name TEXT NOT NULL,
      unit TEXT DEFAULT '',
      price REAL DEFAULT 0,
      bonus_default REAL DEFAULT 0,
      image_path TEXT,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      synced_at TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      price_override INTEGER DEFAULT 0,
      description TEXT DEFAULT '',
      min_order_qty REAL DEFAULT 0,
      shade_name TEXT DEFAULT '',
      color_code TEXT DEFAULT '',
      group_key TEXT DEFAULT '',
      FOREIGN KEY (section_id) REFERENCES catalog_sections(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_products_section ON products(section_id)`,
    `CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`,
    `CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku_num)`,
    `CREATE INDEX IF NOT EXISTS idx_products_edari_seq ON products(edari_seq)`,
    `CREATE INDEX IF NOT EXISTS idx_products_group_key ON products(group_key)`,
    `CREATE TABLE IF NOT EXISTS edari_materials (
      seq TEXT PRIMARY KEY,
      num TEXT,
      barcode TEXT,
      name1 TEXT NOT NULL,
      name2 TEXT,
      unit TEXT DEFAULT '',
      sell_pr1 REAL DEFAULT 0,
      sell_pr2 REAL DEFAULT 0,
      sell_pr3 REAL DEFAULT 0,
      sell_pr5 REAL DEFAULT 0,
      bonus REAL DEFAULT 0,
      in_tot REAL DEFAULT 0,
      out_tot REAL DEFAULT 0,
      remarks TEXT,
      synced_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_edari_materials_barcode ON edari_materials(barcode)`,
    `CREATE INDEX IF NOT EXISTS idx_edari_materials_num ON edari_materials(num)`,
    `CREATE TABLE IF NOT EXISTS order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      product_id INTEGER,
      barcode TEXT,
      mat_name TEXT,
      quant REAL DEFAULT 0,
      bonus REAL DEFAULT 0,
      unit_price REAL DEFAULT 0,
      line_total REAL DEFAULT 0,
      remarks TEXT
    )`
  ];
  for (const sql of statements) run(db, sql);
  ensureShadeColumns(db);
}

async function main() {
  if (!fs.existsSync(CATALOG_JSON)) {
    console.error('Missing catalog.json — run extract-rybella-catalog.js first');
    process.exit(1);
  }
  if (!fs.existsSync(DB_PATH)) {
    console.error('Missing portal.db at', DB_PATH);
    process.exit(1);
  }

  const catalogFile = JSON.parse(fs.readFileSync(CATALOG_JSON, 'utf8'));
  const catalog = catalogFile.catalog || [];
  console.log(`Catalog: ${catalog.length} products, DB: ${DB_PATH}${DRY ? ' (dry-run)' : ''}`);

  const SQL = await initSqlJs();
  const fileBuf = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(fileBuf);
  db.run('PRAGMA foreign_keys = ON');
  ensureCommerceSchema(db);
  console.log('Commerce schema ready. edari_materials:',
    getScalar(db, 'SELECT COUNT(*) AS c FROM edari_materials')?.c ?? 0);

  const brandName = catalogFile.brands?.[0]?.name || 'rybella';
  const brandCode = slugify(brandName);
  const brandLogo = catalogFile.brands?.[0]?.logo || '';

  let branch = getScalar(db, `
    SELECT * FROM catalog_branches
    WHERE lower(code) = lower($c) OR lower(name) = lower($n)
  `, { $c: brandCode, $n: brandName });

  if (!branch) {
    console.log('Creating branch', brandName);
    if (!DRY) {
      run(db, 'INSERT INTO catalog_branches (code, name, sort_order, is_active) VALUES ($c, $n, 1, 1)', {
        $c: brandCode,
        $n: brandName
      });
      branch = getScalar(db, 'SELECT * FROM catalog_branches WHERE code = $c', { $c: brandCode });
      if (brandLogo) {
        const logoSrc = resolveBackupImage(brandLogo);
        if (logoSrc) {
          const ext = extFromUrl(logoSrc);
          const rel = `branches/${branch.id}.${ext}`;
          fs.mkdirSync(path.join(PORTAL_UPLOADS, 'branches'), { recursive: true });
          fs.copyFileSync(logoSrc, path.join(PORTAL_UPLOADS, rel));
          run(db, 'UPDATE catalog_branches SET image_path = $p WHERE id = $id', { $p: rel, $id: branch.id });
        }
      }
    } else {
      branch = { id: -1, name: brandName, code: brandCode };
    }
  } else {
    console.log('Using existing branch', branch.id, branch.name);
  }

  const branchId = branch.id;

  if (PURGE && !DRY && branchId > 0) {
    console.log('Purging products in branch', branchId);
    const ids = [];
    const s = db.prepare(`
      SELECT p.id, p.image_path FROM products p
      JOIN catalog_sections sec ON sec.id = p.section_id
      WHERE sec.branch_id = $b
    `);
    s.bind({ $b: branchId });
    while (s.step()) ids.push(s.getAsObject());
    s.free();
    for (const row of ids) {
      try {
        run(db, 'UPDATE order_lines SET product_id = NULL WHERE product_id = $id', { $id: row.id });
      } catch { /* ignore */ }
      run(db, 'DELETE FROM products WHERE id = $id', { $id: row.id });
      if (row.image_path) {
        const full = path.join(PORTAL_UPLOADS, row.image_path);
        if (fs.existsSync(full)) fs.unlinkSync(full);
      }
    }
    console.log('Deleted', ids.length, 'products');
  }

  const sectionByCat = new Map();
  const categories = (catalogFile.categories || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  for (const cat of categories) {
    let sec = getScalar(db, `
      SELECT * FROM catalog_sections WHERE branch_id = $b AND name = $n
    `, { $b: branchId, $n: cat.name });
    if (!sec && !DRY) {
      run(db, `
        INSERT INTO catalog_sections (branch_id, name, sort_order, is_active)
        VALUES ($b, $n, $o, 1)
      `, { $b: branchId, $n: cat.name, $o: cat.sortOrder || 0 });
      sec = getScalar(db, `
        SELECT * FROM catalog_sections WHERE branch_id = $b AND name = $n
      `, { $b: branchId, $n: cat.name });
      console.log('Created section', cat.name, '→', sec.id);
    } else if (sec) {
      console.log('Section', cat.name, '→', sec.id);
    } else {
      sec = { id: -(cat.id), name: cat.name };
    }
    sectionByCat.set(cat.id, sec);
    sectionByCat.set(cat.name, sec);
  }

  const stats = {
    created: 0,
    skippedDup: 0,
    missingEdari: 0,
    fromEdari: 0,
    fromFallback: 0,
    images: 0,
    shadeGroups: 0,
    errors: []
  };

  if (!DRY) db.run('BEGIN');

  for (const item of catalog) {
    const section = sectionByCat.get(item.categoryId) || sectionByCat.get(item.categoryName);
    if (!section) {
      stats.errors.push({ name: item.name, error: 'no section' });
      continue;
    }
    const sectionId = section.id;
    const hasShades = !!(item.hasShades && item.variants.some((v) => v.shadeName));
    const multi = item.variants.length > 1 && item.variants.some((v) => v.shadeName);
    const groupKey = (hasShades || multi) ? `rybella-${item.rybellaProductId}` : '';
    if (groupKey) stats.shadeGroups += 1;

    const baseName = String(item.name || '').trim();
    const sortBase = Number(item.sortOrder || 0) * 100;

    for (let i = 0; i < item.variants.length; i += 1) {
      const v = item.variants[i];
      const barcode = String(v.barcode || '').trim();
      if (!barcode) continue;

      const dup = getScalar(db, `
        SELECT id FROM products
        WHERE section_id = $s AND (barcode = $b OR sku_num = $b)
      `, { $s: sectionId, $b: barcode });
      if (dup) {
        stats.skippedDup += 1;
        continue;
      }

      const mat = findMaterial(db, barcode);
      let price = 0;
      let qty = 0;
      let edariSeq = '';
      let skuNum = barcode;
      let unit = '';
      let bonus = 0;
      let syncedAt = null;
      let fromEdari = false;

      if (mat) {
        fromEdari = true;
        price = edariWholesale(mat);
        qty = edariStock(mat);
        edariSeq = String(mat.seq || '');
        skuNum = String(mat.num || barcode);
        unit = String(mat.unit || '');
        bonus = Number(mat.bonus || 0);
        syncedAt = mat.synced_at || new Date().toISOString();
      } else {
        price = Number(v.syncPriceHint || 0) > 0
          ? Number(v.syncPriceHint)
          : Number(v.retailPriceHint || 0);
        qty = Number(v.stockHint || 0);
        stats.missingEdari += 1;
      }

      const shadeName = (hasShades || multi) ? String(v.shadeName || '').trim() : '';
      const colorCode = (hasShades || multi) ? String(v.colorCode || '').trim() : '';
      const displayName = shadeName && !baseName.includes(shadeName)
        ? `${baseName} - ${shadeName}`
        : baseName;

      if (DRY) {
        stats.created += 1;
        if (fromEdari) stats.fromEdari += 1;
        else stats.fromFallback += 1;
        continue;
      }

      run(db, `
        INSERT INTO products (
          section_id, edari_seq, sku_num, barcode, name, unit, price, bonus_default,
          price_override, description, min_order_qty, shade_name, color_code, group_key,
          is_active, sort_order, synced_at, updated_at
        ) VALUES (
          $sectionId, $seq, $num, $barcode, $name, $unit, $price, $bonus,
          0, $desc, $qty, $shade, $color, $group,
          1, $sort, $synced, datetime('now')
        )
      `, {
        $sectionId: sectionId,
        $seq: edariSeq,
        $num: skuNum,
        $barcode: barcode,
        $name: displayName,
        $unit: unit,
        $price: price,
        $bonus: bonus,
        $desc: String(item.description || '').slice(0, 4000),
        $qty: qty,
        $shade: shadeName,
        $color: colorCode,
        $group: groupKey,
        $sort: sortBase + i,
        $synced: syncedAt
      });

      const created = getScalar(db, 'SELECT last_insert_rowid() AS id');
      const productId = created.id;
      stats.created += 1;
      if (fromEdari) stats.fromEdari += 1;
      else stats.fromFallback += 1;

      const imagePath = copyProductImage(productId, v.image || item.mainImage);
      if (imagePath) {
        run(db, 'UPDATE products SET image_path = $p WHERE id = $id', { $p: imagePath, $id: productId });
        stats.images += 1;
      }
    }
  }

  if (!DRY) {
    db.run('COMMIT');
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    for (const suffix of ['-wal', '-shm']) {
      const p = DB_PATH + suffix;
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch { /* ignore */ }
      }
    }
  }

  db.close();

  console.log('\n=== Import summary ===');
  console.log(JSON.stringify({
    branch: { id: branchId, name: brandName },
    sections: categories.map((c) => c.name),
    ...stats,
    errorSample: stats.errors.slice(0, 10)
  }, null, 2));

  if (stats.missingEdari) {
    console.log(`\nNote: ${stats.missingEdari} barcodes were not in edari_materials.`);
    console.log('Prices/qty used Rybella sync fallback. After Edari sync, use admin «تحديث من Edari».');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
