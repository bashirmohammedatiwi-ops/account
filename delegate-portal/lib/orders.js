const db = require('./db');
const bcrypt = require('bcryptjs');
const { notifyNewOrder } = require('./push');

/** Canonical UI statuses: pending | processing | rejected */
const STATUS_LABELS = {
  draft: 'قيد الانتظار',
  submitted: 'قيد الانتظار',
  under_review: 'قيد الانتظار',
  pending: 'قيد الانتظار',
  approved: 'تم التجهيز',
  processing: 'تم التجهيز',
  delivered: 'تم التجهيز',
  rejected: 'مرفوض',
  cancelled: 'مرفوض'
};

/** Map any stored status → one of the three UI statuses. */
const STATUS_CANONICAL = {
  draft: 'pending',
  submitted: 'pending',
  under_review: 'pending',
  pending: 'pending',
  approved: 'processing',
  processing: 'processing',
  delivered: 'processing',
  rejected: 'rejected',
  cancelled: 'rejected'
};

/** DB values accepted when filtering by a UI status. */
const STATUS_FILTER_GROUP = {
  pending: ['draft', 'submitted', 'under_review', 'pending'],
  processing: ['approved', 'processing', 'delivered'],
  rejected: ['rejected', 'cancelled']
};

const AGENT_EDITABLE = new Set(['draft']);
/** Free movement among the three UI statuses (pending / processing / rejected). */
const UI_STATUSES = new Set(['pending', 'processing', 'rejected']);
const ADMIN_TRANSITIONS = {
  draft: ['submitted', 'pending', 'processing', 'rejected'],
  submitted: ['pending', 'processing', 'rejected'],
  under_review: ['pending', 'processing', 'rejected'],
  pending: ['processing', 'rejected', 'pending'],
  approved: ['processing', 'rejected', 'pending'],
  processing: ['pending', 'rejected', 'processing'],
  delivered: ['processing', 'rejected', 'pending'],
  rejected: ['pending', 'processing', 'rejected'],
  cancelled: ['pending', 'processing', 'rejected']
};

function canonicalStatus(s) {
  return STATUS_CANONICAL[s] || 'pending';
}

function statusLabel(s) {
  return STATUS_LABELS[s] || STATUS_LABELS[canonicalStatus(s)] || s;
}

function nextOrderNo(prefix = 'PO') {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const head = `${prefix}-${day}`;
  const last = db.prepare(`
    SELECT order_no FROM orders WHERE order_no LIKE ? ORDER BY id DESC LIMIT 1
  `).get(`${head}-%`);
  let seq = 1;
  if (last?.order_no) {
    const part = Number(last.order_no.split('-').pop());
    if (!Number.isNaN(part)) seq = part + 1;
  }
  return `${head}-${String(seq).padStart(4, '0')}`;
}

function nextShorjaOrderNo() {
  return nextOrderNo('SO');
}

function ensureShorjaSystemAgent() {
  const existing = db.prepare(`SELECT id FROM agents WHERE username = 'shorja-system'`).get();
  if (existing) return Number(existing.id);
  const hash = bcrypt.hashSync(`shorja-system-${Date.now()}`, 10);
  const r = db.prepare(`
    INSERT INTO agents (name, phone, username, password_hash, active)
    VALUES ('فرع الشورجة', '', 'shorja-system', ?, 1)
  `).run(hash);
  return Number(r.lastInsertRowid);
}

function lineImageUrl(productId, barcode) {
  let path = '';
  if (productId) {
    const r = db.prepare('SELECT image_path FROM products WHERE id = ?').get(productId);
    path = r?.image_path || '';
  }
  if (!path && barcode) {
    const r = db.prepare(`
      SELECT image_path FROM products
      WHERE barcode = ? AND image_path IS NOT NULL AND trim(image_path) != ''
      ORDER BY id DESC LIMIT 1
    `).get(String(barcode));
    path = r?.image_path || '';
  }
  if (!path) return '';
  return `/uploads/${String(path).replace(/\\/g, '/')}`;
}

function mapLine(row) {
  return {
    id: row.id,
    productId: row.product_id,
    barcode: row.barcode || '',
    matName: row.mat_name,
    quant: Number(row.quant || 0),
    bonus: Number(row.bonus || 0),
    tester: Number(row.tester || 0),
    unitPrice: Number(row.unit_price || 0),
    lineTotal: Number(row.line_total || 0),
    remarks: row.remarks || '',
    imageUrl: lineImageUrl(row.product_id, row.barcode)
  };
}

