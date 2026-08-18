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
  { key: 'cash', label: 'صندوق المبلغ' },
  { key: 'commissionDebit', label: 'حـ/ العمولات (مدين)' },
  { key: 'commissionCredit', label: 'حـ/ مقابل العمولات (دائن)' },
  { key: 'discount', label: 'حـ/ الحسم' }
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
    return `
      <label class="field rv-acc-field">
        <span>${esc(f.label)}</span>
        <input type="search" class="search" data-rv-acc="${f.key}"
          placeholder="بحث برقم أو اسم الحساب..."
          value="${esc(rvAccLabel(acc) === 'غير محدد' ? '' : rvAccLabel(acc))}">
        <small class="muted" data-rv-acc-picked="${f.key}">${esc(acc.seq ? `Seq ${acc.seq}` : 'اختر حساباً من نتائج البحث')}</small>
        <div class="rv-acc-results" data-rv-acc-results="${f.key}"></div>
      </label>`;
  }).join('');

  grid.querySelectorAll('[data-rv-acc]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.dataset.rvAcc;
      clearTimeout(receiptAdmin.searchTimers[key]);
      receiptAdmin.searchTimers[key] = setTimeout(() => searchReceiptAccount(key, input.value), 280);
    });
  });
}

async function searchReceiptAccount(key, q) {
  const box = document.querySelector(`[data-rv-acc-results="${key}"]`);
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

function receiptBadgeClass(status) {
  return ({ pending: 'pending', reviewed: 'ok', posted: 'ok', rejected: 'off' })[status] || 'pending';
}

async function loadReceiptsPage() {
  const status = document.getElementById('receiptStatusFilter')?.value || '';
  const [list, stats] = await Promise.all([
    commerceApi(`/receipts${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    commerceApi('/receipts/stats')
  ]);
  const s = stats.stats || {};
  document.getElementById('receiptStats').innerHTML = `
    <span class="badge pending">انتظار ${s.pending || 0}</span>
    <span class="badge ok">جاهز ${s.reviewed || 0}</span>
    <span class="badge ok">مُرحَّل ${s.posted || 0}</span>
    <span class="badge">اليوم ${s.today || 0}</span>`;

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
      <td>
        <button type="button" class="btn btn-soft btn-sm" data-receipt-id="${r.id}">عرض</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="9">لا توجد سندات قبض</td></tr>';

  document.querySelectorAll('[data-receipt-id]').forEach((btn) => {
    btn.addEventListener('click', () => openReceiptDetail(Number(btn.dataset.receiptId)));
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
  const posting = data.posting || {};
  const panel = document.getElementById('receiptDetailPanel');
  panel.classList.remove('hidden');
  const locked = r.status === 'posted';
  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <h2 class="panel-title">سند ${esc(r.receiptNo)}</h2>
        <p class="panel-desc">${esc(r.agentName)} · ${esc(r.customerName)} · <span dir="ltr">${esc(r.customerNum)}</span></p>
      </div>
      <span class="badge ${receiptBadgeClass(r.status)}">${esc(r.statusLabel)}</span>
    </div>
    <div class="rv-edit-grid">
      <label class="field"><span>المبلغ</span>
        <input type="number" id="rvEditAmount" value="${r.amount}" ${locked ? 'readonly' : ''}></label>
      <label class="field"><span>العمولة</span>
        <input type="number" id="rvEditCommission" value="${r.commission}" ${locked ? 'readonly' : ''}></label>
      <label class="field"><span>الحسم</span>
        <input type="number" id="rvEditDiscount" value="${r.discount}" ${locked ? 'readonly' : ''}></label>
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
      <button type="button" class="btn btn-soft" id="btnSaveReceiptEdit">حفظ التعديل</button>
      <button type="button" class="btn btn-soft" id="btnRejectReceipt">رفض</button>
      <button type="button" class="btn btn-primary" id="btnPostReceipt">ترحيل للإداري</button>
    </div>`}
  `;

  document.getElementById('btnSaveReceiptEdit')?.addEventListener('click', () => saveReceiptEdit(r.id));
  document.getElementById('btnRejectReceipt')?.addEventListener('click', () => rejectReceipt(r.id));
  document.getElementById('btnPostReceipt')?.addEventListener('click', () => postReceiptToEdariUi(r.id));
}

async function saveReceiptEdit(id) {
  try {
    await commerceApi(`/receipts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
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
    if (!window.edariDesktop?.postEdariReceipt) {
      showToast('الترحيل يتم من تطبيق الإدارة المكتبي المتصل بـ Edari', 'err');
      return;
    }
    if (!confirm('ترحيل سند القبض إلى الإداري كسند قبض وسند قيد؟')) return;
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
    showToast(`تم الترحيل · قيد ${result.journalNum}`);
    await loadReceiptsPage();
    await openReceiptDetail(id);
  } catch (err) {
    showToast(err.message, 'err');
  }
}

function initReceiptsAdmin() {
  document.getElementById('btnSaveReceiptSettings')?.addEventListener('click', () => saveReceiptSettings());
  document.getElementById('receiptStatusFilter')?.addEventListener('change', () => loadReceiptsPage());
}

window.commercePages = window.commercePages || {};
window.commercePages.receipts = async () => {
  await loadReceiptSettings();
  await loadReceiptsPage();
};

initReceiptsAdmin();
