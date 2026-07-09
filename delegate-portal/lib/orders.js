const db = require('./db');

const STATUS_LABELS = {
  draft: 'مسودة',
  submitted: 'مرسل',
  under_review: 'قيد المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  processing: 'قيد التنفيذ',
  delivered: 'تم التسليم',
  cancelled: 'ملغى'
};

const AGENT_EDITABLE = new Set(['draft']);
const ADMIN_TRANSITIONS = {
  submitted: ['under_review', 'approved', 'rejected', 'cancelled'],
  under_review: ['approved', 'rejected', 'processing', 'cancelled'],
  approved: ['processing', 'delivered', 'cancelled'],
  processing: ['delivered', 'cancelled'],
  rejected: [],
  delivered: [],
  cancelled: []
};

function statusLabel(s) {
  return STATUS_LABELS[s] || s;
}

function nextOrderNo() {
  const prefix = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  const last = db.prepare(`
    SELECT order_no FROM orders WHERE order_no LIKE ? ORDER BY id DESC LIMIT 1
  `).get(`${prefix}-%`);
  let seq = 1;
  if (last?.order_no) {
    const part = Number(last.order_no.split('-').pop());
    if (!Number.isNaN(part)) seq = part + 1;
  }
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

function mapLine(row) {
  return {
    id: row.id,
    productId: row.product_id,
    barcode: row.barcode || '',
    matName: row.mat_name,
    quant: Number(row.quant || 0),
    bonus: Number(row.bonus || 0),
    unitPrice: Number(row.unit_price || 0),
    lineTotal: Number(row.line_total || 0),
    remarks: row.remarks || ''
  };
}

function mapOrder(row, lines = [], events = []) {
  const account = row.customer_acc_seq
    ? db.prepare('SELECT seq, num, name1 FROM accounts WHERE seq = ?').get(String(row.customer_acc_seq))
    : null;
  const agent = db.prepare('SELECT id, name FROM agents WHERE id = ?').get(row.agent_id);
  const branch = row.catalog_branch_id
    ? db.prepare('SELECT id, name FROM catalog_branches WHERE id = ?').get(row.catalog_branch_id)
    : null;

  return {
    id: row.id,
    orderNo: row.order_no,
    status: row.status,
    statusLabel: statusLabel(row.status),
    agentId: row.agent_id,
    agentName: agent?.name || '',
    customerAccSeq: row.customer_acc_seq || '',
    customerName: account?.name1 || '',
    customerNum: account?.num || '',
    catalogBranchId: row.catalog_branch_id,
    catalogBranchName: branch?.name || '',
    notes: row.notes || '',
    totalQty: Number(row.total_qty || 0),
    totalAmount: Number(row.total_amount || 0),
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    lines: lines.map(mapLine),
    events: events.map((e) => ({
      id: e.id,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      note: e.note || '',
      actorType: e.actor_type,
      createdAt: e.created_at
    }))
  };
}

function loadOrder(id) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!row) return null;
  const lines = db.prepare('SELECT * FROM order_lines WHERE order_id = ? ORDER BY id').all(id);
  const events = db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id').all(id);
  return mapOrder(row, lines, events);
}

function recalcOrderTotals(orderId) {
  const lines = db.prepare('SELECT quant, line_total FROM order_lines WHERE order_id = ?').all(orderId);
  const totalQty = lines.reduce((s, l) => s + Number(l.quant || 0), 0);
  const totalAmount = lines.reduce((s, l) => s + Number(l.line_total || 0), 0);
  db.prepare(`
    UPDATE orders SET total_qty = ?, total_amount = ?, updated_at = datetime('now') WHERE id = ?
  `).run(totalQty, totalAmount, orderId);
}

