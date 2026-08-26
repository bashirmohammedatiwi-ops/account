/* Admin: new customers from delegates */

const CR_PILL = { pending: 'pending', reviewed: 'ready', posted: 'posted', rejected: 'rejected' };

const customerReqAdmin = {
  selected: null,
  trees: [],
  rows: [],
  listIds: [],
  viewMode: 'table'
};

function canPostCustomersFromDesktop() {
  return !!window.edariDesktop?.postEdariCustomer;
}

function canEditCustomerReq(status) {
  return status !== 'posted';
}

function crApplyChip(chip) {
  const sel = document.getElementById('customerReqStatusFilter');
  if (sel) sel.value = chip === 'all' ? '' : chip;
  colSyncChips(chip === 'all' ? 'all' : chip);
  void loadCustomerRequestsPage();
}

function customerReqRowActions(r) {
  const editable = canEditCustomerReq(r.status);
  return `
    <div class="rcv-row-actions">
      <button type="button" class="btn btn-soft btn-sm" data-creq-id="${r.id}">${editable ? 'مراجعة' : 'عرض'}</button>
      ${editable ? `<button type="button" class="btn btn-danger btn-sm" data-del-creq="${r.id}">حذف</button>` : ''}
      ${r.status !== 'posted' && r.status !== 'rejected' ? `
      <button type="button" class="btn btn-primary btn-sm" data-post-creq="${r.id}">ترحيل</button>` : ''}
    </div>`;
}

function bindCustomerReqInteractions() {
  document.querySelectorAll('[data-creq-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void openCustomerReqDetail(Number(btn.dataset.creqId));
    });
  });
  document.querySelectorAll('[data-del-creq]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void deleteCustomerReqUi(Number(btn.dataset.delCreq));
    });
  });
  document.querySelectorAll('[data-post-creq]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void postCustomerReqToEdariUi(Number(btn.dataset.postCreq));
    });
  });
  document.querySelectorAll('[data-cr-row]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      void openCustomerReqDetail(Number(row.dataset.crRow));
    });
  });
}

async function loadCustomerTrees() {
  if (customerReqAdmin.trees.length) return customerReqAdmin.trees;
  const data = await commerceApi('/customer-requests/trees');
  customerReqAdmin.trees = data.trees || [];
  return customerReqAdmin.trees;
}

function customerReqSearchQuery() {
  return String(document.getElementById('customerReqSearch')?.value || '').trim().toLowerCase();
}

