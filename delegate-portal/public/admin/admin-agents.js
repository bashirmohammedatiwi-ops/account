/* Agents page — hierarchy, filters, teams / table / cards */

const agentPage = {
  agents: [],
  filter: 'all',
  view: 'teams',
  sort: 'name',
  search: ''
};

const AG_FILTER_LABELS = {
  all: 'الكل',
  primary: 'رئيسيون',
  secondary: 'ثانويون',
  active: 'نشط',
  inactive: 'موقوف'
};

function agentMatchesFilter(a) {
  const f = agentPage.filter;
  if (f === 'primary' && a.delegateRole === 'secondary') return false;
  if (f === 'secondary' && a.delegateRole !== 'secondary') return false;
  if (f === 'active' && !a.active) return false;
  if (f === 'inactive' && a.active) return false;
  const q = agentPage.search.trim().toLowerCase();
  if (!q) return true;
  const hay = `${a.name} ${a.username} ${a.phone || ''} ${a.parentAgentName || ''}`.toLowerCase();
  return hay.includes(q);
}

function sortAgents(list) {
  const sorted = [...list];
  const dir = 1;
  sorted.sort((a, b) => {
    switch (agentPage.sort) {
      case 'role': {
        const ra = a.delegateRole === 'secondary' ? 1 : 0;
        const rb = b.delegateRole === 'secondary' ? 1 : 0;
        return (ra - rb) * dir || String(a.name).localeCompare(String(b.name), 'ar');
      }
      case 'status': {
        const sa = a.active ? 0 : 1;
        const sb = b.active ? 0 : 1;
        return (sa - sb) * dir || String(a.name).localeCompare(String(b.name), 'ar');
      }
      case 'trees':
        return ((b.treeSeqs?.length || 0) - (a.treeSeqs?.length || 0)) || String(a.name).localeCompare(String(b.name), 'ar');
      case 'name':
      default:
        return String(a.name).localeCompare(String(b.name), 'ar');
    }
  });
  return sorted;
}

function filteredAgents() {
  return sortAgents(agentPage.agents.filter(agentMatchesFilter));
}

function agentStats(agents) {
  const total = agents.length;
  const primary = agents.filter((a) => a.delegateRole !== 'secondary').length;
  const secondary = agents.filter((a) => a.delegateRole === 'secondary').length;
  const active = agents.filter((a) => a.active).length;
  const trees = agents.reduce((s, a) => s + (a.treeSeqs?.length || 0), 0);
  return { total, primary, secondary, active, inactive: total - active, trees };
}

function renderAgentStats(agents) {
  const s = agentStats(agents);
  colRenderStatGrid(document.getElementById('agentStats'), [
    { key: 'all', cls: 'neutral', label: 'إجمالي المندوبين', count: s.total, filterKey: 'all' },
    { key: 'primary', cls: 'ready', label: 'رئيسيون', count: s.primary, filterKey: 'primary' },
    { key: 'secondary', cls: 'pending', label: 'ثانويون', count: s.secondary, filterKey: 'secondary' },
    { key: 'active', cls: 'posted', label: 'نشط', count: s.active, filterKey: 'active' },
    { key: 'inactive', cls: 'warn', label: 'موقوف', count: s.inactive, filterKey: 'inactive' },
    { key: 'trees', cls: 'neutral', label: 'شجرات مصرّحة', count: s.trees, filterKey: 'all', clickable: false }
  ], (key) => {
    agentPage.filter = key || 'all';
    syncAgentFilterChips();
    renderAgentsWorkspace();
  });
}

function renderAgentResultsBar() {
  const el = document.getElementById('agentResultsBar');
  if (!el) return;
  const filtered = filteredAgents();
  const total = agentPage.agents.length;
  const filterLabel = AG_FILTER_LABELS[agentPage.filter] || agentPage.filter;
  const viewLabel = agentPage.view === 'teams' ? 'فرق' : agentPage.view === 'table' ? 'جدول' : 'بطاقات';
  el.innerHTML = `
    <div class="ag-results-main">
      <span class="ag-results-count">عرض <strong class="num-en" dir="ltr">${fmtNumAlways(filtered.length)}</strong> من <strong class="num-en" dir="ltr">${fmtNumAlways(total)}</strong> مندوب</span>
      ${agentPage.filter !== 'all' ? `<span class="ag-results-filter">تصفية: ${esc(filterLabel)}</span>` : ''}
      ${agentPage.search.trim() ? `<span class="ag-results-filter">بحث: «${esc(agentPage.search.trim())}»</span>` : ''}
    </div>
    <span class="ag-results-view">عرض: ${esc(viewLabel)}</span>`;
}

