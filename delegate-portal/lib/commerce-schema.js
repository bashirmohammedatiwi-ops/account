/** Commerce tables: catalog branches → sections → products, orders */
function migrateCommerceSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS catalog_branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      image_path TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS catalog_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_catalog_sections_branch ON catalog_sections(branch_id);

    CREATE TABLE IF NOT EXISTS products (
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
      FOREIGN KEY (section_id) REFERENCES catalog_sections(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_products_section ON products(section_id);
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku_num);
    CREATE INDEX IF NOT EXISTS idx_products_edari_seq ON products(edari_seq);

    CREATE TABLE IF NOT EXISTS edari_materials (
      seq TEXT PRIMARY KEY,
      num TEXT,
      barcode TEXT,
      name1 TEXT NOT NULL,
      name2 TEXT,
      unit TEXT DEFAULT '',
      sell_pr1 REAL DEFAULT 0,
      sell_pr2 REAL DEFAULT 0,
      bonus REAL DEFAULT 0,
      remarks TEXT,
      synced_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_edari_materials_barcode ON edari_materials(barcode);
    CREATE INDEX IF NOT EXISTS idx_edari_materials_num ON edari_materials(num);

    CREATE TABLE IF NOT EXISTS agent_catalog_branches (
      agent_id INTEGER NOT NULL,
      branch_id INTEGER NOT NULL,
      PRIMARY KEY (agent_id, branch_id),
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      FOREIGN KEY (branch_id) REFERENCES catalog_branches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      agent_id INTEGER NOT NULL,
      customer_acc_seq TEXT,
      catalog_branch_id INTEGER,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      total_qty REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      submitted_at TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (catalog_branch_id) REFERENCES catalog_branches(id)
    );

    CREATE INDEX IF NOT EXISTS idx_orders_agent ON orders(agent_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

    CREATE TABLE IF NOT EXISTS order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      barcode TEXT,
      mat_name TEXT NOT NULL,
      quant REAL DEFAULT 0,
      bonus REAL DEFAULT 0,
      unit_price REAL DEFAULT 0,
      line_total REAL DEFAULT 0,
      remarks TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE INDEX IF NOT EXISTS idx_order_lines_order ON order_lines(order_id);

    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      actor_type TEXT,
      actor_id TEXT,
      from_status TEXT,
      to_status TEXT,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
  `);

  migrateProductExtras(db);

  const branchCount = db.prepare('SELECT COUNT(*) AS c FROM catalog_branches').get().c;
  if (!branchCount) {
    db.prepare(`
      INSERT INTO catalog_branches (code, name, sort_order, is_active)
      VALUES ('main', 'الفرع الرئيسي', 1, 1)
    `).run();
    const branchId = db.prepare('SELECT id FROM catalog_branches LIMIT 1').get().id;
    db.prepare(`
      INSERT INTO catalog_sections (branch_id, name, sort_order, is_active)
      VALUES (?, 'عام', 1, 1)
    `).run(branchId);
  }

  const edariCols = [
    ['name2', 'TEXT'],
    ['sell_pr2', 'REAL DEFAULT 0'],
    ['bonus', 'REAL DEFAULT 0'],
    ['remarks', 'TEXT']
  ];
  for (const [col, type] of edariCols) {
    try {
      db.exec(`ALTER TABLE edari_materials ADD COLUMN ${col} ${type}`);
    } catch { /* exists */ }
  }
}

function columnExists(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function migrateProductExtras(db) {
  if (!columnExists(db, 'products', 'price_override')) {
    db.exec('ALTER TABLE products ADD COLUMN price_override INTEGER DEFAULT 0');
  }
  if (!columnExists(db, 'products', 'description')) {
    db.exec('ALTER TABLE products ADD COLUMN description TEXT DEFAULT \'\'');
  }
  if (!columnExists(db, 'products', 'min_order_qty')) {
    db.exec('ALTER TABLE products ADD COLUMN min_order_qty REAL DEFAULT 0');
  }
}

module.exports = { migrateCommerceSchema };
