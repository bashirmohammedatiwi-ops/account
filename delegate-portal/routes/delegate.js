const express = require('express');
const db = require('../lib/db');
const {
  getChildren,
  getStatementForAccount,
  getAssignableTrees
} = require('../lib/accounts');
const { debtStatusFromBalance, balanceSummaryLabel } = require('../lib/statement-utils');
const { getInvoiceForExport } = require('../lib/invoices');

const router = express.Router();

function getAllowedRootSeqs() {
  const fromEnv = String(process.env.DELEGATE_TREE_SEQS || '').trim();
  if (fromEnv) return fromEnv.split(',').map((s) => s.trim()).filter(Boolean);

  const assigned = db.prepare('SELECT DISTINCT account_seq AS seq FROM agent_trees').all();
  if (assigned.length) return assigned.map((r) => r.seq);

  return getAssignableTrees().map((t) => t.seq);
}

function isAllowed(seq) {
  const roots = getAllowedRootSeqs();
  if (!roots.length) return true;
  const target = String(seq);
  for (const root of roots) {
    if (target === String(root)) return true;
    let queue = [String(root)];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === target) return true;
      const kids = db.prepare('SELECT seq FROM accounts WHERE master_seq = ?').all(cur);
      for (const k of kids) queue.push(String(k.seq));
    }
  }
  return false;
}

router.get('/trees', (_req, res) => {
  const roots = getAllowedRootSeqs();
  const trees = roots.map((seq) => {
    const acc = db.prepare('SELECT * FROM accounts WHERE seq = ?').get(String(seq));
    if (!acc) return null;
    const directChildren = db.prepare(
      'SELECT COUNT(*) AS c FROM accounts WHERE master_seq = ?'
    ).get(String(seq)).c;
    return {
      seq: acc.seq,
      num: acc.num,
      name1: acc.name1,
      bal: acc.bal,
      subCount: acc.sub_count,
      directChildren,
      debtStatus: debtStatusFromBalance(acc.bal)
    };
  }).filter(Boolean);

  res.json({ ok: true, trees });
});

router.get('/accounts/:seq/children', (req, res) => {
  if (!isAllowed(req.params.seq)) {
    return res.status(403).json({ ok: false, error: 'الحساب غير متاح' });
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

router.get('/accounts/:seq/statement', (req, res) => {
  if (!isAllowed(req.params.seq)) {
    return res.status(403).json({ ok: false, error: 'الحساب غير متاح' });
  }
  const stmt = getStatementForAccount(req.params.seq);
  if (!stmt) return res.status(404).json({ ok: false, error: 'الحساب غير موجود' });
  res.json({ ok: true, ...stmt });
});

router.get('/invoices/:ref', (req, res) => {
  const ref = String(req.params.ref || '').trim();
  const by = String(req.query.by || 'auto').trim();
  const accSeq = String(req.query.acc || '').trim();
  if (!ref) {
    return res.status(400).json({ ok: false, error: 'رقم الفاتورة غير صالح' });
  }
  const data = getInvoiceForExport(ref, by, accSeq);
  if (!data) {
    return res.status(404).json({ ok: false, error: 'الفاتورة غير موجودة — قد تحتاج مزامنة جديدة' });
  }
  res.json({ ok: true, ...data });
});

router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ ok: true, results: [] });

  const rows = db.prepare(`
    SELECT seq, num, name1, bal FROM accounts
    WHERE num LIKE ? OR name1 LIKE ?
    ORDER BY num LIMIT 80
  `).all(`%${q}%`, `%${q}%`).filter((r) => isAllowed(r.seq));

  res.json({
    ok: true,
    results: rows.map((r) => ({ ...r, debtStatus: debtStatusFromBalance(r.bal) }))
  });
});

module.exports = router;
