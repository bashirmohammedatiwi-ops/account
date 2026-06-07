const crypto = require('crypto');
const db = require('./db');

const DEFAULT_TTL_HOURS = Number(process.env.SHARE_TOKEN_TTL_HOURS || 72);

function migrateShareTokens() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS share_tokens (
      token TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      agent_id INTEGER,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_share_tokens_expires ON share_tokens(expires_at);
  `);
}

migrateShareTokens();

function purgeExpiredTokens() {
  db.prepare('DELETE FROM share_tokens WHERE expires_at < ?').run(new Date().toISOString());
}

function createShareToken({ kind, payload, agentId, ttlHours = DEFAULT_TTL_HOURS }) {
  purgeExpiredTokens();
  const token = crypto.randomBytes(24).toString('hex');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + ttlHours * 60 * 60 * 1000);
  db.prepare(`
    INSERT INTO share_tokens (token, kind, payload, agent_id, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    token,
    String(kind),
    JSON.stringify(payload || {}),
    agentId || null,
    expiresAt.toISOString(),
    createdAt.toISOString()
  );
  return { token, expiresAt: expiresAt.toISOString() };
}

function getShareToken(token) {
  purgeExpiredTokens();
  const row = db.prepare('SELECT * FROM share_tokens WHERE token = ?').get(String(token || '').trim());
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM share_tokens WHERE token = ?').run(row.token);
    return null;
  }
  let payload = {};
  try {
    payload = JSON.parse(row.payload || '{}');
  } catch {
    payload = {};
  }
  return { ...row, payload };
}

function buildShareUrl(req, token) {
  const { getPublicBaseUrl } = require('./public-url');
  const base = getPublicBaseUrl(req).replace(/\/$/, '');
  return `${base}/api/mobile/share/${token}.pdf`;
}

module.exports = {
  createShareToken,
  getShareToken,
  buildShareUrl,
  purgeExpiredTokens
};
