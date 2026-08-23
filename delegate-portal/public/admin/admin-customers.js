/* Admin: new customers from delegates */

const customerReqAdmin = {
  selected: null,
  trees: []
};

function canPostCustomersFromDesktop() {
  return !!window.edariDesktop?.postEdariCustomer;
}

function crBadgeClass(status) {
  if (typeof receiptBadgeClass === 'function') return receiptBadgeClass(status);
  return ({ pending: 'pending', reviewed: 'ok', posted: 'ok', rejected: 'off' })[status] || 'pending';
}

function canEditCustomerReq(status) {
  if (typeof canEditReceipt === 'function') return canEditReceipt(status);
  return status !== 'posted';
}

function setRvTab(name) {
  document.querySelectorAll('[data-rv-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.rvTab === name);
  });
  document.getElementById('rvTabReceipts')?.classList.toggle('hidden', name !== 'receipts');
  document.getElementById('rvTabDelivery')?.classList.toggle('hidden', name !== 'delivery');
  document.getElementById('rvTabCustomers')?.classList.toggle('hidden', name !== 'customers');
  if (name === 'delivery' && typeof window.loadDeliveryReceiptsPage === 'function') {
    void window.loadDeliveryReceiptsPage();
  }
}

function customerReqRowActions(r) {
  const editable = canEditCustomerReq(r.status);
  return `
    <button type="button" class="btn btn-soft btn-sm" data-creq-id="${r.id}">${editable ? 'تعديل' : 'عرض'}</button>
    ${editable ? `<button type="button" class="btn btn-danger btn-sm" data-del-creq="${r.id}">حذف</button>` : ''}
    ${r.status !== 'posted' && r.status !== 'rejected' ? `
    <button type="button" class="btn btn-primary btn-sm" data-post-creq="${r.id}">ترحيل</button>` : ''}`;
}

async function loadCustomerTrees() {
  if (customerReqAdmin.trees.length) return customerReqAdmin.trees;
  const data = await commerceApi('/customer-requests/trees');
  customerReqAdmin.trees = data.trees || [];
  return customerReqAdmin.trees;
}

