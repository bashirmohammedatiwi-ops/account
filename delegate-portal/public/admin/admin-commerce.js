/* Admin: catalog, orders */
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
  lastProductCheckId: null,
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

function fmtInvInt(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function orderLineTotal(line) {
  return Math.round(Number(line.quant || 0) * Number(line.unitPrice || line.price || 0));
}

function fmtOrderDocDate(v) {
  if (!v) {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  }
  const raw = String(v).replace('T', ' ').trim();
  const iso = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;
  }
  return raw.slice(0, 10) || '—';
}

function invBarcodeCell(line) {
  return String(line.barcode || line.matNum || '').replace(/\s+/g, '') || '—';
}

function qtyTd(val) {
  const n = Number(val);
  return `<td class="col-amt" dir="ltr">${!n ? '—' : fmtInvInt(n)}</td>`;
}

function invMoneyTd(val, cls) {
  const n = Number(val);
  if (Number.isNaN(n)) return `<td class="col-amt num ${cls || ''}" dir="ltr">—</td>`;
  return `<td class="col-amt num ${cls || ''}" dir="ltr">${fmtInvInt(n)}</td>`;
}

function renderOrderInvoiceHero(lines, meta = {}) {
  const {
    title = 'فاتورة طلب مندوب',
    clientName = '—',
    clientNum = '',
    docNum = '—',
    docDate = '',
    remarks = ''
  } = meta;
  const total = lines.reduce((s, l) => s + orderLineTotal(l), 0);
  const qtySum = lines.reduce((s, l) => s + Number(l.quant || 0), 0);
  const bonusSum = lines.reduce((s, l) => s + Number(l.bonus || 0), 0);

  return `
    <div class="doc-panel invoice-doc inv-order-doc">
      <div class="doc-head-row">
        <img class="doc-logo" src="/m/assets/logo.png" alt="" width="36" height="36">
        <div class="doc-head-main">
          <span class="doc-label">شركة ديما الحياة</span>
          <strong class="doc-title">${esc(title)}</strong>
          <span class="doc-meta-line">رقم ${esc(docNum)} · ${esc(docDate || fmtOrderDocDate())}</span>
          ${remarks ? `<span class="doc-meta-line doc-meta-note">${esc(remarks)}</span>` : ''}
        </div>
        <div class="doc-head-side">
          <strong class="doc-client">${esc(clientName)}</strong>
          ${clientNum ? `<span class="doc-client-num" dir="ltr">${esc(clientNum)}</span>` : ''}
        </div>
      </div>
      <table class="doc-meta-table invoice-meta">
        <tbody>
          <tr>
            <th>عدد البنود</th><td dir="ltr">${lines.length}</td>
            <th>إجمالي الكمية</th><td dir="ltr">${fmtInvInt(qtySum)}</td>
            <th>إجمالي الهدايا</th><td dir="ltr">${fmtInvInt(bonusSum)}</td>
            <th>إجمالي الفاتورة</th><td class="net" dir="ltr">${fmtInvInt(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

function renderOrderInvoiceLines(lines) {
  if (!lines.length) {
    return '<div class="empty-state order-invoice-empty"><p>لا توجد بنود في هذا الطلب</p></div>';
  }
  const total = lines.reduce((s, l) => s + orderLineTotal(l), 0);
  return `
    <div class="table-scroll order-invoice-table-wrap">
      <table class="data-table inv-table" dir="rtl">
        <thead>
          <tr>
            <th class="col-n">م</th>
            <th class="col-barcode">الباركود</th>
            <th class="col-name">اسم المادة</th>
            <th class="col-amt">الكمية</th>
            <th class="col-amt">هدية</th>
            <th class="col-amt">سعر الوحدة</th>
            <th class="col-amt">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map((line, i) => `
            <tr>
              <td class="col-n">${i + 1}</td>
              <td class="col-barcode" dir="ltr">${esc(invBarcodeCell(line))}</td>
              <td class="col-name">${esc(line.matName || '—')}</td>
              ${qtyTd(line.quant)}
              ${qtyTd(line.bonus)}
              ${invMoneyTd(line.unitPrice ?? line.price)}
              ${invMoneyTd(orderLineTotal(line), 'net')}
            </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr class="row-sum">
            <td colspan="6" class="total-label">إجمالي الفاتورة</td>
            <td class="num" dir="ltr">${fmtInvInt(total)}</td>
          </tr>
          <tr class="row-total">
            <td colspan="6" class="total-label">الصافي للدفع</td>
            <td class="num net" dir="ltr">${fmtInvInt(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

function renderOrderInvoiceDocument(order) {
  const lines = (order.lines || []).map((l) => ({
    ...l,
    price: l.unitPrice
  }));
  const remarks = [
    order.agentName ? `المندوب: ${order.agentName}` : '',
    order.catalogBranchName ? `الفرع: ${order.catalogBranchName}` : '',
    order.notes || ''
  ].filter(Boolean).join(' · ');

  return renderOrderInvoiceHero(lines, {
    title: `طلب ${order.orderNo}`,
    clientName: order.customerName || '—',
    clientNum: order.customerNum || '',
    docNum: order.orderNo,
    docDate: fmtOrderDocDate(order.submittedAt || order.createdAt),
    remarks
  }) + renderOrderInvoiceLines(lines);
}

async function downloadOrderPdf(order) {
  const res = await fetch(`${getApiBase()}/api/admin/orders/${order.id}.pdf`);
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok) {
    let message = `فشل تصدير PDF (${res.status})`;
    if (contentType.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      message = data.error || message;
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  if (!blob.size) throw new Error('ملف PDF فارغ');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `order-${order.orderNo || order.id}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function printOrderInvoice() {
  document.body.classList.add('printing-order');
  const cleanup = () => {
    document.body.classList.remove('printing-order');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
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
      <div class="stat-card stat-mini"><div class="k">بدون صورة</div><div class="v">${fmtNumAlways(s.withoutImage)}</div></div>`;
  } catch { /* ignore */ }
}

let priceRefreshRunning = false;

function isNotFoundError(err) {
  return /not found|404|cannot post/i.test(String(err?.message || ''));
}

function getSyncApiKey() {
  return document.getElementById('syncApiKey')?.value?.trim()
    || localStorage.getItem('syncApiKey')
    || '';
}

async function syncApiPost(path, body) {
  const syncKey = getSyncApiKey();
  if (!syncKey) {
    throw new Error('أدخل مفتاح المزامنة في صفحة «رفع البيانات» ثم أعد المحاولة');
  }
  const res = await fetch(`${getApiBase()}/api/sync${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sync-key': syncKey },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function wholesaleFromEdariRow(row) {
  if (!row || typeof row !== 'object') return 0;
  const sellPr1 = Number(row.SellPr1 ?? row.sell_pr1 ?? row.priceRetail ?? 0);
  const sellPr5 = Number(row.SellPr5 ?? row.sell_pr5 ?? 0);
  if (sellPr1 > 0) return sellPr1;
  if (sellPr5 > 0) return sellPr5;
  return 0;
}

/** Legacy servers used SellPr2 (half wholesale) — send SellPr1 only for catalog price. */
function prepareEdariRowsForUpload(rows = []) {
  return rows.map((row) => {
    const wholesale = wholesaleFromEdariRow(row);
    return {
      ...row,
      SellPr1: wholesale,
      sell_pr1: wholesale,
      SellPr2: 0,
      sell_pr2: 0
    };
  });
}

async function uploadEdariMaterialRows(rows, onProgress) {
  if (!rows.length) return { materials: 0, productsUpdated: 0 };
  const prepared = prepareEdariRowsForUpload(rows);
  const ADMIN_BATCH = Math.min(500, prepared.length);
  try {
    let materials = 0;
    let productsUpdated = 0;
    for (let i = 0; i < prepared.length; i += ADMIN_BATCH) {
      if (onProgress) onProgress(Math.min(i + ADMIN_BATCH, prepared.length), prepared.length);
      const data = await commerceApi('/products/sync-materials', {
        method: 'POST',
        body: JSON.stringify({ rows: prepared.slice(i, i + ADMIN_BATCH) })
      });
      materials += data.materials || 0;
      productsUpdated += data.productsUpdated || 0;
    }
    return { materials, productsUpdated };
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
  }

  const SYNC_BATCH = 800;
  const start = await syncApiPost('/start', { accountSeqs: [] });
  let materials = 0;
  let productsUpdated = 0;
  const totalBatches = Math.ceil(prepared.length / SYNC_BATCH) || 1;
  for (let i = 0; i < prepared.length; i += SYNC_BATCH) {
    const batch = Math.floor(i / SYNC_BATCH) + 1;
    if (onProgress) onProgress(Math.min(i + SYNC_BATCH, prepared.length), prepared.length);
    const data = await syncApiPost('/chunk', {
      syncId: start.syncId,
      kind: 'products',
      rows: prepared.slice(i, i + SYNC_BATCH),
      batch,
      totalBatches
    });
    materials += data.imported || 0;
    productsUpdated += data.productsUpdated || 0;
  }
  await syncApiPost('/finish', {
    syncId: start.syncId,
    stats: { products: materials, source: 'price-refresh' }
  });
  return { materials, productsUpdated };
}

async function refreshPricesFromCacheFallback() {
  const showAll = document.getElementById('productShowAllSections')?.checked;
  if (commerce.selectedSectionId && !showAll) {
    return commerceApi(`/catalog/sections/${commerce.selectedSectionId}/sync-products`, { method: 'POST' });
  }
  const sections = showAll && commerce.selectedBranchId
    ? commerce.allSections.filter((s) => s.branchId === commerce.selectedBranchId)
    : commerce.sections;
  if (!sections?.length) {
    throw new Error('اختر قسماً أو فرعاً أولاً');
  }
  let updated = 0;
  let total = 0;
  for (const section of sections) {
    const data = await commerceApi(`/catalog/sections/${section.id}/sync-products`, { method: 'POST' });
    updated += data.updated || 0;
    total += data.total || 0;
  }
  return { updated, total, message: `تم تحديث ${updated} من ${total} منتج (اسم · عدد · سعر)` };
}

function buildCatalogRefreshScope() {
  const body = {};
  const params = new URLSearchParams();
  const showAll = document.getElementById('productShowAllSections')?.checked;
  if (commerce.selectedSectionId && !showAll) {
    body.sectionId = commerce.selectedSectionId;
    params.set('sectionId', commerce.selectedSectionId);
  } else if (commerce.selectedBranchId) {
    body.branchId = commerce.selectedBranchId;
    params.set('branchId', commerce.selectedBranchId);
  }
  return { body, params };
}

async function fetchCatalogRefreshCodes() {
  const { params } = buildCatalogRefreshScope();
  try {
    return await commerceApi(`/products/refresh-codes?${params}`);
  } catch (err) {
    if (!isNotFoundError(err)) throw err;
    const qs = buildProductQuery();
    qs.set('limit', '5000');
    qs.set('offset', '0');
    const data = await commerceApi(`/products?${qs}`);
    const products = data.products || [];
    if (!products.length) throw new Error('لا توجد منتجات في الكتalog');
    const codes = new Set();
    for (const p of products) {
      for (const code of [p.edariSeq, p.barcode, p.skuNum]) {
        const value = String(code || '').trim();
        if (value) codes.add(value);
      }
    }
    return { codes: [...codes], productCount: products.length };
  }
}

async function refreshCatalogPricesNow() {
  if (priceRefreshRunning) return;
  const btn = document.getElementById('btnRefreshProductPrices');
  priceRefreshRunning = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'جاري التحديث...';
  }
  try {
    const { codes, productCount } = await fetchCatalogRefreshCodes();

    if (window.edariDesktop?.fetchEdariCatalogMaterials || window.edariDesktop?.fetchEdariMaterials) {
      showToast(`جاري تحديث ${productCount} منتج من Edari...`, 'ok');
      if (btn) btn.textContent = `Edari 0/${codes.length}...`;
      let live;
      if (window.edariDesktop.fetchEdariCatalogMaterials) {
        live = await window.edariDesktop.fetchEdariCatalogMaterials({ codes });
      } else {
        live = await window.edariDesktop.fetchEdariMaterials();
      }
      if (!live.ok) throw new Error(live.error || 'فشل قراءة Edari');
      const rows = live.rows || [];
      if (!rows.length) throw new Error('لم تُعثر على مواد Edari للمنتجات المضافة');
      const result = await uploadEdariMaterialRows(rows, (done, total) => {
        if (btn) btn.textContent = `رفع ${done}/${total}...`;
      });
      showToast(`تم — ${result.productsUpdated} منتج · سعر الجملة (SellPr1)`, 'ok');
    } else {
      const { body } = buildCatalogRefreshScope();
      let data;
      try {
        data = await commerceApi('/products/refresh-prices', {
          method: 'POST',
          body: JSON.stringify(body)
        });
      } catch (err) {
        if (!isNotFoundError(err)) throw err;
        data = await refreshPricesFromCacheFallback();
      }
      showToast(data.message || `تم تحديث ${data.updated} منتج`, 'ok');
    }
    await loadCatalogProducts();
    await loadProductStats();
  } catch (err) {
    showToast(err.message, 'err');
  } finally {
    priceRefreshRunning = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'تحديث من Edari الآن';
    }
  }
}

function renderProductBadges(p) {
  const badges = [];
  if (p.edariSeq) badges.push('<span class="badge ok">Edari</span>');
  if (p.shadeName || p.colorCode) {
    const swatch = p.colorCode
      ? `<span class="shade-swatch" style="background:${esc(p.colorCode)}"></span>`
      : '';
    badges.push(`<span class="badge shade-badge">${swatch}${esc(p.shadeName || 'درجة')}</span>`);
  }
  if (!p.isActive) badges.push('<span class="badge err">موقوف</span>');
  if (!p.imageUrl) badges.push('<span class="badge muted-badge">بدون صورة</span>');
  return badges.join(' ');
}

function updateBulkBar() {
  const bar = document.getElementById('productBulkBar');
  const count = commerce.selectedProductIds.size;
  if (!bar) return;
  bar.classList.toggle('hidden', count === 0);
  const countEl = document.getElementById('productBulkCount');
  if (countEl) {
    const dragMode = canDragReorderProducts();
    let suffix = '';
    if (dragMode && count > 1) suffix = ' — اسحب للأعلى/الأسفل أو ▲▼';
    else if (dragMode) suffix = ' — اسحب أو ▲▼ للترتيب';
    countEl.textContent = `${count} محدد${suffix}`;
  }
  const dragMode = canDragReorderProducts();
  document.querySelectorAll('.product-reorder-btn').forEach((btn) => {
    btn.classList.toggle('hidden', !dragMode || count === 0);
  });
  syncProductRowSelectionStyles();
}

function syncProductRowSelectionStyles() {
  document.querySelectorAll('#catalogProductsBody tr[data-product-id]').forEach((row) => {
    const id = Number(row.dataset.productId);
    row.classList.toggle('product-row-selected', commerce.selectedProductIds.has(id));
  });
}

function getDragProductGroup(dragId) {
  const selected = [...commerce.selectedProductIds];
  if (selected.length > 1 && selected.includes(dragId)) {
    const order = commerce.products.map((p) => p.id);
    return order.filter((id) => selected.includes(id));
  }
  return [dragId];
}

function reorderProductIdBlock(ids, movingIds, targetId) {
  const moving = ids.filter((id) => movingIds.includes(id));
  if (!moving.length || moving.includes(targetId)) return ids;
  const rest = ids.filter((id) => !movingIds.includes(id));
  let insertIdx = rest.indexOf(targetId);
  if (insertIdx < 0) insertIdx = rest.length;
  rest.splice(insertIdx, 0, ...moving);
  return rest;
}

function moveProductBlockUp(ids, movingIds) {
  const moving = ids.filter((id) => movingIds.includes(id));
  if (!moving.length) return ids;
  const firstIdx = ids.indexOf(moving[0]);
  if (firstIdx <= 0) return ids;
  return reorderProductIdBlock(ids, movingIds, ids[firstIdx - 1]);
}

function moveProductBlockDown(ids, movingIds) {
  const moving = ids.filter((id) => movingIds.includes(id));
  if (!moving.length) return ids;
  const lastIdx = ids.indexOf(moving[moving.length - 1]);
  if (lastIdx >= ids.length - 1) return ids;
  const afterId = ids[lastIdx + 1];
  const rest = ids.filter((id) => !movingIds.includes(id));
  const insertIdx = rest.indexOf(afterId) + 1;
  rest.splice(insertIdx, 0, ...moving);
  return rest;
}

function computeDropOrder(ids, movingIds, targetId, before) {
  if (movingIds.includes(targetId)) return ids;
  let anchorId = targetId;
  if (!before) {
    const targetIdx = ids.indexOf(targetId);
    anchorId = targetIdx >= 0 && targetIdx < ids.length - 1 ? ids[targetIdx + 1] : null;
  }
  if (anchorId == null) {
    const moving = ids.filter((id) => movingIds.includes(id));
    const rest = ids.filter((id) => !movingIds.includes(id));
    return [...rest, ...moving];
  }
  return reorderProductIdBlock(ids, movingIds, anchorId);
}

function applyProductTableDomOrder(orderIds) {
  const tbody = document.getElementById('catalogProductsBody');
  if (!tbody) return;
  const map = new Map();
  tbody.querySelectorAll('tr[data-product-id]').forEach((tr) => {
    map.set(Number(tr.dataset.productId), tr);
  });
  orderIds.forEach((id) => {
    const tr = map.get(id);
    if (tr) tbody.appendChild(tr);
  });
}

function scrollProductRowIntoView(productId, scroller) {
  const row = document.querySelector(`#catalogProductsBody tr[data-product-id="${productId}"]`);
  if (!row || !scroller) return;
  const rowRect = row.getBoundingClientRect();
  const boxRect = scroller.getBoundingClientRect();
  if (rowRect.top < boxRect.top + 8) {
    scroller.scrollTop -= boxRect.top + 8 - rowRect.top;
  } else if (rowRect.bottom > boxRect.bottom - 8) {
    scroller.scrollTop += rowRect.bottom - boxRect.bottom + 8;
  }
}

const productDragScroll = {
  active: false,
  pointerY: 0,
  raf: null,
  scroller: null
};

function productDragAutoScrollStep() {
  if (!productDragScroll.active || !productDragScroll.scroller) return;
  const scroller = productDragScroll.scroller;
  const rect = scroller.getBoundingClientRect();
  const edge = 88;
  const maxStep = 26;
  let delta = 0;
  if (productDragScroll.pointerY < rect.top + edge) {
    const t = Math.min(1, (rect.top + edge - productDragScroll.pointerY) / edge);
    delta = -Math.ceil(maxStep * (0.35 + t * 0.65));
  } else if (productDragScroll.pointerY > rect.bottom - edge) {
    const t = Math.min(1, (productDragScroll.pointerY - (rect.bottom - edge)) / edge);
    delta = Math.ceil(maxStep * (0.35 + t * 0.65));
  }
  scroller.classList.toggle('product-scroll-up', delta < 0);
  scroller.classList.toggle('product-scroll-down', delta > 0);
  if (delta) scroller.scrollTop += delta;
  productDragScroll.raf = requestAnimationFrame(productDragAutoScrollStep);
}

function startProductDragAutoScroll(clientY, scroller) {
  productDragScroll.active = true;
  productDragScroll.pointerY = clientY;
  productDragScroll.scroller = scroller;
  if (productDragScroll.raf) cancelAnimationFrame(productDragScroll.raf);
  productDragScroll.raf = requestAnimationFrame(productDragAutoScrollStep);
}

function updateProductDragPointerY(clientY) {
  productDragScroll.pointerY = clientY;
}

function stopProductDragAutoScroll() {
  productDragScroll.active = false;
  if (productDragScroll.raf) {
    cancelAnimationFrame(productDragScroll.raf);
    productDragScroll.raf = null;
  }
  productDragScroll.scroller?.classList.remove('product-scroll-up', 'product-scroll-down');
  productDragScroll.scroller = null;
}

async function persistProductOrder(orderIds, movingCount = 1) {
  await commerceApi('/products/reorder', {
    method: 'POST',
    body: JSON.stringify({ sectionId: commerce.selectedSectionId, orderedIds: orderIds })
  });
  commerce.products.sort((a, b) => orderIds.indexOf(a.id) - orderIds.indexOf(b.id));
  const msg = movingCount > 1 ? `تم نقل ${movingCount} منتجات` : 'تم تحديث الترتيب';
  showToast(msg);
}

async function moveSelectedProducts(direction) {
  if (!canDragReorderProducts()) return;
  const movingIds = commerce.products
    .map((p) => p.id)
    .filter((id) => commerce.selectedProductIds.has(id));
  if (!movingIds.length) return;
  const ids = commerce.products.map((p) => p.id);
  const nextIds = direction === 'up'
    ? moveProductBlockUp(ids, movingIds)
    : moveProductBlockDown(ids, movingIds);
  if (nextIds.join(',') === ids.join(',')) return;
  try {
    await persistProductOrder(nextIds, movingIds.length);
    applyProductTableDomOrder(nextIds);
    syncProductRowSelectionStyles();
    scrollProductRowIntoView(movingIds[0], document.getElementById('productTableScroll'));
  } catch (err) {
    showToast(err.message, 'err');
  }
}

function selectProductRange(fromId, toId) {
  const ids = commerce.products.map((p) => p.id);
  const fromIdx = ids.indexOf(fromId);
  const toIdx = ids.indexOf(toId);
  if (fromIdx < 0 || toIdx < 0) return;
  const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
  for (let i = start; i <= end; i += 1) {
    commerce.selectedProductIds.add(ids[i]);
  }
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
  if (dragEnabled) {
    const hint = document.getElementById('productDragHint');
    if (hint) {
      hint.textContent = '↕ حدّد منتجات (Shift+نقر) — اسحب للأعلى/الأسفل مع تمرير تلقائي أو ▲▼';
    }
  }

  document.getElementById('catalogProductsBody').innerHTML = commerce.products.map((p) => `
    <tr data-product-id="${p.id}" ${dragEnabled ? 'draggable="true"' : ''} class="${dragEnabled ? 'product-draggable' : ''}${commerce.selectedProductIds.has(p.id) ? ' product-row-selected' : ''}">
      <td class="col-check"><input type="checkbox" class="product-check" data-id="${p.id}"></td>
      <td class="col-drag">${dragEnabled ? `<span class="drag-handle" title="اسحب${commerce.selectedProductIds.has(p.id) && commerce.selectedProductIds.size > 1 ? ' المجموعة' : ''}">⠿</span>` : ''}</td>
      <td>${p.imageUrl ? `<img src="${getApiBase()}${p.imageUrl}" alt="" class="product-thumb">` : '<span class="product-thumb-empty">—</span>'}</td>
      <td dir="ltr">${esc(p.barcode || p.skuNum || '—')}</td>
      <td>
        <strong>${esc(p.name)}</strong>
        ${commerce.productFilters.showAllSections && p.sectionName ? `<div class="muted product-sub">${esc(p.sectionName)}</div>` : ''}
        <div class="product-badges">${renderProductBadges(p)}</div>
      </td>
      <td dir="ltr">${p.minOrderQty || 0}</td>
      <td dir="ltr">${fmtMoney(p.price)}</td>
      <td>${p.isActive ? '<span class="badge ok">نشط</span>' : '<span class="badge err">موقوف</span>'}</td>
      <td class="product-actions">
        <button type="button" class="btn btn-soft btn-sm" data-prod-edit="${p.id}">تعديل</button>
        <button type="button" class="btn btn-danger btn-sm" data-prod-del="${p.id}">حذف</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="9">لا توجد منتجات — أضف منتجاً</td></tr>';

  const countEl = document.getElementById('productCountLine');
  if (countEl) {
    const from = commerce.productTotal ? commerce.productOffset + 1 : 0;
    const to = commerce.productOffset + commerce.products.length;
    countEl.textContent = `عرض ${from}–${to} من ${commerce.productTotal} منتج`;
  }
  renderProductPagination();

  let shiftRangeSelecting = false;
  document.querySelectorAll('.product-check').forEach((cb) => {
    cb.addEventListener('click', (e) => {
      const id = Number(cb.dataset.id);
      if (e.shiftKey && commerce.lastProductCheckId != null && commerce.lastProductCheckId !== id) {
        shiftRangeSelecting = true;
        selectProductRange(commerce.lastProductCheckId, id);
        document.querySelectorAll('.product-check').forEach((other) => {
          other.checked = commerce.selectedProductIds.has(Number(other.dataset.id));
        });
        updateBulkBar();
        return;
      }
      commerce.lastProductCheckId = id;
    });
    cb.addEventListener('change', () => {
      if (shiftRangeSelecting) {
        shiftRangeSelecting = false;
        return;
      }
      const id = Number(cb.dataset.id);
      if (cb.checked) commerce.selectedProductIds.add(id);
      else commerce.selectedProductIds.delete(id);
      commerce.lastProductCheckId = id;
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
  const scroller = document.getElementById('productTableScroll') || tbody?.closest('.table-scroll');
  const table = document.getElementById('catalogProductsTable');
  if (!tbody || !scroller || !table) return;

  if (!table.dataset.productDragBound) {
    table.dataset.productDragBound = '1';
    bindProductDragTableEvents(table, scroller);
  }

  tbody.querySelectorAll('tr[draggable="true"]').forEach((row) => {
    row.addEventListener('dragstart', (e) => onProductRowDragStart(e, row, tbody, scroller));
    row.addEventListener('dragend', () => onProductRowDragEnd(tbody));
  });
}

const productDragSession = {
  groupIds: [],
  savedOrderIds: null,
  dropped: false,
  previewKey: ''
};

function onProductRowDragStart(e, row, tbody, scroller) {
  if (e.target.closest('.product-check') || e.target.closest('button') || e.target.closest('a')) {
    e.preventDefault();
    return;
  }
  const dragId = Number(row.dataset.productId);
  productDragSession.groupIds = getDragProductGroup(dragId);
  productDragSession.savedOrderIds = commerce.products.map((p) => p.id);
  productDragSession.dropped = false;
  productDragSession.previewKey = '';
  row.classList.add('dragging');
  tbody.querySelectorAll('tr[data-product-id]').forEach((r) => {
    const id = Number(r.dataset.productId);
    if (productDragSession.groupIds.includes(id)) r.classList.add('dragging-group');
  });
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', productDragSession.groupIds.join(','));
  if (productDragSession.groupIds.length > 1) {
    const badge = document.createElement('div');
    badge.textContent = `${productDragSession.groupIds.length} منتج`;
    badge.style.cssText = 'position:fixed;top:-100px;padding:6px 10px;background:#2563eb;color:#fff;border-radius:8px;font-size:13px;';
    document.body.appendChild(badge);
    e.dataTransfer.setDragImage(badge, 20, 16);
    setTimeout(() => badge.remove(), 0);
  }
  startProductDragAutoScroll(e.clientY, scroller);
}

function onProductRowDragEnd(tbody) {
  stopProductDragAutoScroll();
  if (!productDragSession.dropped && productDragSession.savedOrderIds) {
    applyProductTableDomOrder(productDragSession.savedOrderIds);
    commerce.products.sort((a, b) =>
      productDragSession.savedOrderIds.indexOf(a.id) - productDragSession.savedOrderIds.indexOf(b.id));
  }
  productDragSession.groupIds = [];
  productDragSession.savedOrderIds = null;
  productDragSession.previewKey = '';
  tbody.querySelectorAll('tr').forEach((r) => {
    r.classList.remove('dragging', 'drag-over', 'drag-over-before', 'dragging-group');
  });
}

function bindProductDragTableEvents(table, scroller) {
  table.addEventListener('dragover', (e) => {
    if (!productDragSession.groupIds.length) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    updateProductDragPointerY(e.clientY);
    if (!productDragScroll.active) startProductDragAutoScroll(e.clientY, scroller);

    const row = e.target.closest('tr[data-product-id]');
    const tbody = document.getElementById('catalogProductsBody');
    if (!row || !tbody) return;

    const targetId = Number(row.dataset.productId);
    tbody.querySelectorAll('tr').forEach((r) => r.classList.remove('drag-over', 'drag-over-before'));
    if (productDragSession.groupIds.includes(targetId)) return;

    const rect = row.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    row.classList.toggle('drag-over-before', before);
    row.classList.toggle('drag-over', !before);

    const previewKey = `${targetId}:${before ? 'b' : 'a'}`;
    if (previewKey === productDragSession.previewKey) return;
    productDragSession.previewKey = previewKey;

    const ids = commerce.products.map((p) => p.id);
    const nextIds = computeDropOrder(ids, productDragSession.groupIds, targetId, before);
    if (nextIds.join(',') !== ids.join(',')) {
      applyProductTableDomOrder(nextIds);
      commerce.products.sort((a, b) => nextIds.indexOf(a.id) - nextIds.indexOf(b.id));
    }
  });

  scroller.addEventListener('dragover', (e) => {
    if (!productDragSession.groupIds.length) return;
    e.preventDefault();
    updateProductDragPointerY(e.clientY);
  });

  table.addEventListener('dragleave', (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      document.getElementById('catalogProductsBody')?.querySelectorAll('tr').forEach((r) => {
        r.classList.remove('drag-over', 'drag-over-before');
      });
    }
  });

  table.addEventListener('drop', async (e) => {
    if (!productDragSession.groupIds.length) return;
    e.preventDefault();
    const row = e.target.closest('tr[data-product-id]');
    if (!row) return;

    const targetId = Number(row.dataset.productId);
    if (productDragSession.groupIds.includes(targetId)) return;

    const ids = commerce.products.map((p) => p.id);
    const rect = row.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    const nextIds = computeDropOrder(ids, productDragSession.groupIds, targetId, before);

    try {
      productDragSession.dropped = true;
      await persistProductOrder(nextIds, productDragSession.groupIds.length);
      applyProductTableDomOrder(nextIds);
      syncProductRowSelectionStyles();
      scrollProductRowIntoView(productDragSession.groupIds[0], scroller);
    } catch (err) {
      productDragSession.dropped = false;
      if (productDragSession.savedOrderIds) {
        applyProductTableDomOrder(productDragSession.savedOrderIds);
        commerce.products.sort((a, b) =>
          productDragSession.savedOrderIds.indexOf(a.id) - productDragSession.savedOrderIds.indexOf(b.id));
      }
      showToast(err.message, 'err');
    }
  });
}

function setProductSectionContext(sectionId) {
  const id = sectionId || commerce.selectedSectionId;
  const el = document.getElementById('productSectionId');
  if (el) el.value = id || '';
  const section = commerce.allSections.find((s) => s.id === id)
    || commerce.sections.find((s) => s.id === id);
  const branch = commerce.branches.find((b) => b.id === (section?.branchId || commerce.selectedBranchId));
  const hint = document.getElementById('productAddSectionHint');
  if (!hint) return;
  if (!id) {
    hint.textContent = 'اختر قسماً من القائمة أولاً';
    hint.classList.add('warn');
    return;
  }
  hint.textContent = `يُضاف إلى: ${branch?.name || '—'} — ${section?.name || '—'}`;
  hint.classList.remove('warn');
}

function setProductImagePreview(p) {
  const box = document.getElementById('productImagePreview');
  const removeBtn = document.getElementById('btnProductRemoveImage');
  if (!box) return;
  if (p?.imageUrl) {
    box.innerHTML = `<img src="${getApiBase()}${p.imageUrl}" alt="" class="product-preview-img">`;
    removeBtn?.classList.remove('hidden');
  } else {
    box.innerHTML = '<span class="product-image-placeholder">صورة</span>';
    removeBtn?.classList.add('hidden');
  }
}

function setProductImagePreviewFromFile(file) {
  const box = document.getElementById('productImagePreview');
  const removeBtn = document.getElementById('btnProductRemoveImage');
  if (!box || !file) return;
  const url = URL.createObjectURL(file);
  box.innerHTML = `<img src="${url}" alt="" class="product-preview-img">`;
  removeBtn?.classList.remove('hidden');
}

function clearPendingProductImage() {
  pendingProductImageFile = null;
}

function isImageFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name || '');
}

function pickImageFromFileList(files) {
  const list = [...(files || [])];
  return list.find((f) => isImageFile(f)) || null;
}

function pickImageFromDataTransfer(dt) {
  if (!dt) return null;
  const fromFiles = pickImageFromFileList(dt.files);
  if (fromFiles) return fromFiles;
  const items = [...(dt.items || [])];
  for (const item of items) {
    if (item.kind === 'file' && (!item.type || item.type.startsWith('image/'))) {
      const file = item.getAsFile();
      if (file && isImageFile(file)) return file;
    }
  }
  return null;
}

async function applyProductImageFile(file) {
  if (!file) return;
  if (!isImageFile(file)) {
    showToast('الملف ليس صورة صالحة', 'err');
    return;
  }
  const id = document.getElementById('productId')?.value;
  try {
    if (id) {
      await uploadProductImage(Number(id), file);
    } else {
      pendingProductImageFile = file;
      setProductImagePreviewFromFile(file);
      showToast('تم تجهيز الصورة — تُرفع عند الإضافة');
    }
  } catch (err) {
    showToast(err.message || 'فشل رفع الصورة', 'err');
  }
}

function isProductModalOpen() {
  const modal = document.getElementById('productModal');
  return !!(modal && !modal.classList.contains('hidden'));
}

function bindProductImageDropzone() {
  const zone = document.getElementById('productImageDropzone');
  if (!zone || zone.dataset.boundDropzone) return;
  zone.dataset.boundDropzone = '1';

  const setDrag = (on) => zone.classList.toggle('is-dragover', !!on);

  zone.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    document.getElementById('productImageInput')?.click();
  });

  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      document.getElementById('productImageInput')?.click();
    }
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    zone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setDrag(true);
    });
  });

  zone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (!zone.contains(e.relatedTarget)) setDrag(false);
  });

  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag(false);
    const file = pickImageFromDataTransfer(e.dataTransfer);
    if (!file) {
      showToast('أسقط ملف صورة فقط', 'err');
      return;
    }
    await applyProductImageFile(file);
  });

  // Paste while product modal is open (Ctrl+V / Cmd+V)
  document.addEventListener('paste', async (e) => {
    if (!isProductModalOpen()) return;
    const file = pickImageFromDataTransfer(e.clipboardData);
    if (!file) return;
    // Don't steal paste from text fields unless clipboard is an image
    const tag = (e.target?.tagName || '').toLowerCase();
    if ((tag === 'input' || tag === 'textarea') && !file.type?.startsWith('image/')) return;
    e.preventDefault();
    await applyProductImageFile(file);
  });
}

let lastEdariMaterial = null;
let barcodeLookupTimer = null;
let pendingProductImageFile = null;

async function pushEdariMaterialToCache(material) {
  if (!material?.seq) return material;
  try {
    const data = await commerceApi('/products/edari-cache', {
      method: 'POST',
      body: JSON.stringify({ material })
    });
    return data.material || material;
  } catch {
    return material;
  }
}

function fillProductFormFromEdari(m) {
  if (!m) return;
  document.getElementById('productName').value = m.name || '';
  document.getElementById('productBarcode').value = m.barcode || m.num || '';
  document.getElementById('productSkuNum').value = m.num || '';
  document.getElementById('productEdariSeq').value = m.seq || '';
  document.getElementById('productUnit').value = m.unit || '';
  document.getElementById('productPrice').value = m.wholesalePrice ?? m.price ?? 0;
  document.getElementById('productQty').value = m.stockQty ?? m.qty ?? 0;
}

function buildMaterialPayload(material, price, qty) {
  if (!material?.seq) return null;
  return {
    ...material,
    price: Number(price) || material.price || material.wholesalePrice || 0,
    wholesalePrice: Number(price) || material.wholesalePrice || material.price || 0,
    stockQty: Number(qty) || material.stockQty || material.qty || 0,
    qty: Number(qty) || material.qty || material.stockQty || 0
  };
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
    box.innerHTML = `<p class="muted">${esc(message || 'أدخل باركوداً موجوداً في Edari')}</p>`;
    return;
  }
  box.classList.add('edari-live-ok');
  box.innerHTML = `
    <p class="muted"><span class="badge ok">من Edari</span>
    عدد (رصيد): <strong dir="ltr">${material.stockQty ?? material.qty ?? 0}</strong>
    · سعر الجملة: <strong dir="ltr">${fmtMoney(material.wholesalePrice ?? material.price)}</strong></p>`;
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
      document.getElementById('productPrice').value = '';
      document.getElementById('productQty').value = '';
    }
    renderEdariLivePreview(null, 'err', 'أدخل الباركود');
    return;
  }
  renderEdariLivePreview(null, 'loading');
  try {
    let material = null;
    let liveMaterial = null;
    if (window.edariDesktop?.lookupEdariMaterial) {
      const live = await window.edariDesktop.lookupEdariMaterial(raw);
      if (live?.ok && live.material) {
        liveMaterial = live.material;
        material = live.material;
      } else if (live?.error && !live.ok) {
        lastEdariMaterial = null;
        renderEdariLivePreview(null, 'err', live.error);
        return;
      }
    }
    if (!material?.seq) {
      const data = await commerceApi(`/products/edari-lookup?code=${encodeURIComponent(raw)}`);
      material = data.material;
    } else {
      material = await pushEdariMaterialToCache(liveMaterial);
      if (material && liveMaterial) {
        const livePrice = liveMaterial.wholesalePrice ?? liveMaterial.price ?? 0;
        if (livePrice > 0) {
          material = {
            ...material,
            ...liveMaterial,
            wholesalePrice: livePrice,
            price: livePrice
          };
        }
      }
    }
    lastEdariMaterial = material;
    fillProductFormFromEdari(material);
    renderEdariLivePreview(material, 'ok');
  } catch (err) {
    lastEdariMaterial = null;
    renderEdariLivePreview(null, 'err', err.message);
  }
}

function openProductModal(id = null) {
  const modal = document.getElementById('productModal');
  const isEdit = !!id;
  lastEdariMaterial = null;
  clearPendingProductImage();
  clearShadeRows();

  if (!isEdit && !commerce.selectedSectionId) {
    return showToast('اختر قسماً أولاً', 'err');
  }

  const barcodeInput = document.getElementById('productBarcode');
  document.getElementById('productModalTitle').textContent = isEdit ? 'تعديل منتج' : 'إضافة منتج';
  document.getElementById('productId').value = id || '';
  document.getElementById('productSaveBtn').textContent = isEdit ? 'حفظ' : 'إضافة';
  document.getElementById('btnProductSyncEdari')?.classList.toggle('hidden', !isEdit);
  modal.classList.toggle('product-modal--edit', isEdit);
  document.getElementById('productShadesBuilder')?.classList.toggle('hidden', isEdit);
  if (barcodeInput) barcodeInput.readOnly = isEdit;

  if (isEdit) {
    const p = commerce.products.find((x) => x.id === id);
    if (!p) return;
    setProductSectionContext(p.sectionId);
    barcodeInput.value = p.barcode || '';
    document.getElementById('productName').value = p.name || '';
    document.getElementById('productQty').value = p.minOrderQty ?? 0;
    document.getElementById('productPrice').value = p.price ?? 0;
    document.getElementById('productSkuNum').value = p.skuNum || '';
    document.getElementById('productEdariSeq').value = p.edariSeq || '';
    document.getElementById('productUnit').value = p.unit || '';
    document.getElementById('productShadeName').value = p.shadeName || '';
    document.getElementById('productColorCode').value = p.colorCode || '';
    document.getElementById('productGroupKey').value = p.groupKey || '';
    renderEdariLivePreview({
      stockQty: p.minOrderQty ?? 0,
      qty: p.minOrderQty ?? 0,
      wholesalePrice: p.price ?? 0,
      price: p.price ?? 0
    }, 'ok');
    document.getElementById('productImageHint').textContent =
      `اسحب وأفلت أو الصق (Ctrl+V) — آخر مزامنة Edari: ${(p.syncedAt || '—').slice(0, 19).replace('T', ' ')}`;
    setProductImagePreview(p);
  } else {
    document.getElementById('productForm').reset();
    document.getElementById('productQty').value = '';
    document.getElementById('productPrice').value = '';
    document.getElementById('productShadeName').value = '';
    document.getElementById('productColorCode').value = '';
    document.getElementById('productGroupKey').value = '';
    if (barcodeInput) barcodeInput.readOnly = false;
    setProductSectionContext(commerce.selectedSectionId);
    document.getElementById('edariLivePreview')?.classList.add('hidden');
    document.getElementById('productImageHint').textContent =
      'اسحب وأفلت، أو الصق (Ctrl+V)، أو اختر ملفاً — PNG / JPG / WebP';
    setProductImagePreview(null);
    setTimeout(() => barcodeInput?.focus(), 120);
  }

  modal.classList.remove('hidden');
}

function closeProductModal() {
  document.getElementById('productModal').classList.add('hidden');
}

async function saveProductForm(e) {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const isEdit = !!id;

  if (isEdit) {
    try {
      if (pendingProductImageFile) {
        await uploadProductImage(Number(id), pendingProductImageFile);
        clearPendingProductImage();
      }
      showToast('تم الحفظ');
      closeProductModal();
      await loadCatalogProducts();
    } catch (err) {
      showToast(err.message || 'فشل الحفظ', 'err');
    }
    return;
  }

  const sectionId = Number(document.getElementById('productSectionId').value);
  const barcode = document.getElementById('productBarcode').value.trim();
  const name = document.getElementById('productName').value.trim();
  const shadeName = document.getElementById('productShadeName')?.value.trim() || '';
  const colorCode = document.getElementById('productColorCode')?.value.trim() || '';
  const extraShades = collectExtraShadeRows();

  if (!sectionId) return showToast('اختر قسماً', 'err');
  if (!barcode) return showToast('الباركود مطلوب', 'err');

  try {
    if (!lastEdariMaterial?.seq) {
      return showToast('أدخل باركوداً موجوداً في Edari أولاً', 'err');
    }
    if (!name) return showToast('الاسم مطلوب — امسح الباركود وأعد الإدخال', 'err');
    const price = Number(document.getElementById('productPrice').value) || 0;
    const minOrderQty = Number(document.getElementById('productQty').value) || 0;

    if (extraShades.length) {
      const shades = [
        {
          barcode,
          shadeName,
          colorCode,
          material: buildMaterialPayload(lastEdariMaterial, price, minOrderQty),
          price,
          minOrderQty
        },
        ...extraShades
      ];
      const data = await commerceApi('/products/shade-group', {
        method: 'POST',
        body: JSON.stringify({ sectionId, name, shades })
      });
      if (pendingProductImageFile && data.products?.[0]?.id) {
        await uploadProductImage(data.products[0].id, pendingProductImageFile);
        clearPendingProductImage();
      }
      const errN = (data.errors || []).length;
      showToast(errN
        ? `أُضيف ${data.products.length} درجة — فشل ${errN}`
        : `أُضيف ${data.products.length} درجة`);
    } else {
      const data = await commerceApi('/products/by-barcode', {
        method: 'POST',
        body: JSON.stringify({
          sectionId,
          barcode,
          name,
          price,
          minOrderQty,
          shadeName,
          colorCode,
          priceOverride: false,
          material: buildMaterialPayload(lastEdariMaterial, price, minOrderQty)
        })
      });
      if (pendingProductImageFile && data.product?.id) {
        await uploadProductImage(data.product.id, pendingProductImageFile);
        clearPendingProductImage();
      }
      showToast('تمت إضافة المنتج');
    }
    closeProductModal();
    await loadCatalogProducts();
  } catch (err) {
    showToast(err.message || 'فشل الحفظ', 'err');
  }
}

function clearShadeRows() {
  const box = document.getElementById('productShadeRows');
  if (box) box.innerHTML = '';
}

function addShadeRow(prefill = {}) {
  const box = document.getElementById('productShadeRows');
  if (!box) return;
  const row = document.createElement('div');
  row.className = 'product-shade-row';
  row.innerHTML = `
    <input type="text" class="shade-row-barcode" dir="ltr" placeholder="باركود الدرجة" value="${esc(prefill.barcode || '')}">
    <input type="text" class="shade-row-name" placeholder="اسم الدرجة" value="${esc(prefill.shadeName || '')}">
    <input type="color" class="shade-row-color" value="${esc(prefill.colorCode || '#cccccc')}" title="لون">
    <input type="text" class="shade-row-color-hex" dir="ltr" placeholder="#hex" value="${esc(prefill.colorCode || '')}">
    <button type="button" class="btn btn-icon shade-row-remove" aria-label="حذف">×</button>
  `;
  const color = row.querySelector('.shade-row-color');
  const hex = row.querySelector('.shade-row-color-hex');
  color?.addEventListener('input', () => { if (hex) hex.value = color.value; });
  hex?.addEventListener('change', () => {
    if (color && /^#[0-9a-fA-F]{6}$/.test(hex.value.trim())) color.value = hex.value.trim();
  });
  row.querySelector('.shade-row-remove')?.addEventListener('click', () => row.remove());
  box.appendChild(row);
}

function collectExtraShadeRows() {
  return [...document.querySelectorAll('#productShadeRows .product-shade-row')]
    .map((row) => ({
      barcode: row.querySelector('.shade-row-barcode')?.value.trim() || '',
      shadeName: row.querySelector('.shade-row-name')?.value.trim() || '',
      colorCode: row.querySelector('.shade-row-color-hex')?.value.trim()
        || row.querySelector('.shade-row-color')?.value || ''
    }))
    .filter((s) => s.barcode);
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
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('تعذّر قراءة الصورة'));
    reader.readAsDataURL(file);
  });
  await commerceApi(`/products/${id}/image`, {
    method: 'POST',
    body: JSON.stringify({ dataUrl })
  });
  showToast('تم رفع الصورة');
  const data = await commerceApi(`/products/${id}`);
  setProductImagePreview(data.product);
  await loadCatalogProducts();
}

async function runBulkAction(action) {
  const ids = [...commerce.selectedProductIds];
  if (!ids.length) return;

  if (action === 'move_up') {
    await moveSelectedProducts('up');
    return;
  }
  if (action === 'move_down') {
    await moveSelectedProducts('down');
    return;
  }
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
      <td><span class="badge ${orderStatusBadgeClass(o.status)}">${esc(o.statusLabel)}</span></td>
      <td dir="ltr">${o.lines?.length || 0}</td>
      <td dir="ltr">${fmtMoney(o.totalAmount)}</td>
      <td>${esc(o.submittedAt || o.createdAt || '—')}</td>
      <td class="orders-row-actions">
        <button type="button" class="btn btn-soft btn-sm" data-order-id="${o.id}">عرض</button>
        <button type="button" class="btn btn-danger btn-sm" data-order-delete="${o.id}" data-order-no="${esc(o.orderNo)}" title="حذف الطلب">حذف</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="8">لا توجد طلبات</td></tr>';

  document.querySelectorAll('[data-order-id]').forEach((btn) => {
    btn.addEventListener('click', () => openOrderDetail(Number(btn.dataset.orderId)));
  });
  document.querySelectorAll('[data-order-delete]').forEach((btn) => {
    btn.addEventListener('click', () => {
      void deleteOrderById(Number(btn.dataset.orderDelete), btn.dataset.orderNo || '');
    });
  });
}

function orderStatusBadgeClass(status) {
  return ({
    draft: 'muted-badge',
    submitted: 'pending',
    under_review: 'warn',
    approved: 'ok',
    rejected: 'off',
    processing: 'pending',
    delivered: 'ok',
    cancelled: 'muted-badge'
  })[status] || 'pending';
}

async function deleteOrderById(id, orderNo = '') {
  const label = orderNo ? `الطلب ${orderNo}` : 'هذا الطلب';
  if (!confirm(`حذف ${label} نهائياً؟\nلا يمكن التراجع عن هذا الإجراء.`)) return;
  try {
    await commerceApi(`/orders/${id}`, { method: 'DELETE' });
    showToast('تم حذف الطلب');
    if (commerce.selectedOrder?.id === id) {
      commerce.selectedOrder = null;
      document.getElementById('orderDetailPanel')?.classList.add('hidden');
    }
    await loadOrdersPage();
  } catch (err) {
    showToast(err.message || 'تعذّر حذف الطلب', 'err');
  }
}

async function openOrderDetail(id) {
  const data = await commerceApi(`/orders/${id}`);
  const o = data.order;
  commerce.selectedOrder = o;
  const panel = document.getElementById('orderDetailPanel');
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="panel-head order-detail-head">
      <div>
        <h3>طلب ${esc(o.orderNo)} · ${esc(o.statusLabel)}</h3>
        <p class="muted order-detail-sub">${esc(o.agentName)}${o.catalogBranchName ? ` · ${esc(o.catalogBranchName)}` : ''}</p>
      </div>
      <div class="btn-row order-detail-actions no-print">
        <button type="button" class="btn btn-soft btn-sm" id="btnPrintOrder">طباعة</button>
        <button type="button" class="btn btn-primary btn-sm" id="btnExportOrderPdf">تصدير PDF</button>
        <button type="button" class="btn btn-danger btn-sm" id="btnDeleteOrder">حذف الطلب</button>
        <button type="button" class="btn btn-soft btn-sm" id="btnCloseOrderDetail">إغلاق</button>
      </div>
    </div>
    <div id="orderInvoicePrint" class="order-invoice-wrap">
      ${renderOrderInvoiceDocument(o)}
    </div>
    <div class="order-meta-bar no-print">
      <span class="badge ${orderStatusBadgeClass(o.status)}">${esc(o.statusLabel)}</span>
      <span class="muted">${esc(o.submittedAt || o.createdAt || '—')}</span>
    </div>
    <div class="btn-row order-status-actions no-print" style="margin-top:12px">
      <button type="button" class="btn btn-primary btn-sm" data-status="approved">موافقة</button>
      <button type="button" class="btn btn-soft btn-sm" data-status="under_review">مراجعة</button>
      <button type="button" class="btn btn-danger btn-sm" data-status="rejected">رفض</button>
      <button type="button" class="btn btn-soft btn-sm" data-status="processing">تنفيذ</button>
      <button type="button" class="btn btn-soft btn-sm" data-status="delivered">تم التسليم</button>
      <button type="button" class="btn btn-soft btn-sm" data-status="cancelled">إلغاء</button>
    </div>`;

  document.getElementById('btnCloseOrderDetail')?.addEventListener('click', () => {
    commerce.selectedOrder = null;
    panel.classList.add('hidden');
  });
  document.getElementById('btnPrintOrder')?.addEventListener('click', () => printOrderInvoice());
  document.getElementById('btnExportOrderPdf')?.addEventListener('click', async () => {
    try {
      await downloadOrderPdf(o);
      showToast('تم تنزيل PDF');
    } catch (err) {
      showToast(err.message, 'err');
    }
  });
  document.getElementById('btnDeleteOrder')?.addEventListener('click', () => {
    void deleteOrderById(o.id, o.orderNo);
  });
  panel.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const note = btn.dataset.status === 'rejected' ? prompt('سبب الرفض:') : '';
      if (btn.dataset.status === 'rejected' && note == null) return;
      try {
        await commerceApi(`/orders/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: btn.dataset.status, note: note || '' })
        });
        await loadOrdersPage();
        await openOrderDetail(id);
      } catch (err) {
        showToast(err.message || 'تعذّر تحديث الحالة', 'err');
      }
    });
  });
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function initCommerceAdmin() {
  document.getElementById('btnAddBranch')?.addEventListener('click', () => openCatalogCreate('branch'));

  document.getElementById('btnAddSection')?.addEventListener('click', () => openCatalogCreate('section'));

  document.getElementById('btnAddProduct')?.addEventListener('click', () => openProductModal());
  document.getElementById('btnAddShadeRow')?.addEventListener('click', () => addShadeRow());

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

  document.getElementById('btnRefreshProductPrices')?.addEventListener('click', () => refreshCatalogPricesNow());

  document.getElementById('btnSyncSectionProducts')?.addEventListener('click', async () => {
    if (!commerce.selectedSectionId) return showToast('اختر قسماً', 'err');
    if (!confirm('مزامنة كل منتجات هذا القسم من Edari؟\nسيتم تحديث الاسم والعدد والسعر من الإداري.')) return;
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
      document.getElementById('productQty').value = data.product.minOrderQty ?? 0;
      document.getElementById('productPrice').value = data.product.price ?? 0;
      renderEdariLivePreview({
        stockQty: data.product.minOrderQty ?? 0,
        qty: data.product.minOrderQty ?? 0,
        wholesalePrice: data.product.price ?? 0,
        price: data.product.price ?? 0
      }, 'ok');
      showToast('تم التحديث من Edari');
      await loadCatalogProducts();
    } catch (err) {
      showToast(err.message, 'err');
    }
  });

  document.getElementById('btnProductUploadImage')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('productImageInput').click();
  });

  document.getElementById('productImageInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await applyProductImageFile(file);
  });

  bindProductImageDropzone();

  document.getElementById('btnProductRemoveImage')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const id = document.getElementById('productId').value;
    if (pendingProductImageFile) {
      clearPendingProductImage();
      setProductImagePreview(null);
      return;
    }
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
  catalog: loadCatalogPage,
  orders: loadOrdersPage
};

initCommerceAdmin();
