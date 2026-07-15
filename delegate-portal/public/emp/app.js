const API = '/api/emp';
const TOKEN_KEY = 'empToken';
const EMP_KEY = 'empUser';
const INSTALL_DISMISS_KEY = 'empInstallDismissed';

const STATUS_META = {
  pending: { label: 'قيد الانتظار', badge: 'pending' },
  processing: { label: 'تم التجهيز', badge: 'processing' },
  rejected: { label: 'مرفوض', badge: 'rejected' }
};

const FILTERS = [
  { id: 'pending', label: 'انتظار' },
  { id: 'processing', label: 'مجهّز' },
  { id: 'rejected', label: 'مرفوض' },
  { id: '', label: 'الكل' }
];

const PREP_FILTERS = [
  { id: '', label: 'الكل' },
  { id: 'confirmed', label: 'مؤكد ✓' },
  { id: 'pending_confirm', label: 'بانتظار التأكيد' }
];

const SOURCE_FILTERS = [
  { id: '', label: 'كل المصادر' },
  { id: 'delegate', label: 'طلبات المندوبين' },
  { id: 'shorja', label: 'طلبات الشورجة' }
];

const state = {
  employee: null,
  screen: 'list',
  tab: 'list',
  filter: new URLSearchParams(window.location.search).get('filter') || 'pending',
  sourceFilter: new URLSearchParams(window.location.search).get('source') || '',
  prepFilter: '',
  search: '',
  orders: [],
  stats: null,
  selectedOrder: null,
  deferredInstall: null,
  pullStartY: 0,
  pulling: false
};

function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function setOfflineBanner(offline) {
  document.getElementById('offlineBanner')?.classList.toggle('hidden', !offline);
}

function showInstallBanner(show) {
  const el = document.getElementById('installBanner');
  if (!el) return;
  const dismissed = localStorage.getItem(INSTALL_DISMISS_KEY);
  if (show && !isStandaloneApp() && !dismissed) {
    el.classList.remove('hidden');
    const copy = el.querySelector('.install-banner-copy p');
    if (copy && isIos() && !state.deferredInstall) {
      copy.textContent = 'من Safari: زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»';
    }
  } else {
    el.classList.add('hidden');
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
}

function bindPwaUi() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstall = e;
    showInstallBanner(true);
  });

  document.getElementById('btnInstallApp')?.addEventListener('click', async () => {
    const prompt = state.deferredInstall;
    if (!prompt) {
      alert('من المتصفح: قائمة ⋮ ثم «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق»');
      return;
    }
    prompt.prompt();
    await prompt.userChoice.catch(() => ({}));
    state.deferredInstall = null;
    showInstallBanner(false);
  });

  document.getElementById('btnDismissInstall')?.addEventListener('click', () => {
    localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    showInstallBanner(false);
  });

  window.addEventListener('online', () => setOfflineBanner(false));
  window.addEventListener('offline', () => setOfflineBanner(true));
  setOfflineBanner(!navigator.onLine);

  if (isIos() && !isStandaloneApp() && !localStorage.getItem(INSTALL_DISMISS_KEY)) {
    showInstallBanner(true);
  }

  if (isStandaloneApp()) {
    document.documentElement.classList.add('standalone');
  }
}

