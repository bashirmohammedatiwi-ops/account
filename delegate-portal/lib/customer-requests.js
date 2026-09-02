const db = require('./db');
const {
  normalizeName,
  normalizePhone,
  normalizeAddress,
  buildEdariAccountName
} = require('./customer-posting');
const {
  canAgentAccess,
  getLeafDescendants,
  getGroupPath
} = require('./accounts');

const PICKABLE_REQUEST_STATUSES = new Set(['pending', 'reviewed']);

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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function nextRequestNo() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const head = `CR-${day}`;
  const last = db.prepare(`
    SELECT request_no FROM customer_requests WHERE request_no LIKE ? ORDER BY id DESC LIMIT 1
  `).get(`${head}-%`);
  let seq = 1;
  if (last?.request_no) {
    const part = Number(last.request_no.split('-').pop());
    if (!Number.isNaN(part)) seq = part + 1;
  }
  return `${head}-${String(seq).padStart(4, '0')}`;
}

function findAccount(seqOrNum) {
  const raw = String(seqOrNum || '').trim();
  if (!raw) return null;
  return db.prepare(`
    SELECT seq, num, name1, sub_count FROM accounts
    WHERE seq = ? OR num = ?
    ORDER BY CASE WHEN seq = ? THEN 0 WHEN num = ? THEN 1 ELSE 2 END
    LIMIT 1
  `).get(raw, raw, raw, raw);
}

function assertAgentAssignedTree(agentId, treeAccSeq) {
  const row = db.prepare(`
    SELECT account_seq FROM agent_trees WHERE agent_id = ? AND account_seq = ?
  `).get(agentId, String(treeAccSeq));
  if (!row) throw new Error('اختر شجرة من شجراتك المعتمدة');
}

function logEvent(requestId, { actorType, actorId, fromStatus, toStatus, note }) {
  db.prepare(`
    INSERT INTO customer_request_events (request_id, actor_type, actor_id, from_status, to_status, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    requestId,
    actorType || '',
    actorId != null ? String(actorId) : '',
    fromStatus || '',
    toStatus || '',
    note || ''
  );
}

function mapRequest(row, events = []) {
  if (!row) return null;
  const agent = row.agent_id
    ? db.prepare('SELECT id, name FROM agents WHERE id = ?').get(row.agent_id)
    : null;
  const name = row.name || '';
  const phone = row.phone || '';
  const address = row.address || '';
  return {
    id: row.id,
    requestNo: row.request_no,
    status: row.status,
    statusLabel: statusLabel(row.status),
    agentId: row.agent_id,
    agentName: agent?.name || '',
    treeAccSeq: row.tree_acc_seq || '',
    treeNum: row.tree_num || '',
    treeName: row.tree_name || '',
    name,
    phone,
    address,
    notes: row.notes || '',
    edariName: buildEdariAccountName({ name, phone, address }),
    edariSeq: row.edari_seq || '',
    edariNum: row.edari_num || '',
    edariPostedAt: row.edari_posted_at || '',
    postedError: row.posted_error || '',
    adminNote: row.admin_note || '',
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
}

function loadCustomerRequest(id) {
  const row = db.prepare('SELECT * FROM customer_requests WHERE id = ?').get(id);
  if (!row) return null;
  const events = db.prepare(
    'SELECT * FROM customer_request_events WHERE request_id = ? ORDER BY id'
  ).all(id);
  return mapRequest(row, events);
}

function listCustomerRequests({ agentId, status, limit = 200 } = {}) {
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
  params.push(Math.min(Math.max(Number(limit) || 200, 1), 500));
  return db.prepare(`
    SELECT * FROM customer_requests
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT ?
  `).all(...params).map((row) => mapRequest(row));
}

function customerRequestStats() {
  const today = todayIso();
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) AS reviewed,
      SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END) AS posted,
      SUM(CASE WHEN date(submitted_at) = date(?) OR date(created_at) = date(?) THEN 1 ELSE 0 END) AS today
    FROM customer_requests
  `).get(today, today);
  return {
    total: row?.total || 0,
    pending: row?.pending || 0,
    reviewed: row?.reviewed || 0,
    posted: row?.posted || 0,
    today: row?.today || 0
  };
}

