const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../lib/db');
const { signAgent, authAgent } = require('../lib/auth');
const {
  canAgentAccess,
  getChildren,
  getStatementForAccount,
  agentAllowedSeqs
} = require('../lib/accounts');
const { debtStatusFromBalance, balanceSummaryLabel } = require('../lib/statement-utils');
const { getInvoiceForExport, canAgentAccessInvoice } = require('../lib/invoices');
const { buildStatementPdf, buildInvoicePdf } = require('../lib/pdf-export');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const agent = db.prepare('SELECT * FROM agents WHERE username = ? AND active = 1').get(username);
  if (!agent || !bcrypt.compareSync(password, agent.password_hash)) {
    return res.status(401).json({ ok: false, error: 'بيانات الدخول غير صحيحة' });
  }
  const token = signAgent({ id: agent.id, username: agent.username, name: agent.name });
  res.json({ ok: true, token, agent: { id: agent.id, name: agent.name, username: agent.username } });
});

router.get('/me', authAgent, (req, res) => {
  res.json({ ok: true, agent: { id: req.agent.id, name: req.agent.name, username: req.agent.username } });
});

router.get('/trees', authAgent, (req, res) => {
  const roots = db.prepare(`
    SELECT at.account_seq AS seq FROM agent_trees at WHERE at.agent_id = ?
  `).all(req.agent.id);

  const trees = roots.map((r) => {
    const acc = db.prepare('SELECT * FROM accounts WHERE seq = ?').get(r.seq);
    if (!acc) return null;
    const childCount = db.prepare(
      'SELECT COUNT(*) AS c FROM accounts WHERE master_seq = ?'
    ).get(r.seq).c;
    return {
      seq: acc.seq,
      num: acc.num,
      name1: acc.name1,
      bal: acc.bal,
      subCount: acc.sub_count,
      directChildren: childCount,
      debtStatus: debtStatusFromBalance(acc.bal)
    };
  }).filter(Boolean);

  res.json({ ok: true, trees });
});

router.get('/accounts/:seq', authAgent, (req, res) => {
  if (!canAgentAccess(req.agent.id, req.params.seq)) {
    return res.status(403).json({ ok: false, error: 'لا تملك صلاحية هذا الحساب' });
  }
  const acc = db.prepare('SELECT * FROM accounts WHERE seq = ?').get(String(req.params.seq));
  if (!acc) return res.status(404).json({ ok: false, error: 'الحساب غير موجود' });
  res.json({
    ok: true,
    account: {
      ...acc,
      debtStatus: debtStatusFromBalance(acc.bal),
      summary: balanceSummaryLabel(acc.bal)
    }
  });
});

router.get('/accounts/:seq/children', authAgent, (req, res) => {
  if (!canAgentAccess(req.agent.id, req.params.seq)) {
    return res.status(403).json({ ok: false, error: 'لا تملك صلاحية هذا الحساب' });
  }
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

router.get('/accounts/:seq/statement.pdf', authAgent, async (req, res) => {
  if (!canAgentAccess(req.agent.id, req.params.seq)) {
    return res.status(403).json({ ok: false, error: 'لا تملك صلاحية هذا الحساب' });
  }
  const sinceLastMatch = String(req.query.since || 'match').trim().toLowerCase() !== 'all';
  const stmt = getStatementForAccount(req.params.seq, { sinceLastMatch });
  if (!stmt) return res.status(404).json({ ok: false, error: 'الحساب غير موجود' });
  try {
    const buffer = await buildStatementPdf(stmt, { sinceLastMatch: stmt.sinceLastMatch });
    const num = stmt.account?.num || req.params.seq;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${num}.pdf"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/accounts/:seq/statement', authAgent, (req, res) => {
  if (!canAgentAccess(req.agent.id, req.params.seq)) {
    return res.status(403).json({ ok: false, error: 'لا تملك صلاحية هذا الحساب' });
  }
  const sinceLastMatch = String(req.query.since || 'match').trim().toLowerCase() !== 'all';
  const stmt = getStatementForAccount(req.params.seq, { sinceLastMatch });
  if (!stmt) return res.status(404).json({ ok: false, error: 'الحساب غير موجود' });
  res.json({ ok: true, ...stmt });
});

async function sendInvoicePdf(req, res) {
  const ref = String(req.params.ref || '').trim();
  const by = String(req.query.by || 'auto').trim();
  const accSeq = String(req.query.acc || '').trim();
  if (!ref) {
    return res.status(400).json({ ok: false, error: 'رقم الفاتورة غير صالح' });
  }
  if (!canAgentAccessInvoice(req.agent.id, ref, { by, accSeq })) {
    return res.status(403).json({ ok: false, error: 'لا تملك صلاحية هذه الفاتورة' });
  }
  const data = getInvoiceForExport(ref, by, accSeq);
  if (!data) {
    return res.status(404).json({ ok: false, error: 'الفاتورة غير موجودة — قد تحتاج مزامنة جديدة' });
  }
  try {
    const buffer = await buildInvoicePdf(data);
    const num = data.invoice?.num || ref;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${num}.pdf"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'فشل إنشاء PDF' });
  }
}

router.get('/invoices/:ref.pdf', authAgent, sendInvoicePdf);
router.get('/invoices/:ref/pdf', authAgent, sendInvoicePdf);

router.get('/invoices/:ref', authAgent, (req, res) => {
  const ref = String(req.params.ref || '').trim();
  const by = String(req.query.by || 'auto').trim();
  const accSeq = String(req.query.acc || '').trim();
  if (!ref) {
    return res.status(400).json({ ok: false, error: 'رقم الفاتورة غير صالح' });
  }
  if (!canAgentAccessInvoice(req.agent.id, ref, { by, accSeq })) {
    return res.status(403).json({ ok: false, error: 'لا تملك صلاحية هذه الفاتورة' });
  }
  const data = getInvoiceForExport(ref, by, accSeq);
  if (!data) {
    return res.status(404).json({ ok: false, error: 'الفاتورة غير موجودة — قد تحتاج مزامنة جديدة' });
  }
  res.json({ ok: true, ...data });
});

router.get('/search', authAgent, (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ ok: true, results: [] });

  const allowed = agentAllowedSeqs(req.agent.id);
  const results = db.prepare(`
    SELECT seq, num, name1, bal, master_seq FROM accounts
    WHERE (num LIKE ? OR name1 LIKE ?)
    ORDER BY num LIMIT 50
  `).all(`%${q}%`, `%${q}%`).filter((r) => allowed.has(String(r.seq)));

  res.json({
    ok: true,
    results: results.map((r) => ({
      ...r,
      debtStatus: debtStatusFromBalance(r.bal)
    }))
  });
});

module.exports = router;
