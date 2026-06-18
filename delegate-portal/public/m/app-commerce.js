/* Mobile commerce v3: Edari-style showcase + live invoice + localStorage */

function shopGridLayout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  let cols = 2;
  if (w >= 1280) cols = 4;
  else if (w >= 600) cols = 3;
  let rows = 2;
  if (w >= 1024 && h >= 680) rows = 3;
  else if (w >= 768 && h >= 560) rows = 3;
  return { cols, rows, perPage: cols * rows };
}

function getProductsPerPage() {
  return shopGridLayout().perPage;
}

const commerce = {
  branches: [],
  sections: [],
  products: [],
  productFilter: '',
  orders: [],
  selectedBranch: null,
  selectedSection: null,
  selectedProductId: null,
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

function invoiceStorageKey() {
  return `delegateInvoice:${state.agent?.id || 'guest'}`;
}

function commerceApi(path, opts = {}) {
  return api(path, opts);
}

function getDraft(productId) {
  const id = Number(productId);
  if (!commerce.draft[id]) commerce.draft[id] = { quant: 0, bonus: 0 };
  return commerce.draft[id];
}

function invoiceUnitsTotal() {
  return Object.values(commerce.draft).reduce((s, d) => s + Number(d.quant || 0), 0);
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function findProduct(id) {
  return commerce.products.find((p) => p.id === Number(id)) || null;
}

function selectProduct(productId) {
  commerce.selectedProductId = productId ? Number(productId) : null;
  renderProductDetailPanel();
  document.querySelectorAll('.shop-prod-card').forEach((el) => {
    el.classList.toggle('shop-prod-card-active', Number(el.dataset.productId) === commerce.selectedProductId);
  });
}

function invoiceLineCount() {
  return Object.values(commerce.draft).filter((d) => d.quant > 0 || d.bonus > 0).length;
}

function updateShopOrderStats() {
  const unitsEl = document.getElementById('shopStatUnits');
  const itemsEl = document.getElementById('shopStatItems');
  const totalEl = document.getElementById('shopStatTotal');
  const nameEl = document.getElementById('shopCustomerName');
  if (unitsEl) unitsEl.textContent = fmtInvInt(invoiceUnitsTotal());
  if (itemsEl) itemsEl.textContent = String(invoiceLineCount());
  if (totalEl) totalEl.textContent = fmtInvInt(invoiceTotalAmount());
  if (nameEl) {
    const c = commerce.invoiceCustomer;
    nameEl.textContent = c?.name1 || 'اختر زبوناً';
  }
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

function orderLineTotal(line) {
  return Math.round(Number(line.quant || 0) * Number(line.unitPrice || line.price || 0));
}

function buildOrderLines() {
  const lines = [];
  for (const p of commerce.products) {
    const d = commerce.draft[p.id];
    if (!d || (!d.quant && !d.bonus)) continue;
    lines.push({
      productId: p.id,
      barcode: p.barcode || p.skuNum || '',
      matNum: p.barcode || p.skuNum || '',
      matName: p.name,
      quant: d.quant || 0,
      bonus: d.bonus || 0,
      unitPrice: Number(p.price || 0),
      price: Number(p.price || 0),
      lineTotal: (d.quant || 0) * Number(p.price || 0)
    });
  }
  return lines;
}

function persistInvoiceDraft() {
  if (!state.agent?.id) return;
  const payload = {
    branchId: commerce.selectedBranch?.id || null,
    branchName: commerce.selectedBranch?.name || '',
    sectionId: commerce.selectedSection?.id || null,
    sectionName: commerce.selectedSection?.name || '',
    draft: commerce.draft,
    customer: commerce.invoiceCustomer,
    notes: commerce.invoiceNotes,
    savedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem(invoiceStorageKey(), JSON.stringify(payload));
  } catch { /* quota */ }
  updateResumeBanner();
}

function loadInvoiceDraft() {
  try {
    const raw = localStorage.getItem(invoiceStorageKey());
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearInvoiceStorage() {
  localStorage.removeItem(invoiceStorageKey());
  updateResumeBanner();
}

function hasSavedInvoiceLines(saved) {
  if (!saved?.draft) return false;
  return Object.values(saved.draft).some((d) => Number(d.quant) > 0 || Number(d.bonus) > 0);
}

function applyPersistedDraft() {
  const saved = loadInvoiceDraft();
  if (!saved) return;
  commerce.draft = saved.draft || {};
  commerce.invoiceCustomer = saved.customer || commerce.invoiceCustomer;
  commerce.invoiceNotes = saved.notes || '';
  const notesEl = document.getElementById('invoiceNotes');
  if (notesEl && notesEl.value !== commerce.invoiceNotes) notesEl.value = commerce.invoiceNotes;
}

function restoreDraftIntoMemory() {
  const saved = loadInvoiceDraft();
  if (!saved) return;
  commerce.draft = saved.draft || {};
  commerce.invoiceCustomer = saved.customer || null;
  commerce.invoiceNotes = saved.notes || '';
}

function updateResumeBanner() {
  const banner = document.getElementById('invoiceResumeBanner');
  const text = document.getElementById('invoiceResumeText');
  if (!banner || !text) return;
  const saved = loadInvoiceDraft();
  const active = hasSavedInvoiceLines(saved);
  banner.classList.toggle('hidden', !active);
  if (active) {
    const where = [saved.branchName, saved.sectionName].filter(Boolean).join(' · ');
    text.textContent = where ? `محفوظة · ${where}` : 'فاتورة محفوظة';
  }
}

function adjustDraft(productId, field, delta) {
  const d = getDraft(productId);
  const key = field === 'bonus' ? 'bonus' : 'quant';
  d[key] = Math.max(0, Number(d[key] || 0) + Number(delta || 0));
  syncProductRow(productId);
  updateInvoiceUI();
  persistInvoiceDraft();
}

function syncProductRow(productId) {
  const id = Number(productId);
  const d = getDraft(id);
  const active = (d.quant || 0) > 0 || (d.bonus || 0) > 0;
  const card = document.querySelector(`.shop-prod-card[data-product-id="${id}"]`);
  if (card) card.classList.toggle('shop-prod-card-in-cart', active);
  if (commerce.selectedProductId === id) {
    const qEl = document.querySelector('[data-detail-q]');
    const bEl = document.querySelector('[data-detail-b]');
    const lineEl = document.querySelector('[data-detail-line-total]');
    if (qEl) qEl.textContent = String(d.quant || 0);
    if (bEl) bEl.textContent = String(d.bonus || 0);
    if (lineEl) {
      const p = findProduct(id);
      lineEl.textContent = fmtInvInt((d.quant || 0) * Number(p?.price || 0));
    }
  }
  updateShopOrderStats();
}

function renderQtyBlock(productId, field, value) {
  const isGift = field === 'bonus';
  const detailAttr = isGift ? 'data-detail-b' : 'data-detail-q';
  const label = isGift ? 'عينة' : 'وحدة';
  return `
    <div class="shop-detail-step${isGift ? ' shop-detail-step-gift' : ''}">
      <span class="prod-step-label">${label}</span>
      <div class="prod-step-btns">
        <button type="button" class="prod-btn prod-btn-minus" data-draft-action data-product-id="${productId}" data-field="${field}" data-delta="-1" aria-label="نقص">−</button>
        <span class="prod-step-val" dir="ltr" ${detailAttr}>${value}</span>
        <button type="button" class="prod-btn prod-btn-plus" data-draft-action data-product-id="${productId}" data-field="${field}" data-delta="1" aria-label="زيادة">+</button>
      </div>
    </div>`;
}

function productImageSrc(p) {
  if (!p?.imageUrl) return '';
  if (String(p.imageUrl).startsWith('http')) return p.imageUrl;
  return `${window.location.origin}${p.imageUrl}`;
}

function renderProductGridCard(p) {
  const d = getDraft(p.id);
  const selected = commerce.selectedProductId === p.id;
  const inCart = (d.quant || 0) > 0 || (d.bonus || 0) > 0;
  const img = productImageSrc(p);
  return `
    <button type="button" class="shop-prod-card${selected ? ' shop-prod-card-active' : ''}${inCart ? ' shop-prod-card-in-cart' : ''}" data-product-id="${p.id}" data-select-product="${p.id}">
      <span class="shop-prod-card-media">
        ${img
    ? `<img src="${img}" alt="" class="shop-prod-card-img" loading="lazy">`
    : '<span class="shop-prod-card-empty" aria-hidden="true">📦</span>'}
      </span>
      <span class="shop-prod-card-name">${esc(p.name)}</span>
    </button>`;
}

function renderProductDetailPanel() {
  const panel = document.getElementById('shopProductDetail');
  if (!panel) return;
  const p = findProduct(commerce.selectedProductId);
  if (!p) {
    panel.classList.add('is-empty');
    panel.innerHTML = `
      <div class="shop-detail-empty">
        <span aria-hidden="true">📦</span>
        <p>اختر صنفاً من القائمة</p>
      </div>`;
    return;
  }
  panel.classList.remove('is-empty');
  const d = getDraft(p.id);
  const img = productImageSrc(p);
  const stock = Number(p.minOrderQty ?? 0);
  const lineTotal = (d.quant || 0) * Number(p.price || 0);
  panel.innerHTML = `
    <div class="shop-detail-inner">
      <div class="shop-detail-scroll">
        ${img ? `<button type="button" class="shop-detail-hero" data-view-product-id="${p.id}" aria-label="عرض الصورة"><img src="${img}" alt=""></button>` : ''}
        <h3 class="shop-detail-name">${esc(p.name)}</h3>
        <p class="shop-detail-meta">
          <span dir="ltr">${esc(p.barcode || p.skuNum || '—')}</span>
          <span class="shop-detail-price" dir="ltr">${fmtInvInt(p.price)}</span>
        </p>
        <div class="shop-detail-qty">
          ${renderQtyBlock(p.id, 'quant', d.quant || 0)}
          ${renderQtyBlock(p.id, 'bonus', d.bonus || 0)}
        </div>
        <div class="shop-detail-summary">
          <span>مخزون <strong dir="ltr">${stock > 0 ? fmtInvInt(stock) : '—'}</strong></span>
          <span>إجمالي <strong dir="ltr" data-detail-line-total>${fmtInvInt(lineTotal)}</strong></span>
        </div>
      </div>
      <div class="shop-detail-foot">
        <button type="button" class="shop-detail-add" data-draft-action data-product-id="${p.id}" data-field="quant" data-delta="1">إضافة</button>
        <label class="shop-detail-notes">
          <textarea id="shopDetailNotes" rows="2" placeholder="ملاحظات...">${esc(commerce.invoiceNotes || '')}</textarea>
        </label>
      </div>
    </div>`;
}

function renderSectionTabs() {
  const tabs = document.getElementById('shopSectionTabs');
  if (!tabs) return;
  if (!commerce.sections.length) {
    tabs.innerHTML = '';
    return;
  }
  tabs.innerHTML = commerce.sections.map((s) => `
    <button type="button" class="shop-edari-tab${commerce.selectedSection?.id === s.id ? ' active' : ''}"
      role="tab" aria-selected="${commerce.selectedSection?.id === s.id}"
      data-shop-section-tab="${s.id}">${esc(s.name)}</button>`).join('');
}

function renderPageDots(pageCount, activeIndex = 0) {
  const dots = document.getElementById('shopPageDots');
  if (!dots) return;
  if (pageCount <= 1) {
    dots.innerHTML = '';
    dots.classList.add('hidden');
    return;
  }
  dots.classList.remove('hidden');
  dots.innerHTML = Array.from({ length: pageCount }, (_, i) => `
    <span class="shop-page-dot${i === activeIndex ? ' active' : ''}" data-page-dot="${i}"></span>`).join('');
}

function bindProductPagesScroll() {
  const vp = document.getElementById('shopPagesViewport');
  const dotsEl = document.getElementById('shopPageDots');
  if (!vp || vp.dataset.boundScroll) return;
  vp.dataset.boundScroll = '1';
  vp.addEventListener('scroll', () => {
    const w = vp.clientWidth || 1;
    const idx = Math.round(vp.scrollLeft / w);
    dotsEl?.querySelectorAll('.shop-page-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === idx);
    });
  }, { passive: true });
}

function renderProductPages() {
  const track = document.getElementById('shopProductsPages');
  const vp = document.getElementById('shopPagesViewport');
  if (!track) return;
  const items = filteredProducts();
  if (!items.length) {
    track.innerHTML = '<div class="shop-pages-empty"><p>لا توجد منتجات</p></div>';
    renderPageDots(0);
    return;
  }
  const pages = chunkArray(items, getProductsPerPage());
  if (!commerce.selectedProductId || !items.some((p) => p.id === commerce.selectedProductId)) {
    commerce.selectedProductId = items[0].id;
  }
  track.innerHTML = pages.map((pageItems) => `
    <div class="shop-page">
      <div class="shop-page-grid">
        ${pageItems.map(renderProductGridCard).join('')}
      </div>
    </div>`).join('');
  renderPageDots(pages.length, 0);
  if (vp) vp.scrollLeft = 0;
  bindProductPagesScroll();
  renderProductDetailPanel();
}

function renderProductShowcase() {
  renderSectionTabs();
  renderProductPages();
  updateInvoiceUI();
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
  renderProductShowcase();
}

async function loadSectionProducts() {
  if (!commerce.selectedSection?.id) return;
  const data = await commerceApi(`/catalog/sections/${commerce.selectedSection.id}/products`);
  commerce.products = data.products || [];
  commerce.productFilter = '';
  const searchEl = document.getElementById('shopProductSearch');
  if (searchEl) searchEl.value = '';
  applyPersistedDraft();
  renderProductShowcase();
  persistInvoiceDraft();
}

async function switchSection(sectionId) {
  const next = commerce.sections.find((x) => x.id === Number(sectionId));
  if (!next || commerce.selectedSection?.id === next.id) return;
  commerce.selectedSection = next;
  commerce.selectedProductId = null;
  setOverlay(true);
  try {
    await loadSectionProducts();
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

async function openShopCatalog() {
  if (!commerce.selectedBranch) return goToScreen('shop');
  setOverlay(true);
  try {
    const data = await commerceApi(`/catalog/branches/${commerce.selectedBranch.id}/sections`);
    commerce.sections = data.sections || [];
    if (!commerce.sections.length) {
      alert('لا توجد أقسام في هذا الفرع');
      return;
    }
    const saved = loadInvoiceDraft();
    let section = commerce.selectedSection;
    if (!section || !commerce.sections.some((s) => s.id === section.id)) {
      if (saved?.sectionId && saved.branchId === commerce.selectedBranch.id) {
        section = commerce.sections.find((s) => s.id === saved.sectionId);
      }
      section = section || commerce.sections[0];
    }
    commerce.selectedSection = section;
    await loadSectionProducts();
    goToScreen('shop-products');
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

function todayInvoiceDate() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function renderInvoiceHeroBlock(lines, meta = {}) {
  const {
    title = 'فاتورة طلب مندوب',
    clientName = '—',
    clientNum = '',
    docNum = 'مسودة',
    remarks = ''
  } = meta;

  const total = lines.reduce((s, l) => s + orderLineTotal(l), 0);
  const qtySum = lines.reduce((s, l) => s + Number(l.quant || 0), 0);
  const bonusSum = lines.reduce((s, l) => s + Number(l.bonus || 0), 0);

  return `
    <div class="doc-panel invoice-doc inv-order-doc">
      <div class="doc-head-row">
        <img class="doc-logo" src="assets/logo.png" alt="" width="36" height="36">
        <div class="doc-head-main">
          <span class="doc-label">شركة ديما الحياة</span>
          <strong class="doc-title">${esc(title)}</strong>
          <span class="doc-meta-line">رقم ${esc(docNum)} · ${todayInvoiceDate()}</span>
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

function renderInvoiceLinesBlock(lines, meta = {}) {
  const { readonly = false } = meta;
  if (!lines.length) {
    return '<div class="empty-state"><div class="icon">🧾</div><p>الفاتورة فارغة — أضف منتجات بالضغط على +</p></div>';
  }

  const total = lines.reduce((s, l) => s + orderLineTotal(l), 0);

  return `
    <div class="table-scroll">
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
          ${lines.map((line, i) => {
    const qtyCells = readonly
      ? `${qtyTd(line.quant)}${qtyTd(line.bonus)}`
      : `<td class="col-amt inv-editable-qty">
                  <div class="inv-table-stepper">
                    <button type="button" class="inv-step-btn inv-step-btn-xs" data-invoice-action data-product-id="${line.productId}" data-field="quant" data-delta="-1">−</button>
                    <span dir="ltr">${line.quant || 0}</span>
                    <button type="button" class="inv-step-btn inv-step-btn-xs" data-invoice-action data-product-id="${line.productId}" data-field="quant" data-delta="1">+</button>
                  </div>
                </td>
                <td class="col-amt inv-editable-qty">
                  <div class="inv-table-stepper inv-table-stepper-gift">
                    <button type="button" class="inv-step-btn inv-step-btn-xs" data-invoice-action data-product-id="${line.productId}" data-field="bonus" data-delta="-1">−</button>
                    <span dir="ltr">${line.bonus || 0}</span>
                    <button type="button" class="inv-step-btn inv-step-btn-xs" data-invoice-action data-product-id="${line.productId}" data-field="bonus" data-delta="1">+</button>
                  </div>
                </td>`;
    return `
            <tr>
              <td class="col-n">${i + 1}</td>
              <td class="col-barcode" dir="ltr">${esc(invBarcodeCell(line))}</td>
              <td class="col-name">${esc(line.matName || '—')}</td>
              ${qtyCells}
              ${invMoneyTd(line.unitPrice ?? line.price)}
              ${invMoneyTd(orderLineTotal(line), 'net')}
            </tr>`;
  }).join('')}
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

function renderEdariInvoiceDocument(lines, meta = {}) {
  if (!lines.length) {
    return `
      <div class="inv-order-doc-empty-compact">
        <span>🧾</span>
        <p>أضف منتجات بالضغط على <strong>+</strong> — تظهر هنا كفاتورة Edari</p>
      </div>`;
  }
  return renderInvoiceHeroBlock(lines, meta) + renderInvoiceLinesBlock(lines, meta);
}

function renderLiveInvoicePanel() {
  const hero = document.getElementById('invoiceModalHero');
  const linesEl = document.getElementById('invoiceModalLines');
  const countEl = document.getElementById('invoiceModalLineCount');
  if (!hero || !linesEl) return;

  const lines = buildOrderLines();
  const c = commerce.invoiceCustomer;
  const meta = {
    clientName: c?.name1 || '—',
    clientNum: c?.num || '',
    docNum: 'مسودة',
    remarks: commerce.invoiceNotes || '',
    readonly: false
  };

  if (!lines.length) {
    hero.innerHTML = '';
    linesEl.innerHTML = renderInvoiceLinesBlock(lines, meta);
    if (countEl) countEl.textContent = '0 بند';
  } else {
    hero.innerHTML = renderInvoiceHeroBlock(lines, meta);
    linesEl.innerHTML = renderInvoiceLinesBlock(lines, meta);
    if (countEl) countEl.textContent = `${lines.length} ${lines.length === 1 ? 'بند' : 'بنود'}`;
  }
  renderModalInvoiceCustomer();
}

function renderModalInvoiceCustomer() {
  const el = document.getElementById('modalInvoiceCustomer');
  if (!el) return;
  const c = commerce.invoiceCustomer;
  if (c?.seq) {
    el.innerHTML = `<strong>${esc(c.name1)}</strong><span dir="ltr">${esc(c.num || '')}</span>`;
    el.classList.add('has-customer');
  } else {
    el.innerHTML = '<span class="muted">لم يُختر زبون — اختر من الكشوفات</span>';
    el.classList.remove('has-customer');
  }
}

function isInvoiceModalOpen() {
  const overlay = document.getElementById('invoiceOverlay');
  return overlay && !overlay.classList.contains('hidden');
}

function openInvoiceModal() {
  renderLiveInvoicePanel();
  const overlay = document.getElementById('invoiceOverlay');
  overlay?.classList.remove('hidden');
  overlay?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('inv-sheet-open');
  const total = invoiceTotalAmount();
  const modalTotal = document.getElementById('invoiceModalTotal');
  if (modalTotal) modalTotal.textContent = fmtInvInt(total);
}

function closeInvoiceModal() {
  const overlay = document.getElementById('invoiceOverlay');
  overlay?.classList.add('hidden');
  overlay?.setAttribute('aria-hidden', 'true');
  if (!document.getElementById('customerOverlay')?.classList.contains('hidden')) return;
  document.body.classList.remove('inv-sheet-open');
}

function updateInvoiceUI() {
  if (isInvoiceModalOpen()) renderLiveInvoicePanel();
  const total = invoiceTotalAmount();
  const count = invoiceLineCount();
  const badgeEl = document.getElementById('invoiceOpenBadge');
  const modalTotal = document.getElementById('invoiceModalTotal');
  if (modalTotal) modalTotal.textContent = fmtInvInt(total);
  if (badgeEl) badgeEl.textContent = String(count);
  const bar = document.getElementById('invoiceActionBar');
  const openBtn = document.getElementById('btnOpenInvoice');
  if (bar) bar.classList.toggle('has-lines', count > 0);
  if (openBtn) openBtn.classList.toggle('has-items', count > 0);
  updateShopOrderStats();
}

function clearInvoiceDraft({ resetNotes = true } = {}) {
  commerce.draft = {};
  if (resetNotes) {
    commerce.invoiceNotes = '';
    const notesEl = document.getElementById('invoiceNotes');
    if (notesEl) notesEl.value = '';
    const detailNotes = document.getElementById('shopDetailNotes');
    if (detailNotes) detailNotes.value = '';
  }
  document.querySelectorAll('.shop-prod-card').forEach((row) => {
    row.classList.remove('shop-prod-card-in-cart');
  });
  renderProductDetailPanel();
  clearInvoiceStorage();
  updateInvoiceUI();
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
          <span class="inv-shop-hint">عرض المنتجات والفاتورة</span>
        </span>
        ${ICONS.chevron}
      </button>`).join('') || '<div class="empty-state"><p>لا توجد فروع منتجات</p></div>';

    document.querySelectorAll('[data-shop-branch]').forEach((btn) => {
      btn.addEventListener('click', () => {
        commerce.selectedBranch = commerce.branches.find((x) => x.id === Number(btn.dataset.shopBranch));
        void openShopCatalog();
      });
    });
    updateResumeBanner();
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

async function openShopProducts() {
  if (!commerce.selectedBranch) return goToScreen('shop');
  if (!commerce.selectedSection) return openShopCatalog();
  setOverlay(true);
  try {
    await loadSectionProducts();
    goToScreen('shop-products');
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

function openProductImage(productId) {
  const p = findProduct(productId);
  const url = p ? productImageSrc(p) : '';
  if (!url) return;
  const overlay = document.createElement('div');
  overlay.className = 'shop-image-lightbox';
  overlay.innerHTML = `
    <button type="button" class="shop-image-lightbox-close" aria-label="إغلاق">×</button>
    <img src="${url}" alt="">`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.shop-image-lightbox-close')) overlay.remove();
  });
  document.body.appendChild(overlay);
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
    closeInvoiceModal();
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
  document.body.classList.add('inv-sheet-open');
  await renderCustomerTrees();
}

function closeCustomerPicker() {
  document.getElementById('customerOverlay')?.classList.add('hidden');
  if (!isInvoiceModalOpen()) document.body.classList.remove('inv-sheet-open');
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
  updateInvoiceUI();
  updateShopOrderStats();
  persistInvoiceDraft();
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
          <span dir="ltr">${fmtInvInt(o.totalAmount)}</span>
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
    const lines = (o.lines || []).map((l) => ({
      ...l,
      price: l.unitPrice,
      matNum: l.barcode
    }));
    document.getElementById('orderDetailSheet').innerHTML = `
      ${renderEdariInvoiceDocument(lines, {
    title: `طلب ${o.orderNo}`,
    clientName: o.customerName || '—',
    clientNum: o.customerNum || '',
    docNum: o.orderNo,
    remarks: o.notes || '',
    readonly: true
  })}
      <div class="inv-order-status-row">
        <span class="badge ${STATUS_BADGE[o.status] || 'pending'}">${esc(o.statusLabel)}</span>
        <span class="muted">${esc(o.catalogBranchName || '')}</span>
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
      crumb.textContent = 'عرض وطلب · اختر فرعاً';
      if (kicker) kicker.textContent = 'Edari · الطلبات';
    } else if (name === 'shop-products') {
      title.textContent = commerce.selectedBranch?.name || 'عرض وطلب';
      crumb.textContent = `${commerce.selectedSection?.name || ''} · فاتورة حية`.trim();
      if (kicker) kicker.textContent = 'Edari · عرض للزبون';
    } else if (name === 'my-orders') {
      title.textContent = 'طلباتي';
      crumb.textContent = 'طلبات مرسلة للوحة التحكم';
      if (kicker) kicker.textContent = 'Edari · الطلبات';
    } else if (name === 'order-detail') {
      title.textContent = 'تفاصيل الطلب';
      crumb.textContent = '';
      if (kicker) kicker.textContent = 'Edari · الفاتورة';
    }
  },

  onScreen(name) {
    if (name === 'shop') void loadShopBranches();
    if (name === 'my-orders') void loadMyOrders();
    if (name === 'shop-products') {
      applyPersistedDraft();
      renderProductShowcase();
      updateInvoiceUI();
    }
  },

  handleBack() {
    if (isInvoiceModalOpen()) {
      closeInvoiceModal();
      return true;
    }
    if (document.getElementById('customerOverlay') && !document.getElementById('customerOverlay').classList.contains('hidden')) {
      if (commerce.pickerTree) {
        commerce.pickerTree = null;
        void renderCustomerTrees();
        return true;
      }
      closeCustomerPicker();
      return true;
    }
    if (state.screen === 'order-detail') {
      goToScreen('my-orders');
      return true;
    }
    if (state.screen === 'shop-products') {
      goToScreen('shop');
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
      void openShopCatalog();
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
  restoreDraftIntoMemory();

  document.getElementById('shopSectionTabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-shop-section-tab]');
    if (!tab) return;
    void switchSection(tab.dataset.shopSectionTab);
  });

  document.getElementById('shopProductsPages')?.addEventListener('click', (e) => {
    const selectBtn = e.target.closest('[data-select-product]');
    if (selectBtn) {
      selectProduct(selectBtn.dataset.selectProduct);
      return;
    }
    const draftBtn = e.target.closest('[data-draft-action]');
    if (draftBtn) {
      adjustDraft(draftBtn.dataset.productId, draftBtn.dataset.field, Number(draftBtn.dataset.delta));
    }
    const imgBtn = e.target.closest('[data-view-product-id]');
    if (imgBtn) openProductImage(imgBtn.dataset.viewProductId);
  });

  document.getElementById('shopProductDetail')?.addEventListener('click', (e) => {
    const draftBtn = e.target.closest('[data-draft-action]');
    if (draftBtn) {
      adjustDraft(draftBtn.dataset.productId, draftBtn.dataset.field, Number(draftBtn.dataset.delta));
      return;
    }
    const heroBtn = e.target.closest('[data-view-product-id]');
    if (heroBtn) openProductImage(heroBtn.dataset.viewProductId);
  });

  document.getElementById('shopProductDetail')?.addEventListener('input', (e) => {
    if (e.target.id !== 'shopDetailNotes') return;
    commerce.invoiceNotes = e.target.value || '';
    const notesEl = document.getElementById('invoiceNotes');
    if (notesEl) notesEl.value = commerce.invoiceNotes;
    persistInvoiceDraft();
    renderLiveInvoicePanel();
  });

  document.getElementById('btnShopPickCustomer')?.addEventListener('click', () => openCustomerPicker());

  document.getElementById('invoiceModalLines')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-invoice-action]');
    if (!btn) return;
    adjustDraft(btn.dataset.productId, btn.dataset.field, Number(btn.dataset.delta));
  });

  document.getElementById('btnOpenInvoice')?.addEventListener('click', () => openInvoiceModal());
  document.getElementById('btnCloseInvoice')?.addEventListener('click', closeInvoiceModal);
  document.getElementById('invoiceOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'invoiceOverlay') closeInvoiceModal();
  });

  document.getElementById('shopProductSearch')?.addEventListener('input', (e) => {
    commerce.productFilter = e.target.value || '';
    renderProductShowcase();
  });

  document.getElementById('shopPageDots')?.addEventListener('click', (e) => {
    const dot = e.target.closest('[data-page-dot]');
    if (!dot) return;
    const vp = document.getElementById('shopPagesViewport');
    if (!vp) return;
    vp.scrollTo({ left: Number(dot.dataset.pageDot) * vp.clientWidth, behavior: 'smooth' });
  });

  document.getElementById('btnSubmitInvoice')?.addEventListener('click', () => submitInvoice());
  document.getElementById('btnClearInvoice')?.addEventListener('click', confirmClearInvoice);
  document.getElementById('btnPickCustomer')?.addEventListener('click', () => openCustomerPicker());
  document.getElementById('btnCloseCustomer')?.addEventListener('click', closeCustomerPicker);

  document.getElementById('invoiceNotes')?.addEventListener('input', (e) => {
    commerce.invoiceNotes = e.target.value || '';
    persistInvoiceDraft();
    renderLiveInvoicePanel();
  });

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

  const notesEl = document.getElementById('invoiceNotes');
  if (notesEl && commerce.invoiceNotes) notesEl.value = commerce.invoiceNotes;
  updateInvoiceUI();
  updateResumeBanner();

  let shopResizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(shopResizeTimer);
    shopResizeTimer = setTimeout(() => {
      if (state.screen !== 'shop-products') return;
      renderProductPages();
    }, 160);
  }, { passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      clearTimeout(shopResizeTimer);
      shopResizeTimer = setTimeout(() => {
        if (state.screen !== 'shop-products') return;
        renderProductPages();
      }, 160);
    }, { passive: true });
  }
}

initCommerceMobile();
