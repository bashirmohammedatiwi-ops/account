const db = require('./db');
const {
  readSyncNum,
  assignBillNosForLines,
  resolveLineTotal
} = require('./invoice-line-sync');
const { syncMaterialsFromEdari, refreshAllProductsFromEdariCache } = require('./products');
const { normalizeEdariDateIso } = require('./date-utils');

const usedBillNosStmt = db.prepare('SELECT bill_no FROM invoice_lines WHERE bill_seq = ?');

function getChildren(parentSeq) {
  return db.prepare(
    'SELECT * FROM accounts WHERE master_seq = ? ORDER BY num'
  ).all(String(parentSeq));
}

/** كل الحسابات النهائية (بدون فروع) تحت شجرة أو مجلد */
function getLeafDescendants(rootSeq) {
  const leaves = [];
  const queue = [String(rootSeq)];
  while (queue.length) {
    const parent = queue.shift();
    const kids = getChildren(parent);
    for (const kid of kids) {
      if (Number(kid.sub_count) > 0) {
        queue.push(String(kid.seq));
      } else {
        leaves.push(kid);
      }
    }
  }
  return leaves.sort((a, b) => String(a.num).localeCompare(String(b.num), 'ar'));
}

/** مسار المجلدات بين الشجرة والزبون — مثل: الصليخ */
function getGroupPath(leafSeq, rootSeq) {
  const parts = [];
  let current = String(leafSeq);
  const root = String(rootSeq);
  const seen = new Set();
  while (current && current !== root && !seen.has(current)) {
    seen.add(current);
    const row = db.prepare('SELECT master_seq FROM accounts WHERE seq = ?').get(current);
    if (!row) break;
    const master = String(row.master_seq || '0');
    if (!master || master === '0' || master === root) break;
    const parent = db.prepare('SELECT name1 FROM accounts WHERE seq = ?').get(master);
    if (parent?.name1) parts.unshift(parent.name1);
    current = master;
  }
  return parts.join(' / ');
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
  const { getPrimaryAgentId, normalizeRole } = require('./agent-hierarchy');
  const agent = db.prepare('SELECT delegate_role, parent_agent_id FROM agents WHERE id = ?').get(Number(agentId));
  const role = normalizeRole(agent?.delegate_role);
  const treeAgentIds = [Number(agentId)];
  if (role === 'secondary' && agent?.parent_agent_id) {
    treeAgentIds.push(Number(agent.parent_agent_id));
  }

  const roots = [];
  for (const tid of treeAgentIds) {
    const rows = db.prepare('SELECT account_seq FROM agent_trees WHERE agent_id = ?').all(tid);
    for (const r of rows) roots.push(r.account_seq);
  }

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

function looksBrokenTreeName(name) {
  const s = String(name || '');
  return !s.trim() || s.includes('\uFFFD') || s.includes('�') || /[\u4e00-\u9fff]/.test(s);
}

function pickBetterTreeName(a, b) {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (left && !looksBrokenTreeName(left)) return left;
  if (right && !looksBrokenTreeName(right)) return right;
  return left || right;
}

function classifyAssignableTree(row = {}) {
  const num = String(row.num || '').trim();
  const name = String(row.name1 || '').trim();
  const master = String(row.master ?? row.master_seq ?? '').replace(/[^0-9]/g, '') || '0';
  const isCustomer = row.isCustomer === true
    || master === '13'
    || /^121/.test(num)
    || /زبائن|زبون/.test(name);
  return { isCustomer, master };
}

function sortAssignableTrees(trees = []) {
  return trees.slice().sort((a, b) => {
    if (!!b.isCustomer !== !!a.isCustomer) return a.isCustomer ? -1 : 1;
    const seqDiff = Number(b.seq || 0) - Number(a.seq || 0);
    if (seqDiff) return seqDiff;
    return String(a.num || '').localeCompare(String(b.num || ''), 'ar', { numeric: true });
  });
}

function getAssignableTrees() {
  return db.prepare(`
    SELECT seq, num, name1, sub_count, bal, master_seq
    FROM accounts
    WHERE CAST(sub_count AS INTEGER) > 0
       OR master_seq = '13'
       OR name1 LIKE '%زبائن%'
       OR name1 LIKE '%شجرة%'
    ORDER BY seq DESC
  `).all();
}

/**
 * دمج شجرات Edari الحية مع المرفوعة للسيرفر — للعرض في صلاحيات المندوب.
 * onServer=true يعني الحسابات مرفوعة؛ يمكن تعيين الشجرة حتى قبل الرفع.
 */
function getMergedAssignableTrees(edariTrees = []) {
  const dbTrees = getAssignableTrees();
  const dbSeqSet = new Set(dbTrees.map((r) => String(r.seq)));
  const map = new Map();

  for (const raw of edariTrees || []) {
    const seq = String(raw.seq ?? '').trim();
    if (!seq) continue;
    const name1 = String(raw.name1 || '').trim();
    const extra = classifyAssignableTree({ ...raw, name1 });
    map.set(seq, {
      seq,
      num: String(raw.num || '').trim(),
      name1,
      sub_count: Number(raw.sub_count ?? raw.subCount ?? 0),
      bal: Number(raw.bal ?? 0),
      master: extra.master,
      isCustomer: extra.isCustomer,
      onServer: dbSeqSet.has(seq)
    });
  }

  for (const dbRow of dbTrees) {
    const seq = String(dbRow.seq);
    const hit = map.get(seq);
    if (hit) {
      const name1 = pickBetterTreeName(hit.name1, dbRow.name1);
      const extra = classifyAssignableTree({ ...hit, name1, num: hit.num || dbRow.num });
      map.set(seq, {
        ...hit,
        onServer: true,
        num: hit.num || String(dbRow.num || '').trim(),
        name1,
        sub_count: hit.sub_count || Number(dbRow.sub_count || 0),
        bal: hit.bal ?? dbRow.bal,
        master: extra.master,
        isCustomer: extra.isCustomer
      });
    } else {
      const name1 = String(dbRow.name1 || '').trim();
      const extra = classifyAssignableTree({ ...dbRow, name1 });
      map.set(seq, {
        seq,
        num: String(dbRow.num || '').trim(),
        name1,
        sub_count: Number(dbRow.sub_count || 0),
        bal: Number(dbRow.bal || 0),
        master: extra.master,
        isCustomer: extra.isCustomer,
        onServer: true
      });
    }
  }

  return sortAssignableTrees([...map.values()]);
}

/**
 * حركات الحساب — تشمل حركات كل الأحفاد إذا كان حساباً أباً (sub_count > 0)،
 * تماماً مثل كشف الحساب في Edari الذي يجمّع حركات الفروع تحت الأب.
 * للزبون النهائي (sub_count = 0) تُرجَع حركاته فقط.
 */
function getAccountJournalRows(account) {
  const isParent = Number(account.sub_count) > 0;
  if (!isParent) {
    return db.prepare(
      'SELECT * FROM journal WHERE acc_seq = ? ORDER BY tx_date, seq'
    ).all(String(account.seq));
  }

  const seqs = getDescendantSeqs(account.seq);
  if (seqs.length <= 1) {
    return db.prepare(
      'SELECT * FROM journal WHERE acc_seq = ? ORDER BY tx_date, seq'
    ).all(String(account.seq));
  }

  const placeholders = seqs.map(() => '?').join(',');
  const nameBySeq = new Map();
  for (const s of seqs) {
    const a = db.prepare('SELECT name1 FROM accounts WHERE seq = ?').get(String(s));
    if (a?.name1) nameBySeq.set(String(s), a.name1);
  }
  const rows = db.prepare(
    `SELECT * FROM journal WHERE acc_seq IN (${placeholders}) ORDER BY tx_date, seq`
  ).all(...seqs);

  // وسم كل حركة بالفرع المصدر (يظهر في عمود الفرع بالكشف)
  for (const row of rows) {
    if (String(row.acc_seq) !== String(account.seq)) {
      const branchName = nameBySeq.get(String(row.acc_seq));
      if (branchName && !String(row.exp2 || '').trim()) {
        row.exp2 = branchName;
      }
    }
  }
  return rows;
}

function getStatementForAccount(accSeq) {
  const account = db.prepare('SELECT * FROM accounts WHERE seq = ?').get(String(accSeq));
  if (!account) return null;
  const rows = getAccountJournalRows(account);

  const {
    buildStatementLines,
    balanceSummaryLabel,
    debtStatusFromBalance,
    resolveDebtDisplayAmount,
    resolveStatementTotals,
    resolveFinalBalance,
    buildOpeningLine,
    resolveStatementPeriod,
    resolveCumulativeStatementWindow
  } = require('./statement-utils');
  const { resolveLastMatchCutoff, hasMatchCutoff } = require('./reconciliation-utils');

  const cutoff = resolveLastMatchCutoff(account, rows);
  const matchAvailable = hasMatchCutoff(account, rows);

  const hasPreviousYear = rows.some((r) => String(r.seq || '').startsWith('PY'));
  const {
    openingBalance,
    movementRows: filteredRows,
    periodCutoff,
    openingNote
  } = hasPreviousYear
    ? { openingBalance: 0, movementRows: rows, periodCutoff: null, openingNote: '' }
    : resolveCumulativeStatementWindow(account, rows);

  const stmt = buildStatementLines(filteredRows, { openingBalance });

  const openingLine = openingBalance !== 0
    ? buildOpeningLine(openingBalance, periodCutoff, { note: openingNote })
    : null;
  if (openingLine) {
    stmt.lines.unshift(openingLine);
  }

  const { periodStart, periodEnd } = resolveStatementPeriod(filteredRows, periodCutoff);

  const { totalDebit, totalCredit } = resolveStatementTotals({
    lines: stmt.lines,
    stmt,
    account,
    preferLineTotals: true
  });
  const finalBalance = resolveFinalBalance({
    accountBal: account.bal,
    totalDebit,
    totalCredit,
    stmtFinalBalance: stmt.finalBalance,
    preferLineBalance: true
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

function normalizeJournalSeq(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^PY[0-9A-Za-z]+:/i.test(s)) return s;
  return s.replace(/[^0-9]/g, '');
}

function preserveSyncId(raw) {
  const s = String(raw ?? '').trim();
  if (/^PY[0-9A-Za-z]+:/i.test(s)) return s;
  const n = s.replace(/[^0-9]/g, '');
  return n && n !== '0' ? n : '';
}

function mapJournalRow(j) {
  const dept = j.Dept ?? j.is_debit;
  const billSeq = preserveSyncId(j.BillSeq ?? j.bill_seq);
  return {
    seq: normalizeJournalSeq(j.Seq ?? j.seq),
    acc_seq: String(j.Acc ?? j.acc_seq ?? '').replace(/[^0-9]/g, ''),
    tx_date: normalizeEdariDateIso(j.Date ?? j.tx_date ?? j.DtCreated ?? '')
      || String(j.Date ?? j.tx_date ?? j.DtCreated ?? '').trim(),
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
    seq: preserveSyncId(inv.Seq ?? inv.seq) || String(inv.Seq ?? inv.seq ?? ''),
    num: String(inv.Num ?? inv.num ?? ''),
    kind: String(inv.Kind ?? inv.kind ?? ''),
    inv_date: normalizeEdariDateIso(inv.Date ?? inv.inv_date ?? '')
      || String(inv.Date ?? inv.inv_date ?? '').trim(),
    total: Number(inv.Total ?? inv.total ?? 0),
    payment: Number(inv.Payment ?? inv.payment ?? 0),
    discount: Number(inv.DisCnt ?? inv.discount ?? 0),
    line_count: Number(inv.count ?? inv.line_count ?? 0),
    remarks: inv.remarks ?? inv.Remarks ?? '',
    acc_seq: String(inv.Two ?? inv.acc_seq ?? ''),
    synced_at: now
  };
}

const maxBillNoStmt = db.prepare(`
  SELECT COALESCE(MAX(bill_no), 0) AS m FROM invoice_lines WHERE bill_seq = ?
`);

function ensureInvoiceLineBillNosForImport(rows = []) {
  return assignBillNosForLines(rows, {
    getMaxBillNo: (billSeq) => Number(maxBillNoStmt.get(billSeq)?.m || 0),
    getUsedBillNos: (billSeq) => usedBillNosStmt
      .all(billSeq)
      .map((row) => Number(row.bill_no))
      .filter((n) => n > 0)
  });
}

function mapInvoiceLineRow(line) {
  const billSeq = preserveSyncId(line.BillSeq ?? line.bill_seq);
  if (!billSeq) return null;
  const quant = readSyncNum(line, 'Quant', 'quant');
  const price = readSyncNum(line, 'Price', 'price');
  const bonus = readSyncNum(line, 'OBonus', 'bonus');
  const lineTotalVal = resolveLineTotal(line);
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

function startSyncSession(accountSeqs = [], options = {}) {
  const started = new Date().toISOString();
  const logId = db.prepare(
    'INSERT INTO sync_logs (started_at, status, message) VALUES (?, ?, ?)'
  ).run(started, 'running', 'جاري الاستيراد').lastInsertRowid;

  const shouldPurge = options.purge === true || options.replace === true;
  if (shouldPurge && accountSeqs.length) {
    if (options.scope === 'previous-year') purgePreviousYearScope(accountSeqs);
    else purgeCurrentYearScope(accountSeqs);
  }

  return logId;
}

function uniqueAccountSeqs(accountSeqs = []) {
  return [...new Set(accountSeqs.map((s) => String(s)).filter(Boolean))];
}

function deleteInvoicesBySeqs(billSeqs = []) {
  const seqs = [...new Set(billSeqs.map((s) => String(s || '').trim()).filter(Boolean))];
  if (!seqs.length) return { invoices: { changes: 0 }, lines: { changes: 0 } };
  const placeholders = seqs.map(() => '?').join(',');
  const lines = db.prepare(`DELETE FROM invoice_lines WHERE bill_seq IN (${placeholders})`).run(...seqs);
  const invoices = db.prepare(`DELETE FROM invoices WHERE seq IN (${placeholders})`).run(...seqs);
  return { invoices, lines };
}

/** يحذف حركات وفواتير السنة الحالية فقط — لا يمس بيانات السنة السابقة (PY...). */
function purgeCurrentYearScope(accountSeqs = []) {
  const seqs = uniqueAccountSeqs(accountSeqs);
  if (!seqs.length) return { purgedAccounts: 0, purgedJournal: 0, purgedInvoices: 0 };

  const placeholders = seqs.map(() => '?').join(',');
  const billRows = db.prepare(`
    SELECT DISTINCT bill_seq FROM journal
    WHERE acc_seq IN (${placeholders})
      AND bill_seq IS NOT NULL AND bill_seq != ''
      AND IFNULL(seq, '') NOT LIKE 'PY%'
      AND bill_seq NOT LIKE 'PY%'
  `).all(...seqs);
  const extraInvoices = db.prepare(`
    SELECT seq FROM invoices
    WHERE acc_seq IN (${placeholders}) AND seq NOT LIKE 'PY%'
  `).all(...seqs);
  const billSeqs = [...new Set([
    ...billRows.map((r) => String(r.bill_seq || '')),
    ...extraInvoices.map((r) => String(r.seq || ''))
  ].filter((s) => s && !s.startsWith('PY')))];

  const tx = db.transaction(() => {
    const journalResult = db.prepare(`
      DELETE FROM journal
      WHERE acc_seq IN (${placeholders}) AND IFNULL(seq, '') NOT LIKE 'PY%'
    `).run(...seqs);
    const deleted = deleteInvoicesBySeqs(billSeqs);
    return {
      purgedAccounts: seqs.length,
      purgedJournal: journalResult.changes || 0,
      purgedInvoices: deleted.invoices.changes || 0,
      purgedInvoiceLines: deleted.lines.changes || 0
    };
  });
  return tx();
}

/** يحذف بيانات السنة السابقة المرفوعة يدوياً فقط، قبل إعادة رفعها. */
function purgePreviousYearScope(accountSeqs = []) {
  const seqs = uniqueAccountSeqs(accountSeqs);
  if (!seqs.length) return { purgedAccounts: 0, purgedJournal: 0, purgedInvoices: 0 };

  const placeholders = seqs.map(() => '?').join(',');
  const billRows = db.prepare(`
    SELECT DISTINCT bill_seq FROM journal
    WHERE acc_seq IN (${placeholders})
      AND (seq LIKE 'PY%' OR bill_seq LIKE 'PY%')
  `).all(...seqs);
  const extraInvoices = db.prepare(`
    SELECT seq FROM invoices
    WHERE acc_seq IN (${placeholders}) AND seq LIKE 'PY%'
  `).all(...seqs);
  const billSeqs = [...new Set([
    ...billRows.map((r) => String(r.bill_seq || '')),
    ...extraInvoices.map((r) => String(r.seq || ''))
  ].filter((s) => s.startsWith('PY')))];

  const tx = db.transaction(() => {
    const journalResult = db.prepare(`
      DELETE FROM journal
      WHERE acc_seq IN (${placeholders}) AND seq LIKE 'PY%'
    `).run(...seqs);
    const deleted = deleteInvoicesBySeqs(billSeqs);
    return {
      purgedAccounts: seqs.length,
      purgedJournal: journalResult.changes || 0,
      purgedInvoices: deleted.invoices.changes || 0,
      purgedInvoiceLines: deleted.lines.changes || 0
    };
  });
  return tx();
}

function purgeSyncScope(accountSeqs = []) {
  return purgeCurrentYearScope(accountSeqs);
}

function importSyncChunk(kind, rows = []) {
  if (kind === 'products') {
    if (!rows.length) return { imported: 0, kind };
    const result = syncMaterialsFromEdari(rows);
    return {
      imported: result.materials,
      kind,
      scanned: result.scanned,
      productsUpdated: result.productsUpdated
    };
  }

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
    invoiceLines = 0,
    products = 0,
    source = ''
  } = stats;
  let catalogUpdated = 0;
  let catalogPrices = 0;
  try {
    const refreshed = refreshAllProductsFromEdariCache();
    catalogUpdated = refreshed.updated || 0;
    catalogPrices = refreshed.pricesApplied || 0;
  } catch {
    /* catalog refresh is best-effort */
  }
  const finished = new Date().toISOString();
  const prefix = source === 'auto' ? '[تلقائي] ' : '';
  const catalogPart = catalogUpdated
    ? `، ${catalogUpdated} منتج كتalog`
    : '';
  db.prepare(`
    UPDATE sync_logs SET finished_at=?, status=?, accounts_count=?, journal_count=?, message=?
    WHERE id=?
  `).run(
    finished,
    'success',
    accounts,
    journal,
    `${prefix}تمت المزامنة: ${accounts} حساب، ${journal} حركة، ${invoices} فاتورة، ${invoiceLines} بند${products ? `، ${products} مادة Edari` : ''}${catalogPart}`,
    logId
  );
  return {
    ok: true,
    accounts,
    journal,
    invoices,
    invoiceLines,
    products,
    catalogUpdated,
    catalogPrices,
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

function importSyncData({
  accounts = [],
  journal = [],
  invoices = [],
  invoiceLines = [],
  products = [],
  accountSeqs = [],
  scope = 'current'
}) {
  const purgeSeqs = collectAccountSeqs(accounts, accountSeqs);
  const logId = startSyncSession(purgeSeqs, { purge: true, scope });
  try {
    importSyncChunk('accounts', accounts);
    importSyncChunk('journal', journal);
    importSyncChunk('invoices', invoices);
    importSyncChunk('invoiceLines', invoiceLines);
    if (products.length) importSyncChunk('products', products);
    return finishSyncSession(logId, {
      accounts: accounts.length,
      journal: journal.length,
      invoices: invoices.length,
      invoiceLines: invoiceLines.length,
      products: products.length
    });
  } catch (err) {
    failSyncSession(logId, err.message);
    throw err;
  }
}

function filterAssignableTreeSeqs(treeSeqs = []) {
  const valid = [];
  const invalid = [];
  const seen = new Set();
  for (const raw of treeSeqs) {
    const seq = String(raw ?? '').replace(/[^0-9]/g, '');
    if (!seq) {
      const leftover = String(raw ?? '').trim();
      if (leftover) invalid.push(leftover);
      continue;
    }
    if (seen.has(seq)) continue;
    seen.add(seq);
    valid.push(seq);
  }
  return { valid, invalid };
}

function ensureAssignableAccountStubs(treeInfos = []) {
  const now = new Date().toISOString();
  const get = db.prepare('SELECT seq, sub_count FROM accounts WHERE seq = ?');
  const insert = db.prepare(`
    INSERT INTO accounts (seq, num, name1, name2, master_seq, sub_count, bal, tot1, tot2, address, remarks, official_name, fix_date, fix_bal, last_match_seq, last_match_date, synced_at)
    VALUES (@seq, @num, @name1, '', @master_seq, @sub_count, 0, 0, 0, '', '', '', '', 0, '', '', @synced_at)
  `);
  const bump = db.prepare(`
    UPDATE accounts
    SET sub_count = CASE WHEN CAST(sub_count AS INTEGER) < 1 THEN 1 ELSE sub_count END,
        num = CASE WHEN @num != '' THEN @num ELSE num END,
        name1 = CASE WHEN @name1 != '' THEN @name1 ELSE name1 END,
        master_seq = CASE WHEN @master_seq != '' AND @master_seq != '0' THEN @master_seq ELSE master_seq END
    WHERE seq = @seq
  `);

  const tx = db.transaction(() => {
    for (const raw of treeInfos || []) {
      const seq = String(raw?.seq ?? raw).replace(/[^0-9]/g, '');
      if (!seq) continue;
      const num = String(raw?.num || '').trim();
      const name1 = String(raw?.name1 || raw?.name || '').trim();
      const master = String(raw?.master || raw?.master_seq || '13').replace(/[^0-9]/g, '') || '13';
      const subCount = Math.max(1, Number(raw?.sub_count || 0));
      const existing = get.get(seq);
      if (!existing) {
        insert.run({
          seq,
          num,
          name1,
          master_seq: master,
          sub_count: subCount,
          synced_at: now
        });
      } else {
        bump.run({ seq, num, name1, master_seq: master });
      }
    }
  });
  tx();
  return { ok: true, count: (treeInfos || []).length };
}

function assignAgentTrees(agentId, treeSeqs = [], treeMeta = []) {
  const { valid, invalid } = filterAssignableTreeSeqs(treeSeqs);
  const metaBySeq = new Map(
    (Array.isArray(treeMeta) ? treeMeta : []).map((t) => [String(t.seq || '').replace(/[^0-9]/g, ''), t])
  );
  ensureAssignableAccountStubs(valid.map((seq) => metaBySeq.get(seq) || { seq }));
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM agent_trees WHERE agent_id = ?').run(agentId);
    const ins = db.prepare('INSERT INTO agent_trees (agent_id, account_seq) VALUES (?, ?)');
    for (const seq of valid) ins.run(agentId, seq);
  });
  replace();
  return { valid, invalid };
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
  getLeafDescendants,
  getGroupPath,
  getDescendantSeqs,
  agentAllowedSeqs,
  canAgentAccess,
  getAssignableTrees,
  getMergedAssignableTrees,
  filterAssignableTreeSeqs,
  ensureAssignableAccountStubs,
  assignAgentTrees,
  getStatementForAccount,
  importSyncData,
  startSyncSession,
  purgeSyncScope,
  importSyncChunk,
  finishSyncSession,
  failSyncSession,
  getSyncStatus
};
