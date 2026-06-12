/* Admin: invoices, catalog, orders */
const PRODUCT_PAGE_SIZE = 50;

const commerce = {
  branches: [],
  sections: [],
  allSections: [],
  products: [],
  productTotal: 0,
  productOffset: 0,
  selectedBranchId: null,
  selectedSectionId: null,
  selectedProductIds: new Set(),
  selectedInvoice: null,
  selectedOrder: null,
  productFilters: {
    q: '',
    active: '',
    noImage: '',
    sortBy: 'sort_order',
    showAllSections: false
  }
};

function showToast(msg, type = 'ok') {
  const el = document.getElementById('adminToast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast toast-${type}`;
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), 3200);
}

function commerceApi(path, opts = {}) {
  return api(`/api/admin${path}`, opts);
}

function fmtMoney(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

async function loadInvoicesPage() {
  const q = document.getElementById('invoiceSearch')?.value?.trim() || '';
  const data = await commerceApi(`/invoices?q=${encodeURIComponent(q)}&limit=100`);
  const stats = await commerceApi('/invoices/stats');
  const statsEl = document.getElementById('invoiceStats');
  if (statsEl && stats.stats) {
    statsEl.innerHTML = `
      <div class="stat-card"><div class="k">إجمالي الفواتير</div><div class="v">${fmtNumAlways(stats.stats.total)}</div></div>
      <div class="stat-card"><div class="k">اليوم</div><div class="v">${fmtNumAlways(stats.stats.todayCount)}</div></div>
      <div class="stat-card"><div class="k">هذا الأسبوع</div><div class="v">${fmtNumAlways(stats.stats.weekCount)}</div></div>`;
  }
  document.getElementById('invoicesBody').innerHTML = (data.invoices || []).map((inv) => `
    <tr>
      <td dir="ltr">${esc(inv.num)}</td>
      <td>${esc(inv.date || '—')}</td>
      <td>${esc(inv.accountName || '—')}</td>
      <td>${esc(inv.kindLabel)}</td>
      <td dir="ltr">${fmtMoney(inv.total)}</td>
      <td dir="ltr">${inv.lineCount}</td>
      <td>
        <button type="button" class="btn btn-soft btn-sm" data-inv-view="${esc(inv.seq)}">عرض</button>
        <a class="btn btn-soft btn-sm" href="${getApiBase()}/api/admin/invoices/${encodeURIComponent(inv.seq)}.pdf" target="_blank">PDF</a>
      </td>
    </tr>`).join('') || '<tr><td colspan="7">لا توجد فواتير — نفّذ مزامنة أولاً</td></tr>';

  document.querySelectorAll('[data-inv-view]').forEach((btn) => {
    btn.addEventListener('click', () => openAdminInvoice(btn.dataset.invView));
  });
}

async function openAdminInvoice(seq) {
  const panel = document.getElementById('invoiceDetailPanel');
  panel.classList.remove('hidden');
  panel.innerHTML = '<p class="muted">جاري التحميل...</p>';
  const data = await commerceApi(`/invoices/${encodeURIComponent(seq)}`);
  commerce.selectedInvoice = data.invoice;
  const lines = data.lines || [];
  panel.innerHTML = `
    <div class="panel-head">
      <h3>فاتورة ${esc(data.invoice.num)} · ${esc(data.invoice.date)}</h3>
      <button type="button" class="btn btn-soft btn-sm" id="btnCloseInvoiceDetail">إغلاق</button>
    </div>
    <p><strong>${esc(data.invoice.accountName)}</strong> · ${esc(data.invoice.kindLabel)}</p>
    <p class="muted">${lines.length} بند · إجمالي ${fmtMoney(data.invoice.total)} · صافي ${fmtMoney(data.invoice.netPay)}</p>
    <div class="table-scroll">
      <table class="data-table compact">
        <thead><tr><th>الباركود</th><th>المادة</th><th>كمية</th><th>هدية</th><th>سعر</th><th>مبلغ</th></tr></thead>
        <tbody>${lines.map((l, i) => `
          <tr>
            <td dir="ltr">${esc(l.matNum || l.mat)}</td>
            <td>${esc(l.matName)}</td>
            <td dir="ltr">${l.quant}</td>
            <td dir="ltr">${l.bonus || 0}</td>
            <td dir="ltr">${fmtMoney(l.price)}</td>
            <td dir="ltr">${fmtMoney(l.lineTotal)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
  document.getElementById('btnCloseInvoiceDetail')?.addEventListener('click', () => {
    panel.classList.add('hidden');
  });
}

async function loadCatalogPage() {
  const data = await commerceApi('/catalog/branches');
  commerce.branches = data.branches || [];
  if (!commerce.selectedBranchId && commerce.branches.length) {
    commerce.selectedBranchId = commerce.branches[0].id;
  }
  renderCatalogBranches();
  await loadAllSectionsForBranch();
  await loadCatalogSections();
}

function renderCatalogBranches() {
  const el = document.getElementById('catalogBranchesList');
  if (!el) return;
  el.innerHTML = commerce.branches.map((b) => `
    <div class="tree-pick-wrap ${commerce.selectedBranchId === b.id ? 'active' : ''}">
      <button type="button" class="tree-pick ${commerce.selectedBranchId === b.id ? 'active' : ''}" data-branch-id="${b.id}">
        <div class="tree-pick-body">
          <div class="tree-pick-name">${esc(b.name)}</div>
          <div class="tree-pick-meta">${b.isActive ? 'نشط' : 'موقوف'}</div>
        </div>
      </button>
      <button type="button" class="btn btn-icon btn-tree-edit" data-edit-branch="${b.id}" title="تعديل">✎</button>
    </div>`).join('') || '<p class="muted">لا توجد فروع</p>';

  el.querySelectorAll('[data-branch-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      commerce.selectedBranchId = Number(btn.dataset.branchId);
      commerce.productOffset = 0;
      renderCatalogBranches();
      await loadCatalogSections();
    });
  });
  el.querySelectorAll('[data-edit-branch]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCatalogEdit('branch', Number(btn.dataset.editBranch));
    });
  });
}

