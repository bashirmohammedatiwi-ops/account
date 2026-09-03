const express = require('express');
const os = require('os');
const bcrypt = require('bcryptjs');
const db = require('../lib/db');
const { signAdmin } = require('../lib/auth');
const {
  adminAuthPolicy,
  clientIp,
  isLocalClient,
  optionalAuthAdmin,
  requireAdminAuthUnlessPublic
} = require('../lib/admin-access');
const { runPostingJob } = require('../lib/edari-posting-queue');
const { readServerSettings, writeServerSettings, applyEdariSettingsToEnv } = require('../lib/server-settings');
const {
  getAssignableTrees,
  assignAgentTrees,
  getSyncStatus,
  getChildren,
  getStatementForAccount,
  agentAllowedSeqs
} = require('../lib/accounts');
const {
  mapAgentProfile,
  saveAgentHierarchy,
  validateAgentHierarchyInput,
  listPrimaryAgents,
  getSecondaryAgentIds,
  normalizeRole
} = require('../lib/agent-hierarchy');
const { getPublicBaseUrl } = require('../lib/public-url');
const { runLocalSync, listEdariTrees, listEdariMaterialTrees, queryEdariSalesReport } = require('../lib/sync-runner');
const { queryAdminSalesReport, listReportTrees, listSalesBranches, parseTreeSeqList } = require('../lib/admin-sales-report');
const { buildTreeSalesReportPdf, buildTreeSalesReportSummaryPdf } = require('../lib/pdf-export');
const { listLanAddresses, getPrimaryLanAddress } = require('../lib/lan-host');
const {
  postReceiptToEdari,
  postCustomerToEdari,
  searchEdariAccounts,
  queryEdariAccountStatements,
  exportEdariAccountStatementsPdf,
  listEdariMaterialTreesLive,
  listEdariSalesBranchesLive,
  exportEdariSalesReportPdf,
  lookupEdariMaterial,
  fetchEdariCatalogMaterials,
  fetchEdariMaterials,
  testEdariConnection,
  listEdariDatabases,
  runPriceAppSync
} = require('../lib/edari-server-handlers');

const router = express.Router();
const HOST_BIND = process.env.HOST || '0.0.0.0';

function readSalesReportQuery(req) {
  const treeSeqs = parseTreeSeqList(req.query.treeSeqs || req.query.trees || '');
  const dateFrom = String(req.query.dateFrom || req.query.from || '').trim();
  const dateTo = String(req.query.dateTo || req.query.to || '').trim();
  const includeSales = req.query.includeSales !== '0';
  const includeReturns = req.query.includeReturns !== '0';
  const onlyGifts = req.query.onlyGifts === '1';
  const branches = String(req.query.branches || '')
    .split(/[,،\s]+/)
    .map((s) => s.replace(/[^0-9]/g, '').trim())
    .filter(Boolean);
  return { treeSeqs, dateFrom, dateTo, includeSales, includeReturns, onlyGifts, branches };
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  const token = signAdmin({ id: admin.id, username: admin.username });
  res.json({ ok: true, token, username: admin.username });
});

router.get('/me', optionalAuthAdmin, (req, res) => {
  if (req.admin) {
    return res.json({ ok: true, admin: { id: req.admin.id, username: req.admin.username } });
  }
  const policy = adminAuthPolicy();
  res.json({
    ok: true,
    admin: policy.enabled ? null : { username: 'admin', guest: true },
    guest: !req.admin,
    requireAuth: policy.enabled
  });
});

