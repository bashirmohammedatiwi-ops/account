const API_BASE = window.location.pathname.startsWith('/prices')
  ? window.location.origin
  : '';

const state = { page: 1, limit: 50, search: '', offersOnly: false };

function formatPrice(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('ar-IQ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(n));
}

function formatPercent(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  return v % 1 === 0 ? `${v}٪` : `${v.toFixed(1)}٪`;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return escapeHtml(iso);
  return d.toLocaleDateString('ar-IQ');
}

function renderTable(products) {
  if (!products.length) {
    return '<div class="empty">لا توجد منتجات مطابقة — تأكد من مزامنة POS و Edari</div>';
  }

  const rows = products.map((p) => {
    const qty = p.posStock ?? p.stockBalance ?? 0;
    const qtyClass = qty <= 0 ? 'qty-low' : '';
    const offerBadge = p.hasOffer
      ? `<span class="badge badge-offer">${escapeHtml(p.offerName || 'عرض')}</span>`
      : '<span class="badge badge-none">بدون عرض</span>';

    const priceCells = p.hasOffer
      ? `<td>
          <div class="price price-original">${formatPrice(p.originalPrice)}</div>
          <div class="price price-discount">${formatPercent(p.discountPercent)}</div>
          <div class="price price-final">${formatPrice(p.finalPrice)}</div>
        </td>`
      : `<td><div class="price">${p.originalPrice > 0 ? formatPrice(p.originalPrice) : '—'}</div></td>`;

    return `<tr class="clickable" data-barcode="${escapeHtml(p.barcode)}">
      <td>
        <div class="product-name">${escapeHtml(p.name || '—')}</div>
        <div class="product-meta">باركود: ${escapeHtml(p.barcode)} · رقم: ${escapeHtml(String(p.productNum || p.productCode || '—'))}</div>
        ${p.lastPurchasePrice ? `<div class="product-meta">آخر شراء: ${formatPrice(p.lastPurchasePrice)} (${formatDate(p.lastPurchaseDate)})</div>` : ''}
      </td>
      <td class="hide-mobile">${escapeHtml(p.barcode)}</td>
      ${priceCells}
      <td>${offerBadge}</td>
      <td class="${qtyClass}">${formatPrice(qty)}</td>
    </tr>`;
  }).join('');

  return `<table>
    <thead>
      <tr>
        <th>المنتج (Edari)</th>
        <th class="hide-mobile">الباركود</th>
        <th>أصلي / خصم / نهائي (POS)</th>
        <th>العرض</th>
        <th>المخزون</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function loadStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    const data = await res.json();
    document.getElementById('stat-all').textContent = formatPrice(data.totalProducts);
    document.getElementById('stat-priced').textContent = formatPrice(data.totalWithPrice);
    document.getElementById('stat-offers').textContent = formatPrice(data.productsOnOffer);
    document.getElementById('stat-moves').textContent = formatPrice(data.totalMovements);
    const parts = [];
    if (data.lastPosSyncAt) parts.push(`آخر POS: ${formatDate(data.lastPosSyncAt)}`);
    if (data.lastEdariSyncAt) parts.push(`آخر Edari: ${formatDate(data.lastEdariSyncAt)}`);
    document.getElementById('syncMeta').textContent = parts.join(' · ') || 'لم تُجرَ مزامنة بعد';
  } catch (_) {}
}

async function loadProducts() {
  const content = document.getElementById('content');
  const pagination = document.getElementById('pagination');
  content.innerHTML = '<div class="loading">جاري تحميل المنتجات...</div>';
  pagination.hidden = true;

  const params = new URLSearchParams({
    page: state.page,
    limit: state.limit,
    search: state.search,
    offersOnly: state.offersOnly,
  });

  try {
    const res = await fetch(`${API_BASE}/api/products?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'خطأ في الخادم');

    content.innerHTML = renderTable(data.products);
    content.querySelectorAll('tr.clickable').forEach((row) => {
      row.addEventListener('click', () => openDetail(row.dataset.barcode));
    });

    const { page, totalPages, total } = data.pagination;
    pagination.hidden = totalPages <= 1;
    document.getElementById('page-info').textContent =
      `صفحة ${page} من ${totalPages} (${formatPrice(total)} منتج)`;
    document.getElementById('btn-prev').disabled = page <= 1;
    document.getElementById('btn-next').disabled = page >= totalPages;
  } catch (err) {
    content.innerHTML = `<div class="error">تعذر تحميل البيانات: ${escapeHtml(err.message)}</div>`;
  }
}

