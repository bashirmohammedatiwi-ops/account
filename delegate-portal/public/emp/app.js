const API = '/api/emp';
const TOKEN_KEY = 'empToken';
const EMP_KEY = 'empUser';

const STATUS_META = {
  pending: { label: 'قيد الانتظار', badge: 'pending' },
  processing: { label: 'تم التجهيز', badge: 'processing' },
  rejected: { label: 'مرفوض', badge: 'rejected' }
};

const FILTERS = [
  { id: '', label: 'الكل' },
  { id: 'pending', label: 'قيد الانتظار' },
  { id: 'processing', label: 'تم التجهيز' },
  { id: 'rejected', label: 'مرفوض' }
];

const state = {
  employee: null,
  screen: 'list',
  filter: 'pending',
  orders: [],
  selectedOrder: null
};

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMoney(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatWhen(o) {
  const raw = o.submittedAt || o.updatedAt || o.createdAt || '';
  return String(raw).slice(0, 16).replace('T', ' ');
}

function productImageSrc(url) {
  if (!url) return '';
  if (String(url).startsWith('http')) return url;
  return `${window.location.origin}${url}`;
}

function openImageLightbox(url, caption = '') {
  const box = document.getElementById('imageLightbox');
  const img = document.getElementById('lightboxImg');
  const cap = document.getElementById('lightboxCaption');
  if (!box || !img || !url) return;
  img.src = url;
  img.alt = caption || 'صورة المنتج';
  if (cap) cap.textContent = caption || '';
  box.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeImageLightbox() {
  const box = document.getElementById('imageLightbox');
  const img = document.getElementById('lightboxImg');
  if (!box) return;
  box.classList.add('hidden');
  if (img) img.src = '';
  document.body.style.overflow = '';
}

function lineThumbHtml(line, idx) {
  const src = productImageSrc(line.imageUrl);
  const name = esc(line.matName || 'منتج');
  if (src) {
    return `<button type="button" class="line-thumb" data-img="${esc(src)}" data-caption="${name}" aria-label="تكبير صورة ${name}">
      <img src="${esc(src)}" alt="" loading="lazy">
    </button>`;
  }
  return `<div class="line-thumb line-thumb-empty" aria-hidden="true"><span>${idx + 1}</span></div>`;
}

function statusLabel(status) {
  return STATUS_META[status]?.label || status || '—';
}

function statusBadge(status) {
  return STATUS_META[status]?.badge || 'pending';
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setSession(token, employee) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EMP_KEY, JSON.stringify(employee || {}));
  state.employee = employee;
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMP_KEY);
  state.employee = null;
}

function setOverlay(open) {
  document.getElementById('overlay')?.classList.toggle('hidden', !open);
}

function showLogin(err = '') {
  document.getElementById('loginScreen')?.classList.remove('hidden');
  document.getElementById('appShell')?.classList.add('hidden');
  const errEl = document.getElementById('loginError');
  if (errEl) {
    errEl.textContent = err;
    errEl.classList.toggle('hidden', !err);
  }
}

function showApp() {
  document.getElementById('loginScreen')?.classList.add('hidden');
  document.getElementById('appShell')?.classList.remove('hidden');
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearSession();
    showLogin('انتهت الجلسة — سجّل الدخول مجدداً');
    throw new Error(data.error || 'انتهت الجلسة');
  }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function goToScreen(name) {
  state.screen = name;
  document.querySelectorAll('.screen').forEach((el) => {
    el.classList.toggle('active', el.id === `screen-${name}`);
  });
  const backBtn = document.getElementById('btnBack');
  const title = document.getElementById('screenTitle');
  const kicker = document.getElementById('headerKicker');
  if (name === 'list') {
    backBtn?.classList.add('hidden');
    if (title) title.textContent = 'الطلبات';
    if (kicker) kicker.textContent = state.employee?.name || 'تجهيز الطلبات';
  } else if (name === 'detail') {
    backBtn?.classList.remove('hidden');
    const o = state.selectedOrder;
    if (title) title.textContent = o?.orderNo ? `طلب ${o.orderNo}` : 'تفاصيل الطلب';
    if (kicker) kicker.textContent = o ? statusLabel(o.status) : 'تفاصيل';
  }
}

function renderFilters() {
  const el = document.getElementById('orderFilters');
  if (!el) return;
  el.innerHTML = FILTERS.map((f) => `
    <button type="button" class="filter-chip${state.filter === f.id ? ' active' : ''}"
      data-filter="${esc(f.id)}" role="tab" aria-selected="${state.filter === f.id}">
      ${esc(f.label)}
    </button>`).join('');
  el.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter || '';
      void loadOrders();
    });
  });
}