router.get('/config', (req, res) => {
  const base = getPublicBaseUrl(req);
  const port = Number(process.env.PORT || 5005);
  const lanAddresses = listLanAddresses();
  const primaryLan = getPrimaryLanAddress();
  const policy = adminAuthPolicy();
  res.json({
    ok: true,
    syncApiKey: process.env.SYNC_API_KEY || '',
    serverUrl: base,
    mobileUrl: `${base}/m`,
    adminUrl: `${base}/admin`,
    hostname: os.hostname(),
    requireAuth: policy.enabled,
    authMode: policy.global ? 'always' : (policy.lanOnly ? 'lan' : 'none'),
    clientIsLocal: isLocalClient(req),
    lan: {
      enabled: process.env.LAN_SERVER === '1' || HOST_BIND !== '127.0.0.1',
      host: process.env.HOST || '0.0.0.0',
      port,
      addresses: lanAddresses,
      primaryAddress: primaryLan,
      adminLanUrl: primaryLan ? `http://${primaryLan}:${port}/admin` : null
    }
  });
});

router.get('/lan-info', (req, res) => {
  const port = Number(process.env.PORT || 5005);
  const lanAddresses = listLanAddresses();
  const primaryLan = getPrimaryLanAddress();
  const base = getPublicBaseUrl(req);
  let agentCount = 0;
  let accountCount = 0;
  try {
    agentCount = db.prepare('SELECT COUNT(*) AS c FROM agents').get()?.c || 0;
    accountCount = db.prepare('SELECT COUNT(*) AS c FROM accounts').get()?.c || 0;
  } catch { /* ignore */ }
  res.json({
    ok: true,
    role: 'server',
    service: 'edari-delegate-portal',
    hostname: os.hostname(),
    host: HOST_BIND,
    port,
    baseUrl: base,
    addresses: lanAddresses,
    primaryAddress: primaryLan,
    adminUrl: primaryLan ? `http://${primaryLan}:${port}/admin` : `${base}/admin`,
    mobileUrl: primaryLan ? `http://${primaryLan}:${port}/m` : `${base}/m`,
    uptimeSec: Math.floor(process.uptime()),
    clientIp: clientIp(req),
    stats: { agents: agentCount, accounts: accountCount },
    lanServer: process.env.LAN_SERVER === '1' || HOST_BIND !== '127.0.0.1'
  });
});

router.use(requireAdminAuthUnlessPublic);

router.post('/edari/post-receipt', async (req, res) => {
  try {
    const result = await runPostingJob('receipt', req.body || {}, () => postReceiptToEdari(req.body || {}));
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'فشل ترحيل سند القبض' });
  }
});

router.post('/edari/post-customer', async (req, res) => {
  try {
    const result = await runPostingJob('customer', req.body || {}, () => postCustomerToEdari(req.body || {}));
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'فشل ترحيل الزبون' });
  }
});

router.post('/edari/search-accounts', async (req, res) => {
  try {
    const result = await searchEdariAccounts(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'فشل البحث في حسابات الإداري' });
  }
});

router.post('/edari/account-statements', async (req, res) => {
  try {
    const result = await queryEdariAccountStatements(req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'فشل إنشاء كشف الحساب' });
  }
});

router.post('/edari/account-statements.pdf', async (req, res) => {
  try {
    const result = await exportEdariAccountStatementsPdf(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'فشل تصدير PDF' });
  }
});

router.post('/edari/sales-report.pdf', async (req, res) => {
  try {
    const result = await exportEdariSalesReportPdf(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'فشل تصدير تقرير المبيعات' });
  }
});

router.get('/edari/sales-branches', async (req, res) => {
  try {
    const result = await listEdariSalesBranchesLive({
      dateFrom: req.query.dateFrom || req.query.from || '',
      dateTo: req.query.dateTo || req.query.to || ''
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'فشل قراءة الفروع' });
  }
});

router.post('/edari/lookup-material', async (req, res) => {
  try {
    const code = req.body?.code ?? req.query?.code ?? '';
    const result = await lookupEdariMaterial(code);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'فشل البحث عن المادة' });
  }
});

router.post('/edari/catalog-materials', async (req, res) => {
  try {
    const result = await fetchEdariCatalogMaterials(req.body?.codes || []);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'فشل قراءة المواد' });
  }
});

router.post('/edari/materials', async (_req, res) => {
  try {
    const result = await fetchEdariMaterials();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'فشل تحديث المواد من Edari' });
  }
});

