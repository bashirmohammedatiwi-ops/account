/* Admin: delivery receipts (وصل استلام) */

const DR_PILL = { issued: 'pending', linked: 'ready' };

const deliveryReceiptAdmin = {
  selected: null,
  rows: [],
  listIds: [],
  viewMode: 'table'
};

function drApplyChip(chip) {
  const sel = document.getElementById('deliveryReceiptStatusFilter');
  if (sel) sel.value = chip === 'all' ? '' : chip;
  colSyncChips(chip === 'all' ? 'all' : chip);
  void loadDeliveryReceiptsPage();
}

function deliveryReceiptSearchQuery() {
  return String(document.getElementById('deliveryReceiptSearch')?.value || '').trim().toLowerCase();
}

function filterDeliveryReceiptRows(rows) {
  const q = deliveryReceiptSearchQuery();
  if (!q) return rows;
  return rows.filter((d) => {
    const hay = [d.deliveryNo, d.agentName, d.customerName, d.linkedReceiptNo, d.receiptDate, d.createdAt]
      .join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function drRowActions(d) {
  return `
    <div class="rcv-row-actions">
      <button type="button" class="btn btn-soft btn-sm" data-dr-id="${d.id}">عرض</button>
      <button type="button" class="btn btn-danger btn-sm" data-del-dr="${d.id}">حذف</button>
    </div>`;
}

function bindDeliveryReceiptInteractions() {
  document.querySelectorAll('[data-dr-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void openDeliveryReceiptDetail(Number(btn.dataset.drId));
    });
  });
  document.querySelectorAll('[data-del-dr]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void deleteDeliveryReceiptUi(Number(btn.dataset.delDr));
    });
  });
  document.querySelectorAll('[data-dr-row]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      void openDeliveryReceiptDetail(Number(row.dataset.drRow));
    });
  });
}