function logEvent(orderId, { fromStatus, toStatus, actorType, actorId, note }) {
  db.prepare(`
    INSERT INTO order_events (order_id, actor_type, actor_id, from_status, to_status, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(orderId, actorType || '', String(actorId || ''), fromStatus || '', toStatus || '', note || '');
}

function normalizeLines(lines = []) {
  return lines.map((line) => {
    const quant = Number(line.quant || 0);
    const bonus = Number(line.bonus || 0);
    const unitPrice = Number(line.unitPrice ?? line.price ?? 0);
    const lineTotal = Number(line.lineTotal ?? quant * unitPrice);
    return {
      productId: line.productId || null,
      barcode: String(line.barcode || ''),
      matName: String(line.matName || line.name || '').trim(),
      quant,
      bonus,
      unitPrice,
      lineTotal,
      remarks: String(line.remarks || '')
    };
  }).filter((l) => l.matName && (l.quant || l.bonus || l.lineTotal));
}

function replaceLines(orderId, lines) {
  db.prepare('DELETE FROM order_lines WHERE order_id = ?').run(orderId);
  const insert = db.prepare(`
    INSERT INTO order_lines
      (order_id, product_id, barcode, mat_name, quant, bonus, unit_price, line_total, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const line of normalizeLines(lines)) {
    insert.run(
      orderId,
      line.productId,
      line.barcode,
      line.matName,
      line.quant,
      line.bonus,
      line.unitPrice,
      line.lineTotal,
      line.remarks
    );
  }
  recalcOrderTotals(orderId);
}

function createOrder(agentId, data) {
  const orderNo = nextOrderNo();
  const r = db.prepare(`
    INSERT INTO orders
      (order_no, agent_id, customer_acc_seq, catalog_branch_id, status, notes)
    VALUES (?, ?, ?, ?, 'draft', ?)
  `).run(
    orderNo,
    agentId,
    data.customerAccSeq || '',
    data.catalogBranchId || null,
    data.notes || ''
  );
  const id = r.lastInsertRowid;
  if (data.lines?.length) replaceLines(id, data.lines);
  logEvent(id, { fromStatus: '', toStatus: 'draft', actorType: 'agent', actorId: agentId, note: 'إنشاء طلب' });
  return loadOrder(id);
}

function updateOrder(orderId, agentId, data) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ? AND agent_id = ?').get(orderId, agentId);
  if (!row) return null;
  if (!AGENT_EDITABLE.has(row.status)) throw new Error('لا يمكن تعديل الطلب في هذه الحالة');

  db.prepare(`
    UPDATE orders SET
      customer_acc_seq = ?, catalog_branch_id = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    data.customerAccSeq ?? row.customer_acc_seq,
    data.catalogBranchId ?? row.catalog_branch_id,
    data.notes ?? row.notes,
    orderId
  );
  if (data.lines) replaceLines(orderId, data.lines);
  return loadOrder(orderId);
}

function submitOrder(orderId, agentId) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ? AND agent_id = ?').get(orderId, agentId);
  if (!row) return null;
  if (row.status !== 'draft') throw new Error('الطلب ليس مسودة');
  const lines = db.prepare('SELECT COUNT(*) AS c FROM order_lines WHERE order_id = ?').get(orderId).c;
  if (!lines) throw new Error('أضف بنوداً للطلب أولاً');

  db.prepare(`
    UPDATE orders SET status = 'submitted', submitted_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(orderId);
  logEvent(orderId, {
    fromStatus: 'draft',
    toStatus: 'submitted',
    actorType: 'agent',
    actorId: agentId,
    note: 'إرسال الطلب'
  });
  return loadOrder(orderId);
}

function setOrderStatus(orderId, newStatus, { actorType = 'admin', actorId = '', note = '' } = {}) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!row) return null;
  const allowed = ADMIN_TRANSITIONS[row.status] || [];
  if (!allowed.includes(newStatus) && row.status !== newStatus) {
    throw new Error(`لا يمكن تغيير الحالة من ${statusLabel(row.status)} إلى ${statusLabel(newStatus)}`);
  }
  db.prepare(`
    UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?
  `).run(newStatus, orderId);
  logEvent(orderId, {
    fromStatus: row.status,
    toStatus: newStatus,
    actorType,
    actorId,
    note
  });
  return loadOrder(orderId);
}

function listOrders({ agentId, status, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (agentId) {
    where.push('agent_id = ?');
    params.push(agentId);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  const sql = `
    SELECT * FROM orders
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY COALESCE(submitted_at, created_at) DESC, id DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);
  const rows = db.prepare(sql).all(...params);
  return rows.map((r) => loadOrder(r.id));
}

function orderStats() {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS c, COALESCE(SUM(total_amount), 0) AS amount
    FROM orders GROUP BY status
  `).all();
  const today = db.prepare(`
    SELECT COUNT(*) AS c FROM orders
    WHERE date(COALESCE(submitted_at, created_at)) = date('now') AND status != 'draft'
  `).get();
  return { byStatus: rows, todaySubmitted: today?.c || 0 };
}

/** Statuses an agent may hard-delete. */
const AGENT_DELETABLE = new Set(['draft', 'cancelled', 'rejected']);
/** Statuses an agent may cancel (soft delete → cancelled). */
const AGENT_CANCELLABLE = new Set(['submitted', 'under_review']);

/**
 * Agent removes an order: cancel if still pending review, otherwise hard-delete when allowed.
 */
function deleteOrderByAgent(orderId, agentId) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!row) return null;
  if (Number(row.agent_id) !== Number(agentId)) {
    throw new Error('لا تملك صلاحية هذا الطلب');
  }

  if (AGENT_CANCELLABLE.has(row.status)) {
    return setOrderStatus(orderId, 'cancelled', {
      actorType: 'agent',
      actorId: String(agentId),
      note: 'ألغاه المندوب'
    });
  }

  if (!AGENT_DELETABLE.has(row.status)) {
    throw new Error(`لا يمكن حذف الطلب وهو «${statusLabel(row.status)}»`);
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM order_events WHERE order_id = ?').run(orderId);
    db.prepare('DELETE FROM order_lines WHERE order_id = ?').run(orderId);
    db.prepare('DELETE FROM orders WHERE id = ?').run(orderId);
  });
  tx();
  return { deleted: true, id: orderId, previousStatus: row.status };
}

module.exports = {
  STATUS_LABELS,
  statusLabel,
  loadOrder,
  createOrder,
  updateOrder,
  submitOrder,
  setOrderStatus,
  deleteOrderByAgent,
  listOrders,
  orderStats
};