async function loadCatalogSections() {
  if (!commerce.selectedBranchId) return;
  const data = await commerceApi(`/catalog/branches/${commerce.selectedBranchId}/sections`);
  commerce.sections = data.sections || [];
  if (!commerce.selectedSectionId && commerce.sections.length) {
    commerce.selectedSectionId = commerce.sections[0].id;
  } else if (commerce.selectedSectionId && !commerce.sections.some((s) => s.id === commerce.selectedSectionId)) {
    commerce.selectedSectionId = commerce.sections[0]?.id || null;
  }
  const el = document.getElementById('catalogSectionsList');
  el.innerHTML = commerce.sections.map((s) => `
    <div class="tree-pick-wrap ${commerce.selectedSectionId === s.id ? 'active' : ''}">
      <button type="button" class="tree-pick ${commerce.selectedSectionId === s.id ? 'active' : ''}" data-section-id="${s.id}">
        <div class="tree-pick-body"><div class="tree-pick-name">${esc(s.name)}</div></div>
      </button>
      <button type="button" class="btn btn-icon btn-tree-edit" data-edit-section="${s.id}" title="تعديل">✎</button>
    </div>`).join('') || '<p class="muted">لا توجد أقسام</p>';

  el.querySelectorAll('[data-section-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      commerce.selectedSectionId = Number(btn.dataset.sectionId);
      commerce.productOffset = 0;
      commerce.productFilters.showAllSections = false;
      document.getElementById('productShowAllSections').checked = false;
      await loadCatalogSections();
    });
  });
  el.querySelectorAll('[data-edit-section]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCatalogEdit('section', Number(btn.dataset.editSection));
    });
  });
  await loadAllSectionsForBranch();
  await loadCatalogProducts();
}

async function loadAllSectionsForBranch() {
  commerce.allSections = [];
  for (const branch of commerce.branches) {
    const data = await commerceApi(`/catalog/branches/${branch.id}/sections`);
    for (const s of data.sections || []) {
      commerce.allSections.push({ ...s, branchId: branch.id, branchName: branch.name });
    }
  }
}

function buildProductQuery() {
  const f = commerce.productFilters;
  const params = new URLSearchParams();
  const dragMode = canDragReorderProducts();
  if (!f.showAllSections && commerce.selectedSectionId) {
    params.set('sectionId', commerce.selectedSectionId);
  } else if (commerce.selectedBranchId) {
    params.set('branchId', commerce.selectedBranchId);
  }
  if (f.q) params.set('q', f.q);
  if (f.active === '1') params.set('active', '1');
  if (f.active === '0') params.set('active', '0');
  if (f.noImage === 'no') params.set('noImage', '1');
  if (f.sortBy) params.set('sortBy', f.sortBy);
  params.set('limit', dragMode ? '500' : String(PRODUCT_PAGE_SIZE));
  params.set('offset', dragMode ? '0' : String(commerce.productOffset));
  return params.toString();
}

function canDragReorderProducts() {
  return !commerce.productFilters.showAllSections
    && !!commerce.selectedSectionId
    && commerce.productFilters.sortBy === 'sort_order'
    && !commerce.productFilters.q;
}

function renderProductPagination() {
  const el = document.getElementById('productPagination');
  if (!el) return;
  if (canDragReorderProducts()) {
    el.innerHTML = '';
    return;
  }
  const total = commerce.productTotal;
  const pages = Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE));
  const page = Math.floor(commerce.productOffset / PRODUCT_PAGE_SIZE) + 1;
  if (total <= PRODUCT_PAGE_SIZE) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `
    <button type="button" class="btn btn-soft btn-sm" id="productPagePrev" ${page <= 1 ? 'disabled' : ''}>السابق</button>
    <span class="muted">صفحة ${page} / ${pages}</span>
    <button type="button" class="btn btn-soft btn-sm" id="productPageNext" ${page >= pages ? 'disabled' : ''}>التالي</button>`;
  document.getElementById('productPagePrev')?.addEventListener('click', async () => {
    commerce.productOffset = Math.max(0, commerce.productOffset - PRODUCT_PAGE_SIZE);
    await loadCatalogProducts();
  });
  document.getElementById('productPageNext')?.addEventListener('click', async () => {
    if (commerce.productOffset + PRODUCT_PAGE_SIZE < total) {
      commerce.productOffset += PRODUCT_PAGE_SIZE;
      await loadCatalogProducts();
    }
  });
}

async function loadProductStats() {
  const f = commerce.productFilters;
  const params = new URLSearchParams();
  if (!f.showAllSections && commerce.selectedSectionId) {
    params.set('sectionId', commerce.selectedSectionId);
  } else if (commerce.selectedBranchId) {
    params.set('branchId', commerce.selectedBranchId);
  }
  try {
    const [data, edari] = await Promise.all([
      commerceApi(`/products/stats?${params}`),
      commerceApi('/products/edari-stats').catch(() => ({ stats: {} }))
    ]);
    const s = data.stats || {};
    const em = edari.stats || {};
    const el = document.getElementById('productStatsRow');
    if (!el) return;
    el.innerHTML = `
      <div class="stat-card stat-mini"><div class="k">في الكتalog</div><div class="v">${fmtNumAlways(s.total)}</div></div>
      <div class="stat-card stat-mini"><div class="k">نشط</div><div class="v">${fmtNumAlways(s.active)}</div></div>
      <div class="stat-card stat-mini"><div class="k">أصناف Edari</div><div class="v">${fmtNumAlways(em.total)}</div></div>
      <div class="stat-card stat-mini"><div class="k">بدون صورة</div><div class="v">${fmtNumAlways(s.withoutImage)}</div></div>
      <div class="stat-card stat-mini"><div class="k">سعر يدوي</div><div class="v">${fmtNumAlways(s.priceOverride)}</div></div>`;
  } catch { /* ignore */ }
}

function renderProductBadges(p) {
  const badges = [];
  if (p.edariSeq) badges.push('<span class="badge ok">Edari</span>');
  if (!p.isActive) badges.push('<span class="badge err">موقوف</span>');
  if (p.priceOverride) badges.push('<span class="badge warn">سعر يدوي</span>');
  if (!p.imageUrl) badges.push('<span class="badge muted-badge">بدون صورة</span>');
  return badges.join(' ');
}

