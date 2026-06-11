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

  const {
    buildStatementLines,
    balanceSummaryLabel,
    debtStatusFromBalance,
    resolveDebtDisplayAmount,
    resolveStatementTotals,
    resolveFinalBalance,
    buildOpeningLine,
    isValidFixDate,
    resolveStatementPeriod,
    parseAmount,
    isDebitRow,
    normalizeCarriedBalance
  } = require('./statement-utils');
  const { resolveLastMatchCutoff, hasMatchCutoff } = require('./reconciliation-utils');

  const cutoff = resolveLastMatchCutoff(account, rows);
  const matchAvailable = hasMatchCutoff(account, rows);

  // Edari: كل حركات الحساب — لا فلترة FixDate؛ رصيد مدور فقط عند FixBal وعدم وجود مدين
  const filteredRows = rows;
  const periodCutoff = isValidFixDate(account.fix_date)
    ? { date: account.fix_date, seq: '', source: 'fix_date' }
    : null;

  const hasDebitMovements = rows.some((row) => {
    const am = parseAmount(row.am);
    return am > 0 && isDebitRow(row);
  });

  let openingBalance = 0;
  const fixBal = parseAmount(account.fix_bal);
  if (!hasDebitMovements && fixBal !== 0) {
    openingBalance = normalizeCarriedBalance(fixBal, account);
  }

  const stmt = buildStatementLines(filteredRows, { openingBalance });

  const openingLine = openingBalance !== 0
    ? buildOpeningLine(openingBalance, periodCutoff)
    : null;
  if (openingLine) {
    stmt.lines.unshift(openingLine);
  }

  const { periodStart, periodEnd } = resolveStatementPeriod(filteredRows, periodCutoff);

  const { totalDebit, totalCredit } = resolveStatementTotals({
    lines: stmt.lines,
    stmt,
    account
  });
  const finalBalance = resolveFinalBalance({
    accountBal: account.bal,
    totalDebit,
    totalCredit,
    stmtFinalBalance: stmt.finalBalance
  });
  const debtAmount = resolveDebtDisplayAmount({
    finalBalance,
    totalDebit,
    totalCredit,
    account: { bal: account.bal }
  });

  return {
    account: {
      seq: account.seq,
      num: account.num,
      name1: account.name1,
      name2: account.name2,
      address: account.address,
      bal: account.bal,
      tot1: account.tot1,
      tot2: account.tot2,
      fixDate: account.fix_date || null,
      fixBal: account.fix_bal ?? 0,
      debtStatus: debtStatusFromBalance(finalBalance)
    },
    ...stmt,
    lines: stmt.lines,
    totalDebit,
    totalCredit,
    finalBalance,
    debtAmount,
    summary: balanceSummaryLabel(finalBalance, account.name1),
    openingBalance,
    sinceLastMatch: false,
    periodStart,
    periodEnd,
    lastMatch: cutoff
      ? { seq: cutoff.seq || null, date: cutoff.date || '', source: cutoff.source || null }
      : null,
    hasMatchCutoff: matchAvailable,
    matchSource: cutoff?.source || null
  };
}

