/* Delegate receipts — وصل قبض (WR) + سند قبض (RV) + تسليم للرئيسي */

const receiptsState = {
  tab: 'delivery',
  customer: null,
  tree: null,
  deliveryCustomer: null,
  deliveryTree: null,
  list: [],
  deliveries: [],
  linkedDelivery: null,
  pickerTarget: 'receipt'
};

function isSecondaryAgent() {
  return state.agent?.delegateRole === 'secondary';
}

function isPrimaryAgent() {
  return !isSecondaryAgent();
}

function rvFmt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

function rvStatusClass(status) {
  return ({
    pending: 'pending',
    reviewed: 'ok',
    posted: 'ok',
    rejected: 'off',
    issued: 'pending',
    linked: 'ok'
  })[status] || 'pending';
}

function renderReceiptCustomer() {
  const el = document.getElementById('receiptCustomerLabel');
  if (!el) return;
  const c = receiptsState.customer;
  if (!c) {
    el.className = 'muted';
    el.textContent = 'اختر شجرة ثم زبوناً';
    return;
  }
  el.className = '';
  el.innerHTML = `<strong>${esc(c.name1)}</strong> <span dir="ltr">${esc(c.num || '')}</span>`;
}

function renderDeliveryCustomer() {
  const el = document.getElementById('deliveryCustomerLabel');
  if (!el) return;
  const c = receiptsState.deliveryCustomer;
  if (!c) {
    el.className = 'muted';
    el.textContent = 'اختر شجرة ثم زبوناً';
    return;
  }
  el.className = '';
  el.innerHTML = `<strong>${esc(c.name1)}</strong> <span dir="ltr">${esc(c.num || '')}</span>`;
}

function resetReceiptForm() {
  receiptsState.customer = null;
  receiptsState.tree = null;
  receiptsState.linkedDelivery = null;
  const amount = document.getElementById('receiptAmount');
  const commission = document.getElementById('receiptCommission');
  const discount = document.getElementById('receiptDiscount');
  const notes = document.getElementById('receiptNotes');
  if (amount) amount.value = '';
  if (commission) commission.value = '';
  if (discount) discount.value = '';
  if (notes) notes.value = '';
  renderReceiptCustomer();
  renderLinkedDeliveryBanner();
}

function resetDeliveryForm() {
  receiptsState.deliveryCustomer = null;
  receiptsState.deliveryTree = null;
  const amount = document.getElementById('deliveryAmount');
  const notes = document.getElementById('deliveryNotes');
  if (amount) amount.value = '';
  if (notes) notes.value = '';
  renderDeliveryCustomer();
}