function updateBulkBar() {
  const bar = document.getElementById('productBulkBar');
  const count = commerce.selectedProductIds.size;
  if (!bar) return;
  bar.classList.toggle('hidden', count === 0);
  const countEl = document.getElementById('productBulkCount');
  if (countEl) countEl.textContent = `${count} محدد`;
}

async function loadCatalogProducts() {
  if (!commerce.selectedSectionId && !commerce.selectedBranchId) return;
  commerce.selectedProductIds.clear();
  updateBulkBar();
  document.getElementById('productSelectAll').checked = false;

  const qs = buildProductQuery();
  const data = await commerceApi(`/products?${qs}`);
  commerce.products = data.products || [];
  commerce.productTotal = data.total || commerce.products.length;

  const dragEnabled = canDragReorderProducts();
  document.getElementById('productDragHint')?.classList.toggle('hidden', !dragEnabled);

  document.getElementById('catalogProductsBody').innerHTML = commerce.products.map((p) => `
    <tr data-product-id="${p.id}" ${dragEnabled ? 'draggable="true"' : ''} class="${dragEnabled ? 'product-draggable' : ''}">
      <td class="col-check"><input type="checkbox" class="product-check" data-id="${p.id}"></td>
      <td class="col-drag">${dragEnabled ? '<span class="drag-handle" title="اسحب">⠿</span>' : ''}</td>
      <td>${p.imageUrl ? `<img src="${getApiBase()}${p.imageUrl}" alt="" class="product-thumb">` : '<span class="product-thumb-empty">—</span>'}</td>
      <td dir="ltr">${esc(p.barcode || p.skuNum || '—')}</td>
      <td>
        <strong>${esc(p.name)}</strong>
        ${commerce.productFilters.showAllSections && p.sectionName ? `<div class="muted product-sub">${esc(p.sectionName)}</div>` : ''}
        <div class="product-badges">${renderProductBadges(p)}</div>
      </td>
      <td>${esc(p.unit || '—')}</td>
      <td dir="ltr">${fmtMoney(p.price)}</td>
      <td dir="ltr">${p.bonusDefault || 0}</td>
      <td dir="ltr">${p.sortOrder ?? 0}</td>
      <td>${p.isActive ? '<span class="badge ok">نشط</span>' : '<span class="badge err">موقوف</span>'}</td>
      <td class="product-actions">
        <button type="button" class="btn btn-soft btn-sm" data-prod-edit="${p.id}">تعديل</button>
        <button type="button" class="btn btn-danger btn-sm" data-prod-del="${p.id}">حذف</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="11">لا توجد منتجات — أضف منتجاً أو نفّذ مزامنة Edari</td></tr>';

  const countEl = document.getElementById('productCountLine');
  if (countEl) {
    const from = commerce.productTotal ? commerce.productOffset + 1 : 0;
    const to = commerce.productOffset + commerce.products.length;
    countEl.textContent = `عرض ${from}–${to} من ${commerce.productTotal} منتج`;
  }
  renderProductPagination();

  document.querySelectorAll('.product-check').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = Number(cb.dataset.id);
      if (cb.checked) commerce.selectedProductIds.add(id);
      else commerce.selectedProductIds.delete(id);
      updateBulkBar();
    });
  });

  document.querySelectorAll('[data-prod-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openProductModal(Number(btn.dataset.prodEdit)));
  });
  document.querySelectorAll('[data-prod-del]').forEach((btn) => {
    btn.addEventListener('click', () => deleteProductById(Number(btn.dataset.prodDel)));
  });

  if (dragEnabled) initProductDragDrop();

  await loadProductStats();
}

function initProductDragDrop() {
  const tbody = document.getElementById('catalogProductsBody');
  if (!tbody) return;
  let dragId = null;

  tbody.querySelectorAll('tr[draggable="true"]').forEach((row) => {
    row.addEventListener('dragstart', (e) => {
      dragId = Number(row.dataset.productId);
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      tbody.querySelectorAll('tr').forEach((r) => r.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const targetId = Number(row.dataset.productId);
      if (!dragId || dragId === targetId) return;

      const ids = commerce.products.map((p) => p.id);
      const fromIdx = ids.indexOf(dragId);
      const toIdx = ids.indexOf(targetId);
      if (fromIdx < 0 || toIdx < 0) return;

      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, dragId);

      try {
        await commerceApi('/products/reorder', {
          method: 'POST',
          body: JSON.stringify({ sectionId: commerce.selectedSectionId, orderedIds: ids })
        });
        showToast('تم تحديث الترتيب');
        await loadCatalogProducts();
      } catch (err) {
        showToast(err.message, 'err');
      }
    });
  });
}

function fillProductSectionSelect(selectedId) {
  const sel = document.getElementById('productSectionId');
  if (!sel) return;
  sel.innerHTML = commerce.allSections.map((s) =>
    `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${esc(s.branchName)} — ${esc(s.name)}</option>`
  ).join('');
}

function setProductImagePreview(p) {
  const box = document.getElementById('productImagePreview');
  const removeBtn = document.getElementById('btnProductRemoveImage');
  if (!box) return;
  if (p?.imageUrl) {
    box.innerHTML = `<img src="${getApiBase()}${p.imageUrl}" alt="" class="product-preview-img">`;
    removeBtn?.classList.remove('hidden');
  } else {
    box.innerHTML = '<span class="product-image-placeholder">📦</span>';
    removeBtn?.classList.add('hidden');
  }
}

function setEdariCoreFieldsReadonly(readonly) {
  ['productName', 'productSkuNum', 'productUnit'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.readOnly = readonly;
    el.classList.toggle('readonly', readonly);
  });
  const priceEl = document.getElementById('productPrice');
  const priceOverride = document.getElementById('productPriceOverride')?.checked;
  if (priceEl) {
    const lockPrice = readonly && !priceOverride;
    priceEl.readOnly = lockPrice;
    priceEl.classList.toggle('readonly', lockPrice);
  }
}

let lastEdariMaterial = null;
let barcodeLookupTimer = null;

function fillProductFormFromEdari(m) {
  if (!m) return;
  document.getElementById('productName').value = m.name || '';
  document.getElementById('productBarcode').value = m.barcode || m.num || '';
  document.getElementById('productSkuNum').value = m.num || '';
  document.getElementById('productEdariSeq').value = m.seq || '';
  document.getElementById('productUnit').value = m.unit || '';
  if (!document.getElementById('productPriceOverride')?.checked) {
    document.getElementById('productPrice').value = m.price ?? 0;
  }
  if (m.bonus && !document.getElementById('productId').value) {
    document.getElementById('productBonus').value = m.bonus;
  }
  if (m.remarks && !document.getElementById('productDescription').value) {
    document.getElementById('productDescription').value = m.remarks;
  }
}

function renderEdariLivePreview(material, state, message = '') {
  const box = document.getElementById('edariLivePreview');
  if (!box) return;
  box.classList.remove('hidden', 'edari-live-ok', 'edari-live-err', 'edari-live-loading');
  if (state === 'loading') {
    box.classList.add('edari-live-loading');
    box.innerHTML = '<p class="muted">جاري جلب البيانات من Edari...</p>';
    return;
  }
  if (state === 'err') {
    box.classList.add('edari-live-err');
    box.innerHTML = `
      <p class="edari-live-title">غير موجود في Edari</p>
      <p class="muted">${esc(message || 'نفّذ مزامنة كاملة أولاً')}</p>`;
    return;
  }
  box.classList.add('edari-live-ok');
  box.innerHTML = `
    <div class="edari-live-head">
      <span class="badge ok">من Edari</span>
      <span class="muted" dir="ltr">Seq ${esc(material.seq)}</span>
    </div>
    <h4 class="edari-live-name">${esc(material.name)}</h4>
    ${material.name2 ? `<p class="muted">${esc(material.name2)}</p>` : ''}
    <div class="edari-live-grid">
      <div><span class="k">الباركود</span><strong dir="ltr">${esc(material.barcode || material.num)}</strong></div>
      <div><span class="k">رقم المادة</span><strong dir="ltr">${esc(material.num)}</strong></div>
      <div><span class="k">الوحدة</span><strong>${esc(material.unit || '—')}</strong></div>
      <div><span class="k">السعر</span><strong dir="ltr">${fmtMoney(material.price)}</strong></div>
      ${material.bonus ? `<div><span class="k">بونص Edari</span><strong dir="ltr">${material.bonus}</strong></div>` : ''}
    </div>
    ${material.remarks ? `<p class="edari-live-remarks">${esc(material.remarks)}</p>` : ''}
    <p class="field-hint">يُرفع للسيرفر عند الضغط على «إضافة للكتalog» فقط</p>`;
}

async function lookupEdariByBarcodeInput(code, { isEdit = false } = {}) {
  const raw = String(code || '').trim();
  if (isEdit) return;
  if (!raw) {
    lastEdariMaterial = null;
    if (!document.getElementById('productId').value) {
      document.getElementById('productName').value = '';
      document.getElementById('productSkuNum').value = '';
      document.getElementById('productEdariSeq').value = '';
      document.getElementById('productUnit').value = '';
      if (!document.getElementById('productPriceOverride')?.checked) {
        document.getElementById('productPrice').value = '';
      }
    }
    renderEdariLivePreview(null, 'err', 'أدخل الباركود أو رقم المادة');
    setEdariCoreFieldsReadonly(false);
    return;
  }
  renderEdariLivePreview(null, 'loading');
  try {
    const data = await commerceApi(`/products/edari-lookup?code=${encodeURIComponent(raw)}`);
    lastEdariMaterial = data.material;
    fillProductFormFromEdari(data.material);
    setEdariCoreFieldsReadonly(true);
    renderEdariLivePreview(data.material, 'ok');
  } catch (err) {
    lastEdariMaterial = null;
    setEdariCoreFieldsReadonly(false);
    renderEdariLivePreview(null, 'err', err.message);
  }
}

function openProductModal(id = null) {
  const modal = document.getElementById('productModal');
  const isEdit = !!id;
  lastEdariMaterial = null;
  document.getElementById('productModalTitle').textContent = isEdit ? 'تعديل منتج في الكتalog' : 'إضافة منتج من Edari';
  document.getElementById('productId').value = id || '';
  document.getElementById('productSaveBtn').textContent = isEdit ? 'حفظ التعديلات' : 'إضافة للكتalog';
  document.getElementById('edariSearchBox')?.classList.add('hidden');
  document.getElementById('btnProductSyncEdari').classList.toggle('hidden', !isEdit);

  fillProductSectionSelect(commerce.selectedSectionId);

  if (isEdit) {
    const p = commerce.products.find((x) => x.id === id);
    if (!p) return;
    fillProductSectionSelect(p.sectionId);
    document.getElementById('productName').value = p.name || '';
    document.getElementById('productBarcode').value = p.barcode || '';
    document.getElementById('productSkuNum').value = p.skuNum || '';
    document.getElementById('productEdariSeq').value = p.edariSeq || '';
    document.getElementById('productUnit').value = p.unit || '';
    document.getElementById('productPrice').value = p.price ?? 0;
    document.getElementById('productBonus').value = p.bonusDefault ?? 0;
    document.getElementById('productMinQty').value = p.minOrderQty ?? 0;
    document.getElementById('productSortOrder').value = p.sortOrder ?? 0;
    document.getElementById('productIsActive').checked = !!p.isActive;
    document.getElementById('productPriceOverride').checked = !!p.priceOverride;
    document.getElementById('productDescription').value = p.description || '';
    document.getElementById('productMetaInfo').textContent =
      `مصدر: Edari · آخر مزامنة: ${(p.syncedAt || '—').slice(0, 19).replace('T', ' ')}`;
    setEdariCoreFieldsReadonly(false);
    renderEdariLivePreview({
      seq: p.edariSeq,
      num: p.skuNum,
      barcode: p.barcode,
      name: p.name,
      unit: p.unit,
      price: p.price,
      bonus: p.bonusDefault
    }, 'ok');
    setProductImagePreview(p);
  } else {
    document.getElementById('productForm').reset();
    document.getElementById('productIsActive').checked = true;
    document.getElementById('productBonus').value = 0;
    document.getElementById('productMinQty').value = 0;
    document.getElementById('productSortOrder').value = 0;
    document.getElementById('productMetaInfo').textContent = 'اكتب الباركود — تظهر التفاصيل من Edari فوراً';
    setEdariCoreFieldsReadonly(false);
    renderEdariLivePreview(null, 'err', 'أدخل الباركود أو رقم المادة');
    setProductImagePreview(null);
    fillProductSectionSelect(commerce.selectedSectionId);
    setTimeout(() => document.getElementById('productBarcode')?.focus(), 120);
  }

  modal.classList.remove('hidden');
}

function closeProductModal() {
  document.getElementById('productModal').classList.add('hidden');
}

async function saveProductForm(e) {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const body = {
    sectionId: Number(document.getElementById('productSectionId').value),
    name: document.getElementById('productName').value.trim(),
    barcode: document.getElementById('productBarcode').value.trim(),
    skuNum: document.getElementById('productSkuNum').value.trim(),
    edariSeq: document.getElementById('productEdariSeq').value.trim(),
    unit: document.getElementById('productUnit').value.trim(),
    price: Number(document.getElementById('productPrice').value || 0),
    bonusDefault: Number(document.getElementById('productBonus').value || 0),
    minOrderQty: Number(document.getElementById('productMinQty').value || 0),
    sortOrder: Number(document.getElementById('productSortOrder').value || 0),
    isActive: document.getElementById('productIsActive').checked,
    priceOverride: document.getElementById('productPriceOverride').checked,
    description: document.getElementById('productDescription').value.trim()
  };

  try {
    if (id) {
      await commerceApi(`/products/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('تم حفظ المنتج');
    } else {
      if (!lastEdariMaterial?.seq) {
        return showToast('أدخل باركوداً موجوداً في Edari أولاً', 'err');
      }
      await commerceApi('/products/by-barcode', {
        method: 'POST',
        body: JSON.stringify({
          sectionId: body.sectionId,
          barcode: body.barcode || body.skuNum,
          bonusDefault: body.bonusDefault,
          minOrderQty: body.minOrderQty,
          sortOrder: body.sortOrder,
          isActive: body.isActive,
          priceOverride: body.priceOverride,
          price: body.priceOverride ? body.price : undefined,
          description: body.description
        })
      });
      showToast('تم إضافة المنتج إلى الكتalog');
    }
    closeProductModal();
    await loadCatalogProducts();
  } catch (err) {
    showToast(err.message || 'فشل الحفظ', 'err');
  }
}