const SYNC_UPSERTS = {
  accounts: db.prepare(`
    INSERT INTO accounts (seq, num, name1, name2, master_seq, sub_count, bal, tot1, tot2, address, remarks, official_name, fix_date, fix_bal, last_match_seq, last_match_date, synced_at)
    VALUES (@seq, @num, @name1, @name2, @master_seq, @sub_count, @bal, @tot1, @tot2, @address, @remarks, @official_name, @fix_date, @fix_bal, @last_match_seq, @last_match_date, @synced_at)
    ON CONFLICT(seq) DO UPDATE SET
      num=excluded.num, name1=excluded.name1, name2=excluded.name2, master_seq=excluded.master_seq,
      sub_count=excluded.sub_count, bal=excluded.bal, tot1=excluded.tot1, tot2=excluded.tot2,
      address=excluded.address, remarks=excluded.remarks, official_name=excluded.official_name,
      fix_date=excluded.fix_date, fix_bal=excluded.fix_bal, last_match_seq=excluded.last_match_seq, last_match_date=excluded.last_match_date,
      synced_at=excluded.synced_at
  `),
  journal: db.prepare(`
    INSERT INTO journal (seq, acc_seq, tx_date, am, is_debit, exp1, exp2, bill_num, bill_seq, bill_kind)
    VALUES (@seq, @acc_seq, @tx_date, @am, @is_debit, @exp1, @exp2, @bill_num, @bill_seq, @bill_kind)
    ON CONFLICT(seq, acc_seq) DO UPDATE SET
      tx_date=excluded.tx_date, am=excluded.am, is_debit=excluded.is_debit,
      exp1=excluded.exp1, exp2=excluded.exp2, bill_num=excluded.bill_num,
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
    ON CONFLICT(bill_seq, bill_no) DO UPDATE SET
      mat=excluded.mat,
      mat_num=excluded.mat_num,
      mat_name=excluded.mat_name,
      quant=excluded.quant,
      bonus=excluded.bonus,
      price=excluded.price,
      line_total=excluded.line_total,
      remarks=excluded.remarks,
      kind=excluded.kind
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
    fix_date: a.FixDate ?? a.fix_date ?? '',
    fix_bal: Number(a.FixBal ?? a.fix_bal ?? 0),
    last_match_seq: String(a.LastMatchSeq ?? a.last_match_seq ?? ''),
    last_match_date: a.LastMatchDate ?? a.last_match_date ?? '',
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
    seq: String(j.Seq ?? j.seq).replace(/[^0-9]/g, ''),
    acc_seq: String(j.Acc ?? j.acc_seq ?? '').replace(/[^0-9]/g, ''),
    tx_date: j.Date ?? j.tx_date ?? j.DtCreated ?? '',
    am: Number(j.Am ?? j.am ?? 0),
    is_debit: dept === 'True' || dept === true || dept === 1 ? 1 : 0,
    exp1: String(j.Exp1 ?? j.exp1 ?? j.Remarks ?? j.remarks ?? '').trim(),
    exp2: String(j.Exp2 ?? j.exp2 ?? '').trim(),
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

function readSyncNum(row, ...keys) {
  if (!row) return 0;
  const entries = Object.entries(row);
  for (const key of keys) {
    const lower = key.toLowerCase();
    const hit = entries.find(([name]) => String(name).toLowerCase() === lower);
    const value = hit ? hit[1] : row[key];
    if (value == null || value === '') continue;
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function ensureInvoiceLineBillNosForImport(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const billSeq = String(row.BillSeq ?? row.bill_seq ?? '').replace(/[^0-9]/g, '');
    if (!billSeq) continue;
    if (!grouped.has(billSeq)) grouped.set(billSeq, []);
    grouped.get(billSeq).push(row);
  }

  const maxBillNoStmt = db.prepare(`
    SELECT COALESCE(MAX(bill_no), 0) AS m FROM invoice_lines WHERE bill_seq = ?
  `);
  const out = [];

  for (const [billSeq, lines] of grouped) {
    lines.sort((a, b) => {
      const ba = readSyncNum(a, 'BillNo', 'bill_no', 'LineIndex', 'lineIndex');
      const bb = readSyncNum(b, 'BillNo', 'bill_no', 'LineIndex', 'lineIndex');
      if (ba !== bb) return ba - bb;
      return 0;
    });

    const used = new Set();
    let fallback = Number(maxBillNoStmt.get(billSeq)?.m || 0);

    for (const line of lines) {
      let billNo = readSyncNum(line, 'BillNo', 'bill_no', 'LineIndex', 'lineIndex');
      if (billNo > 0 && used.has(billNo)) billNo = 0;
      if (!billNo) {
        do {
          fallback += 1;
          billNo = fallback;
        } while (used.has(billNo));
      }
      used.add(billNo);
      out.push({ ...line, BillNo: billNo, bill_no: billNo });
    }
  }

  return out;
}

function mapInvoiceLineRow(line) {
  const billSeq = String(line.BillSeq ?? line.bill_seq ?? '').replace(/[^0-9]/g, '');
  if (!billSeq) return null;
  const quant = readSyncNum(line, 'Quant', 'quant');
  const price = readSyncNum(line, 'Price', 'price');
  const bonus = readSyncNum(line, 'OBonus', 'bonus');
  const storedTotal = readSyncNum(line, 'Sum', 'sum', 'line_total');
  const lineTotalVal = storedTotal > 0 ? storedTotal : quant * price;
  const matName = line.MatName ?? line.mat_name ?? line.Name1 ?? '';
  const mat = String(line.Mat ?? line.mat ?? '');
  const billNo = readSyncNum(line, 'BillNo', 'bill_no', 'LineIndex', 'lineIndex');
  if (!billNo) return null;
  if (!quant && !bonus && !price && !lineTotalVal && !String(matName).trim() && !mat.trim()) {
    return null;
  }
  return {
    bill_seq: billSeq,
    bill_no: billNo,
    mat,
    mat_num: String(line.MatNum ?? line.mat_num ?? line.Num ?? ''),
    mat_name: matName,
    quant,
    bonus,
    price,
    line_total: lineTotalVal,
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
      for (const row of ensureInvoiceLineBillNosForImport(rows)) {
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

function collectAccountSeqs(accounts = [], accountSeqs = []) {
  const fromArg = [...new Set(accountSeqs.map((s) => String(s).replace(/[^0-9]/g, '')).filter(Boolean))];
  if (fromArg.length) return fromArg;
  return [...new Set(
    accounts
      .map((a) => String(a.Seq ?? a.seq ?? '').replace(/[^0-9]/g, ''))
      .filter(Boolean)
  )];
}

function importSyncData({ accounts = [], journal = [], invoices = [], invoiceLines = [], accountSeqs = [] }) {
  const purgeSeqs = collectAccountSeqs(accounts, accountSeqs);
  const logId = startSyncSession(purgeSeqs);
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
