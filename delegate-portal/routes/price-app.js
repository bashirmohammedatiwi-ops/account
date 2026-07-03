const express = require('express');
const path = require('path');
const {
  importEdariBatch,
  upsertPosItems,
  getStats,
  listProducts,
  getProductMovements,
} = require('../lib/price-catalog');

const router = express.Router();

function authPriceSync(req, res, next) {
  const expected = process.env.PRICE_SYNC_KEY || process.env.SYNC_API_KEY || '';
  const key = req.headers['x-sync-key'] || req.body?.syncKey || '';
  if (expected && key !== expected) {
    return res.status(403).json({ ok: false, error: 'مفتاح المزامنة غير صحيح' });
  }
  next();
}

router.get('/sync/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'price-app',
    time: new Date().toISOString(),
    pricingSource: 'pos',
    detailsSource: 'edari',
  });
});

router.post('/sync/edari', authPriceSync, (req, res) => {
  try {
    const products = Array.isArray(req.body?.products) ? req.body.products : [];
    const movements = Array.isArray(req.body?.movements) ? req.body.movements : [];
    const result = importEdariBatch({ products, movements });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/** pos-sync-desktop compatibility */
router.post('/sync/inventory/bulk', authPriceSync, (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const synced = upsertPosItems(items);
    res.json({
      ok: true,
      data: { synced, failed: Math.max(0, items.length - synced) },
      synced,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/sync/pos/bulk', authPriceSync, (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const synced = upsertPosItems(items);
    res.json({ ok: true, synced, failed: Math.max(0, items.length - synced) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/api/stats', (_req, res) => {
  try {
    res.json(getStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/products', (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const search = req.query.search || '';
    const offersOnly = req.query.offersOnly === 'true' || req.query.offersOnly === '1';
    res.json(listProducts({ page, limit, search, offersOnly }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/products/:barcode/movements', (req, res) => {
  try {
    const movements = getProductMovements(req.params.barcode);
    res.json({ barcode: req.params.barcode, movements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.use('/prices', express.static(path.join(__dirname, '..', 'public', 'prices')));
router.get('/prices/*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'prices', 'index.html'));
});

module.exports = router;
