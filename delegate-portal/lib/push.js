const https = require('https');
const db = require('./db');

function registerDevice({ ownerType, ownerId, token, platform, app = 'emp' }) {
  const t = String(token || '').trim();
  if (!t) throw new Error('رمز الجهاز مطلوب');
  const existing = db.prepare(`
    SELECT id FROM push_devices WHERE owner_type = ? AND owner_id = ? AND token = ?
  `).get(ownerType, String(ownerId), t);
  if (existing) {
    db.prepare(`
      UPDATE push_devices SET platform = ?, app = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(String(platform || 'android'), app, existing.id);
    return { id: existing.id, updated: true };
  }
  const r = db.prepare(`
    INSERT INTO push_devices (owner_type, owner_id, token, platform, app)
    VALUES (?, ?, ?, ?, ?)
  `).run(ownerType, String(ownerId), t, String(platform || 'android'), app);
  return { id: r.lastInsertRowid, updated: false };
}

function unregisterDevice({ ownerType, ownerId, token }) {
  const t = String(token || '').trim();
  if (!t) return { removed: 0 };
  const r = db.prepare(`
    DELETE FROM push_devices WHERE owner_type = ? AND owner_id = ? AND token = ?
  `).run(ownerType, String(ownerId), t);
  return { removed: r.changes };
}

function listEmployeeTokens() {
  return db.prepare(`
    SELECT token FROM push_devices
    WHERE owner_type = 'employee' AND app = 'emp'
  `).all().map((r) => r.token);
}

function sendFcm(tokens, { title, body, data = {} }) {
  const key = process.env.FCM_SERVER_KEY || '';
  const list = [...new Set((tokens || []).filter(Boolean))];
  if (!key || !list.length) return Promise.resolve({ sent: 0, skipped: true });

  const payload = JSON.stringify({
    registration_ids: list,
    notification: { title, body, sound: 'default' },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    priority: 'high'
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'fcm.googleapis.com',
      path: '/fcm/send',
      method: 'POST',
      headers: {
        Authorization: `key=${key}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          const parsed = raw ? JSON.parse(raw) : {};
          resolve({ sent: parsed.success || 0, failure: parsed.failure || 0, raw: parsed });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function notifyEmployees({ title, body, data = {} }) {
  const tokens = listEmployeeTokens();
  if (!tokens.length) return { sent: 0, skipped: true };
  try {
    return await sendFcm(tokens, { title, body, data });
  } catch (err) {
    console.error('[push] notifyEmployees failed:', err.message);
    return { sent: 0, error: err.message };
  }
}

async function notifyNewOrder(order) {
  if (!order) return;
  return notifyEmployees({
    title: 'طلب شراء جديد',
    body: `${order.orderNo} · ${order.customerName || 'بدون زبون'}`,
    data: { type: 'new_order', orderId: String(order.id) }
  });
}

module.exports = {
  registerDevice,
  unregisterDevice,
  notifyEmployees,
  notifyNewOrder
};