async function loadOrders() {
  setOverlay(true);
  try {
    renderFilters();
    const qs = state.filter ? `?status=${encodeURIComponent(state.filter)}` : '';
    const data = await api(`/orders${qs}`);
    state.orders = data.orders || [];
    const count = state.orders.length;
    const filterLabel = FILTERS.find((f) => f.id === state.filter)?.label || '';
    document.getElementById('ordersMeta').textContent = count
      ? `${count} طلب${state.filter ? ` · ${filterLabel}` : ''}`
      : 'لا توجد طلبات في هذا التصنيف';

    document.getElementById('ordersList').innerHTML = state.orders.map((o) => {
      const giftCount = (o.lines || []).reduce((s, l) => s + Number(l.bonus || 0), 0);
      return `
      <button type="button" class="order-card${giftCount ? ' has-gift' : ''}" data-order-id="${o.id}">
        <div class="order-card-head">
          <div>
            <strong class="order-no" dir="ltr">${esc(o.orderNo)}</strong>
            <p class="order-customer">${esc(o.customerName || 'بدون زبون')}</p>
            <p class="order-agent">${esc(o.agentName || '—')}${o.catalogBranchName ? ` · ${esc(o.catalogBranchName)}` : ''}</p>
          </div>
          <div class="order-card-badges">
            ${giftCount ? `<span class="gift-pill">هدايا ${giftCount}</span>` : ''}
            <span class="badge ${statusBadge(o.status)}">${esc(statusLabel(o.status))}</span>
          </div>
        </div>
        <div class="order-stats">
          <span class="order-stat"><em>${fmtMoney(o.totalAmount)}</em> المبلغ</span>
          <span class="order-stat"><em>${o.lines?.length || 0}</em> بند</span>
          <span class="order-stat${giftCount ? ' gift' : ''}"><em>${giftCount}</em> هدايا</span>
        </div>
        <div class="order-card-foot" dir="ltr">${esc(formatWhen(o))}</div>
      </button>`;
    }).join('') || '<div class="empty-state"><p>لا توجد طلبات</p></div>';

    document.querySelectorAll('[data-order-id]').forEach((btn) => {
      btn.addEventListener('click', () => openOrder(Number(btn.dataset.orderId)));
    });
    goToScreen('list');
  } catch (e) {
    if (getToken()) alert(e.message);
  } finally {
    setOverlay(false);
  }
}

function lineTotals(lines = []) {
  return lines.reduce((acc, l) => {
    acc.qty += Number(l.quant || 0);
    acc.gifts += Number(l.bonus || 0);
    acc.amount += Number(l.lineTotal || 0);
    if (Number(l.bonus || 0) > 0) acc.giftLines += 1;
    return acc;
  }, { qty: 0, gifts: 0, amount: 0, giftLines: 0 });
}

function renderLines(lines = []) {
  if (!lines.length) return '<p class="empty-state">لا توجد بنود</p>';
  return `<div class="prep-lines">${lines.map((l, idx) => {
    const qty = Number(l.quant || 0);
    const gift = Number(l.bonus || 0);
    const deliver = qty + gift;
    const hasGift = gift > 0;
    return `
    <article class="prep-line${hasGift ? ' has-gift' : ''}">
      ${lineThumbHtml(l, idx)}
      <div class="prep-line-main">
        <div class="prep-line-head">
          <strong class="prep-line-name">${esc(l.matName || '—')}</strong>
          ${hasGift ? `<span class="gift-tag">+${gift} هدية</span>` : ''}
        </div>
        ${l.barcode ? `<span class="prep-line-code" dir="ltr">${esc(l.barcode)}</span>` : ''}
        <div class="prep-line-stats">
          <span><em dir="ltr">${qty}</em> بيع</span>
          <span class="${hasGift ? 'gift-stat' : ''}"><em dir="ltr">${gift}</em> هدية</span>
          <span class="deliver-stat"><em dir="ltr">${deliver}</em> للتسليم</span>
        </div>
        ${l.remarks ? `<p class="prep-line-note">${esc(l.remarks)}</p>` : ''}
      </div>
      <div class="prep-line-price" dir="ltr">
        <span class="prep-line-total">${fmtMoney(l.lineTotal)}</span>
        ${qty > 0 ? `<span class="prep-line-unit">${fmtMoney(l.unitPrice)}</span>` : ''}
      </div>
    </article>`;
  }).join('')}</div>`;
}

function bindLineThumbs(root) {
  root?.querySelectorAll('.line-thumb[data-img]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openImageLightbox(btn.dataset.img, btn.dataset.caption || '');
    });
  });
}

