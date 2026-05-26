require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(process.env.DATABASE_PATH || './data/portal.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function columnExists(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function migrateSchema() {
  const journalExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='journal'
  `).get();
  if (journalExists) {
    if (!columnExists('journal', 'bill_seq')) {
      db.exec('ALTER TABLE journal ADD COLUMN bill_seq TEXT');
    }
    if (!columnExists('journal', 'bill_kind')) {
      db.exec('ALTER TABLE journal ADD COLUMN bill_kind TEXT');
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_journal_bill ON journal(bill_seq)');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      seq TEXT PRIMARY KEY,
      num TEXT,
      kind TEXT,
      inv_date TEXT,
      total REAL DEFAULT 0,
      payment REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      line_count INTEGER DEFAULT 0,
      remarks TEXT,
      acc_seq TEXT,
      synced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_invoices_num ON invoices(num);
    CREATE TABLE IF NOT EXISTS invoice_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_seq TEXT NOT NULL,
      bill_no INTEGER,
      mat TEXT,
      mat_name TEXT,
      quant REAL DEFAULT 0,
      price REAL DEFAULT 0,
      kind TEXT,
      UNIQUE(bill_seq, bill_no, mat)
    );
    CREATE INDEX IF NOT EXISTS idx_invoice_lines_bill ON invoice_lines(bill_seq);
  `);
  if (columnExists('invoice_lines', 'id')) {
    if (!columnExists('invoice_lines', 'mat_num')) {
      db.exec('ALTER TABLE invoice_lines ADD COLUMN mat_num TEXT');
    }
    if (!columnExists('invoice_lines', 'bonus')) {
      db.exec('ALTER TABLE invoice_lines ADD COLUMN bonus REAL DEFAULT 0');
    }
    if (!columnExists('invoice_lines', 'line_total')) {
      db.exec('ALTER TABLE invoice_lines ADD COLUMN line_total REAL DEFAULT 0');
    }
    if (!columnExists('invoice_lines', 'remarks')) {
      db.exec('ALTER TABLE invoice_lines ADD COLUMN remarks TEXT');
    }
  }
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      seq TEXT PRIMARY KEY,
      num TEXT NOT NULL,
      name1 TEXT,
      name2 TEXT,
      master_seq TEXT,
      sub_count INTEGER DEFAULT 0,
      bal REAL DEFAULT 0,
      tot1 REAL DEFAULT 0,
      tot2 REAL DEFAULT 0,
      address TEXT,
      remarks TEXT,
      official_name TEXT,
      synced_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_master ON accounts(master_seq);
    CREATE INDEX IF NOT EXISTS idx_accounts_num ON accounts(num);

    CREATE TABLE IF NOT EXISTS journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seq TEXT NOT NULL,
      acc_seq TEXT NOT NULL,
      tx_date TEXT,
      am REAL DEFAULT 0,
      is_debit INTEGER DEFAULT 0,
      exp1 TEXT,
      bill_num TEXT,
      bill_seq TEXT,
      bill_kind TEXT,
      UNIQUE(seq, acc_seq)
    );

    CREATE INDEX IF NOT EXISTS idx_journal_acc ON journal(acc_seq);
    CREATE INDEX IF NOT EXISTS idx_journal_date ON journal(tx_date);

    CREATE TABLE IF NOT EXISTS invoices (
      seq TEXT PRIMARY KEY,
      num TEXT,
      kind TEXT,
      inv_date TEXT,
      total REAL DEFAULT 0,
      payment REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      line_count INTEGER DEFAULT 0,
      remarks TEXT,
      acc_seq TEXT,
      synced_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_num ON invoices(num);

    CREATE TABLE IF NOT EXISTS invoice_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_seq TEXT NOT NULL,
      bill_no INTEGER,
      mat TEXT,
      mat_num TEXT,
      mat_name TEXT,
      quant REAL DEFAULT 0,
      bonus REAL DEFAULT 0,
      price REAL DEFAULT 0,
      line_total REAL DEFAULT 0,
      remarks TEXT,
      kind TEXT,
      UNIQUE(bill_seq, bill_no, mat)
    );

    CREATE INDEX IF NOT EXISTS idx_invoice_lines_bill ON invoice_lines(bill_seq);

    CREATE TABLE IF NOT EXISTS agent_trees (
      agent_id INTEGER NOT NULL,
      account_seq TEXT NOT NULL,
      PRIMARY KEY (agent_id, account_seq),
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      FOREIGN KEY (account_seq) REFERENCES accounts(seq) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT,
      finished_at TEXT,
      status TEXT,
      accounts_count INTEGER DEFAULT 0,
      journal_count INTEGER DEFAULT 0,
      message TEXT
    );
  `);

  migrateSchema();

  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'admin123';
  const exists = db.prepare('SELECT id FROM admins WHERE username = ?').get(adminUser);
  if (!exists) {
    const hash = bcrypt.hashSync(adminPass, 10);
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(adminUser, hash);
    console.log(`Default admin created: ${adminUser}`);
  }
}

initSchema();

module.exports = db;