function renderDeliveryReceiptRows(rows) {
  const body = document.getElementById('deliveryReceiptsBody');
  if (!body) return;
  body.innerHTML = rows.map((d) => {
    const active = deliveryReceiptAdmin.selected === d.id ? ' is-active' : '';
    return `
    <tr class="rcv-row${active}" data-dr-row="${d.id}">
      <td><span class="rcv-no num-en" dir="ltr">${esc(d.deliveryNo)}</span></td>
      <td>
        <div class="rcv-cell-agent">
          <span class="rcv-agent-avatar">${esc(colAgentInitial(d.agentName))}</span>
          <span>${esc(d.agentName)}</span>
        </div>
      </td>
      <td><strong>${esc(d.customerName)}</strong></td>
      <td class="rcv-amt num-en" dir="ltr">${fmtMoney(d.amount)}</td>
      <td>${colStatusPill(d.status, d.statusLabel, DR_PILL)}</td>
      <td>${d.printedAt ? '<span class="rcv-pill rcv-pill-ready">✓</span>' : '—'}</td>
      <td class="num-en" dir="ltr">${esc(d.linkedReceiptNo || '—')}</td>
      <td class="rcv-date num-en" dir="ltr">${fmtDateEn(d.receiptDate || d.createdAt)}</td>
      <td>${drRowActions(d)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="9"><div class="rcv-empty">لا توجد وصولات استلام</div></td></tr>`;
  bindDeliveryReceiptInteractions();
}

function renderDeliveryReceiptCards(rows) {
  const grid = document.getElementById('drCardsGrid');
  if (!grid) return;
  grid.innerHTML = rows.map((d) => {
    const active = deliveryReceiptAdmin.selected === d.id ? ' is-active' : '';
    return `
    <article class="rcv-card-item${active}" data-dr-row="${d.id}">
      <div class="rcv-card-item-head">
        <div>
          <span class="rcv-card-no num-en" dir="ltr">${esc(d.deliveryNo)}</span>
          ${colStatusPill(d.status, d.statusLabel, DR_PILL)}
        </div>
        <span class="rcv-card-date num-en" dir="ltr">${fmtDateEn(d.receiptDate || d.createdAt)}</span>
      </div>
      <div class="rcv-card-item-body">
        <div class="rcv-card-party">
          <span class="rcv-agent-avatar sm">${esc(colAgentInitial(d.agentName))}</span>
          <div><strong>${esc(d.agentName)}</strong><small>${esc(d.customerName)}</small></div>
        </div>
        <div class="rcv-card-amounts">
          <div><span>المبلغ</span><strong class="num-en" dir="ltr">${fmtMoney(d.amount)}</strong></div>
          <div><span>طباعة</span><strong>${d.printedAt ? '✓' : '—'}</strong></div>
          <div><span>سند قبض</span><strong class="num-en" dir="ltr">${esc(d.linkedReceiptNo || '—')}</strong></div>
        </div>
      </div>
      <div class="rcv-card-item-foot">${drRowActions(d)}</div>
    </article>`;
  }).join('') || '<div class="rcv-empty">لا توجد وصولات</div>';
  bindDeliveryReceiptInteractions();
}

function renderDeliveryReceiptList(rows) {
  renderDeliveryReceiptRows(rows);
  renderDeliveryReceiptCards(rows);
  colSetViewMode(deliveryReceiptAdmin.viewMode, 'dr', deliveryReceiptAdmin);
}

async function loadDeliveryReceiptsPage() {
  const status = document.getElementById('deliveryReceiptStatusFilter')?.value || '';
  const path = `/delivery-receipts${status ? `?status=${encodeURIComponent(status)}` : ''}`;
  const [list, stats] = await Promise.all([
    commerceApi(path),
    commerceApi('/delivery-receipts/stats')
  ]);
  const s = stats.stats || {};
  colRenderStatGrid(document.getElementById('deliveryReceiptStats'), [
    { key: 'issued', cls: 'pending', label: 'مُصدَّر', count: s.issued, filterKey: 'issued' },
    { key: 'linked', cls: 'ready', label: 'مرتبط', count: s.linked, filterKey: 'linked' },
    { key: 'today', cls: 'neutral', label: 'اليوم', count: s.today, filterKey: 'all', subText: 'وصل' },
    { key: 'total', cls: 'total', label: 'الإجمالي', count: s.total, clickable: false, subText: 'وصل' }
  ], drApplyChip);

  deliveryReceiptAdmin.rows = list.deliveryReceipts || [];
  deliveryReceiptAdmin.listIds = deliveryReceiptAdmin.rows.map((d) => d.id);
  const filtered = filterDeliveryReceiptRows(deliveryReceiptAdmin.rows);
  const countEl = document.getElementById('deliveryReceiptListCount');
  if (countEl) countEl.innerHTML = `<span class="num-en" dir="ltr">${fmtNumAlways(filtered.length)}</span> وصل`;
  renderDeliveryReceiptList(filtered);
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
  panel.classList.add('has-receipt');
  panel.innerHTML = `
    <div class="rcv-detail-inner">
      <div class="rcv-detail-toolbar">
        ${colDetailNav(deliveryReceiptAdmin.listIds, id)}
        <button type="button" class="rcv-detail-close" id="btnCloseDrDetail" title="إغلاق">×</button>
      </div>
      <div class="rcv-detail-head">
        <div>
          <span class="rcv-detail-kicker">وصل استلام</span>
          <h3 class="rcv-detail-title num-en" dir="ltr">${esc(d.deliveryNo)}</h3>
          <p class="rcv-detail-sub">${esc(d.agentName)} · عرض فقط</p>
        </div>
        ${colStatusPill(d.status, d.statusLabel, DR_PILL)}
      </div>
      <div class="rcv-detail-amounts">
        <div class="rcv-detail-amt rcv-detail-amt-main">
          <span>المبلغ</span>
          <strong class="num-en" dir="ltr">${fmtMoney(d.amount)}</strong>
        </div>
        <div class="rcv-detail-amt"><span>الزبون</span><strong>${esc(d.customerName)}</strong></div>
        <div class="rcv-detail-amt"><span>التاريخ</span><strong class="num-en" dir="ltr">${fmtDateEn(d.receiptDate)}</strong></div>
        <div class="rcv-detail-amt"><span>سند القبض</span><strong class="num-en" dir="ltr">${esc(d.linkedReceiptNo || '—')}</strong></div>
        <div class="rcv-detail-amt"><span>طباعة</span><strong>${d.printedAt ? fmtDateEn(d.printedAt) : '—'}</strong></div>
      </div>
      <label class="rcv-field"><span>ملاحظات</span><p class="rcv-muted">${esc(d.notes || '—')}</p></label>
      <label class="rcv-field"><span>ملاحظة الإدارة</span>
        <textarea id="drAdminNote" rows="2">${esc(d.adminNote || '')}</textarea></label>
      <div class="rcv-detail-actions">
        <button type="button" class="btn btn-primary" id="btnSaveDrNote">حفظ الملاحظة</button>
        <button type="button" class="btn btn-danger" id="btnDeleteDr">حذف</button>
      </div>
    </div>`;

  colHighlightRows('[data-dr-row]', id);
  colBindDetailNav(openDeliveryReceiptDetail);
  document.getElementById('btnCloseDrDetail')?.addEventListener('click', () => {
    deliveryReceiptAdmin.selected = null;
    colShowDetailEmpty(panel, 'اختر وصل استلام', 'اضغط «عرض» من القائمة');
    colHighlightRows('[data-dr-row]', null);
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
  deliveryReceiptAdmin.selected = null;
  colShowDetailEmpty(document.getElementById('deliveryReceiptDetailPanel'), 'اختر وصل استلام', 'اضغط «عرض» من القائمة');
  showToast('تم الحذف');
  await loadDeliveryReceiptsPage();
}

document.getElementById('btnDrRefresh')?.addEventListener('click', () => loadDeliveryReceiptsPage());
document.getElementById('deliveryReceiptStatusFilter')?.addEventListener('change', () => loadDeliveryReceiptsPage());
colInitChips(drApplyChip);
colInitViewToggle('dr', deliveryReceiptAdmin, () => renderDeliveryReceiptList(filterDeliveryReceiptRows(deliveryReceiptAdmin.rows)));

let deliverySearchTimer;
document.getElementById('deliveryReceiptSearch')?.addEventListener('input', () => {
  clearTimeout(deliverySearchTimer);
  deliverySearchTimer = setTimeout(() => {
    const filtered = filterDeliveryReceiptRows(deliveryReceiptAdmin.rows);
    renderDeliveryReceiptList(filtered);
    const countEl = document.getElementById('deliveryReceiptListCount');
    if (countEl) countEl.innerHTML = `<span class="num-en" dir="ltr">${fmtNumAlways(filtered.length)}</span> وصل`;
  }, 220);
});
