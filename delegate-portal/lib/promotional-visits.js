const db = require('./db');
const { resolveGovernorate } = require('./iraq-governorates');

const STATUS_LABELS = {
  pending: 'بانتظار المراجعة',
  reviewed: 'تمت المراجعة',
  archived: 'مؤرشف'
};

const OUTCOME_LABELS = {
  agreed_order: 'وافق على الشراء',
  refused: 'رفض / غير مهتم',
  follow_up: 'يحتاج متابعة',
  samples_requested: 'طلب عينات',
  postponed: 'تأجيل',
  other: 'أخرى'
};

const AGENT_VISIBLE = new Set(['pending', 'reviewed', 'archived']);
const VALID_OUTCOMES = new Set(Object.keys(OUTCOME_LABELS));

function statusLabel(s) {
  return STATUS_LABELS[s] || s;
}

function outcomeLabel(s) {
  return OUTCOME_LABELS[s] || s;
}

function nextVisitNo() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const head = `PV-${day}`;
  const last = db.prepare(`
    SELECT visit_no FROM promotional_visits WHERE visit_no LIKE ? ORDER BY id DESC LIMIT 1
  `).get(`${head}-%`);
  let seq = 1;
  if (last?.visit_no) {
    const part = Number(last.visit_no.split('-').pop());
    if (!Number.isNaN(part)) seq = part + 1;
  }
  return `${head}-${String(seq).padStart(4, '0')}`;
}

function logEvent(visitId, { actorType, actorId, fromStatus, toStatus, note }) {
  db.prepare(`
    INSERT INTO promotional_visit_events (visit_id, actor_type, actor_id, from_status, to_status, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    visitId,
    actorType || '',
    actorId != null ? String(actorId) : '',
    fromStatus || '',
    toStatus || '',
    note || ''
  );
}

function mapVisit(row, events = []) {
  if (!row) return null;
  const agent = row.agent_id
    ? db.prepare('SELECT id, name FROM agents WHERE id = ?').get(row.agent_id)
    : null;
  return {
    id: row.id,
    visitNo: row.visit_no,
    status: row.status,
    statusLabel: statusLabel(row.status),
    agentId: row.agent_id,
    agentName: agent?.name || '',
    governorateCode: row.governorate_code || '',
    governorateName: row.governorate_name || '',
    areaName: row.area_name || '',
    shopName: row.shop_name || '',
    visitOutcome: row.visit_outcome || '',
    visitOutcomeLabel: outcomeLabel(row.visit_outcome),
    notes: row.notes || '',
    centerPhone: row.center_phone || '',
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

function loadPromotionalVisit(id) {
  const row = db.prepare('SELECT * FROM promotional_visits WHERE id = ?').get(id);
  if (!row) return null;
  const events = db.prepare(
    'SELECT * FROM promotional_visit_events WHERE visit_id = ? ORDER BY id'
  ).all(id);
  return mapVisit(row, events);
}

function listPromotionalVisits({ agentId, status, governorateCode, limit = 200 } = {}) {
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
  if (governorateCode) {
    where.push('governorate_code = ?');
    params.push(String(governorateCode).trim().toUpperCase());
  }
  params.push(Math.min(Math.max(Number(limit) || 200, 1), 500));
  return db.prepare(`
    SELECT * FROM promotional_visits
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY id DESC
    LIMIT ?
  `).all(...params).map((row) => mapVisit(row));
}

function visitStats() {
  const today = new Date().toISOString().slice(0, 10);
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) AS reviewed,
      SUM(CASE WHEN date(submitted_at) = date(?) OR date(created_at) = date(?) THEN 1 ELSE 0 END) AS today
    FROM promotional_visits
  `).get(today, today);
  return {
    total: row?.total || 0,
    pending: row?.pending || 0,
    reviewed: row?.reviewed || 0,
    today: row?.today || 0
  };
}

