/* Admin: promotional visits */

const PV_PILL = { pending: 'pending', reviewed: 'ready', archived: 'rejected' };

const promoVisitAdmin = {
  selected: null,
  governorates: [],
  outcomes: [],
  rows: [],
  listIds: [],
  viewMode: 'table'
};

function pvApplyChip(chip) {
  const sel = document.getElementById('promoVisitStatusFilter');
  if (sel) sel.value = chip === 'all' ? '' : chip;
  colSyncChips(chip === 'all' ? 'all' : chip);
  void loadPromotionalVisitsPage();
}

async function loadPromoMeta() {
  if (promoVisitAdmin.governorates.length && promoVisitAdmin.outcomes.length) return;
  const [gov, out] = await Promise.all([
    commerceApi('/promotional-visits/governorates'),
    commerceApi('/promotional-visits/outcomes')
  ]);
  promoVisitAdmin.governorates = gov.governorates || [];
  promoVisitAdmin.outcomes = out.outcomes || [];
}

function promoVisitSearchQuery() {
  return String(document.getElementById('promoVisitSearch')?.value || '').trim().toLowerCase();
}

function filterPromoVisitRows(rows) {
  const q = promoVisitSearchQuery();
  if (!q) return rows;
  return rows.filter((v) => {
    const hay = [v.visitNo, v.agentName, v.governorateName, v.areaName, v.shopName, v.visitOutcomeLabel]
      .join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function pvRowActions(v) {
  return `
    <div class="rcv-row-actions">
      <button type="button" class="btn btn-soft btn-sm" data-pv-id="${v.id}">عرض</button>
      <button type="button" class="btn btn-danger btn-sm" data-del-pv="${v.id}">حذف</button>
    </div>`;
}

function bindPromoVisitInteractions() {
  document.querySelectorAll('[data-pv-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void openPromoVisitDetail(Number(btn.dataset.pvId));
    });
  });
  document.querySelectorAll('[data-del-pv]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void deletePromoVisitUi(Number(btn.dataset.delPv));
    });
  });
  document.querySelectorAll('[data-pv-row]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      void openPromoVisitDetail(Number(row.dataset.pvRow));
    });
  });
}