function mapOrder(row, lines = [], events = []) {
  const sourceType = String(row.source_type || 'delegate');
  const account = row.customer_acc_seq
    ? db.prepare('SELECT seq, num, name1 FROM accounts WHERE seq = ?').get(String(row.customer_acc_seq))
    : null;
  const agent = row.agent_id
    ? db.prepare('SELECT id, name FROM agents WHERE id = ?').get(row.agent_id)
    : null;
  const branch = row.catalog_branch_id
    ? db.prepare('SELECT id, name FROM catalog_branches WHERE id = ?').get(row.catalog_branch_id)
    : null;

  const rawStatus = row.status;
  const uiStatus = canonicalStatus(rawStatus);
  const customerName = sourceType === 'shorja'
    ? (row.customer_display_name || row.shorja_branch_name || 'فرع الشورجة')
    : (account?.name1 || '');
  const agentName = sourceType === 'shorja'
    ? 'فرع الشورجة'
    : (agent?.name || '');
  const catalogBranchName = sourceType === 'shorja'
    ? (row.shorja_branch_name || '')
    : (branch?.name || '');

  return {
    id: row.id,
    orderNo: row.order_no,
    status: uiStatus,
    rawStatus,
    statusLabel: statusLabel(rawStatus),
    sourceType,
    sourceLabel: sourceType === 'shorja' ? 'طلب شورجة' : 'طلب مندوب',
    agentId: row.agent_id,
    agentName,
    customerAccSeq: row.customer_acc_seq || '',
    customerName,
    customerNum: account?.num || '',
    catalogBranchId: row.catalog_branch_id,
    catalogBranchName,
    shorjaInvoiceId: row.shorja_invoice_id != null ? Number(row.shorja_invoice_id) : null,
    shorjaInvoiceNo: row.shorja_invoice_no || '',
    shorjaBranchName: row.shorja_branch_name || '',
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

function employeeCanEditLines(orderRow) {
  if (!orderRow) return false;
  if (orderRow.status === 'draft' && !orderRow.submitted_at) return false;
  const ui = canonicalStatus(orderRow.status);
  return ui === 'pending' || ui === 'processing';
}

function updateOrderLineByEmployee(orderId, lineId, patch, actorId = '') {
  const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!orderRow) return null;
  if (!employeeCanEditLines(orderRow)) {
    throw new Error('لا يمكن تعديل بنود الطلب في هذه الحالة');
  }

  const line = db.prepare('SELECT * FROM order_lines WHERE id = ? AND order_id = ?').get(lineId, orderId);
  if (!line) throw new Error('البند غير موجود');

  const quant = patch.quant !== undefined ? Number(patch.quant) : Number(line.quant || 0);
  const bonus = patch.bonus !== undefined ? Number(patch.bonus) : Number(line.bonus || 0);
  const tester = patch.tester !== undefined ? Number(patch.tester) : Number(line.tester || 0);
  if (Number.isNaN(quant) || Number.isNaN(bonus) || Number.isNaN(tester) || quant < 0 || bonus < 0 || tester < 0) {
    throw new Error('الكميات يجب أن تكون أرقاماً موجبة');
  }
  if (quant === 0 && bonus === 0 && tester === 0) {
    throw new Error('يجب أن تكون كمية البيع أو الهدية أو التيستر أكبر من صفر — أو احذف البند');
  }

  const unitPrice = patch.unitPrice !== undefined
    ? Number(patch.unitPrice)
    : Number(line.unit_price || 0);
  const lineTotal = Number(patch.lineTotal ?? quant * unitPrice);
  const remarks = patch.remarks !== undefined ? String(patch.remarks || '') : (line.remarks || '');

  db.prepare(`
    UPDATE order_lines
    SET quant = ?, bonus = ?, tester = ?, unit_price = ?, line_total = ?, remarks = ?
    WHERE id = ? AND order_id = ?
  `).run(quant, bonus, tester, unitPrice, lineTotal, remarks, lineId, orderId);

  db.prepare(`UPDATE orders SET updated_at = datetime('now') WHERE id = ?`).run(orderId);
  recalcOrderTotals(orderId);
  logEvent(orderId, {
    fromStatus: orderRow.status,
    toStatus: orderRow.status,
    actorType: 'employee',
    actorId: String(actorId),
    note: `تعديل بند: ${line.mat_name} (بيع ${quant} · هدية ${bonus} · تيستر ${tester})`
  });
  return loadOrder(orderId);
}

function deleteOrderLineByEmployee(orderId, lineId, actorId = '') {
  const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!orderRow) return null;
  if (!employeeCanEditLines(orderRow)) {
    throw new Error('لا يمكن حذف بنود الطلب في هذه الحالة');
  }

  const line = db.prepare('SELECT * FROM order_lines WHERE id = ? AND order_id = ?').get(lineId, orderId);
  if (!line) throw new Error('البند غير موجود');

  const count = db.prepare('SELECT COUNT(*) AS c FROM order_lines WHERE order_id = ?').get(orderId).c;
  if (count <= 1) throw new Error('يجب أن يبقى بند واحد على الأقل في الطلب');

  db.prepare('DELETE FROM order_lines WHERE id = ? AND order_id = ?').run(lineId, orderId);
  db.prepare(`UPDATE orders SET updated_at = datetime('now') WHERE id = ?`).run(orderId);
  recalcOrderTotals(orderId);
  logEvent(orderId, {
    fromStatus: orderRow.status,
    toStatus: orderRow.status,
    actorType: 'employee',
    actorId: String(actorId),
    note: `حذف بند: ${line.mat_name}`
  });
  return loadOrder(orderId);
}