function filterCustomerReqRows(rows) {
  const q = customerReqSearchQuery();
  if (!q) return rows;
  return rows.filter((r) => {
    const hay = [r.requestNo, r.agentName, r.treeName, r.treeNum, r.name, r.phone, r.submittedAt, r.createdAt]
      .join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function renderCustomerReqRows(rows) {
  const body = document.getElementById('customerReqsBody');
  if (!body) return;
  body.innerHTML = rows.map((r) => {
    const active = customerReqAdmin.selected?.id === r.id ? ' is-active' : '';
    return `
    <tr class="rcv-row${active}" data-cr-row="${r.id}">
      <td><span class="rcv-no num-en" dir="ltr">${esc(r.requestNo)}</span></td>
      <td>
        <div class="rcv-cell-agent">
          <span class="rcv-agent-avatar">${esc(colAgentInitial(r.agentName))}</span>
          <span>${esc(r.agentName)}</span>
        </div>
      </td>
      <td>${esc(r.treeName || r.treeNum || '—')}</td>
      <td><strong>${esc(r.name || '—')}</strong></td>
      <td class="num-en" dir="ltr">${esc(r.phone || '—')}</td>
      <td>${colStatusPill(r.status, r.statusLabel, CR_PILL)}</td>
      <td class="rcv-date num-en" dir="ltr">${fmtDateEn(r.submittedAt || r.createdAt)}</td>
      <td>${customerReqRowActions(r)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="8"><div class="rcv-empty">لا توجد طلبات زبون جديد</div></td></tr>`;
  bindCustomerReqInteractions();
}

function renderCustomerReqCards(rows) {
  const grid = document.getElementById('crCardsGrid');
  if (!grid) return;
  grid.innerHTML = rows.map((r) => {
    const active = customerReqAdmin.selected?.id === r.id ? ' is-active' : '';
    return `
    <article class="rcv-card-item${active}" data-cr-row="${r.id}">
      <div class="rcv-card-item-head">
        <div>
          <span class="rcv-card-no num-en" dir="ltr">${esc(r.requestNo)}</span>
          ${colStatusPill(r.status, r.statusLabel, CR_PILL)}
        </div>
        <span class="rcv-card-date num-en" dir="ltr">${fmtDateEn(r.submittedAt || r.createdAt)}</span>
      </div>
      <div class="rcv-card-item-body">
        <div class="rcv-card-party">
          <span class="rcv-agent-avatar sm">${esc(colAgentInitial(r.agentName))}</span>
          <div><strong>${esc(r.name || '—')}</strong><small>${esc(r.agentName)} · ${esc(r.treeName || r.treeNum || '')}</small></div>
        </div>
        <div class="rcv-card-amounts">
          <div><span>الهاتف</span><strong class="num-en" dir="ltr">${esc(r.phone || '—')}</strong></div>
        </div>
      </div>
      <div class="rcv-card-item-foot">${customerReqRowActions(r)}</div>
    </article>`;
  }).join('') || '<div class="rcv-empty">لا توجد طلبات</div>';
  bindCustomerReqInteractions();
}

function renderCustomerReqList(rows) {
  renderCustomerReqRows(rows);
  renderCustomerReqCards(rows);
  colSetViewMode(customerReqAdmin.viewMode, 'cr', customerReqAdmin);
}

async function loadCustomerRequestsPage() {
  const status = document.getElementById('customerReqStatusFilter')?.value || '';
  const [list, stats] = await Promise.all([
    commerceApi(`/customer-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    commerceApi('/customer-requests/stats')
  ]);
  const s = stats.stats || {};
  colRenderStatGrid(document.getElementById('customerReqStats'), [
    { key: 'pending', cls: 'pending', label: 'بانتظار المراجعة', count: s.pending, filterKey: 'pending' },
    { key: 'reviewed', cls: 'ready', label: 'جاهز للترحيل', count: s.reviewed, filterKey: 'reviewed' },
    { key: 'posted', cls: 'posted', label: 'مُرحَّل', count: s.posted, filterKey: 'posted' },
    { key: 'today', cls: 'neutral', label: 'اليوم', count: s.today, filterKey: 'all', subText: 'طلب' }
  ], crApplyChip);

  customerReqAdmin.rows = list.requests || [];
  customerReqAdmin.listIds = customerReqAdmin.rows.map((r) => r.id);
  const filtered = filterCustomerReqRows(customerReqAdmin.rows);
  const countEl = document.getElementById('customerReqListCount');
  if (countEl) countEl.innerHTML = `<span class="num-en" dir="ltr">${fmtNumAlways(filtered.length)}</span> طلب`;
  renderCustomerReqList(filtered);
  colSyncChips(status || 'all');
}

window.loadCustomerRequestsPage = loadCustomerRequestsPage;
window.commercePages = window.commercePages || {};
window.commercePages.customerRequests = loadCustomerRequestsPage;

async function openCustomerReqDetail(id) {
  const [data, trees] = await Promise.all([
    commerceApi(`/customer-requests/${id}`),
    loadCustomerTrees()
  ]);
  const r = data.request;
  customerReqAdmin.selected = r;
  const panel = document.getElementById('customerReqDetailPanel');
  panel.classList.add('has-receipt');
  const locked = !canEditCustomerReq(r.status);
  const treeList = [...trees];
  if (r.treeAccSeq && !treeList.some((t) => String(t.seq) === String(r.treeAccSeq))) {
    treeList.unshift({ seq: r.treeAccSeq, num: r.treeNum, name: r.treeName });
  }
  const treeOptions = treeList.map((t) => `
    <option value="${esc(t.seq)}" ${String(t.seq) === String(r.treeAccSeq) ? 'selected' : ''}>
      ${esc(t.name)} · ${esc(t.num)}
    </option>`).join('');

  panel.innerHTML = `
    <div class="rcv-detail-inner">
      <div class="rcv-detail-toolbar">
        ${colDetailNav(customerReqAdmin.listIds, id)}
        <button type="button" class="rcv-detail-close" id="btnCloseCrDetail" title="إغلاق">×</button>
      </div>
      <div class="rcv-detail-head">
        <div>
          <span class="rcv-detail-kicker">طلب زبون</span>
          <h3 class="rcv-detail-title num-en" dir="ltr">${esc(r.requestNo)}</h3>
          <p class="rcv-detail-sub">${esc(r.agentName)} · ${esc(r.treeName || r.treeNum || '')}</p>
        </div>
        ${colStatusPill(r.status, r.statusLabel, CR_PILL)}
      </div>
      <label class="rcv-field"><span>الشجرة</span>
        <select id="crEditTree" class="search" ${locked ? 'disabled' : ''}>${treeOptions}</select></label>
      <div class="rcv-edit-grid">
        <label class="rcv-field"><span>الاسم</span>
          <input type="text" id="crEditName" value="${esc(r.name)}" ${locked ? 'readonly' : ''}></label>
        <label class="rcv-field"><span>الهاتف</span>
          <input type="text" class="num-en" id="crEditPhone" value="${esc(r.phone)}" ${locked ? 'readonly' : ''}></label>
        <label class="rcv-field"><span>العنوان</span>
          <input type="text" id="crEditAddress" value="${esc(r.address)}" ${locked ? 'readonly' : ''}></label>
      </div>
      <label class="rcv-field"><span>ملاحظات</span>
        <textarea id="crEditNotes" rows="2" ${locked ? 'readonly' : ''}>${esc(r.notes)}</textarea></label>
      <label class="rcv-field"><span>ملاحظة الإدارة</span>
        <textarea id="crEditAdminNote" rows="2" ${locked ? 'readonly' : ''}>${esc(r.adminNote)}</textarea></label>
      <p class="rcv-muted">اسم الإداري: <strong>${esc(r.edariName || r.name)}</strong></p>
      ${r.edariNum ? `<p class="rcv-muted">حساب: <span class="num-en" dir="ltr">${esc(r.edariNum)}</span> · Seq <span class="num-en" dir="ltr">${esc(r.edariSeq)}</span></p>` : ''}
      ${r.postedError ? `<p class="rcv-error">${esc(r.postedError)}</p>` : ''}
      ${locked ? '' : `
      <div class="rcv-detail-actions">
        <button type="button" class="btn btn-primary" id="btnSaveCustomerReq">حفظ</button>
        <button type="button" class="btn btn-soft" id="btnPostCustomerReq">ترحيل للإداري</button>
        <button type="button" class="btn btn-soft" id="btnRejectCustomerReq">رفض</button>
        <button type="button" class="btn btn-danger" id="btnDeleteCustomerReq">حذف</button>
      </div>
      ${canPostCustomersFromDesktop() ? '' : '<p class="rcv-muted">الترحيل من تطبيق الإدارة المكتبي فقط</p>'}`}
    </div>`;

  colHighlightRows('[data-cr-row]', id);
  colBindDetailNav(openCustomerReqDetail);
  document.getElementById('btnCloseCrDetail')?.addEventListener('click', () => {
    customerReqAdmin.selected = null;
    colShowDetailEmpty(panel, 'اختر طلب زبون', 'اضغط «مراجعة» من القائمة');
    colHighlightRows('[data-cr-row]', null);
  });

  if (!locked) {
    document.getElementById('btnSaveCustomerReq')?.addEventListener('click', () => saveCustomerReqEdit(r.id));
    document.getElementById('btnDeleteCustomerReq')?.addEventListener('click', () => deleteCustomerReqUi(r.id));
    document.getElementById('btnRejectCustomerReq')?.addEventListener('click', () => rejectCustomerReq(r.id));
    document.getElementById('btnPostCustomerReq')?.addEventListener('click', () => postCustomerReqToEdariUi(r.id));
  }
}

async function saveCustomerReqEdit(id) {
  try {
    const treeSel = document.getElementById('crEditTree');
    const tree = customerReqAdmin.trees.find((t) => String(t.seq) === String(treeSel?.value));
    await commerceApi(`/customer-requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        treeAccSeq: treeSel?.value || '',
        treeName: tree?.name || '',
        name: document.getElementById('crEditName')?.value,
        phone: document.getElementById('crEditPhone')?.value,
        address: document.getElementById('crEditAddress')?.value,
        notes: document.getElementById('crEditNotes')?.value,
        adminNote: document.getElementById('crEditAdminNote')?.value
      })
    });
    showToast('تم حفظ التعديل');
    await loadCustomerRequestsPage();
    await openCustomerReqDetail(id);
  } catch (err) {
    showToast(err.message, 'err');
  }
}

async function deleteCustomerReqUi(id) {
  if (!confirm('حذف طلب الزبون؟')) return;
  try {
    await commerceApi(`/customer-requests/${id}`, { method: 'DELETE' });
    showToast('تم الحذف');
    customerReqAdmin.selected = null;
    colShowDetailEmpty(document.getElementById('customerReqDetailPanel'), 'اختر طلب زبون', 'اضغط «مراجعة» من القائمة');
    await loadCustomerRequestsPage();
  } catch (err) {
    showToast(err.message, 'err');
  }
}

async function rejectCustomerReq(id) {
  try {
    await commerceApi(`/customer-requests/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected', note: 'رفض من الإدارة' })
    });
    showToast('تم الرفض');
    await loadCustomerRequestsPage();
    await openCustomerReqDetail(id);
  } catch (err) {
    showToast(err.message, 'err');
  }
}

async function postCustomerReqToEdariUi(id) {
  try {
    const data = await commerceApi(`/customer-requests/${id}`);
    const posting = data.posting || data.request;
    if (!canPostCustomersFromDesktop()) {
      showToast('افتح تطبيق الإدارة على Windows للترحيل', 'err');
      return;
    }
    if (data.request.status === 'posted') {
      showToast('الزبون مُرحَّل مسبقاً');
      return;
    }
    if (!confirm(`ترحيل ${data.request.name} كفرع جديد تحت ${data.request.treeName || data.request.treeNum}؟`)) return;
    const result = await window.edariDesktop.postEdariCustomer({
      name: posting.name,
      phone: posting.phone,
      address: posting.address,
      notes: posting.notes,
      treeAccSeq: posting.treeAccSeq,
      treeNum: posting.treeNum,
      treeName: posting.treeName
    });
    if (!result?.ok) {
      await commerceApi(`/customer-requests/${id}/posted`, {
        method: 'POST',
        body: JSON.stringify({ error: result?.error || 'فشل الترحيل' })
      });
      throw new Error(result?.error || 'فشل الترحيل');
    }
    await commerceApi(`/customer-requests/${id}/posted`, {
      method: 'POST',
      body: JSON.stringify({
        edariSeq: result.seq,
        edariNum: result.num,
        name1: result.name1,
        address: result.address,
        remarks: result.remarks
      })
    });
    showToast(`تم الترحيل · حساب ${result.num}`);
    await loadCustomerRequestsPage();
    await openCustomerReqDetail(id);
  } catch (err) {
    showToast(err.message, 'err');
  }
}

document.getElementById('btnCrRefresh')?.addEventListener('click', () => loadCustomerRequestsPage());
document.getElementById('btnCrQuickReady')?.addEventListener('click', () => crApplyChip('reviewed'));
document.getElementById('customerReqStatusFilter')?.addEventListener('change', () => loadCustomerRequestsPage());
colInitChips(crApplyChip);
colInitViewToggle('cr', customerReqAdmin, () => renderCustomerReqList(filterCustomerReqRows(customerReqAdmin.rows)));

let crSearchTimer;
document.getElementById('customerReqSearch')?.addEventListener('input', () => {
  clearTimeout(crSearchTimer);
  crSearchTimer = setTimeout(() => {
    const filtered = filterCustomerReqRows(customerReqAdmin.rows);
    renderCustomerReqList(filtered);
    const countEl = document.getElementById('customerReqListCount');
    if (countEl) countEl.innerHTML = `<span class="num-en" dir="ltr">${fmtNumAlways(filtered.length)}</span> طلب`;
  }, 220);
});
