const db = require('./db');

function getChildren(parentSeq) {
  return db.prepare(
    'SELECT * FROM accounts WHERE master_seq = ? ORDER BY num'
  ).all(String(parentSeq));
}

function getDescendantSeqs(rootSeq) {
  const all = [];
  const queue = [String(rootSeq)];
  while (queue.length) {
    const seq = queue.shift();
    all.push(seq);
    const kids = db.prepare('SELECT seq FROM accounts WHERE master_seq = ?').all(seq);
    for (const k of kids) queue.push(String(k.seq));
  }
  return all;
}

function agentAllowedSeqs(agentId) {
  const roots = db.prepare(
    'SELECT account_seq FROM agent_trees WHERE agent_id = ?'
  ).all(agentId).map((r) => r.account_seq);

  const allowed = new Set();
  for (const root of roots) {
    for (const seq of getDescendantSeqs(root)) allowed.add(seq);
    allowed.add(String(root));
  }
  return allowed;
}

function canAgentAccess(agentId, accountSeq) {
  const allowed = agentAllowedSeqs(agentId);
  return allowed.has(String(accountSeq));
}

function getAssignableTrees() {
  return db.prepare(`
    SELECT seq, num, name1, sub_count, bal
    FROM accounts
    WHERE CAST(sub_count AS INTEGER) > 0
    ORDER BY num
  `).all();
}

function getStatementForAccount(accSeq) {
  const account = db.prepare('SELECT * FROM accounts WHERE seq = ?').get(String(accSeq));
  if (!account) return null;
  const rows = db.prepare(
    'SELECT * FROM journal WHERE acc_seq = ? ORDER BY tx_date, seq'
  ).all(String(accSeq));
  const { buildStatementLines, balanceSummaryLabel, debtStatusFromBalance } = require('./statement-utils');
  const stmt = buildStatementLines(rows);
  return {
    account: {
      seq: account.seq,
      num: account.num,
      name1: account.name1,
      name2: account.name2,
      address: account.address,
      bal: account.bal,
      debtStatus: debtStatusFromBalance(account.bal)
    },
    ...stmt,
    summary: balanceSummaryLabel(stmt.finalBalance)
  };
}

function importSyncData({ accounts = [], journal = [] }) {
  const started = new Date().toISOString();
  const logId = db.prepare(
    'INSERT INTO sync_logs (started_at, status, message) VALUES (?, ?, ?)'
  ).run(started, 'running', 'جاري الاستيراد').lastInsertRowid;

  const upsertAcc = db.prepare(`
    INSERT INTO accounts (seq, num, name1, name2, master_seq, sub_count, bal, tot1, tot2, address, remarks, official_name, synced_at)
    VALUES (@seq, @num, @name1, @name2, @master_seq, @sub_count, @bal, @tot1, @tot2, @address, @remarks, @official_name, @synced_at)
    ON CONFLICT(seq) DO UPDATE SET
      num=excluded.num, name1=excluded.name1, name2=excluded.name2, master_seq=excluded.master_seq,
      sub_count=excluded.sub_count, bal=excluded.bal, tot1=excluded.tot1, tot2=excluded.tot2,
      address=excluded.address, remarks=excluded.remarks, official_name=excluded.official_name, synced_at=excluded.synced_at
  `);

  const upsertJournal = db.prepare(`
    INSERT INTO journal (seq, acc_seq, tx_date, am, is_debit, exp1, bill_num)
    VALUES (@seq, @acc_seq, @tx_date, @am, @is_debit, @exp1, @bill_num)
    ON CONFLICT(seq, acc_seq) DO UPDATE SET
      tx_date=excluded.tx_date, am=excluded.am, is_debit=excluded.is_debit,
      exp1=excluded.exp1, bill_num=excluded.bill_num
  `);

  const tx = db.transaction(() => {
    const now = new Date().toISOString();
    for (const a of accounts) {
      upsertAcc.run({
        seq: String(a.Seq ?? a.seq),
        num: String(a.Num ?? a.num ?? ''),
        name1: a.Name1 ?? a.name1 ?? '',
        name2: a.Name2 ?? a.name2 ?? '',
        master_seq: String(a.Master ?? a.master_seq ?? '0'),
        sub_count: Number(a.SubCount ?? a.sub_count ?? 0),
        bal: Number(a.Bal ?? a.bal ?? 0),
        tot1: Number(a.Tot1 ?? a.tot1 ?? 0),
        tot2: Number(a.Tot2 ?? a.tot2 ?? 0),
        address: a.Address ?? a.address ?? '',
        remarks: a.Remarks ?? a.remarks ?? '',
        official_name: a.OfficialName ?? a.official_name ?? '',
        synced_at: now
      });
    }
    for (const j of journal) {
      const dept = j.Dept ?? j.is_debit;
      upsertJournal.run({
        seq: String(j.Seq ?? j.seq),
        acc_seq: String(j.Acc ?? j.acc_seq),
        tx_date: j.Date ?? j.tx_date ?? j.DtCreated ?? '',
        am: Number(j.Am ?? j.am ?? 0),
        is_debit: dept === 'True' || dept === true || dept === 1 ? 1 : 0,
        exp1: j.Exp1 ?? j.exp1 ?? '',
        bill_num: String(j.BillNum ?? j.bill_num ?? '')
      });
    }
  });

  try {
    tx();
    const finished = new Date().toISOString();
    db.prepare(`
      UPDATE sync_logs SET finished_at=?, status=?, accounts_count=?, journal_count=?, message=?
      WHERE id=?
    `).run(finished, 'success', accounts.length, journal.length, 'تمت المزامنة بنجاح', logId);
    return { ok: true, accounts: accounts.length, journal: journal.length, logId };
  } catch (err) {
    db.prepare(`
      UPDATE sync_logs SET finished_at=?, status=?, message=? WHERE id=?
    `).run(new Date().toISOString(), 'error', err.message, logId);
    throw err;
  }
}

function getSyncStatus() {
  const last = db.prepare('SELECT * FROM sync_logs ORDER BY id DESC LIMIT 1').get();
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM accounts) AS accounts,
      (SELECT COUNT(*) FROM journal) AS journal,
      (SELECT COUNT(*) FROM agents WHERE active=1) AS agents
  `).get();
  return { last, counts };
}

module.exports = {
  getChildren,
  getDescendantSeqs,
  agentAllowedSeqs,
  canAgentAccess,
  getAssignableTrees,
  getStatementForAccount,
  importSyncData,
  getSyncStatus
};
