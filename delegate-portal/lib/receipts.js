const db = require('./db');
const { linkDeliveryReceiptToReceipt } = require('./delivery-receipts');
const {
  buildReceiptJournalLines,
  validatePostingAccounts
} = require('./receipt-posting');

const STATUS_LABELS = {
  pending: 'بانتظار المراجعة',
  reviewed: 'جاهز للترحيل',
  posted: 'مُرحَّل',
  rejected: 'مرفوض'
};

const AGENT_VISIBLE = new Set(['pending', 'reviewed', 'posted', 'rejected']);

function statusLabel(s) {
  return STATUS_LABELS[s] || s;
}

function nextReceiptNo() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const head = `RV-${day}`;
  const last = db.prepare(`
    SELECT receipt_no FROM receipts WHERE receipt_no LIKE ? ORDER BY id DESC LIMIT 1
  `).get(`${head}-%`);
  let seq = 1;
  if (last?.receipt_no) {
    const part = Number(last.receipt_no.split('-').pop());
    if (!Number.isNaN(part)) seq = part + 1;
  }
  return `${head}-${String(seq).padStart(4, '0')}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? String(row.value || '') : fallback;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value ?? ''));
}

const EMPTY_ACCOUNT = { seq: '', num: '', name: '' };

function parseAccountJson(raw) {
  try {
    const v = JSON.parse(raw || '{}');
    return {
      seq: String(v.seq || ''),
      num: String(v.num || ''),
      name: String(v.name || v.name1 || '')
    };
  } catch {
    return { ...EMPTY_ACCOUNT };
  }
}

function getReceiptAccountSettings() {
  return {
    cash: parseAccountJson(getSetting('receipt_cash_account')),
    commissionDebit: parseAccountJson(getSetting('receipt_commission_debit_account')),
    commissionCredit: parseAccountJson(getSetting('receipt_commission_credit_account')),
    discount: parseAccountJson(getSetting('receipt_discount_account'))
  };
}

function saveReceiptAccountSettings(payload = {}) {
  const keys = {
    cash: 'receipt_cash_account',
    commissionDebit: 'receipt_commission_debit_account',
    commissionCredit: 'receipt_commission_credit_account',
    discount: 'receipt_discount_account'
  };
  for (const [field, key] of Object.entries(keys)) {
    const acc = payload[field] || {};
    setSetting(key, JSON.stringify({
      seq: String(acc.seq || ''),
      num: String(acc.num || ''),
      name: String(acc.name || acc.name1 || '')
    }));
  }
  return getReceiptAccountSettings();
}

function findAccount(seqOrNum) {
  const raw = String(seqOrNum || '').trim();
  if (!raw) return null;
  return db.prepare(`
    SELECT seq, num, name1 FROM accounts
    WHERE seq = ? OR num = ?
    ORDER BY CASE WHEN seq = ? THEN 0 WHEN num = ? THEN 1 ELSE 2 END
    LIMIT 1
  `).get(raw, raw, raw, raw);
}

function logEvent(receiptId, { actorType, actorId, fromStatus, toStatus, note }) {
  db.prepare(`
    INSERT INTO receipt_events (receipt_id, actor_type, actor_id, from_status, to_status, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    receiptId,
    actorType || '',
    actorId != null ? String(actorId) : '',
    fromStatus || '',
    toStatus || '',
    note || ''
  );
}

