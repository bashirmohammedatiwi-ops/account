require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

require('./lib/db');

const adminRoutes = require('./routes/admin');
const syncRoutes = require('./routes/sync');
const mobileRoutes = require('./routes/mobile');
const delegateRoutes = require('./routes/delegate');
const commerceAdminRoutes = require('./routes/commerce-admin');
const commerceMobileRoutes = require('./routes/commerce-mobile');
const empRoutes = require('./routes/emp');
const integrationShorjaRoutes = require('./routes/integration-shorja');
const priceAppRoutes = require('./routes/price-app');
const { UPLOAD_ROOT } = require('./lib/products');

const app = express();
const PORT = Number(process.env.PORT || 5005);
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors({
  origin: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Sync-Key', 'x-sync-key'],
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS']
}));
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'edari-delegate-portal', time: new Date().toISOString() });
});

app.use('/api/admin', adminRoutes);
app.use('/api/admin', commerceAdminRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/mobile', mobileRoutes);
app.use('/api/mobile', commerceMobileRoutes);
app.use('/api/emp', empRoutes);
app.use('/api/integration', integrationShorjaRoutes);
app.use('/api/delegate', delegateRoutes);
app.use(priceAppRoutes);

app.use('/uploads', express.static(UPLOAD_ROOT, { maxAge: '7d' }));

app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.get('/admin/*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.use('/m', (req, res, next) => {
  if (/\.(css|js|html)$/i.test(req.path)) {
    res.set('Cache-Control', 'no-cache, must-revalidate');
  }
  next();
}, express.static(path.join(__dirname, 'public', 'm'), {
  etag: false,
  lastModified: false
}));
app.get('/m/*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'm', 'index.html'));
});

app.use('/emp', (req, res, next) => {
  if (/\.(css|js|html|json|webmanifest)$/i.test(req.path) || req.path === '/sw.js') {
    res.set('Cache-Control', 'no-cache, must-revalidate');
  }
  next();
}, express.static(path.join(__dirname, 'public', 'emp'), {
  etag: false,
  lastModified: false
}));
app.get('/emp/*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'emp', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: err.message || 'خطأ في السيرفر' });
});

app.listen(PORT, HOST, () => {
  const shorjaUrl = String(process.env.SHORJA_HUB_URL || '').trim();
  const syncKey = String(process.env.SYNC_API_KEY || '').trim();
  console.log(`Edari Delegate Portal: http://${HOST}:${PORT}/admin`);
  console.log(`Delegate mobile: http://${HOST}:${PORT}/m`);
  console.log(`Employee prep: http://${HOST}:${PORT}/emp`);
  console.log(`Employee Flutter app API: http://${HOST}:${PORT}/api/emp`);
  console.log(`Sync API key: ${syncKey || '(default)'}`);
  if (!shorjaUrl) {
    console.warn('[config] SHORJA_HUB_URL غير مضبوط — لن تصل طلبات «تم التجهيز» إلى أدمن الشورجة');
  } else {
    console.log(`Shorja hub (تم التجهيز → الأدمن): ${shorjaUrl}`);
  }
});