async function deleteProductById(id) {
  const p = commerce.products.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`حذف "${p.name}"؟`)) return;
  try {
    await commerceApi(`/products/${id}`, { method: 'DELETE' });
    showToast('تم الحذف');
    await loadCatalogProducts();
  } catch (err) {
    showToast(err.message, 'err');
  }
}

async function uploadProductImage(id, file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await commerceApi(`/products/${id}/image`, {
        method: 'POST',
        body: JSON.stringify({ dataUrl: reader.result })
      });
      showToast('تم رفع الصورة');
      const data = await commerceApi(`/products/${id}`);
      setProductImagePreview(data.product);
      await loadCatalogProducts();
    } catch (err) {
      showToast(err.message, 'err');
    }
  };
  reader.readAsDataURL(file);
}

async function runBulkAction(action) {
  const ids = [...commerce.selectedProductIds];
  if (!ids.length) return;

  if (action === 'move') {
    openBulkMoveModal(ids);
    return;
  }
  if (action === 'delete' && !confirm(`حذف ${ids.length} منتج؟`)) return;

  try {
    const data = await commerceApi('/products/bulk', {
      method: 'POST',
      body: JSON.stringify({ ids, action, payload: {} })
    });
    showToast(`تم تنفيذ العملية على ${data.affected} منتج`);
    await loadCatalogProducts();
  } catch (err) {
    showToast(err.message, 'err');
  }
}

