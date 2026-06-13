const express = require('express');
const { authSync } = require('../lib/auth');
const {
  importSyncData,
  startSyncSession,
  importSyncChunk,
  finishSyncSession,
  failSyncSession,
  getSyncStatus
} = require('../lib/accounts');
const { listCatalogRefreshCodes } = require('../lib/products');

const router = express.Router();
const VALID_KINDS = new Set(['accounts', 'journal', 'invoices', 'invoiceLines', 'products']);

router.post('/start', authSync, (req, res) => {
  try {
    const accountSeqs = Array.isArray(req.body?.accountSeqs) ? req.body.accountSeqs : [];
    const syncId = startSyncSession(accountSeqs);
    res.json({ ok: true, syncId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/chunk', authSync, (req, res) => {
  try {
    const { syncId, kind, rows = [], batch = 1, totalBatches = 1 } = req.body || {};
    if (!syncId) {
      return res.status(400).json({ ok: false, error: 'syncId مطلوب' });
    }
    if (!VALID_KINDS.has(kind)) {
      return res.status(400).json({ ok: false, error: 'نوع الدفعة غير صالح' });
    }
    if (!rows.length) {
      return res.json({ ok: true, imported: 0, batch, totalBatches, kind });
    }
    const result = importSyncChunk(kind, rows);
    res.json({ ok: true, ...result, batch, totalBatches, syncId });
  } catch (err) {
    if (req.body?.syncId) failSyncSession(req.body.syncId, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/finish', authSync, (req, res) => {
  try {
    const { syncId, stats = {} } = req.body || {};
    if (!syncId) {
      return res.status(400).json({ ok: false, error: 'syncId مطلوب' });
    }
    const result = finishSyncSession(syncId, stats);
    res.json({ ok: true, ...result, status: getSyncStatus() });
  } catch (err) {
    if (req.body?.syncId) failSyncSession(req.body.syncId, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/catalog-product-codes', authSync, (_req, res) => {
  try {
    const result = listCatalogRefreshCodes();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/push', authSync, (req, res) => {
  try {
    const {
      accounts = [],
      journal = [],
      invoices = [],
      invoiceLines = [],
      products = [],
      accountSeqs = []
    } = req.body || {};
    if (!accounts.length) {
      return res.status(400).json({ ok: false, error: 'لا توجد حسابات للرفع' });
    }
    const result = importSyncData({
      accounts,
      journal,
      invoices,
      invoiceLines,
      products,
      accountSeqs
    });
    res.json({ ok: true, ...result, status: getSyncStatus() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/status', authSync, (_req, res) => {
  res.json({ ok: true, ...getSyncStatus() });
});

module.exports = router;
