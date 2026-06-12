/* Mobile commerce v2: inline invoice draft, no cart */
const commerce = {
  branches: [],
  sections: [],
  products: [],
  productFilter: '',
  orders: [],
  selectedBranch: null,
  selectedSection: null,
  draft: {},
  invoiceCustomer: null,
  invoiceNotes: '',
  pickerTree: null,
  pickerBranches: []
};

const STATUS_BADGE = {
  submitted: 'pending',
  under_review: 'pending',
  approved: 'ok',
  rejected: 'danger',
  processing: 'pending',
  delivered: 'ok',
  draft: 'muted',
  cancelled: 'muted'
};

function commerceApi(path, opts = {}) {
  return api(path, opts);
}

function getDraft(productId) {
  const id = Number(productId);
  if (!commerce.draft[id]) commerce.draft[id] = { quant: 0, bonus: 0 };
  return commerce.draft[id];
}

function findProduct(productId) {
  return commerce.products.find((p) => p.id === Number(productId));
}

function invoiceLineCount() {
  return Object.values(commerce.draft).filter((d) => d.quant > 0 || d.bonus > 0).length;
}

function invoiceTotalAmount() {
  let total = 0;
  for (const p of commerce.products) {
    const d = commerce.draft[p.id];
    if (!d?.quant) continue;
    total += d.quant * Number(p.price || 0);
  }
  return total;
}

function buildOrderLines() {
  const lines = [];
  for (const p of commerce.products) {
    const d = commerce.draft[p.id];
    if (!d || (!d.quant && !d.bonus)) continue;
    lines.push({
      productId: p.id,
      barcode: p.barcode || p.skuNum || '',
      matName: p.name,
      quant: d.quant || 0,
      bonus: d.bonus || 0,
      unitPrice: Number(p.price || 0),
      lineTotal: (d.quant || 0) * Number(p.price || 0)
    });
  }
  return lines;
}

function adjustDraft(productId, field, delta) {
  const d = getDraft(productId);
  const key = field === 'bonus' ? 'bonus' : 'quant';
  d[key] = Math.max(0, Number(d[key] || 0) + Number(delta || 0));
  syncProductRow(productId);
  updateInvoiceDock();
  if (!document.getElementById('invoiceOverlay')?.classList.contains('hidden')) {
    renderInvoiceSheet();
  }
}

function syncProductRow(productId) {
  const row = document.querySelector(`[data-product-id="${productId}"]`);
  if (!row) return;
  const d = getDraft(productId);
  const qEl = row.querySelector('[data-draft-q]');
  const bEl = row.querySelector('[data-draft-b]');
  if (qEl) qEl.textContent = String(d.quant || 0);
  if (bEl) bEl.textContent = String(d.bonus || 0);
  row.classList.toggle('inv-product-active', (d.quant || 0) > 0 || (d.bonus || 0) > 0);
}

function updateInvoiceDock() {
  const dock = document.getElementById('invoiceDock');
  const count = invoiceLineCount();
  const total = invoiceTotalAmount();
  if (dock) dock.classList.toggle('hidden', count === 0);
  const countEl = document.getElementById('invoiceDockCount');
  const totalEl = document.getElementById('invoiceDockTotal');
  if (countEl) countEl.textContent = `${count} ${count === 1 ? 'بند' : 'بنود'}`;
  if (totalEl) totalEl.textContent = fmtMoney(total);
}

function clearInvoiceDraft({ resetNotes = true } = {}) {
  commerce.draft = {};
  if (resetNotes) {
    commerce.invoiceNotes = '';
    const notesEl = document.getElementById('invoiceNotes');
    if (notesEl) notesEl.value = '';
  }
  document.querySelectorAll('.inv-product-card').forEach((row) => {
    row.classList.remove('inv-product-active');
    const qEl = row.querySelector('[data-draft-q]');
    const bEl = row.querySelector('[data-draft-b]');
    if (qEl) qEl.textContent = '0';
    if (bEl) bEl.textContent = '0';
  });
  updateInvoiceDock();
  renderInvoiceSheet();
}