async function openOrder(id) {
  setOverlay(true);
  try {
    const data = await api(`/orders/${id}`);
    const o = data.order;
    state.selectedOrder = o;
    const lines = o.lines || [];
    const totals = lineTotals(lines);
    const actions = [
      { id: 'pending', label: 'قيد الانتظار', cls: 'soft' },
      { id: 'processing', label: 'تم التجهيز', cls: 'primary' },
      { id: 'rejected', label: 'مرفوض', cls: 'danger' }
    ];
    document.getElementById('orderDetail').innerHTML = `
      <div class="order-hero">
        <div class="order-hero-top">
          <div>
            <p class="order-hero-kicker">طلب شراء</p>
            <h2 class="order-hero-no" dir="ltr">${esc(o.orderNo)}</h2>
          </div>
          <span class="badge lg ${statusBadge(o.status)}">${esc(statusLabel(o.status))}</span>
        </div>
        <div class="order-hero-info">
          <span><b>${esc(o.customerName || 'بدون زبون')}</b>${o.customerNum ? ` · ${esc(o.customerNum)}` : ''}</span>
          <span>${esc(o.agentName || '—')}${o.catalogBranchName ? ` · ${esc(o.catalogBranchName)}` : ''}</span>
          <span dir="ltr">${esc(formatWhen(o))}</span>
        </div>
        <div class="order-hero-chips">
          <span>${lines.length} بند</span>
          <span>${totals.qty} بيع</span>
          ${totals.gifts ? `<span class="chip-gift">${totals.gifts} هدية</span>` : ''}
          <span class="chip-amount" dir="ltr">${fmtMoney(o.totalAmount || totals.amount)}</span>
        </div>
      </div>

      ${totals.gifts ? `<p class="gift-hint">⚠ يحتوي الطلب على <b dir="ltr">${totals.gifts}</b> قطعة هدية</p>` : ''}
      ${o.notes ? `<div class="order-notes"><strong>ملاحظات:</strong> ${esc(o.notes)}</div>` : ''}

      <h3 class="section-title">المنتجات <span>${lines.length}</span></h3>
      ${renderLines(lines)}

      <div class="status-bar">
        <p class="status-bar-label">تغيير الحالة</p>
        <div class="status-actions">
          ${actions.map((a) => `
            <button type="button" class="btn ${a.cls}${o.status === a.id ? ' active' : ''}"
              data-set-status="${a.id}" ${o.status === a.id ? 'disabled' : ''}>
              ${esc(a.label)}
            </button>`).join('')}
        </div>
      </div>`;

    const detailRoot = document.getElementById('orderDetail');
    bindLineThumbs(detailRoot);
    detailRoot.querySelectorAll('[data-set-status]').forEach((btn) => {
      btn.addEventListener('click', () => void setOrderStatus(o.id, btn.dataset.setStatus));
    });
    goToScreen('detail');
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

async function setOrderStatus(id, status) {
  let note = '';
  if (status === 'rejected') {
    const input = prompt('سبب الرفض (اختياري):');
    if (input == null) return;
    note = input;
  } else {
    const label = statusLabel(status);
    if (!confirm(`تغيير حالة الطلب إلى «${label}»؟`)) return;
  }
  setOverlay(true);
  try {
    const data = await api(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note })
    });
    state.selectedOrder = data.order;
    await openOrder(id);
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

async function tryRestoreSession() {
  const token = getToken();
  if (!token) {
    showLogin();
    return;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(EMP_KEY) || '{}');
    const data = await api('/me');
    state.employee = data.employee || saved;
    showApp();
    await loadOrders();
  } catch {
    clearSession();
    showLogin();
  }
}

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername')?.value.trim() || '';
  const password = document.getElementById('loginPassword')?.value || '';
  const errEl = document.getElementById('loginError');
  if (errEl) {
    errEl.textContent = '';
    errEl.classList.add('hidden');
  }
  setOverlay(true);
  try {
    const data = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'فشل الدخول');
      return body;
    });
    setSession(data.token, data.employee);
    showApp();
    await loadOrders();
  } catch (err) {
    showLogin(err.message);
  } finally {
    setOverlay(false);
  }
});

document.getElementById('btnLogout')?.addEventListener('click', () => {
  clearSession();
  showLogin();
});

document.getElementById('btnRefresh')?.addEventListener('click', () => {
  if (state.screen === 'detail' && state.selectedOrder?.id) {
    void openOrder(state.selectedOrder.id);
  } else {
    void loadOrders();
  }
});

document.getElementById('btnBack')?.addEventListener('click', () => {
  void loadOrders();
});

document.getElementById('btnLightboxClose')?.addEventListener('click', closeImageLightbox);
document.getElementById('imageLightbox')?.addEventListener('click', (e) => {
  if (e.target.id === 'imageLightbox') closeImageLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeImageLightbox();
});

void tryRestoreSession();
