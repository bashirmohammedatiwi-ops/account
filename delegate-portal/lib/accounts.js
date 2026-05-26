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
      debtStatus: debtStatusFromBalance(stmt.finalBalance ?? account.bal)
    },
    ...stmt,
    summary: balanceSummaryLabel(stmt.finalBalance)
  };
}

const SYNC_UPSERTS = {
  accounts: db.prepare(`
    INSERT INTO accounts (seq, num, name1, name2, master_seq, sub_count, bal, tot1, tot2, address, remarks, official_name, synced_at)
    VALUES (@seq, @num, @name1, @name2, @master_seq, @sub_count, @bal, @tot1, @tot2, @address, @remarks, @official_name, @synced_at)
    ON CONFLICT(seq) DO UPDATE SET
      num=excluded.num, name1=excluded.name1, name2=excluded.name2, master_seq=excluded.master_seq,
      sub_count=excluded.sub_count, bal=excluded.bal, tot1=excluded.tot1, tot2=excluded.tot2,
      address=excluded.address, remarks=excluded.remarks, official_name=excluded.official_name, synced_at=excluded.synced_at
  `),
  journal: db.prepare(`
    INSERT INTO journal (seq, acc_seq, tx_date, am, is_debit, exp1, bill_num, bill_seq, bill_kind)
    VALUES (@seq, @acc_seq, @tx_date, @am, @is_debit, @exp1, @bill_num, @bill_seq, @bill_kind)
    ON CONFLICT(seq, acc_seq) DO UPDATE SET
      tx_date=excluded.tx_date, am=excluded.am, is_debit=excluded.is_debit,
      exp1=excluded.exp1, bill_num=excluded.bill_num,
      bill_seq=excluded.bill_seq, bill_kind=excluded.bill_kind
  `),
  invoices: db.prepare(`
    INSERT INTO invoices (seq, num, kind, inv_date, total, payment, discount, line_count, remarks, acc_seq, synced_at)
    VALUES (@seq, @num, @kind, @inv_date, @total, @payment, @discount, @line_count, @remarks, @acc_seq, @synced_at)
    ON CONFLICT(seq) DO UPDATE SET
      num=excluded.num, kind=excluded.kind, inv_date=excluded.inv_date,
      total=excluded.total, payment=excluded.payment, discount=excluded.discount,
      line_count=excluded.line_count, remarks=excluded.remarks,
      acc_seq=excluded.acc_seq, synced_at=excluded.synced_at
  `),
  invoiceLines: db.prepare(`
    INSERT INTO invoice_lines (bill_seq, bill_no, mat, mat_num, mat_name, quant, bonus, price, line_total, remarks, kind)
    VALUES (@bill_seq, @bill_no, @mat, @mat_num, @mat_name, @quant, @bonus, @price, @line_total, @remarks, @kind)
    ON CONFLICT(bill_seq, bill_no, mat) DO UPDATE SET
      mat_num=excluded.mat_num, mat_name=excluded.mat_name, quant=excluded.quant,
      bonus=excluded.bonus, price=excluded.price, line_total=excluded.line_total,
      remarks=excluded.remarks, kind=excluded.kind
  `)
};

function mapAccountRow(a, now) {
  return {
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
  };
}

function mapJournalRow(j) {
  const dept = j.Dept ?? j.is_debit;
  const billSeqRaw = j.BillSeq ?? j.bill_seq;
  const billSeq = billSeqRaw != null && String(billSeqRaw).replace(/[^0-9]/g, '') !== '0'
    ? String(billSeqRaw).replace(/[^0-9]/g, '')
    : '';
  return {
    seq: String(j.Seq ?? j.seq),
    acc_seq: String(j.Acc ?? j.acc_seq),
    tx_date: j.Date ?? j.tx_date ?? j.DtCreated ?? '',
    am: Number(j.Am ?? j.am ?? 0),
    is_debit: dept === 'True' || dept === true || dept === 1 ? 1 : 0,
    exp1: j.Exp1 ?? j.exp1 ?? '',
    bill_num: String(j.BillNum ?? j.bill_num ?? ''),
    bill_seq: billSeq,
    bill_kind: String(j.BillKind ?? j.bill_kind ?? '')
  };
}

function mapInvoiceRow(inv, now) {
  return {
    seq: String(inv.Seq ?? inv.seq),
    num: String(inv.Num ?? inv.num ?? ''),
    kind: String(inv.Kind ?? inv.kind ?? ''),
    inv_date: inv.Date ?? inv.inv_date ?? '',
    total: Number(inv.Total ?? inv.total ?? 0),
    payment: Number(inv.Payment ?? inv.payment ?? 0),
    discount: Number(inv.DisCnt ?? inv.discount ?? 0),
    line_count: Number(inv.count ?? inv.line_count ?? 0),
    remarks: inv.remarks ?? inv.Remarks ?? '',
    acc_seq: String(inv.Two ?? inv.acc_seq ?? ''),
    synced_at: now
  };
}

