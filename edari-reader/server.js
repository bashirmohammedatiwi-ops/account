const express = require('express');
const path = require('path');
const config = require('./lib/config');
const scanner = require('./lib/scanner');
const odbcBridge = require('./lib/odbc-bridge');
const nexusAdmin = require('./lib/nexus-admin');
const dashboard = require('./lib/dashboard');
const fieldLabels = require('./lib/field-labels');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', async (_req, res) => {
  try {
    const [server, drivers, aliases, databases] = await Promise.all([
      nexusAdmin.getServerStatus(),
      odbcBridge.detectDrivers(),
      nexusAdmin.fetchAliases().catch(() => []),
      Promise.resolve(scanner.listDatabases(config.dataRoot))
    ]);

    res.json({
      ok: true,
      config: {
        edariRoot: config.edariRoot,
        dataRoot: config.dataRoot,
        nexusAdminUrl: config.nexusAdminUrl,
        defaultServer: config.defaultServer,
        defaultPort: config.defaultPort
      },
      server,
      drivers,
      aliases,
      databases
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/databases', (_req, res) => {
  res.json({ ok: true, databases: scanner.listDatabases(config.dataRoot) });
});

app.get('/api/databases/:name/tables', (req, res) => {
  const dbPath = path.join(config.dataRoot, req.params.name);
  res.json({
    ok: true,
    database: req.params.name,
    path: dbPath,
    tables: scanner.listTables(dbPath),
    textFiles: scanner.listTextExports(dbPath)
  });
});

app.get('/api/databases/:name/text/:file', (req, res) => {
  try {
    const filePath = path.join(config.dataRoot, req.params.name, req.params.file);
    const data = scanner.readTextExport(filePath, Number(req.query.limit || 500));
    res.json({ ok: true, file: req.params.file, ...data });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/api/connection/test', async (req, res) => {
  try {
    const result = await odbcBridge.testConnection(normalizeConnection(req.body));
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/query', async (req, res) => {
  try {
    const result = await odbcBridge.runQuery(normalizeConnection(req.body));
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

function connFromQuery(q) {
  return {
    alias: q.alias || '2025',
    server: q.server || config.defaultServer,
    port: Number(q.port || config.defaultPort)
  };
}

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const stats = await dashboard.getStats(connFromQuery(req.query));
    res.json({ ok: true, stats });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/dashboard/accounts', async (req, res) => {
  try {
    const rows = await dashboard.getAccountsTree(connFromQuery(req.query));
    res.json({ ok: true, rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/dashboard/materials', async (req, res) => {
  try {
    const rows = await dashboard.getMaterialsTree(connFromQuery(req.query), req.query.parent || '0');
    res.json({ ok: true, rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/dashboard/field-labels', (_req, res) => {
  res.json({ ok: true, ...fieldLabels });
});

app.get('/api/dashboard/items/export', async (req, res) => {
  try {
    const rows = await dashboard.exportItems(connFromQuery(req.query), {
      search: req.query.search || '',
      limit: Number(req.query.limit || 50000)
    });
    res.json({ ok: true, rows, count: rows.length });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/dashboard/items', async (req, res) => {
  try {
    const data = await dashboard.getItems(connFromQuery(req.query), {
      search: req.query.search || '',
      cursor: req.query.cursor || '0',
      limit: Number(req.query.limit || 50)
    });
    res.json({ ok: true, ...data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/dashboard/items/:seq', async (req, res) => {
  try {
    const item = await dashboard.getItemBySeq(connFromQuery(req.query), req.params.seq);
    res.json({ ok: true, item });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/dashboard/invoices', async (req, res) => {
  try {
    const data = await dashboard.getInvoices(connFromQuery(req.query), {
      search: req.query.search || '',
      cursor: req.query.cursor || '0',
      limit: Number(req.query.limit || 50)
    });
    res.json({ ok: true, ...data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/dashboard/invoices/:seq/lines', async (req, res) => {
  try {
    const rows = await dashboard.getInvoiceLines(connFromQuery(req.query), req.params.seq);
    res.json({ ok: true, rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/dashboard/receipts', async (req, res) => {
  try {
    const data = await dashboard.getReceipts(connFromQuery(req.query), {
      cursor: req.query.cursor || '0',
      limit: Number(req.query.limit || 50)
    });
    res.json({ ok: true, ...data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/dashboard/receipts/:id/items', async (req, res) => {
  try {
    const rows = await dashboard.getReceiptItems(connFromQuery(req.query), req.params.id);
    res.json({ ok: true, rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/dashboard/journal', async (req, res) => {
  try {
    const data = await dashboard.getJournal(connFromQuery(req.query), {
      cursor: req.query.cursor || '0',
      limit: Number(req.query.limit || 50)
    });
    res.json({ ok: true, ...data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/dashboard/cash', async (req, res) => {
  try {
    const rows = await dashboard.getCashUsers(connFromQuery(req.query));
    res.json({ ok: true, rows });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/dashboard/accounts/:seq', async (req, res) => {
  try {
    const account = await dashboard.getAccountBySeq(connFromQuery(req.query), req.params.seq);
    res.json({ ok: true, account });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/sql/tables', async (req, res) => {
  try {
    const result = await odbcBridge.listSqlTables(normalizeConnection(req.body));
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

function normalizeConnection(body = {}) {
  const mode = body.mode === 'internal' ? 'internal' : 'tcp';
  const databasePath = body.databasePath || path.join(config.dataRoot, body.database || '2025');

  return {
    mode,
    server: body.server || config.defaultServer,
    port: Number(body.port || config.defaultPort),
    alias: body.alias || body.database || '2025',
    databasePath,
    driver: body.driver || null,
    sql: body.sql
  };
}

app.listen(config.port, () => {
  console.log(`Edari Reader running at http://127.0.0.1:${config.port}`);
  console.log(`Data root: ${config.dataRoot}`);
});