function renderPromoVisitRows(rows) {
  const body = document.getElementById('promoVisitsBody');
  if (!body) return;
  body.innerHTML = rows.map((v) => {
    const active = promoVisitAdmin.selected?.id === v.id ? ' is-active' : '';
    return `
    <tr class="rcv-row${active}" data-pv-row="${v.id}">
      <td><span class="rcv-no num-en" dir="ltr">${esc(v.visitNo)}</span></td>
      <td>
        <div class="rcv-cell-agent">
          <span class="rcv-agent-avatar">${esc(colAgentInitial(v.agentName))}</span>
          <span>${esc(v.agentName)}</span>
        </div>
      </td>
      <td>${esc(v.governorateName)}</td>
      <td>${esc(v.areaName)}</td>
      <td><strong>${esc(v.shopName)}</strong></td>
      <td>${esc(v.visitOutcomeLabel)}</td>
      <td>${colStatusPill(v.status, v.statusLabel, PV_PILL)}</td>
      <td class="rcv-date num-en" dir="ltr">${fmtDateEn(v.submittedAt || v.createdAt)}</td>
      <td>${pvRowActions(v)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="9"><div class="rcv-empty">لا توجد زيارات ترويجية</div></td></tr>`;
  bindPromoVisitInteractions();
}

function renderPromoVisitCards(rows) {
  const grid = document.getElementById('pvCardsGrid');
  if (!grid) return;
  grid.innerHTML = rows.map((v) => {
    const active = promoVisitAdmin.selected?.id === v.id ? ' is-active' : '';
    return `
    <article class="rcv-card-item${active}" data-pv-row="${v.id}">
      <div class="rcv-card-item-head">
        <div>
          <span class="rcv-card-no num-en" dir="ltr">${esc(v.visitNo)}</span>
          ${colStatusPill(v.status, v.statusLabel, PV_PILL)}
        </div>
        <span class="rcv-card-date num-en" dir="ltr">${fmtDateEn(v.submittedAt || v.createdAt)}</span>
      </div>
      <div class="rcv-card-item-body">
        <div class="rcv-card-party">
          <span class="rcv-agent-avatar sm">${esc(colAgentInitial(v.agentName))}</span>
          <div><strong>${esc(v.shopName)}</strong><small>${esc(v.governorateName)} · ${esc(v.areaName)}</small></div>
        </div>
        <div class="rcv-card-amounts">
          <div><span>النتيجة</span><strong>${esc(v.visitOutcomeLabel)}</strong></div>
        </div>
      </div>
      <div class="rcv-card-item-foot">${pvRowActions(v)}</div>
    </article>`;
  }).join('') || '<div class="rcv-empty">لا توجد زيارات</div>';
  bindPromoVisitInteractions();
}

function renderPromoVisitList(rows) {
  renderPromoVisitRows(rows);
  renderPromoVisitCards(rows);
  colSetViewMode(promoVisitAdmin.viewMode, 'pv', promoVisitAdmin);
}

async function loadPromotionalVisitsPage() {
  await loadPromoMeta();
  const status = document.getElementById('promoVisitStatusFilter')?.value || '';
  const governorate = document.getElementById('promoVisitGovFilter')?.value || '';
  const q = new URLSearchParams();
  if (status) q.set('status', status);
  if (governorate) q.set('governorate', governorate);
  const path = `/promotional-visits${q.toString() ? `?${q}` : ''}`;
  const [list, stats] = await Promise.all([
    commerceApi(path),
    commerceApi('/promotional-visits/stats')
  ]);
  const s = stats.stats || {};
  colRenderStatGrid(document.getElementById('promoVisitStats'), [
    { key: 'pending', cls: 'pending', label: 'بانتظار المراجعة', count: s.pending, filterKey: 'pending' },
    { key: 'reviewed', cls: 'ready', label: 'تمت المراجعة', count: s.reviewed, filterKey: 'reviewed' },
    { key: 'today', cls: 'neutral', label: 'اليوم', count: s.today, filterKey: 'all', subText: 'زيارة' },
    { key: 'total', cls: 'total', label: 'الإجمالي', count: s.total, clickable: false, subText: 'زيارة' }
  ], pvApplyChip);

  promoVisitAdmin.rows = list.visits || [];
  promoVisitAdmin.listIds = promoVisitAdmin.rows.map((v) => v.id);
  const filtered = filterPromoVisitRows(promoVisitAdmin.rows);
  const countEl = document.getElementById('promoVisitListCount');
  if (countEl) countEl.innerHTML = `<span class="num-en" dir="ltr">${fmtNumAlways(filtered.length)}</span> زيارة`;
  renderPromoVisitList(filtered);
  colSyncChips(status || 'all');

  const govFilter = document.getElementById('promoVisitGovFilter');
  if (govFilter && govFilter.options.length <= 1) {
    govFilter.innerHTML = '<option value="">كل المحافظات</option>' +
      promoVisitAdmin.governorates.map((g) => `<option value="${esc(g.code)}">${esc(g.name)}</option>`).join('');
    if (governorate) govFilter.value = governorate;
  }
}

window.loadPromotionalVisitsPage = loadPromotionalVisitsPage;

async function openPromoVisitDetail(id) {
  await loadPromoMeta();
  const data = await commerceApi(`/promotional-visits/${id}`);
  const v = data.visit;
  promoVisitAdmin.selected = v;
  const panel = document.getElementById('promoVisitDetailPanel');
  panel.classList.add('has-receipt');
  const govOptions = promoVisitAdmin.governorates.map((g) =>
    `<option value="${esc(g.code)}" ${g.code === v.governorateCode ? 'selected' : ''}>${esc(g.name)}</option>`
  ).join('');
  const outcomeOptions = promoVisitAdmin.outcomes.map((o) =>
    `<option value="${esc(o.code)}" ${o.code === v.visitOutcome ? 'selected' : ''}>${esc(o.label)}</option>`
  ).join('');

  panel.innerHTML = `
    <div class="rcv-detail-inner">
      <div class="rcv-detail-toolbar">
        ${colDetailNav(promoVisitAdmin.listIds, id)}
        <button type="button" class="rcv-detail-close" id="pvCloseBtn" title="إغلاق">×</button>
      </div>
      <div class="rcv-detail-head">
        <div>
          <span class="rcv-detail-kicker">زيارة ترويجية</span>
          <h3 class="rcv-detail-title num-en" dir="ltr">${esc(v.visitNo)}</h3>
          <p class="rcv-detail-sub">${esc(v.agentName)} · ${esc(v.governorateName)}</p>
        </div>
        ${colStatusPill(v.status, v.statusLabel, PV_PILL)}
      </div>
      <div class="rcv-edit-grid">
        <label class="rcv-field"><span>المحافظة</span><select id="pvGov" class="search">${govOptions}</select></label>
        <label class="rcv-field"><span>المنطقة</span><input id="pvArea" class="search" value="${esc(v.areaName)}"></label>
        <label class="rcv-field"><span>المحل / المركز</span><input id="pvShop" class="search" value="${esc(v.shopName)}"></label>
        <label class="rcv-field"><span>حالة بعد الترويج</span><select id="pvOutcome" class="search">${outcomeOptions}</select></label>
      </div>
      ${v.centerPhone ? `<p class="rcv-muted">هاتف المركز: <strong class="num-en" dir="ltr">${esc(v.centerPhone)}</strong></p>` : ''}
      <label class="rcv-field"><span>ملاحظات المندوب</span>
        <textarea id="pvNotes" rows="3">${esc(v.notes)}</textarea></label>
      <label class="rcv-field"><span>ملاحظة الإدارة</span>
        <textarea id="pvAdminNote" rows="2">${esc(v.adminNote)}</textarea></label>
      <div class="rcv-detail-actions">
        <button type="button" class="btn btn-primary" id="pvSaveBtn">حفظ</button>
        ${v.status === 'pending' ? '<button type="button" class="btn btn-soft" id="pvReviewBtn">تمت المراجعة</button>' : ''}
        ${v.status !== 'archived' ? '<button type="button" class="btn btn-soft" id="pvArchiveBtn">أرشفة</button>' : ''}
        <button type="button" class="btn btn-danger" id="pvDeleteBtn">حذف</button>
      </div>
    </div>`;

  colHighlightRows('[data-pv-row]', id);
  colBindDetailNav(openPromoVisitDetail);
  document.getElementById('pvCloseBtn')?.addEventListener('click', () => {
    promoVisitAdmin.selected = null;
    colShowDetailEmpty(panel, 'اختر زيارة', 'اضغط «عرض» من القائمة');
    colHighlightRows('[data-pv-row]', null);
  });
  document.getElementById('pvSaveBtn')?.addEventListener('click', () => void savePromoVisitDetail());
  document.getElementById('pvReviewBtn')?.addEventListener('click', () => void setPromoVisitStatus('reviewed'));
  document.getElementById('pvArchiveBtn')?.addEventListener('click', () => void setPromoVisitStatus('archived'));
  document.getElementById('pvDeleteBtn')?.addEventListener('click', () => void deletePromoVisitUi(v.id));
}

async function savePromoVisitDetail() {
  const v = promoVisitAdmin.selected;
  if (!v) return;
  await commerceApi(`/promotional-visits/${v.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      governorateCode: document.getElementById('pvGov')?.value,
      areaName: document.getElementById('pvArea')?.value,
      shopName: document.getElementById('pvShop')?.value,
      visitOutcome: document.getElementById('pvOutcome')?.value,
      notes: document.getElementById('pvNotes')?.value,
      adminNote: document.getElementById('pvAdminNote')?.value
    })
  });
  showToast('تم الحفظ');
  await loadPromotionalVisitsPage();
  await openPromoVisitDetail(v.id);
}

async function setPromoVisitStatus(status) {
  const v = promoVisitAdmin.selected;
  if (!v) return;
  await commerceApi(`/promotional-visits/${v.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });
  await loadPromotionalVisitsPage();
  await openPromoVisitDetail(v.id);
}

async function deletePromoVisitUi(id) {
  if (!confirm('حذف هذه الزيارة الترويجية؟')) return;
  await commerceApi(`/promotional-visits/${id}`, { method: 'DELETE' });
  promoVisitAdmin.selected = null;
  colShowDetailEmpty(document.getElementById('promoVisitDetailPanel'), 'اختر زيارة', 'اضغط «عرض» من القائمة');
  await loadPromotionalVisitsPage();
}

document.getElementById('btnPvRefresh')?.addEventListener('click', () => loadPromotionalVisitsPage());
document.getElementById('promoVisitGovFilter')?.addEventListener('change', () => loadPromotionalVisitsPage());
document.getElementById('promoVisitStatusFilter')?.addEventListener('change', () => loadPromotionalVisitsPage());
colInitChips(pvApplyChip);
colInitViewToggle('pv', promoVisitAdmin, () => renderPromoVisitList(filterPromoVisitRows(promoVisitAdmin.rows)));

let promoSearchTimer;
document.getElementById('promoVisitSearch')?.addEventListener('input', () => {
  clearTimeout(promoSearchTimer);
  promoSearchTimer = setTimeout(() => {
    const filtered = filterPromoVisitRows(promoVisitAdmin.rows);
    renderPromoVisitList(filtered);
    const countEl = document.getElementById('promoVisitListCount');
    if (countEl) countEl.innerHTML = `<span class="num-en" dir="ltr">${fmtNumAlways(filtered.length)}</span> زيارة`;
  }, 220);
});

window.adminPages = window.adminPages || {};
window.adminPages.promotionalVisits = loadPromotionalVisitsPage;
