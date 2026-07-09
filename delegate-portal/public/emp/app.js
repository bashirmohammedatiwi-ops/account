const API = '/api/emp';
const TOKEN_KEY = 'empToken';
const EMP_KEY = 'empUser';

const STATUS_META = {
  pending: { label: 'قيد الانتظار', badge: 'pending' },
  processing: { label: 'قيد التجهيز والإرسال', badge: 'processing' },
  rejected: { label: 'مرفوض', badge: 'rejected' }
};

const FILTERS = [
  { id: '', label: 'الكل' },
  { id: 'pending', label: 'قيد الانتظار' },
  { id: 'processing', label: 'قيد التجهيز والإرسال' },
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
  const totals = lineTotals(lines);
  return `
    <div class="lines">${lines.map((l, idx) => {
      const qty = Number(l.quant || 0);
      const gift = Number(l.bonus || 0);
      const hasGift = gift > 0;
      return `
      <article class="line-card${hasGift ? ' has-gift' : ''}">
        <div class="line-card-top">
          <span class="line-index">${idx + 1}</span>
          <div class="line-card-title">
            <strong class="line-name">${esc(l.matName || '—')}</strong>
            ${l.barcode ? `<span class="line-barcode" dir="ltr">${esc(l.barcode)}</span>` : ''}
          </div>
          ${hasGift ? `<span class="gift-pill">هدية ${gift}</span>` : ''}
        </div>
        <div class="line-metrics">
          <div class="metric">
            <span class="metric-label">الكمية</span>
            <strong class="metric-value" dir="ltr">${qty}</strong>
          </div>
          <div class="metric metric-gift${hasGift ? ' on' : ''}">
            <span class="metric-label">الهدايا</span>
            <strong class="metric-value" dir="ltr">${gift}</strong>
          </div>
          <div class="metric">
            <span class="metric-label">السعر</span>
            <strong class="metric-value" dir="ltr">${fmtMoney(l.unitPrice)}</strong>
          </div>
          <div class="metric">
            <span class="metric-label">الإجمالي</span>
            <strong class="metric-value" dir="ltr">${fmtMoney(l.lineTotal)}</strong>
          </div>
        </div>
        ${hasGift ? `
        <div class="gift-callout">
          <span class="gift-callout-badge">هدية</span>
          <div>
            <strong>يُجهَّز مع هدايا</strong>
            <p>كمية البيع <b dir="ltr">${qty}</b> + هدايا <b dir="ltr">${gift}</b> = إجمالي للتسليم <b dir="ltr">${qty + gift}</b></p>
          </div>
        </div>` : ''}
        ${l.remarks ? `<p class="line-note">${esc(l.remarks)}</p>` : ''}
      </article>`;
    }).join('')}</div>
    <div class="order-summary">
      <div class="summary-chip">
        <span>البنود</span>
        <strong dir="ltr">${lines.length}</strong>
      </div>
      <div class="summary-chip">
        <span>الكميات</span>
        <strong dir="ltr">${totals.qty}</strong>
      </div>
      <div class="summary-chip summary-gift${totals.gifts ? ' on' : ''}">
        <span>إجمالي الهدايا</span>
        <strong dir="ltr">${totals.gifts}</strong>
      </div>
      <div class="summary-chip summary-amount">
        <span>المبلغ</span>
        <strong dir="ltr">${fmtMoney(totals.amount)}</strong>
      </div>
    </div>`;
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
      { id: 'processing', label: 'قيد التجهيز والإرسال', cls: 'primary' },
      { id: 'rejected', label: 'مرفوض', cls: 'danger' }
    ];
    document.getElementById('orderDetail').innerHTML = `
      <div class="detail-banner">
        <div class="detail-banner-main">
          <p class="detail-kicker">طلب شراء</p>
          <h2 dir="ltr">${esc(o.orderNo)}</h2>
          <div class="detail-meta-grid">
            <div>
              <span>الزبون</span>
              <strong>${esc(o.customerName || '—')}${o.customerNum ? ` · ${esc(o.customerNum)}` : ''}</strong>
            </div>
            <div>
              <span>المندوب</span>
              <strong>${esc(o.agentName || '—')}</strong>
            </div>
            ${o.catalogBranchName ? `
            <div>
              <span>الفرع</span>
              <strong>${esc(o.catalogBranchName)}</strong>
            </div>` : ''}
            <div>
              <span>التاريخ</span>
              <strong dir="ltr">${esc(formatWhen(o))}</strong>
            </div>
          </div>
        </div>
        <span class="badge lg ${statusBadge(o.status)}">${esc(statusLabel(o.status))}</span>
      </div>

      <div class="prep-strip">
        <div class="prep-item">
          <span>بنود</span>
          <strong dir="ltr">${lines.length}</strong>
        </div>
        <div class="prep-item">
          <span>كميات</span>
          <strong dir="ltr">${totals.qty}</strong>
        </div>
        <div class="prep-item prep-gift${totals.gifts ? ' on' : ''}">
          <span>هدايا</span>
          <strong dir="ltr">${totals.gifts}</strong>
        </div>
        <div class="prep-item">
          <span>المبلغ</span>
          <strong dir="ltr">${fmtMoney(o.totalAmount || totals.amount)}</strong>
        </div>
      </div>
      ${totals.gifts ? `
      <div class="gift-banner">
        <strong>تنبيه تجهيز:</strong>
        هذا الطلب يحتوي على <b dir="ltr">${totals.gifts}</b> هدية
        ضمن <b dir="ltr">${totals.giftLines}</b> منتج — راجع البنود المظلّلة.
      </div>` : ''}

      ${o.notes ? `<div class="panel notes-panel"><h3>ملاحظات المندوب</h3><p>${esc(o.notes)}</p></div>` : ''}
      <div class="panel lines-panel">
        <div class="panel-head-row">
          <h3>بنود التجهيز</h3>
          <span class="muted-count">${lines.length} منتج</span>
        </div>
        ${renderLines(lines)}
      </div>
      <div class="panel">
        <h3>تغيير الحالة</h3>
        <div class="status-actions">
          ${actions.map((a) => `
            <button type="button" class="btn ${a.cls}${o.status === a.id ? ' active' : ''}"
              data-set-status="${a.id}" ${o.status === a.id ? 'disabled' : ''}>
              ${esc(a.label)}
            </button>`).join('')}
        </div>
      </div>`;

    document.querySelectorAll('[data-set-status]').forEach((btn) => {
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

void tryRestoreSession();