function mapInvoiceLineRow(line) {
  const billSeq = String(line.BillSeq ?? line.bill_seq ?? '').replace(/[^0-9]/g, '');
  if (!billSeq) return null;
  const quant = Number(line.Quant ?? line.quant ?? 0);
  const price = Number(line.Price ?? line.price ?? 0);
  const bonus = Number(line.OBonus ?? line.bonus ?? 0);
  const storedTotal = Number(line.sum ?? line.line_total ?? 0);
  const lineTotal = storedTotal > 0 ? storedTotal : quant * price;
  return {
    bill_seq: billSeq,
    bill_no: Number(line.BillNo ?? line.bill_no ?? 0),
    mat: String(line.Mat ?? line.mat ?? ''),
    mat_num: String(line.MatNum ?? line.mat_num ?? line.Num ?? ''),
    mat_name: line.MatName ?? line.mat_name ?? line.Name1 ?? '',
    quant,
    bonus,
    price,
    line_total: lineTotal,
    remarks: line.MatRem ?? line.remarks ?? '',
    kind: String(line.Kind ?? line.kind ?? '')
  };
}

function startSyncSession(accountSeqs = []) {
  const started = new Date().toISOString();
  const logId = db.prepare(
    'INSERT INTO sync_logs (started_at, status, message) VALUES (?, ?, ?)'
  ).run(started, 'running', 'جاري الاستيراد').lastInsertRowid;

  if (accountSeqs.length) {
    purgeSyncScope(accountSeqs);
  }

  return logId;
}

function purgeSyncScope(accountSeqs = []) {
  const seqs = [...new Set(accountSeqs.map((s) => String(s)).filter(Boolean))];
  if (!seqs.length) return { purgedAccounts: 0, purgedJournal: 0, purgedInvoices: 0 };

  const placeholders = seqs.map(() => '?').join(',');
  const billRows = db.prepare(`
    SELECT DISTINCT bill_seq FROM journal
    WHERE acc_seq IN (${placeholders}) AND bill_seq IS NOT NULL AND bill_seq != ''
  `).all(...seqs);
  const billSeqs = billRows.map((r) => String(r.bill_seq)).filter(Boolean);

  const tx = db.transaction(() => {
    const journalResult = db.prepare(`
      DELETE FROM journal WHERE acc_seq IN (${placeholders})
    `).run(...seqs);

    let invoiceLinesResult = { changes: 0 };
    let invoicesResult = { changes: 0 };
    if (billSeqs.length) {
      const billPlaceholders = billSeqs.map(() => '?').join(',');
      invoiceLinesResult = db.prepare(`
        DELETE FROM invoice_lines WHERE bill_seq IN (${billPlaceholders})
      `).run(...billSeqs);
      invoicesResult = db.prepare(`
        DELETE FROM invoices WHERE seq IN (${billPlaceholders})
      `).run(...billSeqs);
    }

    return {
      purgedAccounts: seqs.length,
      purgedJournal: journalResult.changes || 0,
      purgedInvoices: invoicesResult.changes || 0,
      purgedInvoiceLines: invoiceLinesResult.changes || 0
    };
  });

  return tx();
}

function importSyncChunk(kind, rows = []) {
  const upsert = SYNC_UPSERTS[kind];
  if (!upsert || !rows.length) {
    return { imported: 0, kind };
  }

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    if (kind === 'accounts') {
      for (const row of rows) upsert.run(mapAccountRow(row, now));
      return;
    }
    if (kind === 'journal') {
      for (const row of rows) upsert.run(mapJournalRow(row));
      return;
    }
    if (kind === 'invoices') {
      for (const row of rows) upsert.run(mapInvoiceRow(row, now));
      return;
    }
    if (kind === 'invoiceLines') {
      for (const row of rows) {
        const mapped = mapInvoiceLineRow(row);
        if (mapped) upsert.run(mapped);
      }
    }
  });
  tx();
  return { imported: rows.length, kind };
}

function finishSyncSession(logId, stats = {}) {
  const {
    accounts = 0,
    journal = 0,
    invoices = 0,
    invoiceLines = 0
  } = stats;
  const finished = new Date().toISOString();
  db.prepare(`
    UPDATE sync_logs SET finished_at=?, status=?, accounts_count=?, journal_count=?, message=?
    WHERE id=?
  `).run(
    finished,
    'success',
    accounts,
    journal,
    `تمت المزامنة: ${accounts} حساب، ${journal} حركة، ${invoices} فاتورة، ${invoiceLines} بند`,
    logId
  );
  return {
    ok: true,
    accounts,
    journal,
    invoices,
    invoiceLines,
    logId
  };
}

function failSyncSession(logId, message) {
  db.prepare(`
    UPDATE sync_logs SET finished_at=?, status=?, message=? WHERE id=?
  `).run(new Date().toISOString(), 'error', message, logId);
}

function importSyncData({ accounts = [], journal = [], invoices = [], invoiceLines = [] }) {
  const logId = startSyncSession();
  try {
    importSyncChunk('accounts', accounts);
    importSyncChunk('journal', journal);
    importSyncChunk('invoices', invoices);
    importSyncChunk('invoiceLines', invoiceLines);
    return finishSyncSession(logId, {
      accounts: accounts.length,
      journal: journal.length,
      invoices: invoices.length,
      invoiceLines: invoiceLines.length
    });
  } catch (err) {
    failSyncSession(logId, err.message);
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
  startSyncSession,
  purgeSyncScope,
  importSyncChunk,
  finishSyncSession,
  failSyncSession,
  getSyncStatus
};