function renderStepper(productId, field, value) {
  const label = field === 'bonus' ? 'هدايا مجانية' : 'الكمية';
  const giftClass = field === 'bonus' ? ' inv-stepper-gift' : '';
  return `
    <div class="inv-stepper-block${giftClass}">
      <span class="inv-stepper-label">${field === 'bonus' ? '🎁 ' : ''}${label}</span>
      <div class="inv-stepper">
        <button type="button" class="inv-step-btn" data-draft-action data-product-id="${productId}" data-field="${field}" data-delta="-1" aria-label="تقليل">−</button>
        <span class="inv-step-val" dir="ltr" data-draft-${field === 'bonus' ? 'b' : 'q'}>${value}</span>
        <button type="button" class="inv-step-btn" data-draft-action data-product-id="${productId}" data-field="${field}" data-delta="1" aria-label="زيادة">+</button>
      </div>
    </div>`;
}

function productImageSrc(p) {
  if (!p?.imageUrl) return '';
  if (String(p.imageUrl).startsWith('http')) return p.imageUrl;
  return `${window.location.origin}${p.imageUrl}`;
}

function renderProductCard(p) {
  const d = getDraft(p.id);
  const active = d.quant > 0 || d.bonus > 0;
  const stock = Number(p.minOrderQty ?? 0);
  const img = productImageSrc(p);
  return `
    <article class="inv-product-card${active ? ' inv-product-active' : ''}" data-product-id="${p.id}">
      <div class="inv-product-top">
        <div class="inv-product-media">
          ${img
    ? `<img src="${img}" alt="" class="inv-product-img">`
    : '<span class="inv-product-img inv-product-img-empty">📦</span>'}
        </div>
        <div class="inv-product-copy">
          <h4 class="inv-product-name">${esc(p.name)}</h4>
          <p class="inv-product-barcode" dir="ltr">${esc(p.barcode || p.skuNum || '—')}</p>
          <div class="inv-product-meta-row">
            <span class="inv-product-price" dir="ltr">${fmtMoney(p.price)}</span>
            ${stock > 0 ? `<span class="inv-stock-badge">رصيد ${fmtNumAlways(stock)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="inv-product-controls">
        ${renderStepper(p.id, 'quant', d.quant || 0)}
        ${renderStepper(p.id, 'bonus', d.bonus || 0)}
      </div>
    </article>`;
}

function filteredProducts() {
  const q = commerce.productFilter.trim().toLowerCase();
  if (!q) return commerce.products;
  return commerce.products.filter((p) => {
    const hay = `${p.name} ${p.barcode} ${p.skuNum}`.toLowerCase();
    return hay.includes(q);
  });
}

function renderProductsList() {
  const list = document.getElementById('shopProductsList');
  if (!list) return;
  const items = filteredProducts();
  list.innerHTML = items.map(renderProductCard).join('')
    || '<div class="empty-state"><p>لا توجد منتجات مطابقة</p></div>';
  updateInvoiceDock();
}

async function loadShopBranches() {
  setOverlay(true);
  try {
    const data = await commerceApi('/catalog/branches');
    commerce.branches = data.branches || [];
    document.getElementById('shopBranchesMeta').textContent = commerce.branches.length
      ? `${commerce.branches.length} فرع متاح للطلب`
      : 'لا توجد فروع — اطلب من الإدارة إعداد الكatalog';
    document.getElementById('shopBranchesList').innerHTML = commerce.branches.map((b, i) => `
      <button type="button" class="inv-shop-card inv-shop-card-branch" data-shop-branch="${b.id}" style="--delay:${i * 40}ms">
        <span class="inv-shop-icon">🏪</span>
        <span class="inv-shop-copy">
          <strong>${esc(b.name)}</strong>
          <span class="inv-shop-hint">اضغط لعرض الأقسام</span>
        </span>
        ${ICONS.chevron}
      </button>`).join('') || '<div class="empty-state"><p>لا توجد فروع منتجات</p></div>';

    document.querySelectorAll('[data-shop-branch]').forEach((btn) => {
      btn.addEventListener('click', () => {
        commerce.selectedBranch = commerce.branches.find((x) => x.id === Number(btn.dataset.shopBranch));
        openShopSections();
      });
    });
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

async function openShopSections() {
  if (!commerce.selectedBranch) return goToScreen('shop');
  setOverlay(true);
  try {
    const data = await commerceApi(`/catalog/branches/${commerce.selectedBranch.id}/sections`);
    commerce.sections = data.sections || [];
    document.getElementById('shopSectionsMeta').textContent = `${esc(commerce.selectedBranch.name)} · ${commerce.sections.length} قسم`;
    document.getElementById('shopSectionsList').innerHTML = commerce.sections.map((s, i) => `
      <button type="button" class="inv-shop-card inv-shop-card-section" data-shop-section="${s.id}" style="--delay:${i * 40}ms">
        <span class="inv-shop-icon">📁</span>
        <span class="inv-shop-copy">
          <strong>${esc(s.name)}</strong>
          <span class="inv-shop-hint">عرض المنتجات والفاتورة</span>
        </span>
        ${ICONS.chevron}
      </button>`).join('') || '<div class="empty-state"><p>لا توجد أقسام</p></div>';

    document.querySelectorAll('[data-shop-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        commerce.selectedSection = commerce.sections.find((x) => x.id === Number(btn.dataset.shopSection));
        openShopProducts();
      });
    });
    goToScreen('shop-sections');
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

async function openShopProducts() {
  if (!commerce.selectedSection) return openShopSections();
  setOverlay(true);
  try {
    const data = await commerceApi(`/catalog/sections/${commerce.selectedSection.id}/products`);
    commerce.products = data.products || [];
    commerce.productFilter = '';
    const searchEl = document.getElementById('shopProductSearch');
    if (searchEl) searchEl.value = '';
    const branchName = commerce.selectedBranch?.name || '';
    const sectionName = commerce.selectedSection?.name || '';
    document.getElementById('shopProductsMeta').textContent =
      `${branchName} · ${sectionName} · ${commerce.products.length} منتج`;
    renderProductsList();
    goToScreen('shop-products');
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

function renderInvoiceCustomer() {
  const card = document.getElementById('invoiceCustomerCard');
  const empty = document.getElementById('invoiceCustomerEmpty');
  const c = commerce.invoiceCustomer;
  if (!card || !empty) return;
  if (c?.seq) {
    card.classList.remove('hidden');
    empty.classList.add('hidden');
    card.innerHTML = `
      <div class="inv-customer-main">
        <strong>${esc(c.name1)}</strong>
        <span dir="ltr">${esc(c.num || '')}</span>
      </div>
      ${c.treeName ? `<p class="muted">${esc(c.treeName)}</p>` : ''}`;
  } else {
    card.classList.add('hidden');
    empty.classList.remove('hidden');
  }
}

function renderInvoiceLines() {
  const el = document.getElementById('invoiceLines');
  if (!el) return;
  const lines = buildOrderLines();
  if (!lines.length) {
    el.innerHTML = '<div class="empty-state inv-empty-lines"><p>لا توجد بنود — استخدم + بجانب المنتجات</p></div>';
    return;
  }
  el.innerHTML = lines.map((l) => `
      <div class="inv-invoice-line" data-line-product="${l.productId}">
        <div class="inv-invoice-line-info">
          <strong>${esc(l.matName)}</strong>
          <span class="muted" dir="ltr">${esc(l.barcode)}</span>
          <div class="inv-invoice-line-tags">
            ${l.quant ? `<span class="inv-tag">كمية ${l.quant}</span>` : ''}
            ${l.bonus ? `<span class="inv-tag inv-tag-gift">🎁 ${l.bonus}</span>` : ''}
          </div>
        </div>
        <div class="inv-invoice-line-side">
          <div class="inv-mini-steppers">
            <div class="inv-mini-stepper">
              <button type="button" class="inv-step-btn inv-step-btn-sm" data-invoice-action data-product-id="${l.productId}" data-field="quant" data-delta="-1">−</button>
              <span dir="ltr">${l.quant}</span>
              <button type="button" class="inv-step-btn inv-step-btn-sm" data-invoice-action data-product-id="${l.productId}" data-field="quant" data-delta="1">+</button>
            </div>
            <div class="inv-mini-stepper inv-mini-gift">
              <span class="inv-mini-label">🎁</span>
              <button type="button" class="inv-step-btn inv-step-btn-sm" data-invoice-action data-product-id="${l.productId}" data-field="bonus" data-delta="-1">−</button>
              <span dir="ltr">${l.bonus}</span>
              <button type="button" class="inv-step-btn inv-step-btn-sm" data-invoice-action data-product-id="${l.productId}" data-field="bonus" data-delta="1">+</button>
            </div>
          </div>
          <div class="inv-invoice-line-price" dir="ltr">${fmtMoney(l.lineTotal)}</div>
        </div>
      </div>`).join('');
}

function renderInvoiceSheet() {
  renderInvoiceCustomer();
  renderInvoiceLines();
  const count = invoiceLineCount();
  const total = invoiceTotalAmount();
  document.getElementById('invoiceLineCount')?.replaceChildren(document.createTextNode(String(count)));
  document.getElementById('invoiceSheetTotal')?.replaceChildren(document.createTextNode(fmtMoney(total)));
  updateInvoiceDock();
}

function openInvoiceSheet() {
  if (!invoiceLineCount()) return alert('أضف منتجات للفاتورة أولاً');
  renderInvoiceSheet();
  document.getElementById('invoiceOverlay')?.classList.remove('hidden');
  document.body.classList.add('inv-sheet-open');
}

function closeInvoiceSheet() {
  document.getElementById('invoiceOverlay')?.classList.add('hidden');
  document.body.classList.remove('inv-sheet-open');
}

async function submitInvoice() {
  const lines = buildOrderLines();
  if (!lines.length) return alert('الفاتورة فارغة');
  if (!commerce.invoiceCustomer?.seq) return alert('اختر زبوناً من الكشوفات');
  if (!commerce.selectedBranch?.id) return alert('اختر فرع منتجات');

  const btn = document.getElementById('btnSubmitInvoice');
  btn.disabled = true;
  try {
    const data = await commerceApi('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerAccSeq: commerce.invoiceCustomer.seq,
        catalogBranchId: commerce.selectedBranch.id,
        notes: document.getElementById('invoiceNotes')?.value?.trim() || '',
        lines,
        submit: true
      })
    });
    clearInvoiceDraft({ resetNotes: true });
    closeInvoiceSheet();
    alert(`تم إرسال الطلب ${data.order?.orderNo || ''} إلى لوحة التحكم`);
    goToScreen('my-orders');
    await loadMyOrders();
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
  }
}

function confirmClearInvoice() {
  if (!invoiceLineCount()) return;
  if (!confirm('تفريغ الفاتورة وإعادة الأعداد إلى صفر؟')) return;
  clearInvoiceDraft({ resetNotes: false });
}

async function openCustomerPicker() {
  commerce.pickerTree = null;
  commerce.pickerBranches = [];
  document.getElementById('customerPickerTitle').textContent = 'اختر الشجرة';
  document.getElementById('customerPickerCrumb').textContent = 'الفروع من كشوف الحساب — نفس الزبائن في الكشوفات';
  document.getElementById('customerOverlay')?.classList.remove('hidden');
  await renderCustomerTrees();
}

function closeCustomerPicker() {
  document.getElementById('customerOverlay')?.classList.add('hidden');
}

async function renderCustomerTrees() {
  const list = document.getElementById('customerPickerList');
  list.innerHTML = '<p class="muted">جاري التحميل...</p>';
  try {
    if (!state.trees?.length) {
      const data = await commerceApi('/trees');
      state.trees = data.trees || [];
    }
    const trees = state.trees || [];
    if (!trees.length) {
      list.innerHTML = '<div class="empty-state"><p>لا توجد شجرات متاحة</p></div>';
      return;
    }
    document.getElementById('customerPickerTitle').textContent = 'اختر الشجرة';
    list.innerHTML = trees.map((t) => `
      <button type="button" class="inv-picker-item" data-pick-tree="${esc(t.seq)}">
        <span class="inv-picker-icon">${ICONS.tree}</span>
        <span class="inv-picker-copy">
          <strong>${esc(t.name1 || t.name || 'شجرة')}</strong>
          <span dir="ltr">${esc(t.num || t.seq)}</span>
        </span>
        ${ICONS.chevron}
      </button>`).join('');
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
  }
}

async function openCustomerTreeBranches(seq) {
  commerce.pickerTree = state.trees.find((t) => String(t.seq) === String(seq)) || { seq };
  document.getElementById('customerPickerTitle').textContent = 'اختر الزبون (الفرع)';
  document.getElementById('customerPickerCrumb').textContent =
    `شجرة: ${commerce.pickerTree.name1 || commerce.pickerTree.seq}`;
  const list = document.getElementById('customerPickerList');
  list.innerHTML = '<p class="muted">جاري التحميل...</p>';
  try {
    const data = await commerceApi(`/accounts/${encodeURIComponent(seq)}/children`);
    commerce.pickerBranches = data.children || [];
    if (!commerce.pickerBranches.length) {
      list.innerHTML = '<div class="empty-state"><p>لا توجد فروع في هذه الشجرة</p></div>';
      return;
    }
    list.innerHTML = commerce.pickerBranches.map((b) => `
      <button type="button" class="inv-picker-item" data-pick-customer="${esc(b.seq)}">
        <span class="inv-picker-icon">${ICONS.branch}</span>
        <span class="inv-picker-copy">
          <strong>${esc(b.name1)}</strong>
          <span dir="ltr">${esc(b.num)}</span>
        </span>
      </button>`).join('');
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
  }
}

function selectInvoiceCustomer(branch) {
  commerce.invoiceCustomer = {
    seq: branch.seq,
    num: branch.num,
    name1: branch.name1,
    treeName: commerce.pickerTree?.name1 || ''
  };
  closeCustomerPicker();
  renderInvoiceCustomer();
}

async function loadMyOrders() {
  setOverlay(true);
  try {
    const data = await commerceApi('/orders');
    commerce.orders = data.orders || [];
    document.getElementById('myOrdersMeta').textContent = commerce.orders.length
      ? `${commerce.orders.length} طلب مرسل`
      : 'لا توجد طلبات بعد';
    document.getElementById('myOrdersList').innerHTML = commerce.orders.map((o) => `
      <button type="button" class="inv-order-card" data-order-id="${o.id}">
        <div class="inv-order-card-head">
          <div>
            <strong class="inv-order-no" dir="ltr">${esc(o.orderNo)}</strong>
            <p class="inv-order-customer">${esc(o.customerName || '—')}</p>
          </div>
          <span class="badge ${STATUS_BADGE[o.status] || 'pending'}">${esc(o.statusLabel)}</span>
        </div>
        <div class="inv-order-card-foot">
          <span dir="ltr">${fmtMoney(o.totalAmount)}</span>
          <span>${o.lines?.length || 0} بند · ${esc((o.submittedAt || o.createdAt || '').slice(0, 16).replace('T', ' '))}</span>
        </div>
      </button>`).join('') || '<div class="empty-state"><p>لا توجد طلبات</p></div>';

    document.querySelectorAll('[data-order-id]').forEach((btn) => {
      btn.addEventListener('click', () => openOrderDetail(Number(btn.dataset.orderId)));
    });
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

async function openOrderDetail(id) {
  setOverlay(true);
  try {
    const data = await commerceApi(`/orders/${id}`);
    const o = data.order;
    document.getElementById('orderDetailSheet').innerHTML = `
      <div class="inv-order-detail-head">
        <p class="inv-order-no" dir="ltr">${esc(o.orderNo)}</p>
        <span class="badge ${STATUS_BADGE[o.status] || 'pending'}">${esc(o.statusLabel)}</span>
        <h3>${esc(o.customerName || '—')}</h3>
        <p class="muted">${esc(o.catalogBranchName || '')} · ${esc((o.submittedAt || o.createdAt || '').slice(0, 16).replace('T', ' '))}</p>
      </div>
      <div class="inv-order-detail-lines">
        ${(o.lines || []).map((l) => `
          <div class="inv-invoice-line inv-invoice-line-readonly">
            <div class="inv-invoice-line-info">
              <strong>${esc(l.matName)}</strong>
              <span class="muted" dir="ltr">${esc(l.barcode)}</span>
              <div class="inv-invoice-line-tags">
                ${l.quant ? `<span class="inv-tag">كمية ${l.quant}</span>` : ''}
                ${l.bonus ? `<span class="inv-tag inv-tag-gift">🎁 ${l.bonus}</span>` : ''}
              </div>
            </div>
            <div class="inv-invoice-line-price" dir="ltr">${fmtMoney(l.lineTotal)}</div>
          </div>`).join('')}
      </div>
      ${o.notes ? `<div class="inv-order-notes"><strong>ملاحظات:</strong> ${esc(o.notes)}</div>` : ''}
      <div class="inv-sheet-total inv-order-detail-total">
        <span>الإجمالي</span>
        <strong dir="ltr">${fmtMoney(o.totalAmount)}</strong>
      </div>`;
    goToScreen('order-detail');
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

window.commerceNav = {
  isCommerceRoot(name) {
    return ['shop', 'my-orders'].includes(name);
  },

  applyScreen(name, { backBtn, toolbarWrap, title, crumb }) {
    backBtn.classList.remove('hidden');
    toolbarWrap.classList.add('hidden');
    const kicker = document.getElementById('headerKicker');

    if (name === 'shop') {
      title.textContent = 'المنتجات';
      crumb.textContent = 'فاتورة مباشرة · اختر فرعاً';
      if (kicker) kicker.textContent = 'Edari · الطلبات';
    } else if (name === 'shop-sections') {
      title.textContent = commerce.selectedBranch?.name || 'الأقسام';
      crumb.textContent = 'اختر قسماً';
      if (kicker) kicker.textContent = 'Edari · الأقسام';
    } else if (name === 'shop-products') {
      title.textContent = commerce.selectedSection?.name || 'المنتجات';
      crumb.textContent = `${commerce.selectedBranch?.name || ''} · فاتورة مباشرة`;
      if (kicker) kicker.textContent = 'Edari · المنتجات';
    } else if (name === 'my-orders') {
      title.textContent = 'طلباتي';
      crumb.textContent = 'طلبات مرسلة للوحة التحكم';
      if (kicker) kicker.textContent = 'Edari · الطلبات';
    } else if (name === 'order-detail') {
      title.textContent = 'تفاصيل الطلب';
      crumb.textContent = '';
      if (kicker) kicker.textContent = 'Edari · الطلب';
    }
  },

  onScreen(name) {
    if (name === 'shop') void loadShopBranches();
    if (name === 'my-orders') void loadMyOrders();
    if (name === 'shop-products') updateInvoiceDock();
  },

  handleBack() {
    if (document.getElementById('customerOverlay') && !document.getElementById('customerOverlay').classList.contains('hidden')) {
      if (commerce.pickerTree) {
        commerce.pickerTree = null;
        void renderCustomerTrees();
        return true;
      }
      closeCustomerPicker();
      return true;
    }
    if (document.getElementById('invoiceOverlay') && !document.getElementById('invoiceOverlay').classList.contains('hidden')) {
      closeInvoiceSheet();
      return true;
    }
    if (state.screen === 'order-detail') {
      goToScreen('my-orders');
      return true;
    }
    if (state.screen === 'shop-products') {
      openShopSections();
      return true;
    }
    if (state.screen === 'shop-sections') {
      goToScreen('shop');
      return true;
    }
    if (state.screen === 'shop' || state.screen === 'my-orders') {
      goToScreen('home');
      return true;
    }
    return false;
  },

  refresh() {
    if (state.screen === 'shop') {
      void loadShopBranches();
      return true;
    }
    if (state.screen === 'shop-sections') {
      void openShopSections();
      return true;
    }
    if (state.screen === 'shop-products') {
      void openShopProducts();
      return true;
    }
    if (state.screen === 'my-orders') {
      void loadMyOrders();
      return true;
    }
    return false;
  }
};

function initCommerceMobile() {
  document.getElementById('shopProductsList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-draft-action]');
    if (!btn) return;
    adjustDraft(btn.dataset.productId, btn.dataset.field, Number(btn.dataset.delta));
  });

  document.getElementById('invoiceLines')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-invoice-action]');
    if (!btn) return;
    adjustDraft(btn.dataset.productId, btn.dataset.field, Number(btn.dataset.delta));
  });

  document.getElementById('shopProductSearch')?.addEventListener('input', (e) => {
    commerce.productFilter = e.target.value || '';
    renderProductsList();
  });

  document.getElementById('btnOpenInvoice')?.addEventListener('click', openInvoiceSheet);
  document.getElementById('btnCloseInvoice')?.addEventListener('click', closeInvoiceSheet);
  document.getElementById('btnSubmitInvoice')?.addEventListener('click', () => submitInvoice());
  document.getElementById('btnClearInvoice')?.addEventListener('click', confirmClearInvoice);
  document.getElementById('btnPickCustomer')?.addEventListener('click', () => openCustomerPicker());
  document.getElementById('btnCloseCustomer')?.addEventListener('click', closeCustomerPicker);

  document.getElementById('customerPickerList')?.addEventListener('click', (e) => {
    const treeBtn = e.target.closest('[data-pick-tree]');
    if (treeBtn) {
      void openCustomerTreeBranches(treeBtn.dataset.pickTree);
      return;
    }
    const custBtn = e.target.closest('[data-pick-customer]');
    if (custBtn) {
      const branch = commerce.pickerBranches.find((b) => String(b.seq) === custBtn.dataset.pickCustomer);
      if (branch) selectInvoiceCustomer(branch);
    }
  });

  document.getElementById('invoiceOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'invoiceOverlay') closeInvoiceSheet();
  });

  document.getElementById('customerOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'customerOverlay') closeCustomerPicker();
  });

  if (state.selectedBranch?.seq && !commerce.invoiceCustomer) {
    commerce.invoiceCustomer = {
      seq: state.selectedBranch.seq,
      num: state.selectedBranch.num,
      name1: state.selectedBranch.name1,
      treeName: state.selectedTree?.name1 || ''
    };
  }
}

initCommerceMobile();
