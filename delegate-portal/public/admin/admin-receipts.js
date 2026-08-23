/* Admin: delegate receipt vouchers */

const receiptAdmin = {
  settings: {
    cash: { seq: '', num: '', name: '' },
    commissionDebit: { seq: '', num: '', name: '' },
    commissionCredit: { seq: '', num: '', name: '' },
    discount: { seq: '', num: '', name: '' }
  },
  searchTimers: {},
  selected: null
};

const RECEIPT_SETTING_FIELDS = [
  { key: 'cash', label: 'صندوق المبلغ', hint: 'من صناديق الإداري', kind: 'cash', browse: 'عرض الصناديق' },
  { key: 'commissionDebit', label: 'حـ/ العمولات (مدين)', hint: 'حساب العمولة في الإداري', kind: 'gl' },
  { key: 'commissionCredit', label: 'حـ/ مقابل العمولات (دائن)', hint: 'حساب المقابل في الإداري', kind: 'gl' },
  { key: 'discount', label: 'حـ/ الحسم', hint: 'حساب الحسم في الإداري', kind: 'gl' }
];

function rvAccLabel(acc) {
  if (!acc?.seq && !acc?.num) return 'غير محدد';
  return `${acc.num || ''} ${acc.name || ''}`.trim();
}

function renderReceiptSettings() {
  const grid = document.getElementById('receiptSettingsGrid');
  if (!grid) return;
  grid.innerHTML = RECEIPT_SETTING_FIELDS.map((f) => {
    const acc = receiptAdmin.settings[f.key] || {};
    const picked = acc.seq ? rvAccLabel(acc) : '';
    const placeholder = f.kind === 'cash'
      ? 'ابحث في صناديق الإداري...'
      : 'ابحث برقم أو اسم الحساب في الإداري...';
    return `
      <div class="rv-acc-card${acc.seq ? ' is-set' : ''}" data-rv-card="${f.key}">
        <div class="rv-acc-card-top">
          <span class="rv-acc-kicker">${esc(f.label)}</span>
          ${f.browse ? `<button type="button" class="btn btn-soft btn-sm" data-rv-browse="${f.key}">${esc(f.browse)}</button>` : ''}
        </div>
        <strong class="rv-acc-picked" data-rv-acc-picked="${f.key}">${esc(picked || 'غير محدد')}</strong>
        <input type="search" class="search" data-rv-acc="${f.key}" data-rv-kind="${f.kind}"
          placeholder="${esc(placeholder)}" value="" autocomplete="off">
        <small class="muted">${esc(f.hint)}</small>
        <div class="rv-acc-results" data-rv-acc-results="${f.key}"></div>
      </div>`;
  }).join('');

  grid.querySelectorAll('[data-rv-acc]').forEach((input) => {
    const key = input.dataset.rvAcc;
    const kind = input.dataset.rvKind || 'gl';
    input.addEventListener('input', () => {
      clearTimeout(receiptAdmin.searchTimers[key]);
      receiptAdmin.searchTimers[key] = setTimeout(() => searchReceiptAccount(key, input.value, kind), 220);
    });
    input.addEventListener('focus', () => {
      if (kind === 'cash') void searchReceiptAccount(key, input.value, kind);
    });
  });
  grid.querySelectorAll('[data-rv-browse]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.rvBrowse;
      const input = grid.querySelector(`[data-rv-acc="${key}"]`);
      if (input) {
        input.value = '';
        input.focus();
      }
      void searchReceiptAccount(key, '', 'cash');
    });
  });
}

async function lookupReceiptAccounts(q, kind) {
  if (window.edariDesktop?.searchEdariAccounts) {
    const data = await window.edariDesktop.searchEdariAccounts({ q, kind });
    if (!data?.ok) throw new Error(data?.error || 'فشل البحث في الإداري');
    return data;
  }
  const qs = new URLSearchParams({ q: q || '', kind: kind || '' });
  return commerceApi(`/receipts/accounts/search?${qs}`);
}