function createPromotionalVisit(agentId, data = {}) {
  const gov = resolveGovernorate(data.governorateCode || data.governorateName);
  if (!gov) throw new Error('اختر المحافظة');
  const areaName = String(data.areaName || '').trim();
  if (!areaName) throw new Error('أدخل اسم المنطقة');
  const shopName = String(data.shopName || '').trim();
  if (!shopName) throw new Error('أدخل اسم المحل أو المركز');
  const outcome = String(data.visitOutcome || '').trim();
  if (!VALID_OUTCOMES.has(outcome)) throw new Error('اختر حالة الزيارة بعد الترويج');
  const notes = String(data.notes || '').trim();
  const centerPhone = String(data.centerPhone || data.center_phone || '').trim();
  const visitNo = nextVisitNo();
  const r = db.prepare(`
    INSERT INTO promotional_visits (
      visit_no, agent_id, governorate_code, governorate_name,
      area_name, shop_name, visit_outcome, notes, center_phone,
      status, submitted_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
  `).run(
    visitNo,
    agentId,
    gov.code,
    gov.name,
    areaName,
    shopName,
    outcome,
    notes,
    centerPhone
  );
  const id = r.lastInsertRowid;
  logEvent(id, {
    actorType: 'agent',
    actorId: agentId,
    fromStatus: '',
    toStatus: 'pending',
    note: 'إرسال زيارة ترويجية'
  });
  return loadPromotionalVisit(id);
}

function updateVisitByAdmin(id, data = {}) {
  const row = db.prepare('SELECT * FROM promotional_visits WHERE id = ?').get(id);
  if (!row) return null;
  const areaName = data.areaName != null ? String(data.areaName).trim() : row.area_name;
  const shopName = data.shopName != null ? String(data.shopName).trim() : row.shop_name;
  const notes = data.notes != null ? String(data.notes).trim() : row.notes;
  const adminNote = data.adminNote != null ? String(data.adminNote).trim() : row.admin_note;
  let governorateCode = row.governorate_code;
  let governorateName = row.governorate_name;
  if (data.governorateCode || data.governorateName) {
    const gov = resolveGovernorate(data.governorateCode || data.governorateName);
    if (!gov) throw new Error('المحافظة غير صالحة');
    governorateCode = gov.code;
    governorateName = gov.name;
  }
  let visitOutcome = row.visit_outcome;
  if (data.visitOutcome) {
    const o = String(data.visitOutcome).trim();
    if (!VALID_OUTCOMES.has(o)) throw new Error('حالة الزيارة غير صالحة');
    visitOutcome = o;
  }
  db.prepare(`
    UPDATE promotional_visits SET
      governorate_code = ?, governorate_name = ?,
      area_name = ?, shop_name = ?, visit_outcome = ?,
      notes = ?, admin_note = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(governorateCode, governorateName, areaName, shopName, visitOutcome, notes, adminNote, id);
  return loadPromotionalVisit(id);
}

function setVisitStatus(id, status, { actorType, actorId, note } = {}) {
  const row = db.prepare('SELECT * FROM promotional_visits WHERE id = ?').get(id);
  if (!row) return null;
  const next = String(status || '').trim();
  if (!AGENT_VISIBLE.has(next)) throw new Error('حالة غير صالحة');
  if (row.status === next) return loadPromotionalVisit(id);
  db.prepare(`
    UPDATE promotional_visits SET status = ?, updated_at = datetime('now') WHERE id = ?
  `).run(next, id);
  logEvent(id, {
    actorType,
    actorId,
    fromStatus: row.status,
    toStatus: next,
    note
  });
  return loadPromotionalVisit(id);
}

function deletePromotionalVisit(id, { agentId } = {}) {
  const row = db.prepare('SELECT * FROM promotional_visits WHERE id = ?').get(id);
  if (!row) return null;
  if (agentId && Number(row.agent_id) !== Number(agentId)) return null;
  if (agentId && row.status !== 'pending') throw new Error('لا يمكن حذف زيارة تمت مراجعتها');
  db.prepare('DELETE FROM promotional_visit_events WHERE visit_id = ?').run(id);
  db.prepare('DELETE FROM promotional_visits WHERE id = ?').run(id);
  return { deleted: true, id };
}

module.exports = {
  STATUS_LABELS,
  OUTCOME_LABELS,
  statusLabel,
  outcomeLabel,
  listPromotionalVisits,
  loadPromotionalVisit,
  createPromotionalVisit,
  updateVisitByAdmin,
  setVisitStatus,
  deletePromotionalVisit,
  visitStats
};
