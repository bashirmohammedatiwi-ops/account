/* Mobile commerce: catalog browse, cart, orders */
const commerce = {
  branches: [],
  sections: [],
  products: [],
  orders: [],
  selectedBranch: null,
  selectedSection: null,
  cart: [],
  customer: null,
  customerSearchTimer: null
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

function cartCount() {
  return commerce.cart.reduce((s, l) => s + Number(l.quant || 0), 0);
}

function cartTotal() {
  return commerce.cart.reduce((s, l) => s + Number(l.lineTotal || 0), 0);
}

function updateCartBadge() {
  const el = document.getElementById('cartCount');
  if (el) el.textContent = String(cartCount());
}

function findCartLine(productId) {
  return commerce.cart.find((l) => l.productId === productId);
}

function addToCart(product, quant = 1) {
  const q = Math.max(1, Number(quant) || 1);
  const existing = findCartLine(product.id);
  if (existing) {
    existing.quant += q;
    existing.lineTotal = existing.quant * existing.unitPrice;
  } else {
    commerce.cart.push({
      productId: product.id,
      barcode: product.barcode || product.skuNum || '',
      matName: product.name,
      quant: q,
      bonus: 0,
      unitPrice: Number(product.price || 0),
      lineTotal: q * Number(product.price || 0)
    });
  }
  updateCartBadge();
}

function setCartLineQuant(productId, quant) {
  const line = findCartLine(productId);
  if (!line) return;
  const q = Number(quant);
  if (!q || q <= 0) {
    commerce.cart = commerce.cart.filter((l) => l.productId !== productId);
  } else {
    line.quant = q;
    line.lineTotal = q * line.unitPrice;
  }
  updateCartBadge();
  renderCart();
}

async function loadShopBranches() {
  setOverlay(true);
  try {
    const data = await commerceApi('/catalog/branches');
    commerce.branches = data.branches || [];
    document.getElementById('shopBranchesMeta').textContent = commerce.branches.length
      ? `${commerce.branches.length} فرع متاح`
      : 'لا توجد فروع — اطلب من الإدارة إعداد الكatalog';
    document.getElementById('shopBranchesList').innerHTML = commerce.branches.map((b) => `
      <button type="button" class="shop-card" data-shop-branch="${b.id}">
        <span class="shop-card-icon">🏪</span>
        <span class="shop-card-name">${esc(b.name)}</span>
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
    document.getElementById('shopSectionsList').innerHTML = commerce.sections.map((s) => `
      <button type="button" class="shop-card" data-shop-section="${s.id}">
        <span class="shop-card-icon">📁</span>
        <span class="shop-card-name">${esc(s.name)}</span>
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
    const branchName = commerce.selectedBranch?.name || '';
    const sectionName = commerce.selectedSection?.name || '';
    document.getElementById('shopProductsMeta').textContent = `${branchName} · ${sectionName} · ${commerce.products.length} منتج`;
    document.getElementById('shopProductsList').innerHTML = commerce.products.map((p) => `
      <article class="product-card">
        <div class="product-card-media">
          ${p.imageUrl ? `<img src="${p.imageUrl}" alt="" class="product-img">` : '<span class="product-img-placeholder">📦</span>'}
        </div>
        <div class="product-card-body">
          <h4 class="product-name">${esc(p.name)}</h4>
          <p class="product-meta" dir="ltr">${esc(p.barcode || p.skuNum || '—')}</p>
          <p class="product-price" dir="ltr">${fmtMoney(p.price)}</p>
        </div>
        <div class="product-card-actions">
          <button type="button" class="btn primary btn-sm" data-add-product="${p.id}">+</button>
        </div>
      </article>`).join('') || '<div class="empty-state"><p>لا توجد منتجات في هذا القسم</p></div>';

    document.querySelectorAll('[data-add-product]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = commerce.products.find((x) => x.id === Number(btn.dataset.addProduct));
        if (!p) return;
        const q = prompt('الكمية:', '1');
        if (q == null) return;
        addToCart(p, q);
      });
    });
    updateCartBadge();
    goToScreen('shop-products');
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

function renderCart() {
  const linesEl = document.getElementById('cartLines');
  if (!linesEl) return;

  if (!commerce.cart.length) {
    linesEl.innerHTML = '<div class="empty-state"><p>السلة فارغة — تصفّح المنتجات وأضف بنوداً</p></div>';
    document.getElementById('cartTotal').textContent = '0';
    return;
  }

  linesEl.innerHTML = commerce.cart.map((l) => `
    <div class="cart-line">
      <div class="cart-line-info">
        <strong>${esc(l.matName)}</strong>
        <span class="muted" dir="ltr">${esc(l.barcode)}</span>
      </div>
      <div class="cart-line-qty">
        <button type="button" class="qty-btn" data-qty-minus="${l.productId}">−</button>
        <span dir="ltr">${l.quant}</span>
        <button type="button" class="qty-btn" data-qty-plus="${l.productId}">+</button>
      </div>
      <div class="cart-line-price" dir="ltr">${fmtMoney(l.lineTotal)}</div>
    </div>`).join('');

  document.getElementById('cartTotal').textContent = fmtMoney(cartTotal());

  linesEl.querySelectorAll('[data-qty-minus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const line = findCartLine(Number(btn.dataset.qtyMinus));
      if (line) setCartLineQuant(line.productId, line.quant - 1);
    });
  });
  linesEl.querySelectorAll('[data-qty-plus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const line = findCartLine(Number(btn.dataset.qtyPlus));
      if (line) setCartLineQuant(line.productId, line.quant + 1);
    });
  });
}