function openBulkMoveModal(ids) {
  document.getElementById('bulkMoveCount').textContent = `نقل ${ids.length} منتج`;
  const sel = document.getElementById('bulkMoveSectionId');
  sel.innerHTML = commerce.allSections.map((s) =>
    `<option value="${s.id}">${esc(s.branchName)} — ${esc(s.name)}</option>`
  ).join('');
  document.getElementById('bulkMoveModal').classList.remove('hidden');
  document.getElementById('bulkMoveForm').onsubmit = async (e) => {
    e.preventDefault();
    const sectionId = Number(sel.value);
    try {
      const data = await commerceApi('/products/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids, action: 'move', payload: { sectionId } })
      });
      showToast(`نُقل ${data.affected} منتج`);
      document.getElementById('bulkMoveModal').classList.add('hidden');
      await loadCatalogProducts();
    } catch (err) {
      showToast(err.message, 'err');
    }
  };
}

function openCatalogCreate(type) {
  if (type === 'section' && !commerce.selectedBranchId) {
    return showToast('اختر فرعاً أولاً', 'err');
  }
  const modal = document.getElementById('catalogEditModal');
  document.getElementById('catalogEditType').value = type;
  document.getElementById('catalogEditId').value = '';
  document.getElementById('catalogEditDelete').classList.add('hidden');
  document.getElementById('catalogEditTitle').textContent = type === 'branch' ? 'فرع جديد' : 'قسم جديد';
  document.getElementById('catalogEditName').value = '';
  document.getElementById('catalogEditSort').value = 0;
  document.getElementById('catalogEditActive').checked = true;
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('catalogEditName')?.focus(), 120);
}

