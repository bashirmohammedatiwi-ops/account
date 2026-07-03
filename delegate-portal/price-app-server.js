/**
 * Standalone price-app server (port 5000).
 * POS → prices | Edari → names, stock, purchase movements
 *
 * Usage: node price-app-server.js
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const priceAppRoutes = require('./routes/price-app');

const app = express();
const PORT = Number(process.env.PRICE_APP_PORT || 5000);
const HOST = process.env.PRICE_APP_HOST || '0.0.0.0';

app.use(cors({
  origin: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Sync-Key', 'x-sync-key'],
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(priceAppRoutes);
app.get('/', (_req, res) => res.redirect('/prices/'));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: err.message || 'خطأ في السيرفر' });
});

app.listen(PORT, HOST, () => {
  console.log(`Price App: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/prices/`);
  console.log(`Sync health: http://localhost:${PORT}/sync/health`);
  console.log(`Price sync key: ${process.env.PRICE_SYNC_KEY || process.env.SYNC_API_KEY || '(none — open)'}`);
});
