const db = require('./db');

function mapBranch(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code || '',
    name: row.name,
    sortOrder: row.sort_order,
    isActive: !!row.is_active,
    imagePath: row.image_path || '',
    imageUrl: row.image_path ? `/uploads/${row.image_path}` : ''
  };
}

function mapSection(row) {
  if (!row) return null;
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: !!row.is_active
  };
}

function listBranches({ activeOnly = false } = {}) {
  const rows = db.prepare(`
    SELECT * FROM catalog_branches
    ${activeOnly ? 'WHERE is_active = 1' : ''}
    ORDER BY sort_order, id
  `).all();
  return rows.map(mapBranch);
}

function getBranch(id) {
  return mapBranch(db.prepare('SELECT * FROM catalog_branches WHERE id = ?').get(id));
}

function createBranch({ code, name, sortOrder = 0, isActive = true }) {
  const r = db.prepare(`
    INSERT INTO catalog_branches (code, name, sort_order, is_active)
    VALUES (?, ?, ?, ?)
  `).run(code || '', name, sortOrder, isActive ? 1 : 0);
  return getBranch(r.lastInsertRowid);
}

function updateBranch(id, patch) {
  const row = db.prepare('SELECT * FROM catalog_branches WHERE id = ?').get(id);
  if (!row) return null;
  db.prepare(`
    UPDATE catalog_branches SET
      code = ?, name = ?, sort_order = ?, is_active = ?, image_path = COALESCE(?, image_path)
    WHERE id = ?
  `).run(
    patch.code ?? row.code,
    patch.name ?? row.name,
    patch.sortOrder ?? row.sort_order,
    patch.isActive != null ? (patch.isActive ? 1 : 0) : row.is_active,
    patch.imagePath ?? null,
    id
  );
  return getBranch(id);
}

function deleteBranch(id) {
  if (!db.prepare('SELECT id FROM catalog_branches WHERE id = ?').get(id)) return false;
  const { deleteProductsByBranchId } = require('./products');
  const tx = db.transaction(() => {
    deleteProductsByBranchId(id);
    return db.prepare('DELETE FROM catalog_branches WHERE id = ?').run(id).changes > 0;
  });
  return tx();
}

function listSections(branchId, { activeOnly = false } = {}) {
  const rows = db.prepare(`
    SELECT * FROM catalog_sections
    WHERE branch_id = ?
    ${activeOnly ? 'AND is_active = 1' : ''}
    ORDER BY sort_order, id
  `).all(branchId);
  return rows.map(mapSection);
}

function getSection(id) {
  return mapSection(db.prepare('SELECT * FROM catalog_sections WHERE id = ?').get(id));
}

function createSection({ branchId, name, sortOrder = 0, isActive = true }) {
  const r = db.prepare(`
    INSERT INTO catalog_sections (branch_id, name, sort_order, is_active)
    VALUES (?, ?, ?, ?)
  `).run(branchId, name, sortOrder, isActive ? 1 : 0);
  return getSection(r.lastInsertRowid);
}

function updateSection(id, patch) {
  const row = db.prepare('SELECT * FROM catalog_sections WHERE id = ?').get(id);
  if (!row) return null;
  db.prepare(`
    UPDATE catalog_sections SET branch_id = ?, name = ?, sort_order = ?, is_active = ?
    WHERE id = ?
  `).run(
    patch.branchId ?? row.branch_id,
    patch.name ?? row.name,
    patch.sortOrder ?? row.sort_order,
    patch.isActive != null ? (patch.isActive ? 1 : 0) : row.is_active,
    id
  );
  return getSection(id);
}

function deleteSection(id) {
  if (!db.prepare('SELECT id FROM catalog_sections WHERE id = ?').get(id)) return false;
  const { deleteProductsBySectionId } = require('./products');
  const tx = db.transaction(() => {
    deleteProductsBySectionId(id);
    return db.prepare('DELETE FROM catalog_sections WHERE id = ?').run(id).changes > 0;
  });
  return tx();
}

function agentCatalogBranchIds(agentId) {
  const rows = db.prepare(`
    SELECT branch_id FROM agent_catalog_branches WHERE agent_id = ?
  `).all(agentId);
  if (!rows.length) return null;
  return rows.map((r) => r.branch_id);
}

function listBranchesForAgent(agentId, { activeOnly = true } = {}) {
  const allowed = agentCatalogBranchIds(agentId);
  const branches = listBranches({ activeOnly });
  if (!allowed) return branches;
  const set = new Set(allowed);
  return branches.filter((b) => set.has(b.id));
}

module.exports = {
  listBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
  listSections,
  getSection,
  createSection,
  updateSection,
  deleteSection,
  listBranchesForAgent,
  agentCatalogBranchIds
};