function mapReceipt(row, events = []) {
  if (!row) return null;
  const account = row.customer_acc_seq
    ? db.prepare('SELECT seq, num, name1 FROM accounts WHERE seq = ?').get(String(row.customer_acc_seq))
    : null;
  const agent = row.agent_id
    ? db.prepare('SELECT id, name FROM agents WHERE id = ?').get(row.agent_id)
    : null;
  const settings = getReceiptAccountSettings();
  const snapshot = {
    cash: row.cash_acc_seq ? findAccount(row.cash_acc_seq) : settings.cash,
    commissionDebit: row.commission_debit_acc_seq
      ? findAccount(row.commission_debit_acc_seq) : settings.commissionDebit,
    commissionCredit: row.commission_credit_acc_seq
      ? findAccount(row.commission_credit_acc_seq) : settings.commissionCredit,
    discount: row.discount_acc_seq ? findAccount(row.discount_acc_seq) : settings.discount
  };
  const mapped = {
    id: row.id,
    receiptNo: row.receipt_no,
    status: row.status,
    statusLabel: statusLabel(row.status),
    agentId: row.agent_id,
    agentName: agent?.name || '',
    customerAccSeq: row.customer_acc_seq || '',
    customerNum: account?.num || '',
    customerName: account?.name1 || '',
    treeAccSeq: row.tree_acc_seq || '',
    treeName: row.tree_name || '',
    amount: Number(row.amount || 0),
    commission: Number(row.commission || 0),
    discount: Number(row.discount || 0),
    notes: row.notes || '',
    receiptDate: row.receipt_date || '',
    accounts: {
      cash: accRow(snapshot.cash),
      commissionDebit: accRow(snapshot.commissionDebit),
      commissionCredit: accRow(snapshot.commissionCredit),
      discount: accRow(snapshot.discount)
    },
    edariReceiptNum: row.edari_receipt_num || '',
    edariJournalNum: row.edari_journal_num || '',
    edariPostedAt: row.edari_posted_at || '',
    postedError: row.posted_error || '',
    adminNote: row.admin_note || '',
    deliveryReceiptId: row.delivery_receipt_id || null,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    events: events.map((e) => ({
      id: e.id,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      note: e.note || '',
      actorType: e.actor_type,
      createdAt: e.created_at
    }))
  };
  mapped.journalPreview = buildReceiptJournalLines(mapped, {
    customer: { seq: mapped.customerAccSeq, num: mapped.customerNum, name: mapped.customerName },
    cash: mapped.accounts.cash,
    commissionDebit: mapped.accounts.commissionDebit,
    commissionCredit: mapped.accounts.commissionCredit,
    discount: mapped.accounts.discount
  });
  return mapped;
}

function accRow(row) {
  if (!row) return { ...EMPTY_ACCOUNT };
  return {
    seq: String(row.seq || ''),
    num: String(row.num || ''),
    name: String(row.name || row.name1 || '')
  };
}

function loadReceipt(id) {
  const row = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id);
  if (!row) return null;
  const events = db.prepare(
    'SELECT * FROM receipt_events WHERE receipt_id = ? ORDER BY id'
  ).all(id);
  return mapReceipt(row, events);
}

function listReceipts({ agentId, status, limit = 200 } = {}) {
  const where = [];
  const params = [];
  if (agentId) {
    where.push('agent_id = ?');
    params.push(agentId);
  }
  if (status && AGENT_VISIBLE.has(status)) {
    where.push('status = ?');
    params.push(status);
  }
  const sql = `
    SELECT * FROM receipts
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT ?
  `;
  params.push(Math.min(Math.max(Number(limit) || 200, 1), 500));
  return db.prepare(sql).all(...params).map((row) => mapReceipt(row));
}

function receiptStats() {
  const today = todayIso();
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) AS reviewed,
      SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END) AS posted,
      SUM(CASE WHEN date(submitted_at) = date(?) OR date(created_at) = date(?) THEN 1 ELSE 0 END) AS today
    FROM receipts
  `).get(today, today);
  return {
    total: row?.total || 0,
    pending: row?.pending || 0,
    reviewed: row?.reviewed || 0,
    posted: row?.posted || 0,
    today: row?.today || 0
  };
}

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function createReceipt(agentId, data = {}) {
  const customerAccSeq = String(data.customerAccSeq || '').trim();
  if (!customerAccSeq) throw new Error('اختر زبوناً من الشجرة');
  const customer = findAccount(customerAccSeq);
  if (!customer) throw new Error('الزبون غير موجود في الحسابات');

  const amount = money(data.amount);
  if (amount <= 0) throw new Error('أدخل مبلغ سند القبض');
  const commission = money(data.commission);
  const discount = money(data.discount);
  const settings = getReceiptAccountSettings();
  const receiptNo = nextReceiptNo();
  const deliveryReceiptId = Number(data.deliveryReceiptId || 0);

  if (deliveryReceiptId > 0) {
    const dr = db.prepare('SELECT * FROM delivery_receipts WHERE id = ? AND agent_id = ?').get(deliveryReceiptId, agentId);
    if (!dr) throw new Error('وصل الاستلام غير موجود');
    if (dr.receipt_id) throw new Error('تم إنشاء سند قبض لهذا الوصل مسبقاً');
    if (String(dr.customer_acc_seq) !== String(customer.seq)) {
      throw new Error('الزبون لا يطابق وصل الاستلام');
    }
  }

  const r = db.prepare(`
    INSERT INTO receipts (
      receipt_no, agent_id, customer_acc_seq, tree_acc_seq, tree_name,
      amount, commission, discount, notes, receipt_date, status,
      cash_acc_seq, commission_debit_acc_seq, commission_credit_acc_seq, discount_acc_seq,
      delivery_receipt_id, submitted_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    receiptNo,
    agentId,
    customer.seq,
    String(data.treeAccSeq || ''),
    String(data.treeName || ''),
    amount,
    commission,
    discount,
    String(data.notes || '').trim(),
    String(data.receiptDate || todayIso()).slice(0, 10),
    settings.cash.seq || '',
    settings.commissionDebit.seq || '',
    settings.commissionCredit.seq || '',
    settings.discount.seq || '',
    deliveryReceiptId > 0 ? deliveryReceiptId : null
  );
  if (deliveryReceiptId > 0) {
    linkDeliveryReceiptToReceipt(deliveryReceiptId, r.lastInsertRowid);
  }
  logEvent(r.lastInsertRowid, {
    actorType: 'agent',
    actorId: agentId,
    fromStatus: '',
    toStatus: 'pending',
    note: 'إنشاء سند قبض'
  });
  return loadReceipt(r.lastInsertRowid);
}

