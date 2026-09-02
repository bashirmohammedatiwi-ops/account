const db = require('./db');
const {
  agentScopeIds,
  canAgentViewDeliveryReceipt,
  assertCanMarkHandover,
  handoverStatusLabel,
  getAgentProfile,
  isPrimary
} = require('./agent-hierarchy');

const STATUS_LABELS = {
  issued: 'مُصدَّر',
  linked: 'مرتبط بسند قبض'
};

const AGENT_VISIBLE = new Set(['issued', 'linked']);

function statusLabel(s) {
  return STATUS_LABELS[s] || s;
}

function nextDeliveryNo() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const head = `WR-${day}`;
  const last = db.prepare(`
    SELECT delivery_no FROM delivery_receipts WHERE delivery_no LIKE ? ORDER BY id DESC LIMIT 1
  `).get(`${head}-%`);
  let seq = 1;
  if (last?.delivery_no) {
    const part = Number(last.delivery_no.split('-').pop());
    if (!Number.isNaN(part)) seq = part + 1;
  }
  return `${head}-${String(seq).padStart(4, '0')}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function mapDeliveryReceipt(row, { viewerAgentId } = {}) {
  if (!row) return null;
  const account = row.customer_acc_seq
    ? db.prepare('SELECT seq, num, name1 FROM accounts WHERE seq = ?').get(String(row.customer_acc_seq))
    : null;
  const agent = row.agent_id
    ? db.prepare('SELECT id, name, delegate_role, parent_agent_id FROM agents WHERE id = ?').get(row.agent_id)
    : null;
  let linkedReceiptNo = '';
  if (row.receipt_id) {
    const rv = db.prepare('SELECT receipt_no FROM receipts WHERE id = ?').get(row.receipt_id);
    linkedReceiptNo = rv?.receipt_no || '';
  }
  const handoverStatus = String(row.handover_status || 'pending');
  const agentId = Number(row.agent_id || 0);
  const viewerId = viewerAgentId ? Number(viewerAgentId) : null;
  const isTeamDelivery = viewerId != null && agentId !== viewerId;
  const canMarkHandover = viewerId != null
    && isPrimary(viewerId)
    && isTeamDelivery
    && handoverStatus !== 'received'
    && row.status === 'issued'
    && !row.receipt_id;
  const canCreateReceipt = row.status === 'issued'
    && !row.receipt_id
    && viewerId != null
    && isPrimary(viewerId)
    && (agentId === viewerId || isTeamDelivery);
  return {
    id: row.id,
    deliveryNo: row.delivery_no,
    status: row.status,
    statusLabel: statusLabel(row.status),
    agentId,
    agentName: agent?.name || '',
    agentRole: agent?.delegate_role || 'primary',
    isTeamDelivery,
    handoverStatus,
    handoverStatusLabel: handoverStatusLabel(handoverStatus),
    handoverAt: row.handover_at || '',
    handoverByAgentId: row.handover_by_agent_id ? Number(row.handover_by_agent_id) : null,
    canMarkHandover,
    canCreateReceipt,
    customerAccSeq: row.customer_acc_seq || '',
    customerNum: account?.num || '',
    customerName: account?.name1 || '',
    treeAccSeq: row.tree_acc_seq || '',
    treeName: row.tree_name || '',
    amount: Number(row.amount || 0),
    notes: row.notes || '',
    receiptDate: row.receipt_date || '',
    printedAt: row.printed_at || '',
    receiptId: row.receipt_id || null,
    linkedReceiptNo,
    adminNote: row.admin_note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function loadDeliveryReceipt(id, { viewerAgentId } = {}) {
  const row = db.prepare('SELECT * FROM delivery_receipts WHERE id = ?').get(id);
  return mapDeliveryReceipt(row, { viewerAgentId });
}

function listDeliveryReceipts({ agentId, agentIds, status, limit = 200, viewerAgentId } = {}) {
  const where = [];
  const params = [];
  let ids = agentIds;
  if (!ids && agentId) {
    ids = viewerAgentId && Number(viewerAgentId) === Number(agentId)
      ? agentScopeIds(agentId)
      : [Number(agentId)];
  }
  if (ids && ids.length) {
    where.push(`agent_id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids.map(Number));
  }
  if (status && AGENT_VISIBLE.has(status)) {
    where.push('status = ?');
    params.push(status);
  }
  params.push(Math.min(Math.max(Number(limit) || 200, 1), 500));
  const viewer = viewerAgentId ?? agentId;
  return db.prepare(`
    SELECT * FROM delivery_receipts
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT ?
  `).all(...params).map((row) => mapDeliveryReceipt(row, { viewerAgentId: viewer }));
}