function renderCartCustomer() {
  const sel = document.getElementById('cartCustomerSelected');
  const pick = document.getElementById('cartCustomerPick');
  if (commerce.customer) {
    sel.classList.remove('hidden');
    sel.innerHTML = `الزبون: <strong>${esc(commerce.customer.name1)}</strong> <span dir="ltr">(${esc(commerce.customer.num)})</span>`;
    pick.classList.add('hidden');
  } else if (state.selectedBranch?.seq) {
    commerce.customer = {
      seq: state.selectedBranch.seq,
      num: state.selectedBranch.num,
      name1: state.selectedBranch.name1
    };
    renderCartCustomer();
  } else {
    sel.classList.add('hidden');
  }
}

async function searchCartCustomers(q) {
  const pick = document.getElementById('cartCustomerPick');
  if (!q.trim()) {
    pick.classList.add('hidden');
    return;
  }
  try {
    const data = await commerceApi(`/search?q=${encodeURIComponent(q.trim())}`);
    const results = (data.results || []);
    if (!results.length) {
      pick.classList.remove('hidden');
      pick.innerHTML = '<p class="muted">لا نتائج</p>';
      return;
    }
    pick.classList.remove('hidden');
    pick.innerHTML = results.map((r) => `
      <button type="button" class="cart-customer-item" data-acc-seq="${esc(r.seq)}">
        <strong>${esc(r.name1)}</strong>
        <span dir="ltr">${esc(r.num)}</span>
      </button>`).join('');

    pick.querySelectorAll('[data-acc-seq]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = results.find((x) => String(x.seq) === btn.dataset.accSeq);
        if (!r) return;
        commerce.customer = { seq: r.seq, num: r.num, name1: r.name1 };
        document.getElementById('cartCustomerSearch').value = '';
        pick.classList.add('hidden');
        renderCartCustomer();
      });
    });
  } catch {
    pick.classList.add('hidden');
  }
}

function openCart() {
  renderCart();
  renderCartCustomer();
  goToScreen('shop-cart');
}

async function submitOrder() {
  if (!commerce.cart.length) return alert('السلة فارغة');
  if (!commerce.customer?.seq) return alert('اختر زبوناً للطلب');
  if (!commerce.selectedBranch?.id) return alert('اختر فرع منتجات');

  const btn = document.getElementById('btnSubmitOrder');
  btn.disabled = true;
  try {
    const data = await commerceApi('/orders', {
      method: 'POST',
      body: JSON.stringify({
        customerAccSeq: commerce.customer.seq,
        catalogBranchId: commerce.selectedBranch.id,
        notes: document.getElementById('cartNotes')?.value?.trim() || '',
        lines: commerce.cart,
        submit: true
      })
    });
    commerce.cart = [];
    updateCartBadge();
    alert(`تم إرسال الطلب ${data.order?.orderNo || ''}`);
    goToScreen('my-orders');
    await loadMyOrders();
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
  }
}

