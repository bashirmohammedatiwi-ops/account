require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

require('./lib/db');

const adminRoutes = require('./routes/admin');
const syncRoutes = require('./routes/sync');
const mobileRoutes = require('./routes/mobile');
const delegateRoutes = require('./routes/delegate');

const app = express();
const PORT = Number(process.env.PORT || 5005);
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'edari-delegate-portal', time: new Date().toISOString() });
});

app.use('/api/admin', adminRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/mobile', mobileRoutes);
app.use('/api/delegate', delegateRoutes);

app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.get('/admin/*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.use('/m', express.static(path.join(__dirname, 'public', 'm')));
app.get('/m/*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'm', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Edari Delegate Portal: http://${HOST}:${PORT}/admin`);
  console.log(`Delegate mobile: http://${HOST}:${PORT}/m`);
  console.log(`Sync API key: ${process.env.SYNC_API_KEY || '(default)'}`);
});