function resolveTree(treeAccSeq, fallbackName = '') {
  const tree = findAccount(treeAccSeq);
  if (!tree) throw new Error('الشجرة غير موجودة في الحسابات المزامنة');
  return {
    seq: String(tree.seq),
    num: String(tree.num || ''),
    name: String(fallbackName || tree.name1 || '')
  };
}

function createCustomerRequest(agentId, data = {}) {
  const name = normalizeName(data.name);
  if (!name) throw new Error('أدخل اسم الزبون');
  const treeAccSeq = String(data.treeAccSeq || '').trim();
  if (!treeAccSeq) throw new Error('اختر الشجرة التي يُضاف لها الزبون');
  assertAgentAssignedTree(agentId, treeAccSeq);
  const tree = resolveTree(treeAccSeq, data.treeName);
  const requestNo = nextRequestNo();
  const r = db.prepare(`
    INSERT INTO customer_requests (
      request_no, agent_id, tree_acc_seq, tree_num, tree_name,
      name, phone, address, notes, status, submitted_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
  `).run(
    requestNo,
    agentId,
    tree.seq,
    tree.num,
    tree.name,
    name,
    normalizePhone(data.phone),
    normalizeAddress(data.address, data.phone),
    normalizeName(data.notes)
  );
  logEvent(r.lastInsertRowid, {
    actorType: 'agent',
    actorId: agentId,
    fromStatus: '',
    toStatus: 'pending',
    note: 'طلب زبون جديد'
  });
  return loadCustomerRequest(r.lastInsertRowid);
}

function updateCustomerRequestByAdmin(id, patch = {}) {
  const row = db.prepare('SELECT * FROM customer_requests WHERE id = ?').get(id);
  if (!row) return null;
  if (row.status === 'posted') throw new Error('لا يمكن تعديل زبون مُرحَّل');

  let tree = {
    seq: row.tree_acc_seq,
    num: row.tree_num,
    name: row.tree_name
  };
  if (patch.treeAccSeq) {
    tree = resolveTree(patch.treeAccSeq, patch.treeName);
  } else if (patch.treeName != null) {
    tree.name = String(patch.treeName);
  }

  const name = patch.name != null ? normalizeName(patch.name) : row.name;
  if (!name) throw new Error('اسم الزبون مطلوب');

  db.prepare(`
    UPDATE customer_requests SET
      tree_acc_seq = ?,
      tree_num = ?,
      tree_name = ?,
      name = ?,
      phone = ?,
      address = ?,
      notes = ?,
      admin_note = ?,
      status = 'reviewed',
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    tree.seq,
    tree.num,
    tree.name,
    name,
    patch.phone != null ? normalizePhone(patch.phone) : row.phone,
    patch.address != null ? normalizeAddress(patch.address, patch.phone ?? row.phone) : row.address,
    patch.notes != null ? normalizeName(patch.notes) : row.notes,
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
  return loadCustomerRequest(id);
}

function setCustomerRequestStatus(id, status, { actorType = 'admin', actorId = 'admin', note = '' } = {}) {
  const row = db.prepare('SELECT * FROM customer_requests WHERE id = ?').get(id);
  if (!row) return null;
  const next = String(status || '').trim();
  if (!STATUS_LABELS[next]) throw new Error('حالة غير صالحة');
  if (row.status === 'posted' && next !== 'posted') {
    throw new Error('الزبون مُرحَّل ولا يمكن تغيير حالته');
  }
  db.prepare(`
    UPDATE customer_requests SET status = ?, updated_at = datetime('now') WHERE id = ?
  `).run(next, id);
  logEvent(id, {
    actorType,
    actorId,
    fromStatus: row.status,
    toStatus: next,
    note
  });
  return loadCustomerRequest(id);
}

function upsertLocalCustomer({ seq, num, name1, masterSeq, address, remarks }) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO accounts (
      seq, num, name1, name2, master_seq, sub_count, bal, tot1, tot2,
      address, remarks, official_name, fix_date, fix_bal, last_match_seq, last_match_date, synced_at
    ) VALUES (?, ?, ?, '', ?, 0, 0, 0, 0, ?, ?, '', '', '', '', '', ?)
    ON CONFLICT(seq) DO UPDATE SET
      num=excluded.num,
      name1=excluded.name1,
      master_seq=excluded.master_seq,
      address=excluded.address,
      remarks=excluded.remarks,
      synced_at=excluded.synced_at
  `).run(
    String(seq),
    String(num),
    String(name1 || ''),
    String(masterSeq),
    String(address || ''),
    String(remarks || ''),
    now
  );
  db.prepare(`
    UPDATE accounts SET sub_count = (
      SELECT COUNT(*) FROM accounts c WHERE c.master_seq = accounts.seq
    )
    WHERE seq = ?
  `).run(String(masterSeq));
}