function orderFeed({ sinceId = 0, status = 'pending', sourceType = '' } = {}) {
  const orders = listOrders({ status, sourceType: sourceType || undefined, limit: 100, offset: 0 })
    .filter((o) => o.rawStatus !== 'draft' || o.submittedAt);
  const latest = orders[0] || null;
  const newOrders = sinceId > 0
    ? orders.filter((o) => o.id > sinceId)
    : [];
  return {
    pendingCount: orders.length,
    latest,
    newOrders
  };
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
    const tester = Number(line.tester || 0);
    const unitPrice = Number(line.unitPrice ?? line.price ?? 0);
    const lineTotal = Number(line.lineTotal ?? quant * unitPrice);
    return {
      productId: line.productId || null,
      barcode: String(line.barcode || ''),
      matName: String(line.matName || line.name || '').trim(),
      quant,
      bonus,
      tester,
      unitPrice,
      lineTotal,
      remarks: String(line.remarks || '')
    };
  }).filter((l) => l.matName && (l.quant || l.bonus || l.tester || l.lineTotal));
}

function replaceLines(orderId, lines) {
  db.prepare('DELETE FROM order_lines WHERE order_id = ?').run(orderId);
  const insert = db.prepare(`
    INSERT INTO order_lines
      (order_id, product_id, barcode, mat_name, quant, bonus, tester, unit_price, line_total, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const line of normalizeLines(lines)) {
    insert.run(
      orderId,
      line.productId,
      line.barcode,
      line.matName,
      line.quant,
      line.bonus,
      line.tester,
      line.unitPrice,
      line.lineTotal,
      line.remarks
    );
  }
  recalcOrderTotals(orderId);
}

function createShorjaOrder(data) {
  const invoiceId = Number(data.shorjaInvoiceId || 0);
  if (!invoiceId) throw new Error('shorjaInvoiceId مطلوب');
  const existing = db.prepare(`
    SELECT id FROM orders WHERE source_type = 'shorja' AND shorja_invoice_id = ?
  `).get(invoiceId);
  if (existing) return loadOrder(Number(existing.id));

  const agentId = ensureShorjaSystemAgent();
  const orderNo = nextShorjaOrderNo();
  const customerName = String(data.customerName || '').trim();
  const branchName = String(data.shorjaBranchName || data.branchName || '').trim();
  const notes = String(data.notes || '').trim();
  const noteParts = [
    customerName ? `عميل: ${customerName}` : '',
    data.shorjaInvoiceNo ? `فاتورة: ${data.shorjaInvoiceNo}` : '',
    notes
  ].filter(Boolean);

  const r = db.prepare(`
    INSERT INTO orders
      (order_no, agent_id, customer_acc_seq, catalog_branch_id, status, notes,
       source_type, customer_display_name, shorja_invoice_id, shorja_invoice_no, shorja_branch_name,
       submitted_at)
    VALUES (?, ?, ?, NULL, 'submitted', ?, 'shorja', ?, ?, ?, ?, datetime('now'))
  `).run(
    orderNo,
    agentId,
    data.customerAccSeq || '',
    noteParts.join('\n'),
    customerName,
    invoiceId,
    String(data.shorjaInvoiceNo || ''),
    branchName
  );
  const id = Number(r.lastInsertRowid);
  if (data.lines?.length) replaceLines(id, data.lines);
  logEvent(id, {
    fromStatus: '',
    toStatus: 'submitted',
    actorType: 'shorja',
    actorId: branchName || 'branch',
    note: 'طلب تجهيز من فرع الشورجة'
  });
  const order = loadOrder(id);
  void notifyNewOrder(order).catch(() => {});
  return order;
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
  const order = loadOrder(orderId);
  void notifyNewOrder(order).catch(() => {});
  return order;
}

function setOrderStatus(orderId, newStatus, { actorType = 'admin', actorId = '', note = '' } = {}) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!row) return null;
  // Accept UI aliases (pending) and store canonical DB values.
  const storeStatus = ({
    pending: 'submitted',
    processing: 'processing',
    rejected: 'rejected'
  })[newStatus] || newStatus;

  const fromUi = canonicalStatus(row.status);
  const toUi = canonicalStatus(storeStatus);
  const allowed = ADMIN_TRANSITIONS[row.status] || [];
  const freeUiMove = UI_STATUSES.has(fromUi) && UI_STATUSES.has(toUi);
  const sameUi = fromUi === toUi;
  if (
    !sameUi
    && !freeUiMove
    && !allowed.includes(storeStatus)
    && !allowed.includes(newStatus)
    && row.status !== storeStatus
  ) {
    throw new Error(`لا يمكن تغيير الحالة من ${statusLabel(row.status)} إلى ${statusLabel(storeStatus)}`);
  }
  db.prepare(`
    UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?
  `).run(storeStatus, orderId);
  logEvent(orderId, {
    fromStatus: row.status,
    toStatus: storeStatus,
    actorType,
    actorId,
    note
  });
  return loadOrder(orderId);
}

function listOrders({ agentId, status, sourceType, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (agentId) {
    where.push('agent_id = ?');
    params.push(agentId);
  }
  if (sourceType) {
    where.push('source_type = ?');
    params.push(String(sourceType));
  }
  if (status) {
    const group = STATUS_FILTER_GROUP[status] || STATUS_FILTER_GROUP[canonicalStatus(status)];
    if (group?.length) {
      where.push(`status IN (${group.map(() => '?').join(',')})`);
      params.push(...group);
    } else {
      where.push('status = ?');
      params.push(status);
    }
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
/** Statuses an agent may cancel (soft delete → rejected). */
const AGENT_CANCELLABLE = new Set(['submitted', 'under_review', 'pending']);

/**
 * Agent removes an order: cancel if still pending review, otherwise hard-delete when allowed.
 */
function deleteOrderByAgent(orderId, agentId) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!row) return null;
  if (Number(row.agent_id) !== Number(agentId)) {
    throw new Error('لا تملك صلاحية هذا الطلب');
  }

  if (AGENT_CANCELLABLE.has(row.status) || canonicalStatus(row.status) === 'pending') {
    return setOrderStatus(orderId, 'rejected', {
      actorType: 'agent',
      actorId: String(agentId),
      note: 'ألغاه المندوب'
    });
  }

  if (!AGENT_DELETABLE.has(row.status)) {
    throw new Error(`لا يمكن حذف الطلب وهو «${statusLabel(row.status)}»`);
  }

  return hardDeleteOrder(orderId, row.status);
}

function hardDeleteOrder(orderId, previousStatus) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM order_events WHERE order_id = ?').run(orderId);
    db.prepare('DELETE FROM order_lines WHERE order_id = ?').run(orderId);
    db.prepare('DELETE FROM orders WHERE id = ?').run(orderId);
  });
  tx();
  return { deleted: true, id: orderId, previousStatus };
}

/** Admin hard-deletes any purchase order. */
function deleteOrderByAdmin(orderId) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!row) return null;
  return hardDeleteOrder(orderId, row.status);
}

module.exports = {
  STATUS_LABELS,
  STATUS_FILTER_GROUP,
  canonicalStatus,
  statusLabel,
  loadOrder,
  createOrder,
  createShorjaOrder,
  updateOrder,
  submitOrder,
  setOrderStatus,
  updateOrderLineByEmployee,
  deleteOrderLineByEmployee,
  orderFeed,
  deleteOrderByAgent,
  deleteOrderByAdmin,
  listOrders,
  orderStats
};