function renderLinkedDeliveryBanner() {
  const el = document.getElementById('linkedDeliveryBanner');
  if (!el) return;
  const d = receiptsState.linkedDelivery;
  if (!d) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="rv-linked-copy">
      <strong>مرتبط بوصل ${esc(d.deliveryNo)}</strong>
      <span>${esc(d.customerName || '—')} · ${rvFmt(d.amount)} د.ع</span>
      ${d.isTeamDelivery && d.agentName ? `<span class="muted">مندوب: ${esc(d.agentName)}</span>` : ''}
    </div>
    <button type="button" class="btn soft btn-sm" id="btnClearLinkedDelivery">إلغاء الربط</button>`;
  document.getElementById('btnClearLinkedDelivery')?.addEventListener('click', () => {
    resetReceiptForm();
  });
}

window.receiptsOnCustomer = function receiptsOnCustomer(branch, tree) {
  const target = receiptsState.pickerTarget || 'receipt';
  const customer = { seq: branch.seq, num: branch.num, name1: branch.name1 };
  const treeInfo = { seq: tree?.seq || '', name1: tree?.name1 || '' };
  if (target === 'delivery') {
    receiptsState.deliveryCustomer = customer;
    receiptsState.deliveryTree = treeInfo;
    renderDeliveryCustomer();
  } else {
    receiptsState.customer = customer;
    receiptsState.tree = treeInfo;
    renderReceiptCustomer();
  }
};

function applyReceiptsRoleUi() {
  const secondary = isSecondaryAgent();
  const tabs = document.getElementById('receiptsTabs');
  const panelReceipt = document.getElementById('rvPanelReceipt');
  const banner = document.getElementById('receiptsRoleBanner');
  const homeTile = document.querySelector('[data-app="receipts"]');
  const homeName = homeTile?.querySelector('.home-app-name');
  const homeHint = homeTile?.querySelector('.home-app-hint');

  if (homeName) homeName.textContent = secondary ? 'وصل قبض' : 'سند قبض';
  if (homeHint) {
    homeHint.textContent = secondary ? 'إصدار وصل قبض للزبون' : 'تحصيل من الزبون';
  }

  if (banner) {
    const roleLabel = state.agent?.delegateRoleLabel || (secondary ? 'مندوب ثانوي' : 'مندوب رئيسي');
    if (secondary) {
      banner.classList.remove('hidden');
      banner.innerHTML = `<span class="rv-role-pill warn">${esc(roleLabel)}</span>
        <span>وصل قبض فقط — ${state.agent?.parentAgentName ? `يتبع ${esc(state.agent.parentAgentName)}` : 'يُسلّم المبلغ للرئيسي'}</span>`;
    } else if (Number(state.agent?.secondaryCount) > 0) {
      banner.classList.remove('hidden');
      banner.innerHTML = `<span class="rv-role-pill ok">${esc(roleLabel)}</span>
        <span>${fmtNumAlways(state.agent.secondaryCount)} مندوب ثانوي · تستلم وصولاتهم وتُصدر سند قبض</span>`;
    } else {
      banner.classList.add('hidden');
      banner.innerHTML = '';
    }
  }

  if (secondary) {
    receiptsState.tab = 'delivery';
    tabs?.classList.add('hidden');
    panelReceipt?.classList.add('hidden');
    document.getElementById('rvPanelDelivery')?.classList.remove('hidden');
  } else {
    tabs?.classList.remove('hidden');
    setReceiptsTab(receiptsState.tab || 'delivery', { silent: true });
  }
}

function setReceiptsTab(tab, { silent = false } = {}) {
  if (isSecondaryAgent()) tab = 'delivery';
  receiptsState.tab = tab;
  document.querySelectorAll('[data-rv-tab]').forEach((btn) => {
    const active = btn.dataset.rvTab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.getElementById('rvPanelDelivery')?.classList.toggle('hidden', tab !== 'delivery');
  document.getElementById('rvPanelReceipt')?.classList.toggle('hidden', tab !== 'receipt');
  if (!silent && tab === 'receipt') renderLinkedDeliveryBanner();
}

function deliveryCardActions(d) {
  const parts = [];
  if (d.canMarkHandover) {
    parts.push(`<button type="button" class="btn primary btn-sm" data-handover-dr="${d.id}">استلمت المبلغ</button>`);
  }
  if (d.canCreateReceipt) {
    parts.push(`<button type="button" class="btn soft btn-sm" data-link-dr="${d.id}">سند قبض</button>`);
  }
  if (d.status === 'issued' && !d.receiptId && !d.isTeamDelivery) {
    parts.push(`<button type="button" class="btn danger btn-sm" data-del-dr="${d.id}">حذف</button>`);
  }
  return parts.length ? `<div class="inv-order-card-actions">${parts.join('')}</div>` : '';
}

function renderDeliveryCard(d) {
  const chips = [
    `<span class="badge ${rvStatusClass(d.status)}">${esc(d.statusLabel)}</span>`
  ];
  if (d.handoverStatusLabel) {
    chips.push(`<span class="badge ${d.handoverStatus === 'received' ? 'ok' : 'pending'}">${esc(d.handoverStatusLabel)}</span>`);
  }
  if (d.linkedReceiptNo) {
    chips.push(`<span class="badge ok" dir="ltr">${esc(d.linkedReceiptNo)}</span>`);
  }
  return `
    <article class="inv-order-card">
      <div class="inv-order-card-main">
        <div class="inv-order-card-head">
          <div class="inv-order-card-titles">
            <strong class="inv-order-no" dir="ltr">${esc(d.deliveryNo)}</strong>
            ${chips.join('')}
          </div>
        </div>
        <p class="inv-order-card-cust">${esc(d.customerName || '—')}${d.isTeamDelivery && d.agentName ? ` · ${esc(d.agentName)}` : ''}</p>
        <div class="inv-order-card-stats">
          <span>مبلغ <strong dir="ltr">${rvFmt(d.amount)}</strong></span>
          ${d.printedAt ? '<span>طُبع ✓</span>' : ''}
        </div>
        ${d.notes ? `<p class="inv-order-card-notes">${esc(d.notes)}</p>` : ''}
      </div>
      ${deliveryCardActions(d)}
    </article>`;
}

async function loadMyDeliveries() {
  const list = document.getElementById('myDeliveriesList');
  const meta = document.getElementById('myDeliveriesMeta');
  if (!list) return;
  try {
    const data = await api('/delivery-receipts');
    receiptsState.deliveries = data.deliveryReceipts || [];
    updateReceiptsHomeBadge();

    if (meta) {
      meta.textContent = receiptsState.deliveries.length
        ? `${receiptsState.deliveries.length} وصل`
        : 'لا توجد وصولات بعد';
    }
    list.innerHTML = receiptsState.deliveries.map(renderDeliveryCard).join('')
      || '<div class="empty-state"><p>أصدر وصل قبض ليظهر هنا</p></div>';

    list.querySelectorAll('[data-handover-dr]').forEach((btn) => {
      btn.addEventListener('click', () => void markHandover(Number(btn.dataset.handoverDr)));
    });
    list.querySelectorAll('[data-link-dr]').forEach((btn) => {
      btn.addEventListener('click', () => startReceiptFromDelivery(Number(btn.dataset.linkDr)));
    });
    list.querySelectorAll('[data-del-dr]').forEach((btn) => {
      btn.addEventListener('click', () => void deleteMyDelivery(Number(btn.dataset.delDr)));
    });
  } catch (err) {
    list.innerHTML = `<div class="empty-state"><p>${esc(err.message)}</p></div>`;
  }
}

function updateReceiptsHomeBadge() {
  const badge = document.getElementById('homeBadgeReceipts');
  if (!badge) return;
  let count = 0;
  if (isSecondaryAgent()) {
    count = receiptsState.deliveries.filter((d) => d.status === 'issued' && d.handoverStatus !== 'received').length;
  } else {
    const pendingReceipts = receiptsState.list.filter((r) => r.status === 'pending' || r.status === 'reviewed').length;
    const awaitingReceipt = receiptsState.deliveries.filter((d) => d.canCreateReceipt).length;
    count = pendingReceipts + awaitingReceipt;
  }
  badge.textContent = String(count);
  badge.classList.toggle('hidden', count === 0);
}

async function loadMyReceipts() {
  const list = document.getElementById('myReceiptsList');
  const meta = document.getElementById('myReceiptsMeta');
  if (!list) return;
  if (isSecondaryAgent()) {
    receiptsState.list = [];
    if (meta) meta.textContent = '—';
    list.innerHTML = '';
    updateReceiptsHomeBadge();
    return;
  }
  try {
    const data = await api('/receipts');
    receiptsState.list = data.receipts || [];
    updateReceiptsHomeBadge();
    if (meta) meta.textContent = receiptsState.list.length ? `${receiptsState.list.length} سند` : 'لا توجد سندات بعد';
    list.innerHTML = receiptsState.list.map((r) => `
      <article class="inv-order-card">
        <div class="inv-order-card-main">
          <div class="inv-order-card-head">
            <div class="inv-order-card-titles">
              <strong class="inv-order-no" dir="ltr">${esc(r.receiptNo)}</strong>
              <span class="badge ${rvStatusClass(r.status)}">${esc(r.statusLabel)}</span>
            </div>
          </div>
          <p class="inv-order-card-cust">${esc(r.customerName || '—')}</p>
          <div class="inv-order-card-stats">
            <span>مبلغ <strong dir="ltr">${rvFmt(r.amount)}</strong></span>
            ${Number(r.commission) ? `<span>عمولة <strong dir="ltr">${rvFmt(r.commission)}</strong></span>` : ''}
            ${Number(r.discount) ? `<span>حسم <strong dir="ltr">${rvFmt(r.discount)}</strong></span>` : ''}
          </div>
          ${r.notes ? `<p class="inv-order-card-notes">${esc(r.notes)}</p>` : ''}
          ${r.edariJournalNum ? `<p class="muted" dir="ltr">قيد ${esc(r.edariJournalNum)}</p>` : ''}
        </div>
        ${r.status !== 'posted' ? `
        <div class="inv-order-card-actions">
          <button type="button" class="btn danger btn-sm" data-del-receipt="${r.id}">حذف</button>
        </div>` : ''}
      </article>`).join('') || '<div class="empty-state"><p>أرسل سند قبض ليظهر هنا</p></div>';

    list.querySelectorAll('[data-del-receipt]').forEach((btn) => {
      btn.addEventListener('click', () => void deleteMyReceipt(Number(btn.dataset.delReceipt)));
    });
  } catch (err) {
    list.innerHTML = `<div class="empty-state"><p>${esc(err.message)}</p></div>`;
  }
}

async function markHandover(id) {
  const item = receiptsState.deliveries.find((d) => d.id === id);
  if (!item) return;
  if (!confirm(`تأكيد استلام ${rvFmt(item.amount)} د.ع من ${item.agentName || 'المندوب الثانوي'}؟`)) return;
  setOverlay(true);
  try {
    const data = await api(`/delivery-receipts/${id}/handover`, { method: 'POST', body: '{}' });
    const updated = data.deliveryReceipt;
    if (updated) {
      receiptsState.deliveries = receiptsState.deliveries.map((d) => (d.id === id ? updated : d));
    }
    await loadMyDeliveries();
    alert('تم تأكيد استلام المبلغ');
  } catch (err) {
    alert(err.message);
  } finally {
    setOverlay(false);
  }
}

function startReceiptFromDelivery(id) {
  const item = receiptsState.deliveries.find((d) => d.id === id);
  if (!item || !item.canCreateReceipt) return;
  receiptsState.linkedDelivery = item;
  receiptsState.customer = {
    seq: item.customerAccSeq,
    num: item.customerNum,
    name1: item.customerName
  };
  receiptsState.tree = { seq: item.treeAccSeq, name1: item.treeName };
  const amount = document.getElementById('receiptAmount');
  const notes = document.getElementById('receiptNotes');
  if (amount) amount.value = String(item.amount || '');
  if (notes) notes.value = item.notes || '';
  renderReceiptCustomer();
  renderLinkedDeliveryBanner();
  setReceiptsTab('receipt');
  alert('أكمل سند القبض ثم أرسله للوحة التحكم');
}

async function deleteMyDelivery(id) {
  if (!confirm('حذف وصل القبض؟')) return;
  setOverlay(true);
  try {
    await api(`/delivery-receipts/${id}`, { method: 'DELETE' });
    await loadMyDeliveries();
  } catch (err) {
    alert(err.message);
  } finally {
    setOverlay(false);
  }
}

async function deleteMyReceipt(id) {
  if (!confirm('حذف سند القبض؟')) return;
  setOverlay(true);
  try {
    await api(`/receipts/${id}`, { method: 'DELETE' });
    await loadMyReceipts();
  } catch (err) {
    alert(err.message);
  } finally {
    setOverlay(false);
  }
}

async function submitDelivery(e) {
  e.preventDefault();
  if (!receiptsState.deliveryCustomer?.seq) {
    alert('اختر زبوناً من الشجرة أولاً');
    return;
  }
  const amount = Number(document.getElementById('deliveryAmount')?.value || 0);
  if (amount <= 0) {
    alert('أدخل المبلغ');
    return;
  }
  setOverlay(true);
  try {
    await api('/delivery-receipts', {
      method: 'POST',
      body: JSON.stringify({
        customerAccSeq: receiptsState.deliveryCustomer.seq,
        treeAccSeq: receiptsState.deliveryTree?.seq || '',
        treeName: receiptsState.deliveryTree?.name1 || '',
        amount,
        notes: document.getElementById('deliveryNotes')?.value || ''
      })
    });
    resetDeliveryForm();
    await loadMyDeliveries();
    alert('تم إصدار وصل القبض');
  } catch (err) {
    alert(err.message);
  } finally {
    setOverlay(false);
  }
}

async function submitReceipt(e) {
  e.preventDefault();
  if (isSecondaryAgent()) {
    alert('المندوب الثانوي لا يستطيع إنشاء سند قبض');
    return;
  }
  const linked = receiptsState.linkedDelivery;
  const customerSeq = receiptsState.customer?.seq || linked?.customerAccSeq;
  const treeSeq = receiptsState.tree?.seq || linked?.treeAccSeq || '';
  const treeName = receiptsState.tree?.name1 || linked?.treeName || '';
  if (!customerSeq) {
    alert('اختر زبوناً من الشجرة أولاً');
    return;
  }
  const amount = Number(document.getElementById('receiptAmount')?.value || 0);
  if (amount <= 0) {
    alert('أدخل المبلغ');
    return;
  }
  setOverlay(true);
  try {
    await api('/receipts', {
      method: 'POST',
      body: JSON.stringify({
        customerAccSeq: customerSeq,
        treeAccSeq: treeSeq,
        treeName,
        amount,
        commission: Number(document.getElementById('receiptCommission')?.value || 0),
        discount: Number(document.getElementById('receiptDiscount')?.value || 0),
        notes: document.getElementById('receiptNotes')?.value || '',
        deliveryReceiptId: linked?.id || null
      })
    });
    resetReceiptForm();
    await loadMyReceipts();
    await loadMyDeliveries();
    alert('تم إرسال سند القبض للوحة التحكم');
  } catch (err) {
    alert(err.message);
  } finally {
    setOverlay(false);
  }
}

function bindReceiptsUi() {
  document.getElementById('btnReceiptPickCustomer')?.addEventListener('click', () => {
    receiptsState.pickerTarget = 'receipt';
    if (typeof openCustomerPicker === 'function') openCustomerPicker('receipt');
  });
  document.getElementById('btnDeliveryPickCustomer')?.addEventListener('click', () => {
    receiptsState.pickerTarget = 'delivery';
    if (typeof openCustomerPicker === 'function') openCustomerPicker('delivery');
  });
  document.getElementById('receiptForm')?.addEventListener('submit', submitReceipt);
  document.getElementById('deliveryForm')?.addEventListener('submit', submitDelivery);
  document.querySelectorAll('[data-rv-tab]').forEach((btn) => {
    btn.addEventListener('click', () => setReceiptsTab(btn.dataset.rvTab));
  });
}

async function refreshReceiptsData() {
  applyReceiptsRoleUi();
  await Promise.all([loadMyDeliveries(), loadMyReceipts()]);
}

window.receiptsNav = {
  applyScreen(name, { backBtn, toolbarWrap, title, crumb }) {
    if (name !== 'receipts') return false;
    backBtn.classList.remove('hidden');
    toolbarWrap.classList.add('hidden');
    const secondary = isSecondaryAgent();
    title.textContent = secondary ? 'وصل قبض' : 'سند قبض';
    crumb.textContent = secondary
      ? 'إصدار وصل قبض — يُسلّم للرئيسي'
      : 'وصل قبض للزبون · سند قبض للإدارة';
    const kicker = document.getElementById('headerKicker');
    if (kicker) kicker.textContent = secondary ? 'Edari · وصل قبض' : 'Edari · التحصيل';
    applyReceiptsRoleUi();
    return true;
  },
  onScreen(name) {
    if (name === 'receipts') {
      applyReceiptsRoleUi();
      renderReceiptCustomer();
      renderDeliveryCustomer();
      void refreshReceiptsData();
    }
    if (name === 'home') {
      applyReceiptsRoleUi();
      void refreshReceiptsData();
    }
  },
  handleBack() {
    if (state.screen === 'receipts') {
      goToScreen('home');
      return true;
    }
    return false;
  },
  refresh() {
    if (state.screen !== 'receipts' && state.screen !== 'home') return false;
    void refreshReceiptsData();
    return state.screen === 'receipts';
  },
  onLogin() {
    applyReceiptsRoleUi();
  }
};

bindReceiptsUi();
