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

    document.getElementById('ordersList').innerHTML = state.orders.map((o) => `
      <button type="button" class="order-card" data-order-id="${o.id}">
        <div class="order-card-head">
          <div>
            <strong class="order-no" dir="ltr">${esc(o.orderNo)}</strong>
            <p class="order-customer">${esc(o.customerName || 'بدون زبون')}</p>
            <p class="order-agent">${esc(o.agentName || '—')}${o.catalogBranchName ? ` · ${esc(o.catalogBranchName)}` : ''}</p>
          </div>
          <span class="badge ${statusBadge(o.status)}">${esc(statusLabel(o.status))}</span>
        </div>
        <div class="order-stats">
          <span class="order-stat"><em>${fmtMoney(o.totalAmount)}</em> المبلغ</span>
          <span class="order-stat"><em>${o.lines?.length || 0}</em> بند</span>
          <span class="order-stat"><em dir="ltr">${esc(formatWhen(o))}</em> التاريخ</span>
        </div>
      </button>`).join('') || '<div class="empty-state"><p>لا توجد طلبات</p></div>';

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

function renderLines(lines = []) {
  if (!lines.length) return '<p class="empty-state">لا توجد بنود</p>';
  return `<div class="lines">${lines.map((l) => `
    <div class="line-row">
      <div>
        <div class="line-name">${esc(l.matName || '—')}</div>
        <div class="line-meta" dir="ltr">${esc(l.barcode || '')}${l.bonus ? ` · بونص ${l.bonus}` : ''}</div>
      </div>
      <div class="line-qty">${esc(l.quant)} × ${fmtMoney(l.unitPrice)}</div>
    </div>`).join('')}</div>
    <div class="totals">
      <span>الإجمالي</span>
      <span dir="ltr">${fmtMoney(lines.reduce((s, l) => s + Number(l.lineTotal || 0), 0))}</span>
    </div>`;
}

async function openOrder(id) {
  setOverlay(true);
  try {
    const data = await api(`/orders/${id}`);
    const o = data.order;
    state.selectedOrder = o;
    const actions = [
      { id: 'pending', label: 'قيد الانتظار', cls: 'soft' },
      { id: 'processing', label: 'قيد التجهيز والإرسال', cls: 'primary' },
      { id: 'rejected', label: 'مرفوض', cls: 'danger' }
    ];
    document.getElementById('orderDetail').innerHTML = `
      <div class="detail-banner">
        <div>
          <p class="detail-kicker">طلب شراء</p>
          <h2 dir="ltr">${esc(o.orderNo)}</h2>
          <p>${esc(o.customerName || '—')}${o.customerNum ? ` · ${esc(o.customerNum)}` : ''}</p>
          <p>المندوب: ${esc(o.agentName || '—')}${o.catalogBranchName ? ` · ${esc(o.catalogBranchName)}` : ''}</p>
        </div>
        <span class="badge lg ${statusBadge(o.status)}">${esc(statusLabel(o.status))}</span>
      </div>
      ${o.notes ? `<div class="panel"><h3>ملاحظات</h3><p>${esc(o.notes)}</p></div>` : ''}
      <div class="panel">
        <h3>بنود الطلب</h3>
        ${renderLines(o.lines || [])}
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
