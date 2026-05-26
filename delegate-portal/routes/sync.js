const express = require('express');
const { authSync } = require('../lib/auth');
const { importSyncData, getSyncStatus } = require('../lib/accounts');

const router = express.Router();

router.post('/push', authSync, (req, res) => {
  try {
    const {
      accounts = [],
      journal = [],
      invoices = [],
      invoiceLines = []
    } = req.body || {};
    if (!accounts.length) {
      return res.status(400).json({ ok: false, error: 'لا توجد حسابات للرفع' });
    }
    const result = importSyncData({ accounts, journal, invoices, invoiceLines });
    res.json({ ok: true, ...result, status: getSyncStatus() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/status', authSync, (_req, res) => {
  res.json({ ok: true, ...getSyncStatus() });
});

module.exports = router;
