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
  console.log(`[push] registered device for ${ownerType}/${ownerId} (${platform || 'android'})`);
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

function removeTokens(tokens = []) {
  const list = [...new Set((tokens || []).filter(Boolean))];
  if (!list.length) return 0;
  const stmt = db.prepare('DELETE FROM push_devices WHERE token = ?');
  let removed = 0;
  for (const token of list) {
    removed += stmt.run(token).changes;
  }
  if (removed) console.log(`[push] removed ${removed} invalid token(s)`);
  return removed;
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
  if (!key) {
    console.warn('[push] FCM_SERVER_KEY not set — server push disabled (app uses polling)');
    return Promise.resolve({ sent: 0, skipped: true, reason: 'no_key' });
  }
  if (!list.length) {
    console.warn('[push] No registered device tokens for employees');
    return Promise.resolve({ sent: 0, skipped: true, reason: 'no_tokens' });
  }

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
          const dead = [];
          if (Array.isArray(parsed.results)) {
            parsed.results.forEach((r, i) => {
              if (r.error === 'NotRegistered' || r.error === 'InvalidRegistration') {
                if (list[i]) dead.push(list[i]);
              }
            });
          }
          if (dead.length) removeTokens(dead);
          const sent = parsed.success || 0;
          const failure = parsed.failure || 0;
          if (failure > 0) {
            console.warn('[push] FCM partial failure:', { sent, failure });
          } else if (sent > 0) {
            console.log(`[push] FCM sent to ${sent} device(s): ${title}`);
          }
          resolve({ sent, failure, raw: parsed });
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
  if (!tokens.length) return { sent: 0, skipped: true, reason: 'no_tokens' };
  try {
    return await sendFcm(tokens, { title, body, data });
  } catch (err) {
    console.error('[push] notifyEmployees failed:', err.message);
    return { sent: 0, error: err.message };
  }
}

async function notifyNewOrder(order) {
  if (!order) return;
  const isShorja = order.sourceType === 'shorja';
  return notifyEmployees({
    title: isShorja ? 'طلب تجهيز شورجة' : 'طلب شراء جديد',
    body: isShorja
      ? `${order.orderNo} · ${order.customerName || order.shorjaBranchName || 'فرع الشورجة'}`
      : `${order.orderNo} · ${order.customerName || 'بدون زبون'}`,
    data: {
      type: isShorja ? 'new_shorja_order' : 'new_order',
      orderId: String(order.id),
      sourceType: String(order.sourceType || 'delegate')
    }
  });
}

module.exports = {
  registerDevice,
  unregisterDevice,
  notifyEmployees,
  notifyNewOrder
};