function bindPullToRefresh() {
  const scrollEl = document.querySelector('.app-main');
  const hint = document.getElementById('pullHint');
  if (!scrollEl) return;

  scrollEl.addEventListener('touchstart', (e) => {
    if (state.screen !== 'list' || scrollEl.scrollTop > 0) return;
    state.pullStartY = e.touches[0]?.clientY || 0;
    state.pulling = true;
  }, { passive: true });

  scrollEl.addEventListener('touchmove', (e) => {
    if (!state.pulling || state.screen !== 'list') return;
    const y = e.touches[0]?.clientY || 0;
    const delta = y - state.pullStartY;
    if (delta > 48 && scrollEl.scrollTop <= 0) {
      hint?.classList.remove('hidden');
    } else {
      hint?.classList.add('hidden');
    }
  }, { passive: true });

  scrollEl.addEventListener('touchend', async () => {
    if (!state.pulling) return;
    const visible = hint && !hint.classList.contains('hidden');
    state.pulling = false;
    hint?.classList.add('hidden');
    if (visible && state.screen === 'list') {
      await loadOrders();
    }
  }, { passive: true });
}

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
  const no = idx + 1;
  if (src) {
    return `<button type="button" class="line-thumb" data-img="${esc(src)}" data-caption="${name}" aria-label="تكبير صورة ${name}">
      <span class="line-no-badge">${no}</span>
      <img src="${esc(src)}" alt="" loading="lazy">
    </button>`;
  }
  return `<div class="line-thumb line-thumb-empty" aria-hidden="true"><span class="line-no-badge">${no}</span></div>`;
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
  document.getElementById('bottomNav')?.classList.remove('hidden');
  renderProfile();
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // تجاهل 401 من طلب قديم بعد تسجيل دخول جديد
    if (token && token === getToken()) {
      clearSession();
      showLogin('انتهت الجلسة — سجّل الدخول مجدداً');
    }
    throw new Error(data.error || 'انتهت الجلسة');
  }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function goToScreen(name) {
  state.screen = name;
  if (name !== 'detail') state.tab = name;
  document.querySelectorAll('.screen').forEach((el) => {
    el.classList.toggle('active', el.id === `screen-${name}`);
  });
  const backBtn = document.getElementById('btnBack');
  const title = document.getElementById('screenTitle');
  const kicker = document.getElementById('headerKicker');
  const bottomNav = document.getElementById('bottomNav');
  bottomNav?.classList.toggle('hidden', name === 'detail');
  document.querySelectorAll('.bottom-nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === state.tab && name !== 'detail');
  });
  if (name === 'list') {
    backBtn?.classList.add('hidden');
    if (title) title.textContent = 'الطلبات';
    if (kicker) kicker.textContent = state.employee?.name || 'تجهيز الطلبات';
  } else if (name === 'stats') {
    backBtn?.classList.add('hidden');
    if (title) title.textContent = 'الإحصائيات';
    if (kicker) kicker.textContent = 'ملخص الأداء';
    void loadStats();
  } else if (name === 'profile') {
    backBtn?.classList.add('hidden');
    if (title) title.textContent = 'حسابي';
    if (kicker) kicker.textContent = state.employee?.name || 'الموظف';
    renderProfile();
  } else if (name === 'detail') {
    backBtn?.classList.remove('hidden');
    const o = state.selectedOrder;
    if (title) title.textContent = o?.orderNo ? `طلب ${o.orderNo}` : 'تفاصيل الطلب';
    if (kicker) kicker.textContent = o ? statusLabel(o.status) : 'تفاصيل';
  }
}

