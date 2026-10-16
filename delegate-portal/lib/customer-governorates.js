const db = require('./db');
const { normalizeRole } = require('./agent-hierarchy');
const { agentAllowedSeqs } = require('./accounts');
const { resolveGovernorate, IRAQ_GOVERNORATES } = require('./iraq-governorates');

const NAME_BY_CODE = Object.fromEntries(IRAQ_GOVERNORATES.map((g) => [g.code, g.name]));

/**
 * صاحب التصنيف: المندوب الرئيسي نفسه، أو رئيسي المندوب الثانوي —
 * فيرى الفريق كله نفس التقسيم.
 */
function governorateOwnerId(agentId) {
  const row = db.prepare('SELECT delegate_role, parent_agent_id FROM agents WHERE id = ?').get(Number(agentId));
  if (normalizeRole(row?.delegate_role) === 'secondary' && row?.parent_agent_id) {
    return Number(row.parent_agent_id);
  }
  return Number(agentId);
}

function canEditGovernorates(agentId) {
  const row = db.prepare('SELECT delegate_role FROM agents WHERE id = ?').get(Number(agentId));
  return normalizeRole(row?.delegate_role) === 'primary';
}

/** خريطة seq → رمز المحافظة لفريق المندوب. */
function governorateMapForAgent(agentId) {
  const rows = db.prepare(`
    SELECT account_seq, governorate_code FROM agent_customer_governorates WHERE owner_agent_id = ?
  `).all(governorateOwnerId(agentId));
  return new Map(rows.map((r) => [String(r.account_seq), r.governorate_code]));
}

/** يضيف governorateCode / governorateName لكل صف يحمل seq. */
function attachGovernorates(agentId, rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const map = governorateMapForAgent(agentId);
  return rows.map((row) => {
    const code = row?.seq ? map.get(String(row.seq)) : null;
    if (!code) return { ...row, governorateCode: null, governorateName: null };
    return { ...row, governorateCode: code, governorateName: NAME_BY_CODE[code] || code };
  });
}

/**
 * يحدد محافظة زبون أو أكثر (أو يزيلها عند governorateCode = null).
 * للمندوب الرئيسي فقط، وعلى الحسابات التي يملك صلاحيتها.
 */
function assignGovernorates(agentId, seqs, governorateCode) {
  if (!canEditGovernorates(agentId)) {
    const err = new Error('تصنيف الزبائن حسب المحافظة متاح للمندوب الرئيسي فقط');
    err.status = 403;
    throw err;
  }
  const list = [...new Set((Array.isArray(seqs) ? seqs : []).map((s) => String(s || '').trim()).filter(Boolean))];
  if (!list.length) {
    const err = new Error('اختر زبوناً واحداً على الأقل');
    err.status = 400;
    throw err;
  }
  if (list.length > 2000) {
    const err = new Error('عدد الزبائن كبير جداً في عملية واحدة');
    err.status = 400;
    throw err;
  }
  let gov = null;
  if (governorateCode != null && String(governorateCode).trim() !== '') {
    gov = resolveGovernorate(governorateCode);
    if (!gov) {
      const err = new Error('محافظة غير معروفة');
      err.status = 400;
      throw err;
    }
  }
  const allowed = agentAllowedSeqs(agentId);
  const denied = list.filter((seq) => !allowed.has(seq));
  if (denied.length) {
    const err = new Error('لا تملك صلاحية بعض الحسابات المختارة');
    err.status = 403;
    throw err;
  }

  const owner = governorateOwnerId(agentId);
  const upsert = db.prepare(`
    INSERT INTO agent_customer_governorates (owner_agent_id, account_seq, governorate_code, updated_by_agent_id, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(owner_agent_id, account_seq) DO UPDATE SET
      governorate_code = excluded.governorate_code,
      updated_by_agent_id = excluded.updated_by_agent_id,
      updated_at = excluded.updated_at
  `);
  const remove = db.prepare('DELETE FROM agent_customer_governorates WHERE owner_agent_id = ? AND account_seq = ?');
  db.transaction(() => {
    for (const seq of list) {
      if (gov) upsert.run(owner, seq, gov.code, Number(agentId));
      else remove.run(owner, seq);
    }
  })();
  return {
    updated: list.length,
    governorateCode: gov?.code || null,
    governorateName: gov?.name || null
  };
}

module.exports = {
  governorateOwnerId,
  canEditGovernorates,
  governorateMapForAgent,
  attachGovernorates,
  assignGovernorates
};