function syncAgentFilterChips() {
  document.querySelectorAll('[data-ag-filter]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.agFilter === agentPage.filter);
  });
}

function syncAgentViewBtns() {
  document.querySelectorAll('[data-ag-view]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.agView === agentPage.view);
  });
}

function syncAgentPermMatrix() {
  const role = document.getElementById('agentRole')?.value || 'primary';
  document.getElementById('agentPermPrimary')?.classList.toggle('is-highlight', role === 'primary');
  document.getElementById('agentPermSecondary')?.classList.toggle('is-highlight', role === 'secondary');
}

function agAvatarHtml(name, role) {
  const cls = role === 'secondary' ? 'ag-avatar-secondary' : 'ag-avatar-primary';
  return `<span class="ag-avatar ${cls}">${esc(colAgentInitial(name))}</span>`;
}

function agRoleBadge(a) {
  const isSec = a.delegateRole === 'secondary';
  const label = a.delegateRoleLabel || (isSec ? 'ثانوي' : 'رئيسي');
  return `<span class="ag-badge ag-badge-${isSec ? 'secondary' : 'primary'}">${esc(label)}</span>`;
}

function agStatusBadge(a) {
  return `<span class="ag-badge ag-badge-${a.active ? 'active' : 'off'}">${a.active ? 'نشط' : 'موقوف'}</span>`;
}

function agPermChips(a) {
  const isSec = a.delegateRole === 'secondary';
  return `
    <div class="ag-perm-chips">
      <span class="ag-perm-chip on" title="وصل قبض">وصل</span>
      <span class="ag-perm-chip ${isSec ? 'off' : 'on'}" title="سند قبض">سند</span>
      <span class="ag-perm-chip ${isSec ? 'off' : 'on'}" title="إدارة فريق">فريق</span>
    </div>`;
}

function agCardActions(id) {
  return `
    <div class="ag-card-actions">
      <button type="button" class="btn btn-soft btn-sm" data-ag-edit="${id}">تعديل</button>
      <button type="button" class="btn btn-ghost btn-sm ag-btn-del" data-ag-del="${id}">حذف</button>
    </div>`;
}

