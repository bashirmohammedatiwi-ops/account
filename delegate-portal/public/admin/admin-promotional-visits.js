/* Admin: promotional visits from delegates (الزيادات الترويجية) */

const promoVisitAdmin = { selected: null, governorates: [], outcomes: [], rows: [] };

function pvBadgeClass(status) {
  return ({ pending: 'pending', reviewed: 'ok', archived: 'off' })[status] || 'pending';
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
  const statsEl = document.getElementById('promoVisitStats');
  if (statsEl) {
    statsEl.innerHTML = `
      <span class="rv-kpi pending">انتظار <strong>${s.pending || 0}</strong></span>
      <span class="rv-kpi ok">مراجع <strong>${s.reviewed || 0}</strong></span>
      <span class="rv-kpi">اليوم <strong>${s.today || 0}</strong></span>
      <span class="rv-kpi">الإجمالي <strong>${s.total || 0}</strong></span>`;
  }
  const body = document.getElementById('promoVisitsBody');
  if (!body) return;
  promoVisitAdmin.rows = list.visits || [];
  renderPromoVisitRows(filterPromoVisitRows(promoVisitAdmin.rows));

  const govFilter = document.getElementById('promoVisitGovFilter');
  if (govFilter && govFilter.options.length <= 1) {
    govFilter.innerHTML = '<option value="">كل المحافظات</option>' +
      promoVisitAdmin.governorates.map((g) => `<option value="${esc(g.code)}">${esc(g.name)}</option>`).join('');
    if (governorate) govFilter.value = governorate;
  }
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

function renderPromoVisitRows(rows) {
  const body = document.getElementById('promoVisitsBody');
  if (!body) return;
  body.innerHTML = rows.map((v) => `
    <tr>
      <td dir="ltr">${esc(v.visitNo)}</td>
      <td>${esc(v.agentName)}</td>
      <td>${esc(v.governorateName)}</td>
      <td>${esc(v.areaName)}</td>
      <td>${esc(v.shopName)}</td>
      <td>${esc(v.visitOutcomeLabel)}</td>
      <td><span class="badge ${pvBadgeClass(v.status)}">${esc(v.statusLabel)}</span></td>
      <td>${esc(v.submittedAt || v.createdAt || '—')}</td>
      <td class="row-actions">
        <button type="button" class="btn btn-soft btn-sm" data-pv-id="${v.id}">عرض</button>
        <button type="button" class="btn btn-danger btn-sm" data-del-pv="${v.id}">حذف</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="9"><div class="rv-empty">لا توجد زيارات ترويجية بعد — تظهر هنا بعد إرسال المندوب</div></td></tr>';

  document.querySelectorAll('[data-pv-id]').forEach((btn) => {
    btn.addEventListener('click', () => openPromoVisitDetail(Number(btn.dataset.pvId)));
  });
  document.querySelectorAll('[data-del-pv]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void deletePromoVisitUi(Number(btn.dataset.delPv));
    });
  });
}

window.loadPromotionalVisitsPage = loadPromotionalVisitsPage;

let promoSearchTimer;
document.getElementById('promoVisitSearch')?.addEventListener('input', () => {
  clearTimeout(promoSearchTimer);
  promoSearchTimer = setTimeout(() => {
    if (promoVisitAdmin.rows.length) {
      renderPromoVisitRows(filterPromoVisitRows(promoVisitAdmin.rows));
    } else {
      void loadPromotionalVisitsPage();
    }
  }, 220);
});

async function openPromoVisitDetail(id) {
  await loadPromoMeta();
  const data = await commerceApi(`/promotional-visits/${id}`);
  const v = data.visit;
  promoVisitAdmin.selected = v;
  const panel = document.getElementById('promoVisitDetailPanel');
  panel.classList.remove('hidden');
  const govOptions = promoVisitAdmin.governorates.map((g) =>
    `<option value="${esc(g.code)}" ${g.code === v.governorateCode ? 'selected' : ''}>${esc(g.name)}</option>`
  ).join('');
  const outcomeOptions = promoVisitAdmin.outcomes.map((o) =>
    `<option value="${esc(o.code)}" ${o.code === v.visitOutcome ? 'selected' : ''}>${esc(o.label)}</option>`
  ).join('');
  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <h2 class="panel-title">زيارة ${esc(v.visitNo)}</h2>
        <p class="panel-desc">${esc(v.agentName)} · ${esc(v.governorateName)}</p>
      </div>
      <span class="badge ${pvBadgeClass(v.status)}">${esc(v.statusLabel)}</span>
    </div>
    <div class="form-grid">
      <label>المحافظة<select id="pvGov">${govOptions}</select></label>
      <label>المنطقة<input id="pvArea" value="${esc(v.areaName)}"></label>
      <label>المحل / المركز<input id="pvShop" value="${esc(v.shopName)}"></label>
      <label>حالة بعد الترويج<select id="pvOutcome">${outcomeOptions}</select></label>
      <label class="full">ملاحظات المندوب
        ${v.centerPhone ? `<p class="muted" style="margin:0 0 8px">رقم هاتف المركز: <strong dir="ltr">${esc(v.centerPhone)}</strong></p>` : ''}
        <textarea id="pvNotes" rows="3">${esc(v.notes)}</textarea>
      </label>
      <label class="full">ملاحظة الإدارة<textarea id="pvAdminNote" rows="2">${esc(v.adminNote)}</textarea></label>
    </div>
    <div class="panel-actions">
      <button type="button" class="btn btn-primary" id="pvSaveBtn">حفظ التعديلات</button>
      ${v.status === 'pending' ? '<button type="button" class="btn btn-soft" id="pvReviewBtn">تمت المراجعة</button>' : ''}
      ${v.status !== 'archived' ? '<button type="button" class="btn btn-soft" id="pvArchiveBtn">أرشفة</button>' : ''}
      <button type="button" class="btn btn-soft" id="pvCloseBtn">إغلاق</button>
    </div>`;

  document.getElementById('pvSaveBtn')?.addEventListener('click', () => void savePromoVisitDetail());
  document.getElementById('pvReviewBtn')?.addEventListener('click', () => void setPromoVisitStatus('reviewed'));
  document.getElementById('pvArchiveBtn')?.addEventListener('click', () => void setPromoVisitStatus('archived'));
  document.getElementById('pvCloseBtn')?.addEventListener('click', () => panel.classList.add('hidden'));
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
  document.getElementById('promoVisitDetailPanel')?.classList.add('hidden');
  await loadPromotionalVisitsPage();
}

window.adminPages = window.adminPages || {};
window.adminPages.promotionalVisits = async () => {
  await loadPromotionalVisitsPage();
};