function filterOrders(list) {
  let rows = list;
  if (state.filter === 'processing' && state.prepFilter === 'confirmed') {
    rows = rows.filter((o) => o.prepConfirmed);
  } else if (state.filter === 'processing' && state.prepFilter === 'pending_confirm') {
    rows = rows.filter((o) => !o.prepConfirmed);
  }
  if (state.filter === 'processing') {
    rows = [...rows].sort((a, b) => {
      if (!!a.prepConfirmed === !!b.prepConfirmed) return Number(b.id) - Number(a.id);
      return a.prepConfirmed ? -1 : 1;
    });
  }
  const q = String(state.search || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((o) => {
    const hay = [o.orderNo, o.customerName, o.agentName, o.shorjaInvoiceNo, o.shorjaBranchName, o.catalogBranchName]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function renderProfile() {
  const name = state.employee?.name || 'موظف التجهيز';
  const user = state.employee?.username || '—';
  document.getElementById('profileName').textContent = name;
  document.getElementById('profileUser').textContent = user;
  document.getElementById('profileAvatar').textContent = name.trim().charAt(0) || 'م';
  document.getElementById('profileServer').textContent = window.location.origin;
}

async function loadStats() {
  try {
    const data = await api('/orders/stats');
    state.stats = data.stats || {};
    const by = state.stats.byStatus || [];
    let pending = 0; let processing = 0; let rejected = 0;
    for (const row of by) {
      const s = String(row.status || '');
      const c = Number(row.c || 0);
      if (['draft', 'submitted', 'under_review', 'pending'].includes(s)) pending += c;
      else if (['approved', 'processing', 'delivered'].includes(s)) processing += c;
      else if (['rejected', 'cancelled'].includes(s)) rejected += c;
    }
    const today = state.stats.todaySubmitted || 0;
    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-tile pending"><b>${pending}</b><span>قيد الانتظار</span></div>
      <div class="stat-tile processing"><b>${processing}</b><span>تم التجهيز</span></div>
      <div class="stat-tile rejected"><b>${rejected}</b><span>مرفوض</span></div>
      <div class="stat-tile today"><b>${today}</b><span>طلبات اليوم</span></div>`;
    const max = Math.max(pending, processing, rejected, 1);
    document.getElementById('statsChart').innerHTML = `
      <div class="bar" style="--h:${Math.round(pending / max * 100)}%"><i>انتظار</i><b>${pending}</b></div>
      <div class="bar processing" style="--h:${Math.round(processing / max * 100)}%"><i>مجهّز</i><b>${processing}</b></div>
      <div class="bar rejected" style="--h:${Math.round(rejected / max * 100)}%"><i>مرفوض</i><b>${rejected}</b></div>`;
  } catch (e) {
    document.getElementById('statsGrid').innerHTML = `<p class="login-error">${esc(e.message)}</p>`;
  }
}

async function updatePendingBadge() {
  try {
    const data = await api('/orders/feed?status=pending');
    const n = Number(data.pendingCount || 0);
    const badge = document.getElementById('pendingBadge');
    if (!badge) return;
    badge.textContent = String(n);
    badge.classList.toggle('hidden', n <= 0);
  } catch { /* ignore */ }
}

function renderFilters() {
  const el = document.getElementById('orderFilters');
  if (!el) return;
  el.innerHTML = FILTERS.map((f) => `
    <button type="button" class="filter-chip status-chip${state.filter === f.id ? ' active' : ''}"
      data-filter="${esc(f.id)}" role="tab" aria-selected="${state.filter === f.id}">
      ${esc(f.label)}
    </button>`).join('');
  el.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter = btn.dataset.filter || '';
      if (state.filter !== 'processing') state.prepFilter = '';
      renderFilters();
      void loadOrders();
    });
  });

  const prepEl = document.getElementById('orderPrepFilters');
  if (prepEl) {
    if (state.filter === 'processing') {
      prepEl.classList.remove('hidden');
      prepEl.innerHTML = PREP_FILTERS.map((f) => `
        <button type="button" class="filter-chip prep-chip${state.prepFilter === f.id ? ' active' : ''}"
          data-prep="${esc(f.id)}" role="tab" aria-selected="${state.prepFilter === f.id}">
          ${esc(f.label)}
        </button>`).join('');
      prepEl.querySelectorAll('[data-prep]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.prepFilter = btn.dataset.prep || '';
          renderOrdersList();
        });
      });
    } else {
      prepEl.classList.add('hidden');
      prepEl.innerHTML = '';
    }
  }

  const srcEl = document.getElementById('orderSourceFilters');
  if (!srcEl) return;
  srcEl.innerHTML = SOURCE_FILTERS.map((f) => `
    <button type="button" class="filter-chip source-chip${state.sourceFilter === f.id ? ' active' : ''}"
      data-source="${esc(f.id)}" role="tab" aria-selected="${state.sourceFilter === f.id}">
      ${esc(f.label)}
    </button>`).join('');
  srcEl.querySelectorAll('[data-source]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.sourceFilter = btn.dataset.source || '';
      void loadOrders();
    });
  });
}

async function togglePrepConfirm(orderId, confirmed) {
  if (!confirmed && !confirm('إلغاء علامة تأكيد التجهيز عن هذا الطلب؟')) return;
  setOverlay(true);
  try {
    await api(`/orders/${orderId}/prep-confirm`, {
      method: 'PATCH',
      body: JSON.stringify({ confirmed })
    });
    await loadOrders();
    if (state.selectedOrder?.id === orderId) await openOrder(orderId);
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

async function loadOrders() {
  setOverlay(true);
  try {
    renderFilters();
    const params = new URLSearchParams();
    if (state.filter) params.set('status', state.filter);
    if (state.sourceFilter) params.set('sourceType', state.sourceFilter);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await api(`/orders${qs}`);
    state.orders = data.orders || [];
    renderOrdersList();
    goToScreen('list');
    void updatePendingBadge();
  } catch (e) {
    if (getToken()) alert(e.message);
  } finally {
    setOverlay(false);
  }
}

function renderOrdersList() {
  const visible = filterOrders(state.orders);
  const count = visible.length;
  const filterLabel = FILTERS.find((f) => f.id === state.filter)?.label || '';
  const sourceLabel = SOURCE_FILTERS.find((f) => f.id === state.sourceFilter)?.label || '';
  document.getElementById('ordersMeta').textContent = count
    ? `${count} طلب${state.filter ? ` · ${filterLabel}` : ''}${state.sourceFilter ? ` · ${sourceLabel}` : ''}`
    : (state.search ? 'لا توجد نتائج للبحث' : 'لا توجد طلبات في هذا التصنيف');

  document.getElementById('ordersList').innerHTML = visible.map((o) => {
      const giftCount = (o.lines || []).reduce((s, l) => s + Number(l.bonus || 0), 0);
      const confirmed = o.status === 'processing' && o.prepConfirmed;
      const sourceBadge = o.sourceType === 'shorja'
        ? '<span class="source-pill shorja">شورجة</span>'
        : '<span class="source-pill delegate">مندوب</span>';
      const subline = o.sourceType === 'shorja'
        ? `${esc(o.shorjaBranchName || 'فرع الشورجة')}${o.shorjaInvoiceNo ? ` · فاتورة ${esc(o.shorjaInvoiceNo)}` : ''}`
        : `${esc(o.agentName || '—')}${o.catalogBranchName ? ` · ${esc(o.catalogBranchName)}` : ''}`;
      const prepBtn = o.status === 'processing'
        ? `<button type="button" class="prep-confirm-btn${confirmed ? ' confirmed' : ''}" data-prep-toggle="${o.id}" data-prep-state="${confirmed ? '1' : '0'}">${confirmed ? '✓ مؤكد — إلغاء' : '✓ تأكيد التجهيز'}</button>`
        : '';
      return `
      <button type="button" class="order-card${giftCount ? ' has-gift' : ''}${confirmed ? ' prep-confirmed' : ''}" data-order-id="${o.id}">
        ${confirmed ? '<div class="prep-confirmed-bar" aria-hidden="true"></div>' : ''}
        <div class="order-card-head">
          <div>
            <strong class="order-no" dir="ltr">${esc(o.orderNo)}</strong>
            <p class="order-customer">${esc(o.customerName || 'بدون زبون')}</p>
            <p class="order-agent">${subline}</p>
          </div>
          <div class="order-card-badges">
            ${confirmed ? '<span class="confirmed-pill">✓ مؤكد</span>' : ''}
            ${sourceBadge}
            ${giftCount ? `<span class="gift-pill">هدايا ${giftCount}</span>` : ''}
            <span class="badge ${statusBadge(o.status)}">${esc(statusLabel(o.status))}</span>
          </div>
        </div>
        <div class="order-stats">
          <span class="order-stat"><em>${fmtMoney(o.totalAmount)}</em> المبلغ</span>
          <span class="order-stat"><em>${o.lines?.length || 0}</em> بند</span>
          <span class="order-stat${giftCount ? ' gift' : ''}"><em>${giftCount}</em> هدايا</span>
        </div>
        ${prepBtn}
        <div class="order-card-foot" dir="ltr">${esc(formatWhen(o))}</div>
      </button>`;
    }).join('') || '<div class="empty-state"><p>لا توجد طلبات</p></div>';

    document.querySelectorAll('[data-order-id]').forEach((btn) => {
      btn.addEventListener('click', () => openOrder(Number(btn.dataset.orderId)));
    });
    document.querySelectorAll('[data-prep-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        void togglePrepConfirm(Number(btn.dataset.prepToggle), btn.dataset.prepState !== '1');
      });
    });
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

function orderEditable(o) {
  return o && (o.status === 'pending' || o.status === 'processing');
}

function renderLines(lines = [], { editable = false, orderId = 0 } = {}) {
  if (!lines.length) return '<p class="empty-state">لا توجد بنود</p>';
  return `<div class="prep-lines">${lines.map((l, idx) => {
    const qty = Number(l.quant || 0);
    const gift = Number(l.bonus || 0);
    const tester = Number(l.tester || 0);
    const deliver = qty + gift + tester;
    const hasGift = gift > 0;
    const hasTester = tester > 0;
    return `
    <article class="prep-line${hasGift ? ' has-gift' : ''}${hasTester ? ' has-tester' : ''}" data-line-id="${l.id || ''}">
      ${lineThumbHtml(l, idx)}
      <div class="prep-line-main">
        <div class="prep-line-head">
          <span class="line-no-pill">بند ${idx + 1}</span>
          <strong class="prep-line-name">${esc(l.matName || '—')}</strong>
          ${hasGift ? `<span class="gift-tag">+${gift} هدية</span>` : ''}
          ${hasTester ? `<span class="tester-tag">+${tester} تيستر</span>` : ''}
        </div>
        ${l.barcode ? `<span class="prep-line-code" dir="ltr">${esc(l.barcode)}</span>` : ''}
        <div class="prep-line-stats">
          <span><em dir="ltr">${qty}</em> بيع</span>
          <span class="${hasGift ? 'gift-stat' : ''}"><em dir="ltr">${gift}</em> هدية</span>
          <span class="${hasTester ? 'tester-stat' : ''}"><em dir="ltr">${tester}</em> تيستر</span>
          <span class="deliver-stat"><em dir="ltr">${deliver}</em> للتسليم</span>
        </div>
        ${l.remarks ? `<p class="prep-line-note">${esc(l.remarks)}</p>` : ''}
      </div>
      <div class="prep-line-side">
        <div class="prep-line-price" dir="ltr">
          <span class="prep-line-total">${fmtMoney(l.lineTotal)}</span>
          ${qty > 0 ? `<span class="prep-line-unit">${fmtMoney(l.unitPrice)}</span>` : ''}
        </div>
        ${editable ? `<div class="line-actions">
          <button type="button" class="btn ghost sm line-edit" data-order-id="${orderId}" data-line-id="${l.id}">تعديل</button>
          <button type="button" class="btn danger sm line-del" data-order-id="${orderId}" data-line-id="${l.id}">حذف</button>
        </div>` : ''}
      </div>
    </article>`;
  }).join('')}</div>`;
}

function bindLineActions(root) {
  root?.querySelectorAll('.line-edit').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const orderId = Number(btn.dataset.orderId);
      const lineId = Number(btn.dataset.lineId);
      const line = (state.selectedOrder?.lines || []).find((l) => Number(l.id) === lineId);
      if (line) void editLine(orderId, line);
    });
  });
  root?.querySelectorAll('.line-del').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      void deleteLine(Number(btn.dataset.orderId), Number(btn.dataset.lineId));
    });
  });
}

async function editLine(orderId, line) {
  const qty = prompt('كمية البيع:', String(line.quant ?? 0));
  if (qty === null) return;
  const bonus = prompt('كمية الهدية:', String(line.bonus ?? 0));
  if (bonus === null) return;
  const tester = prompt('كمية التيستر:', String(line.tester ?? 0));
  if (tester === null) return;
  setOverlay(true);
  try {
    await api(`/orders/${orderId}/lines/${line.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ quant: Number(qty), bonus: Number(bonus), tester: Number(tester) })
    });
    await openOrder(orderId);
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

async function deleteLine(orderId, lineId) {
  if (!confirm('حذف هذا المنتج من الطلب؟')) return;
  setOverlay(true);
  try {
    await api(`/orders/${orderId}/lines/${lineId}`, { method: 'DELETE' });
    await openOrder(orderId);
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
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

      ${o.status === 'processing' ? `
      <div class="prep-confirm-panel${o.prepConfirmed ? ' confirmed' : ''}">
        <p>${o.prepConfirmed ? '✓ تم تأكيد اكتمال التجهيز' : 'بعد الانتهاء، أكّد التجهيز بوضع علامة ✓'}</p>
        <button type="button" class="btn ${o.prepConfirmed ? 'ghost' : 'primary'} full" data-detail-prep="${o.id}" data-prep-state="${o.prepConfirmed ? '1' : '0'}">
          ${o.prepConfirmed ? 'إلغاء التأكيد' : 'تأكيد اكتمال التجهيز ✓'}
        </button>
      </div>` : ''}

      <h3 class="section-title">المنتجات <span>${lines.length}</span></h3>
      ${orderEditable(o) ? '<p class="edit-hint">يمكنك تعديل الكميات أو حذف منتج من الطلب</p>' : ''}
      ${renderLines(lines, { editable: orderEditable(o), orderId: o.id })}

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
    bindLineActions(detailRoot);
    detailRoot.querySelectorAll('[data-set-status]').forEach((btn) => {
      btn.addEventListener('click', () => void setOrderStatus(o.id, btn.dataset.setStatus));
    });
    detailRoot.querySelectorAll('[data-detail-prep]').forEach((btn) => {
      btn.addEventListener('click', () => void togglePrepConfirm(Number(btn.dataset.detailPrep), btn.dataset.prepState !== '1'));
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
  goToScreen(state.tab || 'list');
});

document.getElementById('orderSearch')?.addEventListener('input', (e) => {
  state.search = e.target.value || '';
  if (state.orders.length) renderOrdersList();
});

document.querySelectorAll('.bottom-nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab || 'list';
    goToScreen(tab);
  });
});

document.getElementById('btnLogoutProfile')?.addEventListener('click', () => {
  clearSession();
  showLogin();
});

document.getElementById('btnLightboxClose')?.addEventListener('click', closeImageLightbox);
document.getElementById('imageLightbox')?.addEventListener('click', (e) => {
  if (e.target.id === 'imageLightbox') closeImageLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeImageLightbox();
});

registerServiceWorker();
bindPwaUi();
bindPullToRefresh();
void tryRestoreSession();