function renderAgentCard(a, { compact = false } = {}) {
  const treeCount = a.treeSeqs?.length || 0;
  const isSec = a.delegateRole === 'secondary';
  return `
    <article class="ag-card${compact ? ' ag-card-compact' : ''}${isSec ? ' ag-card-secondary' : ' ag-card-primary'}">
      <header class="ag-card-head">
        ${agAvatarHtml(a.name, a.delegateRole)}
        <div class="ag-card-title">
          <strong>${esc(a.name)}</strong>
          <span class="ag-card-user" dir="ltr">@${esc(a.username)}</span>
          ${a.phone ? `<span class="ag-card-phone" dir="ltr">${esc(a.phone)}</span>` : ''}
        </div>
        <div class="ag-card-badges">
          ${agRoleBadge(a)}
          ${agStatusBadge(a)}
        </div>
      </header>
      <div class="ag-card-meta">
        ${a.parentAgentName ? `<div class="ag-meta-row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><span>يتبع <strong>${esc(a.parentAgentName)}</strong></span></div>` : ''}
        ${!isSec && a.secondaryCount ? `<div class="ag-meta-row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><span><strong>${fmtNumAlways(a.secondaryCount)}</strong> مندوب ثانوي</span></div>` : ''}
        <div class="ag-meta-row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/></svg><span><strong>${fmtNumAlways(treeCount)}</strong> شجرة مصرّحة</span></div>
      </div>
      ${agPermChips(a)}
      ${agCardActions(a.id)}
    </article>`;
}

function buildAgentTeams(agents) {
  const filtered = agents;
  const primaries = filtered.filter((a) => a.delegateRole !== 'secondary');
  const secondaries = filtered.filter((a) => a.delegateRole === 'secondary');
  const orphanSecondaries = secondaries.filter((s) => {
    return !primaries.some((p) => Number(p.id) === Number(s.parentAgentId));
  });
  const teams = primaries.map((p) => ({
    primary: p,
    members: secondaries.filter((s) => Number(s.parentAgentId) === Number(p.id))
  }));
  return { teams, orphanSecondaries, filtered };
}

function renderTeamHeader(primary, members) {
  const treeCount = primary.treeSeqs?.length || 0;
  return `
    <header class="ag-team-header">
      <div class="ag-team-header-main">
        ${agAvatarHtml(primary.name, primary.delegateRole)}
        <div>
          <strong>${esc(primary.name)}</strong>
          <span class="ag-team-header-sub" dir="ltr">@${esc(primary.username)}</span>
        </div>
      </div>
      <div class="ag-team-header-stats">
        <span><strong class="num-en" dir="ltr">${fmtNumAlways(members.length)}</strong> ثانوي</span>
        <span><strong class="num-en" dir="ltr">${fmtNumAlways(treeCount)}</strong> شجرة</span>
        ${agStatusBadge(primary)}
      </div>
      <div class="ag-team-header-actions">
        <button type="button" class="btn btn-soft btn-sm" data-ag-edit="${primary.id}">تعديل الرئيسي</button>
      </div>
    </header>`;
}

function renderAgentsTeamsView(agents) {
  const { teams, orphanSecondaries, filtered } = buildAgentTeams(agents);
  if (!filtered.length) {
    return `<div class="ag-empty"><div class="ag-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><strong>لا توجد نتائج</strong><p>غيّر البحث أو التصفية — أو أضف مندوباً جديداً</p></div>`;
  }

  let html = '<div class="ag-teams">';
  teams.forEach(({ primary, members }) => {
    html += `
      <section class="ag-team-block">
        ${renderTeamHeader(primary, members)}
        <div class="ag-team-lead">
          ${renderAgentCard(primary)}
        </div>
        ${members.length ? `
          <div class="ag-team-members">
            <div class="ag-team-members-label">المندوبون الثانويون (${fmtNumAlways(members.length)})</div>
            <div class="ag-team-grid">
              ${members.map((m) => renderAgentCard(m, { compact: true })).join('')}
            </div>
          </div>` : `
          <div class="ag-team-empty muted">لا يوجد مندوبون ثانويون مرتبطون بهذا الرئيسي</div>`}
      </section>`;
  });

  if (orphanSecondaries.length) {
    html += `
      <section class="ag-team-block ag-team-orphan">
        <header class="ag-team-header ag-team-header-warn">
          <strong>ثانويون بدون رئيسي مُعرَّف</strong>
          <span>يُنصح بربطهم بمندوب رئيسي من التعديل</span>
        </header>
        <div class="ag-team-grid ag-team-grid-pad">
          ${orphanSecondaries.map((m) => renderAgentCard(m, { compact: true })).join('')}
        </div>
      </section>`;
  }

  html += '</div>';
  return html;
}

function renderAgentsCardsView(agents) {
  if (!agents.length) {
    return `<div class="ag-empty"><div class="ag-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg></div><strong>لا توجد نتائج</strong><p>جرّب تصفية أخرى أو أضف مندوباً</p></div>`;
  }
  return `<div class="ag-card-grid">${agents.map((a) => renderAgentCard(a)).join('')}</div>`;
}