async function openDetail(barcode) {
  const dialog = document.getElementById('detailDialog');
  const body = document.getElementById('detailBody');
  document.getElementById('detailTitle').textContent = `تفاصيل: ${barcode}`;
  body.innerHTML = '<div class="loading">جاري التحميل...</div>';
  dialog.showModal();

  try {
    const [prodRes, movRes] = await Promise.all([
      fetch(`${API_BASE}/api/products?search=${encodeURIComponent(barcode)}&limit=1`),
      fetch(`${API_BASE}/api/products/${encodeURIComponent(barcode)}/movements`),
    ]);
    const prodData = await prodRes.json();
    const movData = await movRes.json();
    const p = prodData.products?.[0];

    if (!p) {
      body.innerHTML = '<div class="empty">لا توجد بيانات لهذا الباركود</div>';
      return;
    }

    const moves = movData.movements || [];
    const moveRows = moves.length
      ? moves.map((m) => `<tr>
          <td>${formatDate(m.date)}</td>
          <td>${escapeHtml(m.supplier || '—')}</td>
          <td>${escapeHtml(m.invoice || '—')}</td>
          <td>${formatPrice(m.quantity)}</td>
          <td>${formatPrice(m.unitPrice)}</td>
          <td>${formatPrice(m.totalPrice)}</td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="empty">لا توجد حركات مشتريات من Edari</td></tr>';

    body.innerHTML = `
      <div class="detail-grid">
        <div class="detail-item"><div class="k">الاسم</div><div class="v">${escapeHtml(p.name || '—')}</div></div>
        <div class="detail-item"><div class="k">الباركود</div><div class="v">${escapeHtml(p.barcode)}</div></div>
        <div class="detail-item"><div class="k">السعر الأصلي (POS)</div><div class="v">${formatPrice(p.originalPrice)}</div></div>
        <div class="detail-item"><div class="k">نسبة التخفيض</div><div class="v">${p.hasOffer ? formatPercent(p.discountPercent) : '—'}</div></div>
        <div class="detail-item"><div class="k">السعر بعد التخفيض</div><div class="v">${formatPrice(p.finalPrice)}</div></div>
        <div class="detail-item"><div class="k">مخزون POS / Edari</div><div class="v">${formatPrice(p.posStock ?? '—')} / ${formatPrice(p.stockBalance ?? '—')}</div></div>
      </div>
      <h3>حركات المشتريات (Edari)</h3>
      <table class="movements-table">
        <thead><tr><th>التاريخ</th><th>المورد</th><th>الفاتورة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
        <tbody>${moveRows}</tbody>
      </table>`;
  } catch (err) {
    body.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
  }
}

document.getElementById('btn-search').addEventListener('click', () => {
  state.search = document.getElementById('search').value.trim();
  state.page = 1;
  loadProducts();
});

document.getElementById('search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    state.search = e.target.value.trim();
    state.page = 1;
    loadProducts();
  }
});

document.getElementById('btn-offers-only').addEventListener('click', () => {
  state.offersOnly = !state.offersOnly;
  document.getElementById('btn-offers-only').classList.toggle('active', state.offersOnly);
  state.page = 1;
  loadProducts();
});

document.getElementById('btn-prev').addEventListener('click', () => {
  if (state.page > 1) { state.page -= 1; loadProducts(); }
});

document.getElementById('btn-next').addEventListener('click', () => {
  state.page += 1;
  loadProducts();
});

document.getElementById('btn-close-detail').addEventListener('click', () => {
  document.getElementById('detailDialog').close();
});

loadStats();
loadProducts();