function deliveryReceiptStats({ agentIds } = {}) {
  const today = todayIso();
  let where = '';
  const params = [today];
  if (agentIds && agentIds.length) {
    where = `WHERE agent_id IN (${agentIds.map(() => '?').join(',')})`;
    params.unshift(...agentIds.map(Number));
  }
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'issued' THEN 1 ELSE 0 END) AS issued,
      SUM(CASE WHEN status = 'linked' THEN 1 ELSE 0 END) AS linked,
      SUM(CASE WHEN date(created_at) = date(?) THEN 1 ELSE 0 END) AS today,
      SUM(CASE WHEN handover_status = 'pending' AND status = 'issued' THEN 1 ELSE 0 END) AS handoverPending,
      SUM(CASE WHEN handover_status = 'received' THEN 1 ELSE 0 END) AS handoverReceived
    FROM delivery_receipts
    ${where}
  `).get(...params);
  return {
    total: row?.total || 0,
    issued: row?.issued || 0,
    linked: row?.linked || 0,
    today: row?.today || 0,
    handoverPending: row?.handoverPending || 0,
    handoverReceived: row?.handoverReceived || 0
  };
}

function createDeliveryReceipt(agentId, data = {}) {
  const customerAccSeq = String(data.customerAccSeq || '').trim();
  if (!customerAccSeq) throw new Error('اختر زبوناً من الشجرة');
  const customer = findAccount(customerAccSeq);
  if (!customer) throw new Error('الزبون غير موجود في الحسابات');

  const amount = money(data.amount);
  if (amount <= 0) throw new Error('أدخل مبلغ وصل الاستلام');

  const deliveryNo = nextDeliveryNo();
  const r = db.prepare(`
    INSERT INTO delivery_receipts (
      delivery_no, agent_id, customer_acc_seq, tree_acc_seq, tree_name,
      amount, notes, receipt_date, status, handover_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'issued', 'pending', datetime('now'), datetime('now'))
  `).run(
    deliveryNo,
    agentId,
    customer.seq,
    String(data.treeAccSeq || ''),
    String(data.treeName || ''),
    amount,
    String(data.notes || '').trim(),
    String(data.receiptDate || todayIso()).slice(0, 10)
  );
  return loadDeliveryReceipt(r.lastInsertRowid, { viewerAgentId: agentId });
}

function markDeliveryReceiptPrinted(id, { agentId } = {}) {
  const row = db.prepare('SELECT * FROM delivery_receipts WHERE id = ?').get(id);
  if (!row) return null;
  if (agentId && !canAgentViewDeliveryReceipt(agentId, row.agent_id)) {
    throw new Error('لا تملك صلاحية هذا الوصل');
  }
  db.prepare(`
    UPDATE delivery_receipts SET printed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
  `).run(id);
  return loadDeliveryReceipt(id, { viewerAgentId: agentId });
}

function markDeliveryHandoverReceived(id, primaryAgentId, { note = '' } = {}) {
  const row = db.prepare('SELECT * FROM delivery_receipts WHERE id = ?').get(id);
  if (!row) throw new Error('وصل الاستلام غير موجود');
  assertCanMarkHandover(primaryAgentId, row.agent_id);
  if (row.receipt_id) throw new Error('تم إنشاء سند قبض لهذا الوصل');
  if (String(row.handover_status) === 'received') {
    return loadDeliveryReceipt(id, { viewerAgentId: primaryAgentId });
  }
  db.prepare(`
    UPDATE delivery_receipts SET
      handover_status = 'received',
      handover_at = datetime('now'),
      handover_by_agent_id = ?,
      updated_at = datetime('now'),
      admin_note = CASE WHEN ? != '' THEN ? ELSE admin_note END
    WHERE id = ?
  `).run(primaryAgentId, String(note || '').trim(), String(note || '').trim(), id);
  return loadDeliveryReceipt(id, { viewerAgentId: primaryAgentId });
}

function linkDeliveryReceiptToReceipt(deliveryId, receiptId) {
  const row = db.prepare('SELECT * FROM delivery_receipts WHERE id = ?').get(deliveryId);
  if (!row) throw new Error('وصل الاستلام غير موجود');
  if (row.receipt_id) throw new Error('تم إنشاء سند قبض لهذا الوصل مسبقاً');
  db.prepare(`
    UPDATE delivery_receipts
    SET receipt_id = ?, status = 'linked', updated_at = datetime('now')
    WHERE id = ?
  `).run(receiptId, deliveryId);
  return loadDeliveryReceipt(deliveryId);
}

function deleteDeliveryReceipt(id, { agentId, admin = false } = {}) {
  const row = db.prepare('SELECT * FROM delivery_receipts WHERE id = ?').get(id);
  if (!row) return null;
  if (agentId && !canAgentViewDeliveryReceipt(agentId, row.agent_id)) {
    throw new Error('لا تملك صلاحية هذا الوصل');
  }
  if (!admin && agentId && Number(row.agent_id) !== Number(agentId)) {
    throw new Error('لا يمكن حذف وصل مندوب آخر');
  }
  if (!admin && row.receipt_id) throw new Error('لا يمكن حذف وصل مرتبط بسند قبض');
  db.prepare('DELETE FROM delivery_receipts WHERE id = ?').run(id);
  return { id };
}

function updateDeliveryReceiptByAdmin(id, patch = {}) {
  const row = db.prepare('SELECT * FROM delivery_receipts WHERE id = ?').get(id);
  if (!row) return null;
  db.prepare(`
    UPDATE delivery_receipts SET admin_note = ?, updated_at = datetime('now') WHERE id = ?
  `).run(patch.adminNote != null ? String(patch.adminNote).trim() : row.admin_note, id);
  return loadDeliveryReceipt(id);
}

module.exports = {
  listDeliveryReceipts,
  loadDeliveryReceipt,
  createDeliveryReceipt,
  markDeliveryReceiptPrinted,
  markDeliveryHandoverReceived,
  linkDeliveryReceiptToReceipt,
  deleteDeliveryReceipt,
  updateDeliveryReceiptByAdmin,
  deliveryReceiptStats,
  statusLabel,
  handoverStatusLabel
};