function renderAgentsTableView(agents) {
  if (!agents.length) {
    return `<div class="ag-empty"><div class="ag-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg></div><strong>لا توجد نتائج</strong><p>جرّب تصفية أخرى أو أضف مندوباً</p></div>`;
  }
  const rows = agents.map((a) => {
    const isSec = a.delegateRole === 'secondary';
    return `
      <tr class="ag-row${!a.active ? ' ag-row-off' : ''}">
        <td>
          <div class="ag-table-name">
            ${agAvatarHtml(a.name, a.delegateRole)}
            <div>
              <strong>${esc(a.name)}</strong>
              ${a.phone ? `<span class="ag-table-sub" dir="ltr">${esc(a.phone)}</span>` : ''}
            </div>
          </div>
        </td>
        <td dir="ltr" class="ag-table-user">@${esc(a.username)}</td>
        <td>${agRoleBadge(a)}</td>
        <td>${agStatusBadge(a)}</td>
        <td>${a.parentAgentName ? esc(a.parentAgentName) : '<span class="muted">—</span>'}</td>
        <td class="num-en" dir="ltr">${fmtNumAlways(a.treeSeqs?.length || 0)}</td>
        <td>${agPermChips(a)}</td>
        <td class="ag-table-actions">
          <button type="button" class="btn btn-soft btn-sm" data-ag-edit="${a.id}">تعديل</button>
          <button type="button" class="btn btn-ghost btn-sm ag-btn-del" data-ag-del="${a.id}">حذف</button>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="ag-table-wrap">
      <table class="ag-table">
        <thead>
          <tr>
            <th>المندوب</th>
            <th>المستخدم</th>
            <th>الدور</th>
            <th>الحالة</th>
            <th>يتبع</th>
            <th>شجرات</th>
            <th>الصلاحيات</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function bindAgentWorkspaceActions(root) {
  if (!root) return;
  root.querySelectorAll('[data-ag-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openAgentModal(Number(btn.dataset.agEdit)));
  });
  root.querySelectorAll('[data-ag-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف هذا المندوب؟ لا يمكن التراجع.')) return;
      try {
        await api(`/api/admin/agents/${btn.dataset.agDel}`, { method: 'DELETE' });
        primaryAgentsCache = [];
        await loadAgents();
        notifyAdmin('تم حذف المندوب', 'ok');
      } catch (err) {
        notifyAdmin(err.message || 'فشل الحذف', 'err');
      }
    });
  });
}

function renderAgentsWorkspace() {
  const el = document.getElementById('agentsWorkspace');
  if (!el) return;
  const agents = filteredAgents();
  renderAgentResultsBar();

  if (agentPage.view === 'table') {
    el.innerHTML = renderAgentsTableView(agents);
  } else if (agentPage.view === 'cards') {
    el.innerHTML = renderAgentsCardsView(agents);
  } else {
    el.innerHTML = renderAgentsTeamsView(agents);
  }
  bindAgentWorkspaceActions(el);
}

async function loadAgents() {
  const workspace = document.getElementById('agentsWorkspace');
  if (!workspace) return;
  workspace.innerHTML = '<p class="muted loading">جاري تحميل المندوبين...</p>';
  try {
    const data = await api('/api/admin/agents');
    agentPage.agents = data.agents || [];
    primaryAgentsCache = [];
    renderAgentStats(agentPage.agents);
    if (!agentPage.agents.length) {
      workspace.innerHTML = `
        <div class="ag-empty ag-empty-hero">
          <div class="ag-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg></div>
          <strong>لا يوجد مندوبون بعد</strong>
          <p>أنشئ حساباً للمندوب الأول — حدد الدور (رئيسي/ثانوي) والشجرات المسموحة</p>
          <button type="button" class="btn btn-primary" id="btnAddAgentEmpty">+ مندوب جديد</button>
        </div>`;
      document.getElementById('agentResultsBar')?.replaceChildren();
      document.getElementById('btnAddAgentEmpty')?.addEventListener('click', () => openAgentModal());
      return;
    }
    renderAgentsWorkspace();
  } catch (e) {
    workspace.innerHTML = `<div class="ag-empty"><strong>تعذّر التحميل</strong><p>${esc(e.message)}</p></div>`;
  }
}

function initAgentsPageUi() {
  document.getElementById('agentSearch')?.addEventListener('input', (e) => {
    agentPage.search = e.target.value || '';
    renderAgentsWorkspace();
  });

  document.querySelectorAll('[data-ag-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      agentPage.filter = btn.dataset.agFilter || 'all';
      syncAgentFilterChips();
      renderAgentsWorkspace();
    });
  });

  document.querySelectorAll('[data-ag-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      agentPage.view = btn.dataset.agView || 'teams';
      syncAgentViewBtns();
      renderAgentsWorkspace();
    });
  });

  document.getElementById('agentSort')?.addEventListener('change', (e) => {
    agentPage.sort = e.target.value || 'name';
    renderAgentsWorkspace();
  });

  document.getElementById('btnAgentsRefresh')?.addEventListener('click', () => void loadAgents());

  document.querySelectorAll('input[name="agentRoleRadio"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const sel = document.getElementById('agentRole');
      if (sel) sel.value = radio.value;
      syncAgentRoleUi();
      syncAgentPermMatrix();
    });
  });

  document.getElementById('agentCancelFoot')?.addEventListener('click', () => {
    document.getElementById('agentModal')?.classList.add('hidden');
  });
}

initAgentsPageUi();
