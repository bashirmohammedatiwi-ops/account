const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../lib/db');
const { signAdmin } = require('../lib/auth');
const {
  getAssignableTrees,
  getSyncStatus,
  getChildren,
  getStatementForAccount,
  agentAllowedSeqs
} = require('../lib/accounts');
const { debtStatusFromBalance, balanceSummaryLabel } = require('../lib/statement-utils');
const { getPublicBaseUrl } = require('../lib/public-url');
const { runLocalSync } = require('../lib/sync-runner');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  const token = signAdmin({ id: admin.id, username: admin.username });
  res.json({ ok: true, token, username: admin.username });
});

router.get('/me', (_req, res) => {
  res.json({ ok: true, admin: { username: 'admin' } });
});

router.get('/config', (req, res) => {
  const base = getPublicBaseUrl(req);
  res.json({
    ok: true,
    syncApiKey: process.env.SYNC_API_KEY || '',
    serverUrl: base,
    mobileUrl: `${base}/m`,
    adminUrl: `${base}/admin`
  });
});

router.get('/dashboard', (_req, res) => {
  res.json({ ok: true, ...getSyncStatus() });
});

router.get('/trees', (_req, res) => {
  res.json({ ok: true, trees: getAssignableTrees() });
});

router.get('/agents', (_req, res) => {
  const agents = db.prepare(`
    SELECT id, name, phone, username, active, created_at FROM agents ORDER BY name
  `).all();
  const trees = db.prepare('SELECT agent_id, account_seq FROM agent_trees').all();
  const byAgent = {};
  for (const t of trees) {
    if (!byAgent[t.agent_id]) byAgent[t.agent_id] = [];
    byAgent[t.agent_id].push(t.account_seq);
  }
  res.json({
    ok: true,
    agents: agents.map((a) => ({
      ...a,
      active: !!a.active,
      treeSeqs: byAgent[a.id] || []
    }))
  });
});

router.post('/agents', (req, res) => {
  const { name, phone, username, password, treeSeqs = [] } = req.body || {};
  if (!name || !username || !password) {
    return res.status(400).json({ ok: false, error: 'الاسم واسم المستخدم وكلمة المرور مطلوبة' });
  }
  const hash = bcrypt.hashSync(password, 10);
  try {
    const r = db.prepare(
      'INSERT INTO agents (name, phone, username, password_hash) VALUES (?, ?, ?, ?)'
    ).run(name, phone || '', username, hash);
    const agentId = r.lastInsertRowid;
    const ins = db.prepare('INSERT INTO agent_trees (agent_id, account_seq) VALUES (?, ?)');
    for (const seq of treeSeqs) ins.run(agentId, String(seq));
    res.json({ ok: true, id: agentId });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message.includes('UNIQUE') ? 'اسم المستخدم مستخدم' : e.message });
  }
});

router.put('/agents/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, phone, username, password, active, treeSeqs } = req.body || {};
  const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(id);
  if (!agent) return res.status(404).json({ ok: false, error: 'المندوب غير موجود' });

  if (name != null) db.prepare('UPDATE agents SET name = ? WHERE id = ?').run(name, id);
  if (phone != null) db.prepare('UPDATE agents SET phone = ? WHERE id = ?').run(phone, id);
  if (username != null) db.prepare('UPDATE agents SET username = ? WHERE id = ?').run(username, id);
  if (active != null) db.prepare('UPDATE agents SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  if (password) {
    db.prepare('UPDATE agents SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), id);
  }
  if (Array.isArray(treeSeqs)) {
    db.prepare('DELETE FROM agent_trees WHERE agent_id = ?').run(id);
    const ins = db.prepare('INSERT INTO agent_trees (agent_id, account_seq) VALUES (?, ?)');
    for (const seq of treeSeqs) ins.run(id, String(seq));
  }
  res.json({ ok: true });
});

router.delete('/agents/:id', (req, res) => {
  db.prepare('DELETE FROM agents WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

router.get('/accounts/:seq/children', (req, res) => {
  const children = getChildren(req.params.seq).map((c) => ({
    seq: c.seq,
    num: c.num,
    name1: c.name1,
    name2: c.name2,
    address: c.address,
    bal: c.bal,
    tot1: c.tot1,
    tot2: c.tot2,
    subCount: c.sub_count,
    debtStatus: debtStatusFromBalance(c.bal),
    summary: balanceSummaryLabel(c.bal)
  }));
  res.json({ ok: true, children });
});

router.get('/accounts/:seq/statement', (req, res) => {
  const stmt = getStatementForAccount(req.params.seq);
  if (!stmt) return res.status(404).json({ ok: false, error: 'الحساب غير موجود' });
  res.json({ ok: true, ...stmt });
});

router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ ok: true, results: [] });

  const rows = db.prepare(`
    SELECT seq, num, name1, bal FROM accounts
    WHERE num LIKE ? OR name1 LIKE ?
    ORDER BY num LIMIT 80
  `).all(`%${q}%`, `%${q}%`);

  res.json({
    ok: true,
    results: rows.map((r) => ({ ...r, debtStatus: debtStatusFromBalance(r.bal) }))
  });
});

router.get('/sync/logs', (_req, res) => {
  const logs = db.prepare('SELECT * FROM sync_logs ORDER BY id DESC LIMIT 20').all();
  res.json({ ok: true, logs });
});

router.post('/trigger-sync', async (req, res) => {
  const serverUrl = req.body?.serverUrl || getPublicBaseUrl(req);
  const syncKey = req.body?.syncKey || process.env.SYNC_API_KEY;
  try {
    const result = await runLocalSync(serverUrl, syncKey);
    res.json({ ok: true, ...result, status: getSyncStatus() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, stderr: err.stderr });
  }
});

module.exports = router;