async function loadMyOrders() {
  setOverlay(true);
  try {
    const data = await commerceApi('/orders');
    commerce.orders = data.orders || [];
    document.getElementById('myOrdersMeta').textContent = commerce.orders.length
      ? `${commerce.orders.length} طلب`
      : 'لا توجد طلبات بعد';
    document.getElementById('myOrdersList').innerHTML = commerce.orders.map((o) => `
      <button type="button" class="order-card" data-order-id="${o.id}">
        <div class="order-card-top">
          <strong dir="ltr">${esc(o.orderNo)}</strong>
          <span class="badge ${STATUS_BADGE[o.status] || 'pending'}">${esc(o.statusLabel)}</span>
        </div>
        <p class="order-card-sub">${esc(o.customerName || '—')} · ${esc(o.submittedAt || o.createdAt || '')}</p>
        <p class="order-card-amt" dir="ltr">${fmtMoney(o.totalAmount)} · ${o.lines?.length || 0} بند</p>
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
      <div class="order-detail-head">
        <p class="muted" dir="ltr">${esc(o.orderNo)}</p>
        <h3>${esc(o.statusLabel)}</h3>
        <p>${esc(o.customerName || '—')}</p>
      </div>
      <div class="order-detail-lines">
        ${(o.lines || []).map((l) => `
          <div class="cart-line">
            <div class="cart-line-info"><strong>${esc(l.matName)}</strong><span dir="ltr">${esc(l.barcode)}</span></div>
            <div dir="ltr">${l.quant} × ${fmtMoney(l.unitPrice)}</div>
            <div dir="ltr">${fmtMoney(l.lineTotal)}</div>
          </div>`).join('')}
      </div>
      <div class="cart-footer">
        <div class="cart-total"><span>الإجمالي</span><strong dir="ltr">${fmtMoney(o.totalAmount)}</strong></div>
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
    backBtn.classList.toggle('hidden', ['shop', 'my-orders', 'home'].includes(name));
    toolbarWrap.classList.add('hidden');
    const kicker = document.getElementById('headerKicker');

    if (name === 'shop') {
      title.textContent = 'المنتجات';
      crumb.textContent = 'اختر فرعاً';
      if (kicker) kicker.textContent = 'Edari · المنتجات';
    } else if (name === 'shop-sections') {
      backBtn.classList.remove('hidden');
      title.textContent = commerce.selectedBranch?.name || 'الأقسام';
      crumb.textContent = 'اختر قسماً';
      if (kicker) kicker.textContent = 'Edari · الأقسام';
    } else if (name === 'shop-products') {
      backBtn.classList.remove('hidden');
      title.textContent = commerce.selectedSection?.name || 'المنتجات';
      crumb.textContent = commerce.selectedBranch?.name || '';
      if (kicker) kicker.textContent = 'Edari · المنتجات';
    } else if (name === 'shop-cart') {
      backBtn.classList.remove('hidden');
      title.textContent = 'سلة الطلب';
      crumb.textContent = commerce.selectedBranch?.name || '';
      if (kicker) kicker.textContent = 'Edari · السلة';
    } else if (name === 'my-orders') {
      title.textContent = 'طلباتي';
      crumb.textContent = 'طلبات الشراء المرسلة';
      if (kicker) kicker.textContent = 'Edari · الطلبات';
    } else if (name === 'order-detail') {
      backBtn.classList.remove('hidden');
      title.textContent = 'تفاصيل الطلب';
      crumb.textContent = '';
      if (kicker) kicker.textContent = 'Edari · الطلب';
    }
  },

  onScreen(name) {
    if (name === 'shop') void loadShopBranches();
    if (name === 'my-orders') void loadMyOrders();
  },

  handleBack() {
    if (state.screen === 'order-detail') {
      goToScreen('my-orders');
      return true;
    }
    if (state.screen === 'shop-cart') {
      goToScreen(commerce.selectedSection ? 'shop-products' : 'shop');
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
  document.getElementById('btnOpenCart')?.addEventListener('click', openCart);
  document.getElementById('btnSubmitOrder')?.addEventListener('click', () => submitOrder());

  document.getElementById('cartCustomerSearch')?.addEventListener('input', (e) => {
    clearTimeout(commerce.customerSearchTimer);
    commerce.customerSearchTimer = setTimeout(() => searchCartCustomers(e.target.value), 300);
  });
}

initCommerceMobile();