async function loadCustomerRequestsPage() {
  const status = document.getElementById('customerReqStatusFilter')?.value || '';
  const [list, stats] = await Promise.all([
    commerceApi(`/customer-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    commerceApi('/customer-requests/stats')
  ]);
  const s = stats.stats || {};
  const statsEl = document.getElementById('customerReqStats');
  if (statsEl) {
    statsEl.innerHTML = `
      <span class="rv-kpi pending">انتظار <strong>${s.pending || 0}</strong></span>
      <span class="rv-kpi ok">جاهز <strong>${s.reviewed || 0}</strong></span>
      <span class="rv-kpi posted">مُرحَّل <strong>${s.posted || 0}</strong></span>
      <span class="rv-kpi">اليوم <strong>${s.today || 0}</strong></span>`;
  }
  const body = document.getElementById('customerReqsBody');
  if (!body) return;
  body.innerHTML = (list.requests || []).map((r) => `
    <tr>
      <td dir="ltr">${esc(r.requestNo)}</td>
      <td>${esc(r.agentName)}</td>
      <td>${esc(r.treeName || r.treeNum || '—')}</td>
      <td>${esc(r.name || '—')}</td>
      <td dir="ltr">${esc(r.phone || '—')}</td>
      <td><span class="badge ${crBadgeClass(r.status)}">${esc(r.statusLabel)}</span></td>
      <td>${esc(r.submittedAt || r.createdAt || '—')}</td>
      <td class="row-actions">${customerReqRowActions(r)}</td>
    </tr>`).join('') || '<tr><td colspan="8"><div class="rv-empty">لا توجد طلبات زبون جديد بعد — تظهر هنا بعد إرسال المندوب</div></td></tr>';

  document.querySelectorAll('[data-creq-id]').forEach((btn) => {
    btn.addEventListener('click', () => openCustomerReqDetail(Number(btn.dataset.creqId)));
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
}

window.loadCustomerRequestsPage = loadCustomerRequestsPage;

async function openCustomerReqDetail(id) {
  setRvTab('customers');
  const [data, trees] = await Promise.all([
    commerceApi(`/customer-requests/${id}`),
    loadCustomerTrees()
  ]);
  const r = data.request;
  customerReqAdmin.selected = r;
  const panel = document.getElementById('customerReqDetailPanel');
  panel.classList.remove('hidden');
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
    <div class="panel-head">
      <div>
        <h2 class="panel-title">طلب ${esc(r.requestNo)}</h2>
        <p class="panel-desc">${esc(r.agentName)} · يُضاف تحت ${esc(r.treeName || r.treeNum || '')}</p>
      </div>
      <span class="badge ${crBadgeClass(r.status)}">${esc(r.statusLabel)}</span>
    </div>
    <label class="field">
      <span>الشجرة</span>
      <select id="crEditTree" ${locked ? 'disabled' : ''}>${treeOptions}</select>
    </label>
    <div class="rv-edit-grid">
      <label class="field"><span>الاسم</span>
        <input type="text" id="crEditName" value="${esc(r.name)}" ${locked ? 'readonly' : ''}></label>
      <label class="field"><span>الهاتف</span>
        <input type="text" id="crEditPhone" value="${esc(r.phone)}" ${locked ? 'readonly' : ''}></label>
      <label class="field"><span>العنوان</span>
        <input type="text" id="crEditAddress" value="${esc(r.address)}" ${locked ? 'readonly' : ''}></label>
    </div>
    <label class="field"><span>ملاحظات</span>
      <textarea id="crEditNotes" rows="2" ${locked ? 'readonly' : ''}>${esc(r.notes)}</textarea></label>
    <label class="field"><span>ملاحظة الإدارة</span>
      <textarea id="crEditAdminNote" rows="2" ${locked ? 'readonly' : ''}>${esc(r.adminNote)}</textarea></label>
    <p class="muted">اسم الحساب في الإداري: <strong>${esc(r.edariName || r.name)}</strong></p>
    ${r.edariNum ? `<p class="muted">حساب الإداري: <span dir="ltr">${esc(r.edariNum)}</span> · Seq <span dir="ltr">${esc(r.edariSeq)}</span></p>` : ''}
    ${r.postedError ? `<p class="muted" style="color:#b91c1c">${esc(r.postedError)}</p>` : ''}
    ${locked ? '' : `
    <div class="btn-row" style="margin-top:16px">
      <button type="button" class="btn btn-primary" id="btnSaveCustomerReq">حفظ التعديل</button>
      <button type="button" class="btn btn-danger" id="btnDeleteCustomerReq">حذف الطلب</button>
      <button type="button" class="btn btn-soft" id="btnRejectCustomerReq">رفض</button>
      <button type="button" class="btn btn-soft" id="btnPostCustomerReq">ترحيل للإداري</button>
    </div>
    ${canPostCustomersFromDesktop() ? '' : '<p class="muted">أمر الترحيل يعمل من تطبيق الإدارة المكتبي فقط</p>'}`}
  `;

  if (!locked) {
    document.getElementById('btnSaveCustomerReq')?.addEventListener('click', () => saveCustomerReqEdit(r.id));
    document.getElementById('btnDeleteCustomerReq')?.addEventListener('click', () => deleteCustomerReqUi(r.id));
    document.getElementById('btnRejectCustomerReq')?.addEventListener('click', () => rejectCustomerReq(r.id));
    document.getElementById('btnPostCustomerReq')?.addEventListener('click', () => postCustomerReqToEdariUi(r.id));
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    document.getElementById('customerReqDetailPanel')?.classList.add('hidden');
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

function initCustomerReqsAdmin() {
  document.getElementById('customerReqStatusFilter')?.addEventListener('change', () => loadCustomerRequestsPage());
  document.querySelectorAll('[data-rv-tab]').forEach((btn) => {
    btn.addEventListener('click', () => setRvTab(btn.dataset.rvTab));
  });
}

initCustomerReqsAdmin();
