/**
 * Enrich portal products stock/price from Rybella inventory_sync_snapshots
 * when edari_materials is empty.
 */
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const ROOT = path.join(__dirname, '..');
const SQL_PATH = path.join(ROOT, '_rybella-backup-tmp', 'rybella.sql');
const DB_PATH = path.resolve(process.env.DATABASE_PATH || path.join(ROOT, 'data', 'portal.db'));

function parseCopyBlock(sql, tableName) {
  const marker = `COPY public.${tableName} (`;
  const start = sql.indexOf(marker);
  if (start < 0) return [];
  const headerEnd = sql.indexOf(') FROM stdin;', start);
  const cols = sql.slice(start + marker.length, headerEnd).split(',').map((c) => c.trim());
  let i = headerEnd + ') FROM stdin;'.length;
  while (i < sql.length && (sql[i] === '\r' || sql[i] === '\n')) i += 1;
  const end = sql.indexOf('\n\\.\n', i);
  const body = end > 0 ? sql.slice(i, end) : sql.slice(i);
  return body.split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split('\t');
    const obj = {};
    cols.forEach((c, idx) => {
      obj[c] = parts[idx] === '\\N' ? null : parts[idx];
    });
    return obj;
  });
}

(async () => {
  const dump = fs.readFileSync(SQL_PATH, 'utf8');
  const snaps = parseCopyBlock(dump, 'inventory_sync_snapshots');
  const byBc = new Map();
  for (const s of snaps) {
    const bc = String(s.barcode || '').trim();
    if (!bc) continue;
    byBc.set(bc, {
      price: Number(s.price || 0),
      stock: Number(s.stock || 0),
      name: s.name || ''
    });
  }
  console.log('snapshots', byBc.size);

  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));
  let updated = 0;
  const stmt = db.prepare('SELECT id, barcode, price, min_order_qty FROM products');
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();

  db.run('BEGIN');
  for (const row of rows) {
    const hit = byBc.get(String(row.barcode || '').trim());
    if (!hit) continue;
    // Prefer inventory stock; keep existing price if already set from sync_price
    const stock = hit.stock;
    db.run('UPDATE products SET min_order_qty = $q, updated_at = datetime(\'now\') WHERE id = $id', {
      $q: stock,
      $id: row.id
    });
    updated += 1;
  }
  db.run('COMMIT');
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  db.close();
  console.log('Updated stock for', updated, 'products');
})();