function openCatalogEdit(type, id) {
  const modal = document.getElementById('catalogEditModal');
  document.getElementById('catalogEditType').value = type;
  document.getElementById('catalogEditId').value = id;
  document.getElementById('catalogEditDelete').classList.remove('hidden');

  if (type === 'branch') {
    const b = commerce.branches.find((x) => x.id === id);
    if (!b) return;
    document.getElementById('catalogEditTitle').textContent = 'تعديل فرع';
    document.getElementById('catalogEditName').value = b.name;
    document.getElementById('catalogEditSort').value = b.sortOrder ?? 0;
    document.getElementById('catalogEditActive').checked = !!b.isActive;
  } else {
    const s = commerce.sections.find((x) => x.id === id)
      || commerce.allSections.find((x) => x.id === id);
    if (!s) return;
    document.getElementById('catalogEditTitle').textContent = 'تعديل قسم';
    document.getElementById('catalogEditName').value = s.name;
    document.getElementById('catalogEditSort').value = s.sortOrder ?? 0;
    document.getElementById('catalogEditActive').checked = !!s.isActive;
  }
  modal.classList.remove('hidden');
}

async function saveCatalogEdit(e) {
  e.preventDefault();
  const type = document.getElementById('catalogEditType').value;
  const idRaw = document.getElementById('catalogEditId').value;
  const id = idRaw ? Number(idRaw) : 0;
  const body = {
    name: document.getElementById('catalogEditName').value.trim(),
    sortOrder: Number(document.getElementById('catalogEditSort').value || 0),
    isActive: document.getElementById('catalogEditActive').checked
  };
  if (!body.name) return showToast('الاسم مطلوب', 'err');

  try {
    if (id) {
      if (type === 'branch') {
        await commerceApi(`/catalog/branches/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await commerceApi(`/catalog/sections/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      }
    } else if (type === 'branch') {
      const data = await commerceApi('/catalog/branches', { method: 'POST', body: JSON.stringify(body) });
      commerce.selectedBranchId = data.branch?.id || commerce.selectedBranchId;
    } else {
      if (!commerce.selectedBranchId) return showToast('اختر فرعاً أولاً', 'err');
      const data = await commerceApi('/catalog/sections', {
        method: 'POST',
        body: JSON.stringify({ ...body, branchId: commerce.selectedBranchId })
      });
      commerce.selectedSectionId = data.section?.id || commerce.selectedSectionId;
    }
    showToast(id ? 'تم الحفظ' : 'تمت الإضافة');
    document.getElementById('catalogEditModal').classList.add('hidden');
    await loadCatalogPage();
  } catch (err) {
    showToast(err.message || 'فشل الحفظ', 'err');
  }
}

async function deleteCatalogItem() {
  const type = document.getElementById('catalogEditType').value;
  const id = Number(document.getElementById('catalogEditId').value);
  const label = type === 'branch' ? 'الفرع' : 'القسم';
  if (!confirm(`حذف ${label}؟ سيتم حذف الأقسام/المنتجات التابعة.`)) return;
  try {
    if (type === 'branch') {
      await commerceApi(`/catalog/branches/${id}`, { method: 'DELETE' });
    } else {
      await commerceApi(`/catalog/sections/${id}`, { method: 'DELETE' });
    }
    showToast('تم الحذف');
    document.getElementById('catalogEditModal').classList.add('hidden');
    await loadCatalogPage();
  } catch (err) {
    showToast(err.message, 'err');
  }
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseCsvToRows(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const first = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = first.some((h) => ['barcode', 'name', 'price', 'unit'].includes(h));
  const headers = hasHeader ? first : ['barcode', 'name', 'unit', 'price', 'bonus', 'sort_order', 'active', 'price_override', 'description'];
  const start = hasHeader ? 1 : 0;
  const rows = [];
  for (let i = start; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

function exportProductsCsv() {
  const qs = buildProductQuery().replace(/offset=\d+/, 'offset=0').replace(/limit=\d+/, 'limit=5000');
  const url = `${getApiBase()}/api/admin/products/export.csv?${qs}`;
  window.open(url, '_blank');
}

async function importCsvData(text) {
  if (!commerce.selectedSectionId) return showToast('اختر قسماً', 'err');
  const rows = parseCsvToRows(text);
  if (!rows.length) return showToast('لا توجد بيانات للاستيراد', 'err');
  const data = await commerceApi('/products/import', {
    method: 'POST',
    body: JSON.stringify({ sectionId: commerce.selectedSectionId, rows })
  });
  const results = document.getElementById('importCsvResults');
  results.classList.remove('hidden');
  results.innerHTML = `
    <p class="badge ok">${esc(data.message || 'تم')}</p>
    ${data.errors?.length ? `<p class="badge err">أخطاء: ${data.errors.length}</p>` : ''}`;
  showToast(data.message || 'تم الاستيراد');
  await loadCatalogProducts();
  return data;
}

let edariSearchTimer;
let edariSearchResults = [];

async function searchEdariInModal(q) {
  const box = document.getElementById('edariSearchResults');
  if (!q.trim()) {
    box.innerHTML = '';
    edariSearchResults = [];
    return;
  }
  try {
    const data = await commerceApi(`/products/edari-search?q=${encodeURIComponent(q.trim())}`);
    edariSearchResults = data.materials || [];
    box.innerHTML = edariSearchResults.map((m, i) => `
      <button type="button" class="edari-result-item" data-idx="${i}">
        <strong>${esc(m.name)}</strong>
        <span dir="ltr">${esc(m.barcode || m.num)} · ${fmtMoney(m.price)}</span>
      </button>`).join('') || '<p class="muted">لا توجد نتائج — نفّذ مزامنة Edari</p>';

    box.querySelectorAll('.edari-result-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = edariSearchResults[Number(btn.dataset.idx)];
        if (!m) return;
        document.getElementById('productName').value = m.name;
        document.getElementById('productBarcode').value = m.barcode || m.num;
        document.getElementById('productSkuNum').value = m.num || '';
        document.getElementById('productEdariSeq').value = m.seq || '';
        document.getElementById('productUnit').value = m.unit || '';
        document.getElementById('productPrice').value = m.price ?? 0;
        document.getElementById('edariSearchBox').classList.add('hidden');
        showToast('تم تعبئة البيانات من Edari');
      });
    });
  } catch (err) {
    box.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}

async function loadOrdersPage() {
  const status = document.getElementById('orderStatusFilter')?.value || '';
  const data = await commerceApi(`/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`);
  const stats = await commerceApi('/orders/stats');
  document.getElementById('orderStats').innerHTML = `
    <span class="badge ok">اليوم: ${stats.stats?.todaySubmitted || 0} طلب</span>`;

  document.getElementById('ordersBody').innerHTML = (data.orders || []).map((o) => `
    <tr>
      <td dir="ltr">${esc(o.orderNo)}</td>
      <td>${esc(o.agentName)}</td>
      <td>${esc(o.customerName || '—')}</td>
      <td><span class="badge pending">${esc(o.statusLabel)}</span></td>
      <td dir="ltr">${o.lines?.length || 0}</td>
      <td dir="ltr">${fmtMoney(o.totalAmount)}</td>
      <td>${esc(o.submittedAt || o.createdAt || '—')}</td>
      <td><button type="button" class="btn btn-soft btn-sm" data-order-id="${o.id}">عرض</button></td>
    </tr>`).join('') || '<tr><td colspan="8">لا توجد طلبات</td></tr>';

  document.querySelectorAll('[data-order-id]').forEach((btn) => {
    btn.addEventListener('click', () => openOrderDetail(Number(btn.dataset.orderId)));
  });
}

async function openOrderDetail(id) {
  const data = await commerceApi(`/orders/${id}`);
  const o = data.order;
  const panel = document.getElementById('orderDetailPanel');
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="panel-head">
      <h3>طلب ${esc(o.orderNo)} · ${esc(o.statusLabel)}</h3>
      <button type="button" class="btn btn-soft btn-sm" id="btnCloseOrderDetail">إغلاق</button>
    </div>
    <p><strong>${esc(o.agentName)}</strong> → ${esc(o.customerName || '—')} · ${esc(o.catalogBranchName || '')}</p>
    <div class="table-scroll"><table class="data-table compact"><thead><tr><th>مادة</th><th>باركود</th><th>كمية</th><th>سعر</th><th>مبلغ</th></tr></thead>
    <tbody>${(o.lines || []).map((l) => `
      <tr><td>${esc(l.matName)}</td><td dir="ltr">${esc(l.barcode)}</td><td dir="ltr">${l.quant}</td>
      <td dir="ltr">${fmtMoney(l.unitPrice)}</td><td dir="ltr">${fmtMoney(l.lineTotal)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="btn-row" style="margin-top:12px">
      <button type="button" class="btn btn-primary btn-sm" data-status="approved">موافقة</button>
      <button type="button" class="btn btn-soft btn-sm" data-status="under_review">مراجعة</button>
      <button type="button" class="btn btn-danger btn-sm" data-status="rejected">رفض</button>
      <button type="button" class="btn btn-soft btn-sm" data-status="processing">تنفيذ</button>
      <button type="button" class="btn btn-soft btn-sm" data-status="delivered">تم التسليم</button>
    </div>`;

  document.getElementById('btnCloseOrderDetail')?.addEventListener('click', () => panel.classList.add('hidden'));
  panel.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const note = btn.dataset.status === 'rejected' ? prompt('سبب الرفض:') : '';
      if (btn.dataset.status === 'rejected' && note == null) return;
      await commerceApi(`/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: btn.dataset.status, note: note || '' })
      });
      await loadOrdersPage();
      await openOrderDetail(id);
    });
  });
}

function initCommerceAdmin() {
  document.getElementById('btnInvoiceSearch')?.addEventListener('click', () => loadInvoicesPage());
  document.getElementById('invoiceSearch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadInvoicesPage();
  });

  document.getElementById('btnAddBranch')?.addEventListener('click', () => openCatalogCreate('branch'));

  document.getElementById('btnAddSection')?.addEventListener('click', () => openCatalogCreate('section'));

  document.getElementById('btnAddProduct')?.addEventListener('click', () => openProductModal());

  document.getElementById('btnBulkAddProducts')?.addEventListener('click', () => {
    if (!commerce.selectedSectionId) return showToast('اختر قسماً أولاً', 'err');
    document.getElementById('bulkBarcodesInput').value = '';
    document.getElementById('bulkAddResults').classList.add('hidden');
    document.getElementById('bulkAddModal').classList.remove('hidden');
  });

  document.getElementById('bulkAddClose')?.addEventListener('click', () => {
    document.getElementById('bulkAddModal').classList.add('hidden');
  });

  document.getElementById('bulkAddForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!commerce.selectedSectionId) return showToast('اختر قسماً', 'err');
    const text = document.getElementById('bulkBarcodesInput').value;
    const barcodes = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!barcodes.length) return showToast('أدخل باركود واحد على الأقل', 'err');
    try {
      const data = await commerceApi('/products/bulk-by-barcode', {
        method: 'POST',
        body: JSON.stringify({ sectionId: commerce.selectedSectionId, barcodes })
      });
      const results = document.getElementById('bulkAddResults');
      results.classList.remove('hidden');
      results.innerHTML = `
        <p class="badge ok">أُضيف: ${data.added}</p>
        ${data.skipped?.length ? `<p class="muted">تخطّي: ${data.skipped.length}</p>` : ''}
        ${data.errors?.length ? `<p class="badge err">أخطاء: ${data.errors.length}</p>` : ''}`;
      showToast(data.message || `أُضيف ${data.added} منتج`);
      await loadCatalogProducts();
    } catch (err) {
      showToast(err.message, 'err');
    }
  });

  document.getElementById('btnSyncSectionProducts')?.addEventListener('click', async () => {
    if (!commerce.selectedSectionId) return showToast('اختر قسماً', 'err');
    if (!confirm('مزامنة كل منتجات هذا القسم من Edari؟\nالمنتجات ذات السعر اليدوي لن يتغير سعرها.')) return;
    try {
      const data = await commerceApi(`/catalog/sections/${commerce.selectedSectionId}/sync-products`, { method: 'POST' });
      showToast(data.message || 'تمت المزامنة');
      await loadCatalogProducts();
    } catch (err) {
      showToast(err.message, 'err');
    }
  });

  document.getElementById('productSearch')?.addEventListener('input', () => {
    clearTimeout(commerce._searchT);
    commerce._searchT = setTimeout(async () => {
      commerce.productFilters.q = document.getElementById('productSearch').value.trim();
      commerce.productOffset = 0;
      await loadCatalogProducts();
    }, 300);
  });

  document.getElementById('productFilterActive')?.addEventListener('change', async (e) => {
    commerce.productFilters.active = e.target.value;
    commerce.productOffset = 0;
    await loadCatalogProducts();
  });

  document.getElementById('productFilterImage')?.addEventListener('change', async (e) => {
    commerce.productFilters.noImage = e.target.value;
    commerce.productOffset = 0;
    await loadCatalogProducts();
  });

  document.getElementById('productSortBy')?.addEventListener('change', async (e) => {
    commerce.productFilters.sortBy = e.target.value;
    commerce.productOffset = 0;
    await loadCatalogProducts();
  });

  document.getElementById('productShowAllSections')?.addEventListener('change', async (e) => {
    commerce.productFilters.showAllSections = e.target.checked;
    commerce.productOffset = 0;
    await loadCatalogProducts();
  });

  document.getElementById('productSelectAll')?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    commerce.selectedProductIds.clear();
    document.querySelectorAll('.product-check').forEach((cb) => {
      cb.checked = checked;
      if (checked) commerce.selectedProductIds.add(Number(cb.dataset.id));
    });
    updateBulkBar();
  });

  document.getElementById('productBulkBar')?.querySelectorAll('[data-bulk]').forEach((btn) => {
    btn.addEventListener('click', () => runBulkAction(btn.dataset.bulk));
  });

  document.getElementById('productModalClose')?.addEventListener('click', closeProductModal);
  document.getElementById('productForm')?.addEventListener('submit', saveProductForm);

  document.getElementById('productBarcode')?.addEventListener('input', (e) => {
    if (document.getElementById('productId').value) return;
    clearTimeout(barcodeLookupTimer);
    barcodeLookupTimer = setTimeout(() => lookupEdariByBarcodeInput(e.target.value), 350);
  });

  document.getElementById('productPriceOverride')?.addEventListener('change', () => {
    setEdariCoreFieldsReadonly(!document.getElementById('productId').value);
  });

  document.getElementById('btnProductSyncEdari')?.addEventListener('click', async () => {
    const id = document.getElementById('productId').value;
    if (!id) return;
    try {
      const data = await commerceApi(`/products/${id}/sync-edari`, { method: 'POST' });
      document.getElementById('productName').value = data.product.name || '';
      document.getElementById('productBarcode').value = data.product.barcode || '';
      document.getElementById('productSkuNum').value = data.product.skuNum || '';
      document.getElementById('productEdariSeq').value = data.product.edariSeq || '';
      document.getElementById('productUnit').value = data.product.unit || '';
      if (!data.product.priceOverride) {
        document.getElementById('productPrice').value = data.product.price ?? 0;
      }
      showToast('تم التحديث من Edari');
      await loadCatalogProducts();
    } catch (err) {
      showToast(err.message, 'err');
    }
  });

  document.getElementById('btnProductUploadImage')?.addEventListener('click', () => {
    document.getElementById('productImageInput').click();
  });

  document.getElementById('productImageInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let id = document.getElementById('productId').value;
    if (!id) {
      showToast('احفظ المنتج أولاً ثم ارفع الصورة', 'err');
      return;
    }
    await uploadProductImage(Number(id), file);
    e.target.value = '';
  });

  document.getElementById('btnProductRemoveImage')?.addEventListener('click', async () => {
    const id = document.getElementById('productId').value;
    if (!id || !confirm('حذف صورة المنتج؟')) return;
    try {
      await commerceApi(`/products/${id}/image`, { method: 'DELETE' });
      setProductImagePreview(null);
      showToast('تم حذف الصورة');
      await loadCatalogProducts();
    } catch (err) {
      showToast(err.message, 'err');
    }
  });

  document.getElementById('btnExportProducts')?.addEventListener('click', () => exportProductsCsv());

  document.getElementById('btnImportProducts')?.addEventListener('click', () => {
    if (!commerce.selectedSectionId) return showToast('اختر قسماً', 'err');
    document.getElementById('importCsvText').value = '';
    document.getElementById('importCsvFile').value = '';
    document.getElementById('importCsvResults').classList.add('hidden');
    document.getElementById('importCsvModal').classList.remove('hidden');
  });

  document.getElementById('importCsvClose')?.addEventListener('click', () => {
    document.getElementById('importCsvModal').classList.add('hidden');
  });

  document.getElementById('importCsvFile')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    document.getElementById('importCsvText').value = text;
  });

  document.getElementById('importCsvForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await importCsvData(document.getElementById('importCsvText').value);
    } catch (err) {
      showToast(err.message, 'err');
    }
  });

  document.getElementById('bulkMoveClose')?.addEventListener('click', () => {
    document.getElementById('bulkMoveModal').classList.add('hidden');
  });

  document.getElementById('catalogEditClose')?.addEventListener('click', () => {
    document.getElementById('catalogEditModal').classList.add('hidden');
  });

  document.getElementById('catalogEditForm')?.addEventListener('submit', saveCatalogEdit);
  document.getElementById('catalogEditDelete')?.addEventListener('click', deleteCatalogItem);

  document.getElementById('btnPurgeProducts')?.addEventListener('click', async () => {
    const ok1 = confirm('حذف كل المنتجات من الكتalog؟\n\nلن تُحذف بيانات Edari (edari_materials) — فقط المنتجات المضافة للأقسام.');
    if (!ok1) return;
    const typed = prompt('اكتب DELETE_ALL_PRODUCTS للتأكيد:');
    if (typed !== 'DELETE_ALL_PRODUCTS') return alert('تم الإلغاء — لم يُحذف شيء');

    try {
      const data = await commerceApi('/products/purge-all', {
        method: 'POST',
        body: JSON.stringify({ confirm: 'DELETE_ALL_PRODUCTS' })
      });
      alert(data.message || `تم حذف ${data.deleted} منتج`);
      await loadCatalogProducts();
    } catch (e) {
      showToast(e.message, 'err');
    }
  });

  document.getElementById('orderStatusFilter')?.addEventListener('change', () => loadOrdersPage());
}

window.commercePages = {
  invoices: loadInvoicesPage,
  catalog: loadCatalogPage,
  orders: loadOrdersPage
};

initCommerceAdmin();