function markCustomerRequestPosted(id, {
  edariSeq,
  edariNum,
  name1,
  error = '',
  address,
  remarks
} = {}) {
  const row = db.prepare('SELECT * FROM customer_requests WHERE id = ?').get(id);
  if (!row) return null;
  if (!error && row.status === 'posted') {
    if (edariNum && row.edari_num && String(row.edari_num) !== String(edariNum)) {
      throw new Error('الزبون مُرحَّل مسبقاً برقم حساب مختلف');
    }
    return loadCustomerRequest(id);
  }
  if (error) {
    db.prepare(`
      UPDATE customer_requests SET posted_error = ?, updated_at = datetime('now') WHERE id = ?
    `).run(String(error), id);
    logEvent(id, {
      actorType: 'admin',
      actorId: 'admin',
      fromStatus: row.status,
      toStatus: row.status,
      note: `فشل الترحيل: ${error}`
    });
    return loadCustomerRequest(id);
  }
  db.prepare(`
    UPDATE customer_requests SET
      status = 'posted',
      edari_seq = ?,
      edari_num = ?,
      edari_posted_at = datetime('now'),
      posted_error = '',
      updated_at = datetime('now')
    WHERE id = ?
  `).run(String(edariSeq || ''), String(edariNum || ''), id);
  if (edariSeq && edariNum) {
    upsertLocalCustomer({
      seq: edariSeq,
      num: edariNum,
      name1: name1 || buildEdariAccountName(row),
      masterSeq: row.tree_acc_seq,
      address: address != null ? address : row.address,
      remarks: remarks != null ? remarks : row.notes
    });
    linkOrdersToPostedCustomer(id, { edariSeq, name1: name1 || buildEdariAccountName(row) });
  }
  logEvent(id, {
    actorType: 'admin',
    actorId: 'admin',
    fromStatus: row.status,
    toStatus: 'posted',
    note: `ترحيل للإداري · حساب ${edariNum || ''} · Seq ${edariSeq || ''}`
  });
  return loadCustomerRequest(id);
}

function deleteCustomerRequest(id, { agentId } = {}) {
  const row = db.prepare('SELECT * FROM customer_requests WHERE id = ?').get(id);
  if (!row) return null;
  if (agentId && Number(row.agent_id) !== Number(agentId)) return null;
  if (row.status === 'posted') throw new Error('لا يمكن حذف زبون مُرحَّل');
  db.prepare('DELETE FROM customer_request_events WHERE request_id = ?').run(id);
  db.prepare('DELETE FROM customer_requests WHERE id = ?').run(id);
  return { deleted: true, id };
}

function postingPayload(id) {
  const request = loadCustomerRequest(id);
  if (!request) return null;
  return {
    requestNo: request.requestNo,
    name: request.name,
    phone: request.phone,
    address: request.address,
    notes: request.notes,
    treeAccSeq: request.treeAccSeq,
    treeNum: request.treeNum,
    treeName: request.treeName,
    edariName: request.edariName
  };
}

function mapPickableFromAccount(c, rootSeq) {
  return {
    seq: String(c.seq),
    num: String(c.num || ''),
    name1: String(c.name1 || ''),
    name2: String(c.name2 || ''),
    address: String(c.address || ''),
    remarks: String(c.remarks || ''),
    bal: Number(c.bal || 0),
    subCount: Number(c.sub_count || 0),
    groupPath: getGroupPath(c.seq, rootSeq),
    source: 'account',
    isPending: false,
    requestId: null,
    pendingLabel: ''
  };
}

function mapPickableFromRequest(row) {
  return {
    seq: '',
    num: String(row.request_no || ''),
    name1: String(row.name || ''),
    name2: '',
    address: String(row.address || ''),
    remarks: String(row.notes || ''),
    bal: 0,
    subCount: 0,
    groupPath: '',
    source: 'request',
    isPending: true,
    requestId: Number(row.id),
    pendingLabel: statusLabel(row.status)
  };
}

