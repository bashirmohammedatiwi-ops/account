/**
 * Delete receipt vouchers from portal DB only (not Edari).
 * Usage:
 *   node scripts/delete-receipts-remote.js RV-20260818-0001 RV-20260818-0003
 */
const http = require('http');

const BASE = (process.env.PORTAL_URL || 'http://187.124.23.65:5005').replace(/\/$/, '');
const SYNC_KEY = process.env.SYNC_API_KEY || 'edari-sync-local-key-2025';
const receiptNos = process.argv.slice(2);

if (!receiptNos.length) {
  console.error('Usage: node scripts/delete-receipts-remote.js <receiptNo> [...]');
  process.exit(1);
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Key': SYNC_KEY,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(data || '{}'); } catch { json = { raw: data }; }
        if (res.statusCode >= 400) {
          reject(new Error(json.error || data || `HTTP ${res.statusCode}`));
          return;
        }
        resolve(json);
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  console.log('Deleting from portal:', receiptNos.join(', '));
  const result = await request('POST', '/api/sync/receipts/delete', {
    receiptNos,
    force: true
  });
  console.log(JSON.stringify(result, null, 2));
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