router.get('/server-settings', (_req, res) => {
  const settings = readServerSettings();
  res.json({ ok: true, ...settings });
});

router.put('/server-settings', (req, res) => {
  try {
    const next = writeServerSettings(req.body || {});
    applyEdariSettingsToEnv(next.edari);
    res.json({ ok: true, ...next });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'فشل حفظ الإعدادات' });
  }
});

router.post('/edari/test-connection', async (req, res) => {
  try {
    const result = await testEdariConnection(req.body?.edari || req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'فشل اختبار الاتصال' });
  }
});

router.post('/edari/list-databases', async (req, res) => {
  try {
    const result = await listEdariDatabases(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'فشل اكتشاف القواعد' });
  }
});

router.post('/edari/price-sync', async (req, res) => {
  try {
    const result = await runPriceAppSync(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'فشل مزامنة الأسعار' });
  }
});

router.get('/dashboard', (_req, res) => {
  res.json({ ok: true, ...getSyncStatus() });
});

router.get('/trees', (_req, res) => {
  res.json({ ok: true, trees: getAssignableTrees() });
});

router.get('/agents', (_req, res) => {
  const agents = db.prepare(`
    SELECT id, name, phone, username, active, created_at, parent_agent_id, delegate_role
    FROM agents ORDER BY name
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
      ...mapAgentProfile(a),
      treeSeqs: byAgent[a.id] || []
    }))
  });
});

router.get('/agents/primary', (_req, res) => {
  res.json({ ok: true, agents: listPrimaryAgents() });
});

router.post('/agents', (req, res) => {
  const { name, phone, username, password, treeSeqs = [], delegateRole, parentAgentId } = req.body || {};
  if (!name || !username || !password) {
    return res.status(400).json({ ok: false, error: 'الاسم واسم المستخدم وكلمة المرور مطلوبة' });
  }
  let hierarchy;
  try {
    hierarchy = validateAgentHierarchyInput({ delegateRole, parentAgentId });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  const hash = bcrypt.hashSync(password, 10);
  try {
    const r = db.prepare(
      'INSERT INTO agents (name, phone, username, password_hash, parent_agent_id, delegate_role) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, phone || '', username, hash, hierarchy.parentAgentId, hierarchy.delegateRole);
    const agentId = r.lastInsertRowid;
    const { valid, invalid } = assignAgentTrees(agentId, treeSeqs);
    res.json({
      ok: true,
      id: agentId,
      treesAssigned: valid.length,
      treesSkipped: invalid.length,
      skippedTreeSeqs: invalid,
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message.includes('UNIQUE') ? 'اسم المستخدم مستخدم' : e.message });
  }
});

router.put('/agents/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, phone, username, password, active, treeSeqs, delegateRole, parentAgentId } = req.body || {};
  const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(id);
  if (!agent) return res.status(404).json({ ok: false, error: 'المندوب غير موجود' });

  if (name != null) db.prepare('UPDATE agents SET name = ? WHERE id = ?').run(name, id);
  if (phone != null) db.prepare('UPDATE agents SET phone = ? WHERE id = ?').run(phone, id);
  if (username != null) db.prepare('UPDATE agents SET username = ? WHERE id = ?').run(username, id);
  if (active != null) db.prepare('UPDATE agents SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
  if (password) {
    db.prepare('UPDATE agents SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), id);
  }
  if (delegateRole != null) {
    try {
      saveAgentHierarchy(id, {
        delegateRole,
        parentAgentId: normalizeRole(delegateRole) === 'secondary'
          ? (parentAgentId != null && parentAgentId !== '' ? parentAgentId : null)
          : null
      });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  }
  if (Array.isArray(treeSeqs)) {
    const { valid, invalid } = assignAgentTrees(id, treeSeqs);
    res.json({
      ok: true,
      treesAssigned: valid.length,
      treesSkipped: invalid.length,
      skippedTreeSeqs: invalid,
    });
    return;
  }
  res.json({ ok: true });
});

router.delete('/agents/:id', (req, res) => {
  const id = Number(req.params.id);
  const secondaries = getSecondaryAgentIds(id);
  if (secondaries.length) {
    return res.status(400).json({ ok: false, error: 'لا يمكن حذف مندوب رئيسي لديه مندوبون ثانويون — انقلهم أو احذفهم أولاً' });
  }
  db.prepare('DELETE FROM agents WHERE id = ?').run(id);
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

router.get('/edari/trees', async (_req, res) => {
  try {
    const result = await listEdariTrees();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/edari/material-trees', async (_req, res) => {
  try {
    const result = await listEdariMaterialTrees();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/trigger-sync', async (req, res) => {
  const serverUrl = req.body?.serverUrl || getPublicBaseUrl(req);
  const syncKey = req.body?.syncKey || process.env.SYNC_API_KEY;
  const treeSeqs = Array.isArray(req.body?.treeSeqs) ? req.body.treeSeqs : [];
  try {
    const result = await runLocalSync(serverUrl, syncKey, treeSeqs);
    res.json({ ok: true, ...result, status: getSyncStatus() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, stderr: err.stderr });
  }
});

router.get('/reports/sales/trees', async (_req, res) => {
  const dbTrees = listReportTrees();
  if (dbTrees.length) {
    return res.json({ ok: true, trees: dbTrees, source: 'db' });
  }
  try {
    const result = await listEdariMaterialTrees();
    res.json({ ...result, source: 'edari' });
  } catch (err) {
    res.json({ ok: true, trees: [], source: 'none', error: err.message });
  }
});

router.get('/reports/sales/branches', async (req, res) => {
  const dateFrom = String(req.query.dateFrom || req.query.from || '').trim();
  const dateTo = String(req.query.dateTo || req.query.to || '').trim();
  try {
    const branches = listSalesBranches({ dateFrom, dateTo });
    res.json({ ok: true, branches });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'فشل قراءة الفروع' });
  }
});

router.get('/reports/sales', async (req, res) => {
  const params = readSalesReportQuery(req);
  try {
    const nodeCount = db.prepare('SELECT COUNT(*) AS c FROM edari_material_nodes').get()?.c || 0;
    let report;
    if (nodeCount) {
      report = queryAdminSalesReport(params);
    } else {
      report = await queryEdariSalesReport(params);
    }
    res.json({ ok: true, report });
  } catch (err) {
    try {
      const report = await queryEdariSalesReport(params);
      return res.json({ ok: true, report });
    } catch (edariErr) {
      res.status(400).json({ ok: false, error: edariErr.message || err.message || 'فشل إنشاء التقرير' });
    }
  }
});

router.get('/reports/sales.pdf', async (req, res) => {
  const params = readSalesReportQuery(req);
  const summaryOnly = String(req.query.summary || req.query.summaryOnly || '') === '1';
  const buildPdf = summaryOnly ? buildTreeSalesReportSummaryPdf : buildTreeSalesReportPdf;
  const prefix = summaryOnly ? 'sales-trees-summary' : 'sales-trees';
  try {
    const nodeCount = db.prepare('SELECT COUNT(*) AS c FROM edari_material_nodes').get()?.c || 0;
    let report;
    if (nodeCount) {
      report = queryAdminSalesReport(params);
    } else {
      report = await queryEdariSalesReport(params);
    }
    const buffer = await buildPdf(report);
    const from = report.period?.dateFrom || 'from';
    const to = report.period?.dateTo || 'to';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${prefix}-${from}_${to}.pdf"`);
    res.send(buffer);
  } catch (err) {
    try {
      const report = await queryEdariSalesReport(params);
      const buffer = await buildPdf(report);
      const from = report.period?.dateFrom || 'from';
      const to = report.period?.dateTo || 'to';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${prefix}-${from}_${to}.pdf"`);
      return res.send(buffer);
    } catch (edariErr) {
      res.status(400).json({ ok: false, error: edariErr.message || err.message || 'فشل تصدير PDF' });
    }
  }
});

module.exports = router;