function listPendingPickableForTree(agentId, treeAccSeq) {
  return db.prepare(`
    SELECT * FROM customer_requests
    WHERE agent_id = ?
      AND tree_acc_seq = ?
      AND status IN ('pending', 'reviewed')
      AND (edari_seq IS NULL OR trim(edari_seq) = '')
    ORDER BY name COLLATE NOCASE
  `).all(agentId, String(treeAccSeq));
}

/** زبائن الشجرة للفواتير: حسابات مُرحّلة + طلبات بانتظار الترحيل */
function listPickableCustomers(agentId, treeAccSeq) {
  assertAgentAssignedTree(agentId, treeAccSeq);
  const rootSeq = String(treeAccSeq);
  const accounts = getLeafDescendants(rootSeq).map((c) => mapPickableFromAccount(c, rootSeq));
  const pending = listPendingPickableForTree(agentId, rootSeq).map(mapPickableFromRequest);
  return [...accounts, ...pending].sort((a, b) => String(a.name1).localeCompare(String(b.name1), 'ar'));
}

function loadAgentCustomerRequest(id, agentId) {
  const row = db.prepare('SELECT * FROM customer_requests WHERE id = ? AND agent_id = ?').get(id, agentId);
  return row ? mapRequest(row) : null;
}

function resolveOrderCustomer(agentId, { customerAccSeq, customerRequestId } = {}) {
  const requestId = customerRequestId ? Number(customerRequestId) : 0;
  if (requestId) {
    const request = loadAgentCustomerRequest(requestId, agentId);
    if (!request) throw new Error('طلب الزبون غير موجود');
    if (!PICKABLE_REQUEST_STATUSES.has(request.status)) {
      throw new Error('الزبون غير متاح للطلبات في هذه الحالة');
    }
    return {
      customerAccSeq: '',
      customerRequestId: requestId,
      customerDisplayName: request.name
    };
  }
  const seq = String(customerAccSeq || '').trim();
  if (!seq) throw new Error('اختر زبوناً');
  if (!canAgentAccess(agentId, seq)) throw new Error('لا تملك صلاحية هذا الزبون');
  return {
    customerAccSeq: seq,
    customerRequestId: null,
    customerDisplayName: ''
  };
}

function linkOrdersToPostedCustomer(requestId, { edariSeq, name1 } = {}) {
  if (!requestId || !edariSeq) return;
  db.prepare(`
    UPDATE orders SET
      customer_acc_seq = ?,
      customer_request_id = NULL,
      customer_display_name = CASE
        WHEN customer_display_name IS NULL OR trim(customer_display_name) = '' THEN ?
        ELSE customer_display_name
      END,
      updated_at = datetime('now')
    WHERE customer_request_id = ?
  `).run(String(edariSeq), String(name1 || ''), Number(requestId));
}

function listPostableTrees() {
  const bySeq = new Map();
  const add = (r) => {
    if (!r?.seq) return;
    bySeq.set(String(r.seq), {
      seq: String(r.seq),
      num: String(r.num || ''),
      name: String(r.name1 || r.name || ''),
      subCount: Number(r.sub_count || r.subCount || 0)
    });
  };
  db.prepare(`
    SELECT seq, num, name1, sub_count
    FROM accounts
    WHERE CAST(sub_count AS INTEGER) > 0
    ORDER BY num
  `).all().forEach(add);
  db.prepare(`
    SELECT a.seq, a.num, a.name1, a.sub_count
    FROM agent_trees t
    JOIN accounts a ON a.seq = t.account_seq
  `).all().forEach(add);
  return [...bySeq.values()].sort((a, b) => String(a.num).localeCompare(String(b.num), 'ar'));
}

module.exports = {
  listCustomerRequests,
  loadCustomerRequest,
  customerRequestStats,
  createCustomerRequest,
  updateCustomerRequestByAdmin,
  setCustomerRequestStatus,
  markCustomerRequestPosted,
  deleteCustomerRequest,
  postingPayload,
  listPostableTrees,
  listPickableCustomers,
  resolveOrderCustomer,
  loadAgentCustomerRequest
};