function updateReceiptByAdmin(id, patch = {}) {
  const row = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id);
  if (!row) return null;
  if (row.status === 'posted') throw new Error('لا يمكن تعديل سند مُرحَّل');

  let customerAccSeq = row.customer_acc_seq;
  if (patch.customerAccSeq) {
    const customer = findAccount(patch.customerAccSeq);
    if (!customer) throw new Error('الزبون غير موجود');
    customerAccSeq = customer.seq;
  }

  const amount = patch.amount != null ? money(patch.amount) : Number(row.amount);
  if (amount <= 0) throw new Error('المبلغ مطلوب');

  db.prepare(`
    UPDATE receipts SET
      customer_acc_seq = ?,
      tree_acc_seq = COALESCE(?, tree_acc_seq),
      tree_name = COALESCE(?, tree_name),
      amount = ?,
      commission = ?,
      discount = ?,
      notes = ?,
      receipt_date = ?,
      admin_note = ?,
      status = 'reviewed',
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    customerAccSeq,
    patch.treeAccSeq != null ? String(patch.treeAccSeq) : null,
    patch.treeName != null ? String(patch.treeName) : null,
    amount,
    patch.commission != null ? money(patch.commission) : Number(row.commission),
    patch.discount != null ? money(patch.discount) : Number(row.discount),
    patch.notes != null ? String(patch.notes).trim() : row.notes,
    patch.receiptDate != null ? String(patch.receiptDate).slice(0, 10) : row.receipt_date,
    patch.adminNote != null ? String(patch.adminNote).trim() : row.admin_note,
    id
  );
  logEvent(id, {
    actorType: 'admin',
    actorId: 'admin',
    fromStatus: row.status,
    toStatus: 'reviewed',
    note: 'تعديل قبل الترحيل'
  });
  return loadReceipt(id);
}

function setReceiptStatus(id, status, { actorType = 'admin', actorId = 'admin', note = '' } = {}) {
  const row = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id);
  if (!row) return null;
  const next = String(status || '').trim();
  if (!STATUS_LABELS[next]) throw new Error('حالة غير صالحة');
  if (row.status === 'posted' && next !== 'posted') {
    throw new Error('السند مُرحَّل ولا يمكن تغيير حالته');
  }
  db.prepare(`
    UPDATE receipts SET status = ?, updated_at = datetime('now') WHERE id = ?
  `).run(next, id);
  logEvent(id, {
    actorType,
    actorId,
    fromStatus: row.status,
    toStatus: next,
    note
  });
  return loadReceipt(id);
}

function markReceiptPosted(id, { journalNum, receiptNum, error = '', lines = [], receiptDate } = {}) {
  const row = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id);
  if (!row) return null;
  if (error) {
    db.prepare(`
      UPDATE receipts SET posted_error = ?, updated_at = datetime('now') WHERE id = ?
    `).run(String(error), id);
    logEvent(id, {
      actorType: 'admin',
      actorId: 'admin',
      fromStatus: row.status,
      toStatus: row.status,
      note: `فشل الترحيل: ${error}`
    });
    return loadReceipt(id);
  }
  db.prepare(`
    UPDATE receipts SET
      status = 'posted',
      edari_journal_num = ?,
      edari_receipt_num = ?,
      edari_posted_at = datetime('now'),
      posted_error = '',
      updated_at = datetime('now')
    WHERE id = ?
  `).run(String(journalNum || ''), String(receiptNum || ''), id);
  upsertPostedJournalLines(lines, receiptDate || row.receipt_date, journalNum);
  logEvent(id, {
    actorType: 'admin',
    actorId: 'admin',
    fromStatus: row.status,
    toStatus: 'posted',
    note: `ترحيل للإداري · سند قبض ${receiptNum || ''} · سند قيد ${journalNum || ''}`
  });
  return loadReceipt(id);
}

function upsertPostedJournalLines(lines, receiptDate, journalNum) {
  if (!Array.isArray(lines) || !lines.length) return;
  const txDate = String(receiptDate || todayIso()).slice(0, 10);
  const stmt = db.prepare(`
    INSERT INTO journal (seq, acc_seq, tx_date, am, is_debit, exp1, exp2, bill_num, bill_seq, bill_kind)
    VALUES (@seq, @acc_seq, @tx_date, @am, @is_debit, @exp1, @exp2, @bill_num, @bill_seq, @bill_kind)
    ON CONFLICT(seq, acc_seq) DO UPDATE SET
      tx_date=excluded.tx_date, am=excluded.am, is_debit=excluded.is_debit,
      exp1=excluded.exp1, exp2=excluded.exp2, bill_num=excluded.bill_num,
      bill_seq=excluded.bill_seq, bill_kind=excluded.bill_kind
  `);
  const run = db.transaction((rows) => {
    for (const ln of rows) {
      const seq = String(ln.seq || '').replace(/[^0-9]/g, '');
      const accSeq = String(ln.accSeq || ln.acc_seq || '').replace(/[^0-9]/g, '');
      if (!seq || !accSeq) continue;
      stmt.run({
        seq,
        acc_seq: accSeq,
        tx_date: txDate,
        am: Number(ln.amount || ln.am || 0),
        is_debit: ln.isDebit || ln.is_debit ? 1 : 0,
        exp1: String(ln.exp1 || ''),
        exp2: String(ln.exp2 || ''),
        bill_num: String(ln.billNum || journalNum || ''),
        bill_seq: '',
        bill_kind: '0'
      });
    }
  });
  run(lines);
}

function deleteReceipt(id, { agentId } = {}) {
  const row = db.prepare('SELECT * FROM receipts WHERE id = ?').get(id);
  if (!row) return null;
  if (agentId && Number(row.agent_id) !== Number(agentId)) return null;
  if (row.status === 'posted') throw new Error('لا يمكن حذف سند مُرحَّل');
  db.prepare('DELETE FROM receipt_events WHERE receipt_id = ?').run(id);
  db.prepare('DELETE FROM receipts WHERE id = ?').run(id);
  return { deleted: true, id };
}

function postingPayload(id) {
  const receipt = loadReceipt(id);
  if (!receipt) return null;
  const settings = getReceiptAccountSettings();
  const accounts = {
    customer: {
      seq: receipt.customerAccSeq,
      num: receipt.customerNum,
      name: receipt.customerName
    },
    cash: receipt.accounts.cash.seq ? receipt.accounts.cash : settings.cash,
    commissionDebit: receipt.accounts.commissionDebit.seq
      ? receipt.accounts.commissionDebit : settings.commissionDebit,
    commissionCredit: receipt.accounts.commissionCredit.seq
      ? receipt.accounts.commissionCredit : settings.commissionCredit,
    discount: receipt.accounts.discount.seq ? receipt.accounts.discount : settings.discount
  };
  const error = validatePostingAccounts(receipt, accounts);
  return {
    receipt,
    accounts,
    lines: buildReceiptJournalLines(receipt, accounts),
    error
  };
}

module.exports = {
  STATUS_LABELS,
  statusLabel,
  getReceiptAccountSettings,
  saveReceiptAccountSettings,
  findAccount,
  loadReceipt,
  listReceipts,
  receiptStats,
  createReceipt,
  updateReceiptByAdmin,
  setReceiptStatus,
  markReceiptPosted,
  deleteReceipt,
  postingPayload
};
