/* Admin: delivery receipts (وصل استلام) — display only, no Edari posting */

const deliveryReceiptAdmin = { selected: null, rows: [] };

function drBadgeClass(status) {
  return ({ issued: 'pending', linked: 'ok' })[status] || 'pending';
}

function deliveryReceiptSearchQuery() {
  return String(document.getElementById('deliveryReceiptSearch')?.value || '').trim().toLowerCase();
}

function filterDeliveryReceiptRows(rows) {
  const q = deliveryReceiptSearchQuery();
  if (!q) return rows;
  return rows.filter((d) => {
    const hay = [
      d.deliveryNo,
      d.agentName,
      d.customerName,
      d.linkedReceiptNo,
      d.receiptDate,
      d.createdAt
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function renderDeliveryReceiptRows(rows) {
  const body = document.getElementById('deliveryReceiptsBody');
  if (!body) return;
  body.innerHTML = rows.map((d) => `
    <tr>
      <td dir="ltr">${esc(d.deliveryNo)}</td>
      <td>${esc(d.agentName)}</td>
      <td>${esc(d.customerName)}</td>
      <td class="num-en" dir="ltr">${fmtMoney(d.amount)}</td>
      <td><span class="badge ${drBadgeClass(d.status)}">${esc(d.statusLabel)}</span></td>
      <td>${d.printedAt ? '✓' : '—'}</td>
      <td dir="ltr">${esc(d.linkedReceiptNo || '—')}</td>
      <td>${esc(d.receiptDate || d.createdAt || '—')}</td>
      <td class="row-actions">
        <button type="button" class="btn btn-soft btn-sm" data-dr-id="${d.id}">عرض</button>
        <button type="button" class="btn btn-danger btn-sm" data-del-dr="${d.id}">حذف</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="9"><div class="rv-empty">لا توجد وصول استلام بعد</div></td></tr>';

  document.querySelectorAll('[data-dr-id]').forEach((btn) => {
    btn.addEventListener('click', () => openDeliveryReceiptDetail(Number(btn.dataset.drId)));
  });
  document.querySelectorAll('[data-del-dr]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void deleteDeliveryReceiptUi(Number(btn.dataset.delDr));
    });
  });
}

async function loadDeliveryReceiptsPage() {
  const status = document.getElementById('deliveryReceiptStatusFilter')?.value || '';
  const path = `/delivery-receipts${status ? `?status=${encodeURIComponent(status)}` : ''}`;
  const [list, stats] = await Promise.all([
    commerceApi(path),
    commerceApi('/delivery-receipts/stats')
  ]);
  const s = stats.stats || {};
  const statsEl = document.getElementById('deliveryReceiptStats');
  if (statsEl) {
    statsEl.innerHTML = `
      <span class="rv-kpi pending">مُصدَّر <strong class="num-en" dir="ltr">${fmtNumAlways(s.issued || 0)}</strong></span>
      <span class="rv-kpi ok">مرتبط <strong class="num-en" dir="ltr">${fmtNumAlways(s.linked || 0)}</strong></span>
      <span class="rv-kpi">اليوم <strong class="num-en" dir="ltr">${fmtNumAlways(s.today || 0)}</strong></span>
      <span class="rv-kpi">الإجمالي <strong class="num-en" dir="ltr">${fmtNumAlways(s.total || 0)}</strong></span>`;
  }
  deliveryReceiptAdmin.rows = list.deliveryReceipts || [];
  renderDeliveryReceiptRows(filterDeliveryReceiptRows(deliveryReceiptAdmin.rows));
}

window.loadDeliveryReceiptsPage = loadDeliveryReceiptsPage;

window.commercePages = window.commercePages || {};
window.commercePages.deliveryReceipts = loadDeliveryReceiptsPage;

async function openDeliveryReceiptDetail(id) {
  const data = await commerceApi(`/delivery-receipts/${id}`);
  const d = data.deliveryReceipt;
  if (!d) return;
  deliveryReceiptAdmin.selected = d.id;
  const panel = document.getElementById('deliveryReceiptDetailPanel');
  if (!panel) return;
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="rv-card-head">
      <div>
        <h2 class="rv-card-title">وصل استلام <span dir="ltr">${esc(d.deliveryNo)}</span></h2>
        <p class="rv-card-sub">عرض فقط — لا يُرحَّل للإداري</p>
      </div>
      <button type="button" class="btn btn-soft" id="btnCloseDrDetail">إغلاق</button>
    </div>
    <div class="rv-detail-grid">
      <div><span class="muted">المندوب</span><strong>${esc(d.agentName)}</strong></div>
      <div><span class="muted">الزبون</span><strong>${esc(d.customerName)}</strong></div>
      <div><span class="muted">المبلغ</span><strong class="num-en" dir="ltr">${fmtMoney(d.amount)}</strong></div>
      <div><span class="muted">التاريخ</span><strong>${esc(d.receiptDate || '—')}</strong></div>
      <div><span class="muted">الحالة</span><strong>${esc(d.statusLabel)}</strong></div>
      <div><span class="muted">سند القبض</span><strong dir="ltr">${esc(d.linkedReceiptNo || '—')}</strong></div>
      <div><span class="muted">طباعة</span><strong>${d.printedAt ? esc(d.printedAt) : '—'}</strong></div>
      <div class="rv-detail-wide"><span class="muted">ملاحظات</span><p>${esc(d.notes || '—')}</p></div>
      <div class="rv-detail-wide">
        <label class="muted" for="drAdminNote">ملاحظة الإدارة</label>
        <textarea id="drAdminNote" class="search" rows="2">${esc(d.adminNote || '')}</textarea>
      </div>
    </div>
    <div class="rv-detail-actions">
      <button type="button" class="btn btn-primary" id="btnSaveDrNote">حفظ الملاحظة</button>
      <button type="button" class="btn btn-danger" id="btnDeleteDr">حذف</button>
    </div>`;

  document.getElementById('btnCloseDrDetail')?.addEventListener('click', () => {
    panel.classList.add('hidden');
    deliveryReceiptAdmin.selected = null;
  });
  document.getElementById('btnSaveDrNote')?.addEventListener('click', () => saveDeliveryReceiptNote(d.id));
  document.getElementById('btnDeleteDr')?.addEventListener('click', () => deleteDeliveryReceiptUi(d.id));
}

async function saveDeliveryReceiptNote(id) {
  const note = document.getElementById('drAdminNote')?.value || '';
  await commerceApi(`/delivery-receipts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ adminNote: note })
  });
  showToast('تم حفظ الملاحظة');
  await loadDeliveryReceiptsPage();
  await openDeliveryReceiptDetail(id);
}

async function deleteDeliveryReceiptUi(id) {
  if (!confirm('حذف وصل الاستلام؟')) return;
  await commerceApi(`/delivery-receipts/${id}`, { method: 'DELETE' });
  document.getElementById('deliveryReceiptDetailPanel')?.classList.add('hidden');
  showToast('تم الحذف');
  await loadDeliveryReceiptsPage();
}

document.getElementById('deliveryReceiptStatusFilter')?.addEventListener('change', () => loadDeliveryReceiptsPage());

let deliverySearchTimer;
document.getElementById('deliveryReceiptSearch')?.addEventListener('input', () => {
  clearTimeout(deliverySearchTimer);
  deliverySearchTimer = setTimeout(() => {
    if (deliveryReceiptAdmin.rows.length) {
      renderDeliveryReceiptRows(filterDeliveryReceiptRows(deliveryReceiptAdmin.rows));
    } else {
      void loadDeliveryReceiptsPage();
    }
  }, 220);
});