async function searchReceiptAccount(key, q, kind = 'gl') {
  const box = document.querySelector(`[data-rv-acc-results="${key}"]`);
  if (!box) return;
  const query = String(q || '').trim();
  if (kind !== 'cash' && query.length < 1) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = '<p class="muted">جاري البحث في الإداري...</p>';
  try {
    const data = await lookupReceiptAccounts(query, kind);
    const rows = data.results || [];
    const source = data.source === 'edari' ? 'الإداري' : '';
    box.innerHTML = rows.map((r) => `
      <button type="button" class="rv-acc-hit" data-seq="${esc(r.seq)}" data-num="${esc(r.num)}" data-name="${esc(r.name)}">
        <span class="rv-acc-hit-num" dir="ltr">${esc(r.num)}</span>
        <span class="rv-acc-hit-name">${esc(r.name)}</span>
      </button>`).join('') || `<p class="muted">لا توجد صناديق/حسابات مطابقة${source ? ` في ${source}` : ''}</p>`;
    box.querySelectorAll('.rv-acc-hit').forEach((btn) => {
      btn.addEventListener('click', () => {
        receiptAdmin.settings[key] = {
          seq: btn.dataset.seq,
          num: btn.dataset.num,
          name: btn.dataset.name
        };
        renderReceiptSettings();
      });
    });
  } catch (err) {
    box.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}

async function loadReceiptSettings() {
  const data = await commerceApi('/receipts/settings');
  receiptAdmin.settings = data.accounts || receiptAdmin.settings;
  renderReceiptSettings();
}

async function saveReceiptSettings() {
  try {
    const data = await commerceApi('/receipts/settings', {
      method: 'PUT',
      body: JSON.stringify(receiptAdmin.settings)
    });
    receiptAdmin.settings = data.accounts;
    showToast('تم حفظ حسابات الترحيل');
  } catch (err) {
    showToast(err.message, 'err');
  }
}

function canPostReceiptsFromDesktop() {
  return !!window.edariDesktop?.postEdariReceipt;
}

function updateReceiptPostAlert() {
  const box = document.getElementById('receiptPostAlert');
  const text = document.getElementById('receiptPostAlertText');
  if (!box || !text) return;
  const ok = canPostReceiptsFromDesktop();
  box.classList.toggle('ok', ok);
  text.textContent = ok
    ? 'متصل بالإداري من هذا الجهاز — ابحث في الصناديق مباشرة ثم رحّل سند القبض.'
    : 'افتح تطبيق الإدارة على Windows لاختيار صناديق الإداري وترحيل السندات.';
}

function canEditReceipt(status) {
  return status !== 'posted';
}

function receiptBadgeClass(status) {
  return ({ pending: 'pending', reviewed: 'ok', posted: 'ok', rejected: 'off' })[status] || 'pending';
}

function receiptRowActions(r) {
  const editable = canEditReceipt(r.status);
  return `
    <button type="button" class="btn btn-soft btn-sm" data-receipt-id="${r.id}">${editable ? 'تعديل' : 'عرض'}</button>
    ${editable ? `<button type="button" class="btn btn-danger btn-sm" data-del-receipt="${r.id}">حذف</button>` : ''}
    ${r.status !== 'posted' && r.status !== 'rejected' ? `
    <button type="button" class="btn btn-primary btn-sm" data-post-receipt="${r.id}">ترحيل</button>` : ''}`;
}

async function loadReceiptsPage() {
  const status = document.getElementById('receiptStatusFilter')?.value || '';
  const [list, stats] = await Promise.all([
    commerceApi(`/receipts${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    commerceApi('/receipts/stats')
  ]);
  const s = stats.stats || {};
  document.getElementById('receiptStats').innerHTML = `
    <span class="rv-kpi pending">انتظار <strong>${s.pending || 0}</strong></span>
    <span class="rv-kpi ok">جاهز <strong>${s.reviewed || 0}</strong></span>
    <span class="rv-kpi posted">مُرحَّل <strong>${s.posted || 0}</strong></span>
    <span class="rv-kpi">اليوم <strong>${s.today || 0}</strong></span>`;

  document.getElementById('receiptsBody').innerHTML = (list.receipts || []).map((r) => `
    <tr>
      <td dir="ltr">${esc(r.receiptNo)}</td>
      <td>${esc(r.agentName)}</td>
      <td>${esc(r.customerName || '—')}</td>
      <td dir="ltr">${fmtMoney(r.amount)}</td>
      <td dir="ltr">${fmtMoney(r.commission)}</td>
      <td dir="ltr">${fmtMoney(r.discount)}</td>
      <td><span class="badge ${receiptBadgeClass(r.status)}">${esc(r.statusLabel)}</span></td>
      <td>${esc(r.submittedAt || r.createdAt || '—')}</td>
      <td class="row-actions">${receiptRowActions(r)}</td>
    </tr>`).join('') || '<tr><td colspan="9"><div class="rv-empty">لا توجد سندات قبض بعد — تظهر هنا بعد إرسال المندوب</div></td></tr>';

  document.querySelectorAll('[data-receipt-id]').forEach((btn) => {
    btn.addEventListener('click', () => openReceiptDetail(Number(btn.dataset.receiptId)));
  });
  document.querySelectorAll('[data-del-receipt]').forEach((btn) => {
    btn.addEventListener('click', () => deleteReceiptUi(Number(btn.dataset.delReceipt)));
  });
  document.querySelectorAll('[data-post-receipt]').forEach((btn) => {
    btn.addEventListener('click', () => postReceiptToEdariUi(Number(btn.dataset.postReceipt)));
  });
}

function journalPreviewTable(lines = []) {
  if (!lines.length) return '<p class="muted">لا توجد بنود قيد — راجع المبالغ والحسابات الثابتة</p>';
  return `
    <div class="table-scroll">
      <table class="data-table compact">
        <thead><tr><th>مدين</th><th>دائن</th><th>الحساب</th><th>البيان</th></tr></thead>
        <tbody>
          ${lines.map((ln) => `
            <tr>
              <td dir="ltr">${ln.isDebit ? fmtMoney(ln.amount) : '—'}</td>
              <td dir="ltr">${ln.isDebit ? '—' : fmtMoney(ln.amount)}</td>
              <td>${esc(ln.accNum)} ${esc(ln.accName)}</td>
              <td>${esc(ln.exp1)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function openReceiptDetail(id) {
  const data = await commerceApi(`/receipts/${id}`);
  const r = data.receipt;
  receiptAdmin.selected = r;
  receiptAdmin.editCustomer = {
    seq: r.customerAccSeq,
    num: r.customerNum,
    name: r.customerName
  };
  const posting = data.posting || {};
  const panel = document.getElementById('receiptDetailPanel');
  panel.classList.remove('hidden');
  const locked = !canEditReceipt(r.status);
  const customerLabel = `${r.customerNum || ''} ${r.customerName || ''}`.trim();
  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <h2 class="panel-title">سند ${esc(r.receiptNo)}</h2>
        <p class="panel-desc">${esc(r.agentName)} · ${esc(r.treeName || '')} · <span dir="ltr">${esc(r.customerNum)}</span></p>
      </div>
      <span class="badge ${receiptBadgeClass(r.status)}">${esc(r.statusLabel)}</span>
    </div>
    <label class="field rv-acc-field">
      <span>الزبون</span>
      <input type="search" class="search" id="rvEditCustomerSearch"
        placeholder="بحث لتغيير الزبون..."
        value="${esc(customerLabel)}" ${locked ? 'readonly' : ''}>
      <small class="muted" id="rvEditCustomerPicked">${esc(customerLabel || 'اختر زبوناً')}</small>
      <div class="rv-acc-results" id="rvEditCustomerResults"></div>
    </label>
    <div class="rv-edit-grid">
      <label class="field"><span>المبلغ</span>
        <input type="number" id="rvEditAmount" min="0" step="1" value="${r.amount}" ${locked ? 'readonly' : ''}></label>
      <label class="field"><span>العمولة</span>
        <input type="number" id="rvEditCommission" min="0" step="1" value="${r.commission}" ${locked ? 'readonly' : ''}></label>
      <label class="field"><span>الحسم</span>
        <input type="number" id="rvEditDiscount" min="0" step="1" value="${r.discount}" ${locked ? 'readonly' : ''}></label>
      <label class="field"><span>التاريخ</span>
        <input type="date" id="rvEditDate" value="${esc((r.receiptDate || '').slice(0, 10))}" ${locked ? 'readonly' : ''}></label>
    </div>
    <label class="field"><span>الملاحظات / البيان</span>
      <textarea id="rvEditNotes" rows="2" ${locked ? 'readonly' : ''}>${esc(r.notes)}</textarea></label>
    <label class="field"><span>ملاحظة الإدارة</span>
      <textarea id="rvEditAdminNote" rows="2" ${locked ? 'readonly' : ''}>${esc(r.adminNote)}</textarea></label>
    <h3 class="panel-title" style="margin-top:16px">معاينة سند القيد</h3>
    ${journalPreviewTable(posting.lines || r.journalPreview)}
    ${posting.error ? `<p class="muted" style="color:#b91c1c">${esc(posting.error)}</p>` : ''}
    ${r.edariJournalNum ? `<p class="muted">سند قيد الإداري: <span dir="ltr">${esc(r.edariJournalNum)}</span> · سند قبض: <span dir="ltr">${esc(r.edariReceiptNum || r.receiptNo)}</span></p>` : ''}
    ${r.postedError ? `<p class="muted" style="color:#b91c1c">${esc(r.postedError)}</p>` : ''}
    ${locked ? '' : `
    <div class="btn-row" style="margin-top:16px">
      <button type="button" class="btn btn-primary" id="btnSaveReceiptEdit">حفظ التعديل</button>
      <button type="button" class="btn btn-danger" id="btnDeleteReceipt">حذف السند</button>
      <button type="button" class="btn btn-soft" id="btnRejectReceipt">رفض</button>
      <button type="button" class="btn btn-soft" id="btnPostReceipt">ترحيل للإداري</button>
    </div>
    ${canPostReceiptsFromDesktop() ? '' : '<p class="muted">أمر الترحيل يعمل من تطبيق الإدارة المكتبي فقط</p>'}`}
  `;

  if (!locked) {
    bindReceiptCustomerSearch();
    document.getElementById('btnSaveReceiptEdit')?.addEventListener('click', () => saveReceiptEdit(r.id));
    document.getElementById('btnDeleteReceipt')?.addEventListener('click', () => deleteReceiptUi(r.id));
    document.getElementById('btnRejectReceipt')?.addEventListener('click', () => rejectReceipt(r.id));
    document.getElementById('btnPostReceipt')?.addEventListener('click', () => postReceiptToEdariUi(r.id));
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindReceiptCustomerSearch() {
  const input = document.getElementById('rvEditCustomerSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(receiptAdmin.searchTimers.customer);
    receiptAdmin.searchTimers.customer = setTimeout(
      () => searchReceiptCustomer(input.value),
      280
    );
  });
}

async function searchReceiptCustomer(q) {
  const box = document.getElementById('rvEditCustomerResults');
  const picked = document.getElementById('rvEditCustomerPicked');
  if (!box) return;
  const query = String(q || '').trim();
  if (query.length < 2) {
    box.innerHTML = '';
    return;
  }
  try {
    const data = await commerceApi(`/receipts/accounts/search?q=${encodeURIComponent(query)}`);
    const rows = data.results || [];
    box.innerHTML = rows.map((r) => `
      <button type="button" class="rv-acc-hit" data-seq="${esc(r.seq)}" data-num="${esc(r.num)}" data-name="${esc(r.name)}">
        <strong dir="ltr">${esc(r.num)}</strong> ${esc(r.name)}
      </button>`).join('') || '<p class="muted">لا نتائج</p>';
    box.querySelectorAll('.rv-acc-hit').forEach((btn) => {
      btn.addEventListener('click', () => {
        receiptAdmin.editCustomer = {
          seq: btn.dataset.seq,
          num: btn.dataset.num,
          name: btn.dataset.name
        };
        const search = document.getElementById('rvEditCustomerSearch');
        if (search) search.value = `${btn.dataset.num} ${btn.dataset.name}`.trim();
        if (picked) picked.textContent = `${btn.dataset.num} ${btn.dataset.name}`.trim();
        box.innerHTML = '';
      });
    });
  } catch (err) {
    box.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}

async function saveReceiptEdit(id) {
  try {
    await commerceApi(`/receipts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        customerAccSeq: receiptAdmin.editCustomer?.seq || undefined,
        amount: document.getElementById('rvEditAmount')?.value,
        commission: document.getElementById('rvEditCommission')?.value,
        discount: document.getElementById('rvEditDiscount')?.value,
        receiptDate: document.getElementById('rvEditDate')?.value,
        notes: document.getElementById('rvEditNotes')?.value,
        adminNote: document.getElementById('rvEditAdminNote')?.value
      })
    });
    showToast('تم حفظ التعديل');
    await loadReceiptsPage();
    await openReceiptDetail(id);
  } catch (err) {
    showToast(err.message, 'err');
  }
}

async function deleteReceiptUi(id) {
  const selected = receiptAdmin.selected;
  const label = selected?.id === id ? selected.receiptNo : String(id);
  if (!confirm(`حذف سند القبض ${label} نهائياً؟\nلا يمكن التراجع، ولن يُرحَّل للإداري.`)) return;
  try {
    await commerceApi(`/receipts/${id}`, { method: 'DELETE' });
    showToast('تم حذف سند القبض');
    if (receiptAdmin.selected?.id === id) {
      receiptAdmin.selected = null;
      document.getElementById('receiptDetailPanel')?.classList.add('hidden');
    }
    await loadReceiptsPage();
  } catch (err) {
    showToast(err.message, 'err');
  }
}

async function rejectReceipt(id) {
  if (!confirm('رفض سند القبض؟')) return;
  try {
    await commerceApi(`/receipts/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected', note: 'رفض من الإدارة' })
    });
    showToast('تم الرفض');
    await loadReceiptsPage();
    await openReceiptDetail(id);
  } catch (err) {
    showToast(err.message, 'err');
  }
}

async function postReceiptToEdariUi(id) {
  try {
    const data = await commerceApi(`/receipts/${id}`);
    const posting = data.posting;
    if (posting?.error) {
      showToast(posting.error, 'err');
      return;
    }
    if (!canPostReceiptsFromDesktop()) {
      showToast('افتح تطبيق الإدارة على Windows للترحيل', 'err');
      return;
    }
    if (data.receipt.status === 'posted') {
      showToast('السند مُرحَّل مسبقاً');
      return;
    }
    if (!confirm(`ترحيل سند ${data.receipt.receiptNo} إلى الإداري كسند قبض وسند قيد؟`)) return;
    const result = await window.edariDesktop.postEdariReceipt({
      receiptNo: data.receipt.receiptNo,
      receiptDate: data.receipt.receiptDate,
      lines: posting.lines
    });
    if (!result?.ok) {
      await commerceApi(`/receipts/${id}/posted`, {
        method: 'POST',
        body: JSON.stringify({ error: result?.error || 'فشل الترحيل' })
      });
      throw new Error(result?.error || 'فشل الترحيل');
    }
    await commerceApi(`/receipts/${id}/posted`, {
      method: 'POST',
      body: JSON.stringify({
        journalNum: result.journalNum,
        receiptNum: result.receiptNum || data.receipt.receiptNo,
        receiptDate: data.receipt.receiptDate,
        lines: result.lines || posting.lines
      })
    });
    showToast(`تم الترحيل · سند قيد ${result.journalNum}`);
    await loadReceiptsPage();
    await openReceiptDetail(id);
  } catch (err) {
    showToast(err.message, 'err');
  }
}

function initReceiptsAdmin() {
  document.getElementById('btnSaveReceiptSettings')?.addEventListener('click', () => saveReceiptSettings());
  document.getElementById('receiptStatusFilter')?.addEventListener('change', () => loadReceiptsPage());
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-rv-acc], [data-rv-browse], .rv-acc-results')) return;
    document.querySelectorAll('.rv-acc-results').forEach((el) => { el.innerHTML = ''; });
  });
}

window.commercePages = window.commercePages || {};
window.commercePages.receipts = async () => {
  updateReceiptPostAlert();
  await loadReceiptSettings();
  await loadReceiptsPage();
  if (typeof window.loadCustomerRequestsPage === 'function') {
    await window.loadCustomerRequestsPage();
  }
  if (typeof window.loadDeliveryReceiptsPage === 'function') {
    await window.loadDeliveryReceiptsPage();
  }
};

initReceiptsAdmin();
