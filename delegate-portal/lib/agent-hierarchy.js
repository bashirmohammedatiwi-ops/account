const db = require('./db');

const DELEGATE_ROLES = new Set(['primary', 'secondary']);
const ROLE_LABELS = {
  primary: 'مندوب رئيسي',
  secondary: 'مندوب ثانوي'
};

const HANDOVER_LABELS = {
  pending: 'بانتظار التسليم',
  received: 'استلم الرئيسي المبلغ'
};

function normalizeRole(role) {
  const r = String(role || 'primary').trim().toLowerCase();
  return DELEGATE_ROLES.has(r) ? r : 'primary';
}

function mapAgentProfile(row) {
  if (!row) return null;
  const role = normalizeRole(row.delegate_role);
  const parentId = row.parent_agent_id ? Number(row.parent_agent_id) : null;
  let parentName = '';
  if (parentId) {
    const parent = db.prepare('SELECT name FROM agents WHERE id = ?').get(parentId);
    parentName = parent?.name || '';
  }
  const secondaryCount = role === 'primary'
    ? db.prepare('SELECT COUNT(*) AS c FROM agents WHERE parent_agent_id = ?').get(row.id)?.c || 0
    : 0;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    username: row.username,
    active: !!row.active,
    delegateRole: role,
    delegateRoleLabel: ROLE_LABELS[role] || role,
    parentAgentId: parentId,
    parentAgentName: parentName,
    secondaryCount,
    canCreateReceipt: role === 'primary',
    canCreateDeliveryReceipt: true,
    createdAt: row.created_at
  };
}

function getAgentProfile(agentId) {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(Number(agentId));
  return mapAgentProfile(row);
}

function isSecondary(agentId) {
  return getAgentProfile(agentId)?.delegateRole === 'secondary';
}

function isPrimary(agentId) {
  return getAgentProfile(agentId)?.delegateRole !== 'secondary';
}

function getSecondaryAgentIds(primaryId) {
  return db.prepare(`
    SELECT id FROM agents WHERE parent_agent_id = ? ORDER BY name
  `).all(Number(primaryId)).map((r) => Number(r.id));
}

function getPrimaryAgentId(secondaryId) {
  const row = db.prepare('SELECT parent_agent_id FROM agents WHERE id = ?').get(Number(secondaryId));
  return row?.parent_agent_id ? Number(row.parent_agent_id) : null;
}

function agentScopeIds(agentId) {
  const id = Number(agentId);
  if (isPrimary(id)) return [id, ...getSecondaryAgentIds(id)];
  return [id];
}

function canAgentViewDeliveryReceipt(viewerAgentId, deliveryAgentId) {
  return agentScopeIds(viewerAgentId).includes(Number(deliveryAgentId));
}

function assertCanCreateReceipt(agentId) {
  if (isSecondary(agentId)) {
    throw new Error('المندوب الثانوي لا يستطيع إنشاء سند قبض — أنشئ وصل استلام فقط');
  }
}

function assertCanMarkHandover(primaryAgentId, deliveryAgentId) {
  if (!isPrimary(primaryAgentId)) {
    throw new Error('فقط المندوب الرئيسي يستطيع تأكيد استلام المبلغ');
  }
  const secondaryIds = getSecondaryAgentIds(primaryAgentId);
  if (!secondaryIds.includes(Number(deliveryAgentId))) {
    throw new Error('هذا الوصل لا يتبع مندوباً ثانوياً تحت إدارتك');
  }
}

function validateAgentHierarchyInput({ delegateRole, parentAgentId, agentId } = {}) {
  const role = normalizeRole(delegateRole);
  const parentId = parentAgentId ? Number(parentAgentId) : null;
  if (role === 'secondary') {
    if (!parentId) throw new Error('اختر المندوب الرئيسي للمندوب الثانوي');
    const parent = db.prepare('SELECT id, delegate_role FROM agents WHERE id = ?').get(parentId);
    if (!parent) throw new Error('المندوب الرئيسي غير موجود');
    if (normalizeRole(parent.delegate_role) !== 'primary') {
      throw new Error('يمكن ربط المندوب الثانوي بمندوب رئيسي فقط');
    }
    if (agentId && Number(agentId) === parentId) {
      throw new Error('لا يمكن للمندوب أن يتبع نفسه');
    }
  } else if (parentId) {
    throw new Error('المندوب الرئيسي لا يتبع مندوباً آخر');
  }
  return { delegateRole: role, parentAgentId: role === 'secondary' ? parentId : null };
}

function saveAgentHierarchy(agentId, { delegateRole, parentAgentId } = {}) {
  const current = db.prepare('SELECT delegate_role, parent_agent_id FROM agents WHERE id = ?').get(Number(agentId));
  const parsed = validateAgentHierarchyInput({
    delegateRole: delegateRole ?? current?.delegate_role,
    parentAgentId: parentAgentId !== undefined ? parentAgentId : current?.parent_agent_id,
    agentId
  });
  if (parsed.delegateRole === 'primary') {
    const hasSecondaries = db.prepare('SELECT COUNT(*) AS c FROM agents WHERE parent_agent_id = ?').get(agentId)?.c;
    if (hasSecondaries && parentAgentId) {
      throw new Error('مندوب رئيسي لديه مندوبون ثانويون — لا يمكن تحويله لمندوب ثانوي');
    }
  }
  db.prepare(`
    UPDATE agents SET parent_agent_id = ?, delegate_role = ? WHERE id = ?
  `).run(parsed.parentAgentId, parsed.delegateRole, agentId);
  return getAgentProfile(agentId);
}

function listPrimaryAgents() {
  return db.prepare(`
    SELECT * FROM agents
    WHERE COALESCE(delegate_role, 'primary') = 'primary'
    ORDER BY name
  `).all().map(mapAgentProfile);
}

function handoverStatusLabel(status) {
  return HANDOVER_LABELS[status] || status || '';
}

module.exports = {
  DELEGATE_ROLES,
  ROLE_LABELS,
  HANDOVER_LABELS,
  normalizeRole,
  mapAgentProfile,
  getAgentProfile,
  isSecondary,
  isPrimary,
  getSecondaryAgentIds,
  getPrimaryAgentId,
  agentScopeIds,
  canAgentViewDeliveryReceipt,
  assertCanCreateReceipt,
  assertCanMarkHandover,
  validateAgentHierarchyInput,
  saveAgentHierarchy,
  listPrimaryAgents,
  handoverStatusLabel
};
