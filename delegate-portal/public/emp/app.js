const API = '/api/emp';
const TOKEN_KEY = 'empToken';
const EMP_KEY = 'empUser';
const INSTALL_DISMISS_KEY = 'empInstallDismissed';
const LAST_ORDER_ID_KEY = 'empLastSeenOrderId';
const REMINDER_KEY = 'empLastReminderAt';
const THEME_KEY = 'empTheme';

const STATUS_SEGMENTS = [
  { id: 'pending', label: 'انتظار', icon: '⏳' },
  { id: 'processing', label: 'مجهّز', icon: '📦' },
  { id: 'rejected', label: 'مرفوض', icon: '⛔' },
  { id: '', label: 'الكل', icon: '📋' }
];

const SOURCE_TABS = [
  { id: '', label: 'الكل', icon: '🏷️' },
  { id: 'shorja', label: 'شورجة', icon: '🏪' },
  { id: 'delegate', label: 'مندوبين', icon: '🚚' }
];

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
  search: '',
  orders: [],
  stats: null,
  selectedOrder: null,
  deferredInstall: null,
  pullStartY: 0,
  pulling: false,
  detailTab: 'lines',
  lineEditCtx: null,
  notifyTimer: null,
  reminderTimer: null,
  statusCounts: { pending: 0, processing: 0, rejected: 0, total: 0 }
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
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} د.ع`;
}

function formatWhen(o) {
  const raw = o.submittedAt || o.updatedAt || o.createdAt || '';
  return String(raw).slice(0, 16).replace('T', ' ');
}

function formatTimeAgo(iso) {
  if (!iso) return '—';
  try {
    const dt = new Date(String(iso).replace(' ', 'T'));
    const diff = Date.now() - dt.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'الآن';
    if (mins < 60) return `منذ ${mins} د`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `منذ ${hrs} س`;
    return `منذ ${Math.floor(hrs / 24)} ي`;
  } catch {
    return String(iso);
  }
}

function toast(msg, ms = 2800) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', !!dark);
  const meta = document.getElementById('themeColorMeta');
  if (meta) meta.content = dark ? '#0b1220' : '#0f766e';
  localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const dark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  applyTheme(dark);
  const toggle = document.getElementById('darkModeToggle');
  if (toggle) toggle.checked = dark;
}

async function requestNotifyPermission() {
  if (!('Notification' in window)) {
    toast('المتصفح لا يدعم الإشعارات');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') {
    toast('الإشعارات محظورة من إعدادات المتصفح');
    return false;
  }
  const r = await Notification.requestPermission();
  return r === 'granted';
}

function pushNotification(title, body, { tag, onClick } = {}) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, {
        body,
        icon: './icons/icon-192.png',
        tag: tag || 'emp',
        dir: 'rtl',
        lang: 'ar'
      });
      if (onClick) n.onclick = () => { window.focus(); onClick(); n.close(); };
    } catch { /* ignore */ }
  }
}

function stopNotifications() {
  clearInterval(state.notifyTimer);
  clearInterval(state.reminderTimer);
  state.notifyTimer = null;
  state.reminderTimer = null;
}

function startNotifications() {
  stopNotifications();
  state.notifyTimer = setInterval(() => pollOrderFeed(false), 45000);
  state.reminderTimer = setInterval(() => void checkReminder(), 60000);
  void pollOrderFeed(true);
}

async function pollOrderFeed(seed = false) {
  if (!getToken()) return;
  try {
    const sinceId = seed ? 0 : Number(localStorage.getItem(LAST_ORDER_ID_KEY) || 0);
    const data = await api(`/orders/feed?sinceId=${sinceId}`);
    const latestId = data.latest?.id || sinceId;
    if (latestId > sinceId) localStorage.setItem(LAST_ORDER_ID_KEY, String(latestId));
    if (!seed && (data.newOrders || []).length) {
      for (const o of data.newOrders) {
        pushNotification('طلب شراء جديد', `${o.orderNo} · ${o.customerName || 'بدون زبون'}`, {
          tag: `order-${o.id}`,
          onClick: () => void openOrder(o.id)
        });
        toast(`طلب جديد: ${o.orderNo}`);
      }
      if (state.screen === 'list') void loadOrders();
    }
    updatePendingBadge(Number(data.pendingCount || 0));
  } catch { /* ignore */ }
}

async function checkReminder() {
  const last = Number(localStorage.getItem(REMINDER_KEY) || 0);
  if (Date.now() - last < 15 * 60 * 1000) return;
  try {
    const data = await api('/orders/feed?status=pending');
    const n = Number(data.pendingCount || 0);
    if (n > 0) {
      localStorage.setItem(REMINDER_KEY, String(Date.now()));
      pushNotification('تذكير تجهيز', `${n} طلب بانتظار التجهيز`, { tag: 'reminder' });
      toast(`تذكير: ${n} طلب بانتظار التجهيز`);
    }
  } catch { /* ignore */ }
}

function parseStatusCounts(stats) {
  const by = stats?.byStatus || [];
  let pending = 0; let processing = 0; let rejected = 0;
  for (const row of by) {
    const s = String(row.status || '');
    const c = Number(row.c || 0);
    if (['draft', 'submitted', 'under_review', 'pending'].includes(s)) pending += c;
    else if (['approved', 'processing', 'delivered'].includes(s)) processing += c;
    else if (['rejected', 'cancelled'].includes(s)) rejected += c;
  }
  return { pending, processing, rejected, total: pending + processing + rejected };
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
  const sub = document.getElementById('subHeader');
  if (sub) sub.classList.toggle('hidden', name === 'list');
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
  if (state.filter === 'processing') {
    rows = [...rows].sort((a, b) => {
      if (!!a.prepConfirmed === !!b.prepConfirmed) return Number(b.id) - Number(a.id);
      return a.prepConfirmed ? 1 : -1;
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
    state.statusCounts = parseStatusCounts(state.stats);
    const { pending, processing, rejected } = state.statusCounts;
    const today = state.stats.todaySubmitted || 0;
    const total = state.statusCounts.total || pending + processing + rejected;
    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-tile pending clickable" data-go-filter="pending"><b>${pending}</b><span>قيد الانتظار</span></div>
      <div class="stat-tile processing clickable" data-go-filter="processing"><b>${processing}</b><span>تم التجهيز</span></div>
      <div class="stat-tile rejected clickable" data-go-filter="rejected"><b>${rejected}</b><span>مرفوض</span></div>
      <div class="stat-tile today"><b>${today}</b><span>طلبات اليوم</span></div>`;
    document.getElementById('statsGrid').querySelectorAll('[data-go-filter]').forEach((tile) => {
      tile.addEventListener('click', () => {
        state.filter = tile.dataset.goFilter || '';
        goToScreen('list');
        void loadOrders();
      });
    });
    const overview = document.getElementById('statsOverview');
    if (overview) {
      overview.innerHTML = `<h3>نظرة سريعة</h3>
        <p>إجمالي الطلبات المعروضة: <b>${total}</b></p>
        <p>طلبات اليوم: <b>${today}</b></p>`;
    }
    const max = Math.max(pending, processing, rejected, 1);
    document.getElementById('statsChart').innerHTML = `
      <div class="bar" style="--h:${Math.round(pending / max * 100)}%"><i>انتظار</i><b>${pending}</b></div>
      <div class="bar processing" style="--h:${Math.round(processing / max * 100)}%"><i>مجهّز</i><b>${processing}</b></div>
      <div class="bar rejected" style="--h:${Math.round(rejected / max * 100)}%"><i>مرفوض</i><b>${rejected}</b></div>`;
    renderListHero();
    renderFilters();
  } catch (e) {
    document.getElementById('statsGrid').innerHTML = `<p class="login-error">${esc(e.message)}</p>`;
  }
}

function renderListHero() {
  const name = state.employee?.name || 'موظف التجهيز';
  const today = state.stats?.todaySubmitted ?? '—';
  const heroName = document.getElementById('heroName');
  const heroToday = document.getElementById('heroToday');
  const heroAvatar = document.getElementById('heroAvatar');
  if (heroName) heroName.textContent = name;
  if (heroToday) heroToday.textContent = `${today} طلب ورد اليوم`;
  if (heroAvatar) heroAvatar.textContent = name.trim().charAt(0) || 'م';
}

async function updatePendingBadge(count) {
  try {
    let n = count;
    if (n == null) {
      const data = await api('/orders/feed?status=pending');
      n = Number(data.pendingCount || 0);
    }
    const badge = document.getElementById('pendingBadge');
    if (!badge) return;
    badge.textContent = String(n);
    badge.classList.toggle('hidden', n <= 0);
  } catch { /* ignore */ }
}

function renderFilters() {
  const el = document.getElementById('orderFilters');
  if (el) {
    el.innerHTML = STATUS_SEGMENTS.map((s) => {
      const count = s.id === '' ? state.statusCounts.total : (state.statusCounts[s.id] || 0);
      const active = state.filter === s.id ? ' active' : '';
      return `<button type="button" class="status-seg${active}" data-filter="${esc(s.id)}" role="tab">
        <span class="seg-ico">${s.icon}</span>
        <span class="seg-count">${count}</span>
        <span class="seg-lbl">${esc(s.label)}</span>
      </button>`;
    }).join('');
    el.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filter = btn.dataset.filter ?? '';
        renderFilters();
        void loadOrders();
      });
    });
  }

  const prepHint = document.getElementById('prepHint');
  if (prepHint) prepHint.classList.toggle('hidden', state.filter !== 'processing');

  const srcEl = document.getElementById('orderSourceFilters');
  if (srcEl) {
    srcEl.innerHTML = SOURCE_TABS.map((t) => {
      const active = state.sourceFilter === t.id ? ' active' : '';
      return `<button type="button" class="source-tab${active}" data-source="${esc(t.id)}">${t.icon} ${esc(t.label)}</button>`;
    }).join('');
    srcEl.querySelectorAll('[data-source]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.sourceFilter = btn.dataset.source ?? '';
        renderFilters();
        void loadOrders();
      });
    });
  }
}

async function togglePrepConfirm(orderId, confirmed) {
  if (!confirmed && !confirm('إلغاء علامة تأكيد التجهيز عن هذا الطلب؟')) return;
  setOverlay(true);
  try {
    await api(`/orders/${orderId}/prep-confirm`, {
      method: 'PATCH',
      body: JSON.stringify({ confirmed })
    });
    toast(confirmed ? 'تم تأكيد التجهيز ✓' : 'أُلغي تأكيد التجهيز');
    await loadOrders({ keepScreen: state.screen === 'detail' });
    if (state.selectedOrder?.id === orderId) await openOrder(orderId);
  } catch (e) {
    toast(e.message);
  } finally {
    setOverlay(false);
  }
}

async function loadOrders({ keepScreen = false } = {}) {
  setOverlay(true);
  try {
    const [statsData, ordersData] = await Promise.all([
      api('/orders/stats').catch(() => ({ stats: {} })),
      (async () => {
        const params = new URLSearchParams();
        if (state.filter) params.set('status', state.filter);
        if (state.sourceFilter) params.set('sourceType', state.sourceFilter);
        const qs = params.toString() ? `?${params.toString()}` : '';
        return api(`/orders${qs}`);
      })()
    ]);
    state.stats = statsData.stats || {};
    state.statusCounts = parseStatusCounts(state.stats);
    state.orders = ordersData.orders || [];
    renderListHero();
    renderFilters();
    renderOrdersList();
    if (!keepScreen) goToScreen('list');
    void updatePendingBadge();
  } catch (e) {
    if (getToken()) toast(e.message);
  } finally {
    setOverlay(false);
  }
}

function renderOrdersList() {
  const visible = filterOrders(state.orders);
  const listEl = document.getElementById('ordersList');
  const emptyEl = document.getElementById('ordersEmpty');
  if (!listEl) return;

  if (!visible.length) {
    listEl.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  listEl.innerHTML = visible.map((o) => {
    const giftCount = (o.lines || []).reduce((s, l) => s + Number(l.bonus || 0), 0);
    const confirmed = o.status === 'processing' && o.prepConfirmed;
    const sourceBadge = o.sourceType === 'shorja'
      ? '<span class="badge-v3 shorja">شورجة</span>'
      : '<span class="badge-v3 delegate">مندوب</span>';
    const subline = o.sourceType === 'shorja'
      ? `${esc(o.shorjaBranchName || 'فرع الشورجة')}${o.shorjaInvoiceNo ? ` · فاتورة ${esc(o.shorjaInvoiceNo)}` : ''}`
      : `${esc(o.agentName || '—')}${o.catalogBranchName ? ` · ${esc(o.catalogBranchName)}` : ''}`;
    const lineCount = o.lines?.length || 0;
    return `
    <article class="order-card-v3${confirmed ? ' confirmed' : ''}" data-order-id="${o.id}">
      ${confirmed ? '<div class="confirmed-strip" aria-hidden="true"></div>' : ''}
      <button type="button" class="order-card-body" data-open-order="${o.id}">
        <div class="order-card-top">
          <div>
            <strong class="order-no" dir="ltr">${esc(o.orderNo)}</strong>
            <div class="order-customer-row">
              <span>${esc(o.customerName || 'بدون زبون')}</span>
              ${confirmed ? '<span class="badge-v3 processing">✓ مؤكد</span>' : ''}
            </div>
            <p class="order-subline">${subline}</p>
          </div>
          <div class="order-badges">
            ${sourceBadge}
            <span class="badge-v3 ${statusBadge(o.status)}">${esc(statusLabel(o.status))}</span>
          </div>
        </div>
        <div class="order-mini-stats">
          <span class="mini-stat"><em dir="ltr">${fmtMoney(o.totalAmount)}</em></span>
          <span class="mini-stat"><em>${lineCount}</em> بند</span>
          ${giftCount ? `<span class="mini-stat gift"><em>${giftCount}</em> هدية</span>` : ''}
          <span class="time-ago">${formatTimeAgo(o.submittedAt || o.updatedAt)}</span>
        </div>
      </button>
      ${o.status === 'processing' ? `
      <div class="prep-check-row${confirmed ? ' confirmed' : ''}" data-prep-row="${o.id}">
        <button type="button" class="prep-check-circle" data-prep-toggle="${o.id}" data-prep-state="${confirmed ? '1' : '0'}" aria-label="تأكيد التجهيز">
          ${confirmed ? '✓' : ''}
        </button>
        <div class="prep-check-text">
          ${confirmed ? 'تم تأكيد التجهيز' : 'تأكيد اكتمال التجهيز'}
          <div class="prep-check-sub">${confirmed ? 'اضغط لإلغاء التأكيد' : 'اضغط عند الانتهاء من التجهيز'}</div>
        </div>
      </div>` : ''}
    </article>`;
  }).join('');

  listEl.querySelectorAll('[data-open-order]').forEach((btn) => {
    btn.addEventListener('click', () => void openOrder(Number(btn.dataset.openOrder)));
  });
  listEl.querySelectorAll('[data-prep-toggle]').forEach((btn) => {
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
        ${l.barcode ? `<button type="button" class="prep-line-code tappable" dir="ltr" data-barcode="${esc(l.barcode)}" data-line-name="${name}" data-line-no="${idx + 1}">${esc(l.barcode)}</button>` : ''}
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

function openBarcodeModal(line, idx) {
  const code = String(line.barcode || '').trim();
  if (!code) return;
  const dlg = document.getElementById('barcodeModal');
  const svg = document.getElementById('barcodeSvg');
  const nameEl = document.getElementById('barcodeProductName');
  const codeEl = document.getElementById('barcodeCode');
  const noEl = document.getElementById('barcodeLineNo');
  if (!dlg || !svg) return;
  if (nameEl) nameEl.textContent = line.matName || 'منتج';
  if (codeEl) codeEl.textContent = code;
  if (noEl) noEl.textContent = `بند ${idx + 1}`;
  svg.innerHTML = '';
  try {
    const format = /^\d{13}$/.test(code) ? 'EAN13' : 'CODE128';
    window.JsBarcode(svg, code, { format, displayValue: false, margin: 8, height: 70 });
  } catch {
    svg.innerHTML = `<text x="10" y="40">${esc(code)}</text>`;
  }
  dlg.showModal();
  dlg.dataset.copyCode = code;
}

function bindBarcodeActions(root) {
  root?.querySelectorAll('[data-barcode]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openBarcodeModal({
        barcode: btn.dataset.barcode,
        matName: btn.dataset.lineName
      }, Number(btn.dataset.lineNo) - 1);
    });
  });
}

function openLineEditModal(orderId, line) {
  state.lineEditCtx = { orderId, lineId: line.id };
  const dlg = document.getElementById('lineEditModal');
  document.getElementById('lineEditName').textContent = line.matName || '—';
  document.getElementById('lineEditQty').value = String(line.quant ?? 0);
  document.getElementById('lineEditBonus').value = String(line.bonus ?? 0);
  document.getElementById('lineEditTester').value = String(line.tester ?? 0);
  dlg?.showModal();
}

async function submitLineEdit(e) {
  e?.preventDefault();
  const ctx = state.lineEditCtx;
  if (!ctx) return;
  const quant = Number(document.getElementById('lineEditQty')?.value || 0);
  const bonus = Number(document.getElementById('lineEditBonus')?.value || 0);
  const tester = Number(document.getElementById('lineEditTester')?.value || 0);
  setOverlay(true);
  try {
    await api(`/orders/${ctx.orderId}/lines/${ctx.lineId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quant, bonus, tester })
    });
    document.getElementById('lineEditModal')?.close();
    state.lineEditCtx = null;
    toast('تم حفظ التعديل');
    await openOrder(ctx.orderId);
  } catch (err) {
    toast(err.message);
  } finally {
    setOverlay(false);
  }
}

async function editLine(orderId, line) {
  openLineEditModal(orderId, line);
}

async function deleteLine(orderId, lineId) {
  if (!confirm('حذف هذا المنتج من الطلب؟')) return;
  setOverlay(true);
  try {
    await api(`/orders/${orderId}/lines/${lineId}`, { method: 'DELETE' });
    toast('تم حذف البند');
    await openOrder(orderId);
  } catch (e) {
    toast(e.message);
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

function renderEventTimeline(events = []) {
  if (!events.length) return '<p class="empty-state">لا يوجد سجل بعد</p>';
  const rows = [...events].reverse();
  return `<div class="event-timeline">${rows.map((ev) => {
    const label = ev.toStatus ? statusLabel(canonicalStatusFromEvent(ev.toStatus)) : 'حدث';
    const actor = ev.actorType || '—';
    return `
    <div class="event-item">
      <strong>${esc(label)}</strong>
      <span>${esc(actor)} · ${formatTimeAgo(ev.createdAt)}</span>
      ${ev.note ? `<p style="margin:6px 0 0;font-size:0.75rem">${esc(ev.note)}</p>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function canonicalStatusFromEvent(s) {
  const map = {
    draft: 'pending', submitted: 'pending', under_review: 'pending', pending: 'pending',
    approved: 'processing', processing: 'processing', delivered: 'processing',
    rejected: 'rejected', cancelled: 'rejected'
  };
  return map[String(s)] || s;
}

function renderOrderInfoPanel(o) {
  const rows = [
    ['رقم الطلب', o.orderNo],
    ['الزبون', o.customerName],
    ['رقم الزبون', o.customerNum],
    ['المندوب', o.agentName],
    ['الفرع', o.catalogBranchName || o.shorjaBranchName],
    ['المصدر', o.sourceType === 'shorja' ? 'شورجة' : 'مندوبين'],
    ['فاتورة الشورجة', o.shorjaInvoiceNo],
    ['تاريخ الإرسال', formatWhen(o)],
    ['الحالة', statusLabel(o.status)],
    ['المبلغ', fmtMoney(o.totalAmount)]
  ];
  return `<div class="profile-card">${rows.filter((r) => r[1]).map(([k, v]) => `
    <div class="profile-row"><span class="ico">•</span><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('')}
    ${o.notes ? `<div class="order-notes" style="margin-top:10px"><strong>ملاحظات:</strong> ${esc(o.notes)}</div>` : ''}
  </div>`;
}

function renderDetailTabContent(o, lines, totals) {
  const tab = state.detailTab;
  if (tab === 'info') return renderOrderInfoPanel(o);
  if (tab === 'events') return renderEventTimeline(o.events || []);
  return `
    ${totals.gifts ? `<p class="gift-hint">⚠ يحتوي الطلب على <b dir="ltr">${totals.gifts}</b> قطعة هدية</p>` : ''}
    ${orderEditable(o) ? '<p class="edit-hint">يمكنك تعديل الكميات أو حذف منتج من الطلب</p>' : ''}
    ${renderLines(lines, { editable: orderEditable(o), orderId: o.id })}`;
}

function bindDetailTabs(root, o, lines, totals) {
  root?.querySelectorAll('[data-detail-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.detailTab = btn.dataset.detailTab || 'lines';
      root.querySelectorAll('[data-detail-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      const panel = root.querySelector('#detailPanel');
      if (panel) panel.innerHTML = renderDetailTabContent(o, lines, totals);
      bindLineThumbs(panel);
      bindLineActions(panel);
      bindBarcodeActions(panel);
    });
  });
}

async function openOrder(id) {
  setOverlay(true);
  try {
    const data = await api(`/orders/${id}`);
    const o = data.order;
    state.selectedOrder = o;
    state.detailTab = state.detailTab || 'lines';
    const lines = o.lines || [];
    const totals = lineTotals(lines);
    const confirmed = o.status === 'processing' && o.prepConfirmed;
    const sourceAlert = o.sourceType === 'shorja'
      ? '<div class="alert-banner shorja">طلب من فرع الشورجة — سيُرحّل للأدمن بعد التجهيز</div>'
      : '<div class="alert-banner delegate">طلب مندوب — سيصل لتطبيق الأدمن بعد «تم التجهيز»</div>';

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
          <span class="time-ago">${formatTimeAgo(o.submittedAt || o.updatedAt)}</span>
        </div>
        <div class="metric-row">
          <div class="metric-tile"><em>${lines.length}</em><span>بند</span></div>
          <div class="metric-tile"><em dir="ltr">${totals.qty}</em><span>بيع</span></div>
          <div class="metric-tile"><em dir="ltr">${fmtMoney(o.totalAmount || totals.amount)}</em><span>المبلغ</span></div>
        </div>
      </div>

      ${sourceAlert}

      <div class="quick-status">
        ${[
          { id: 'pending', label: 'انتظار' },
          { id: 'processing', label: 'تم التجهيز' },
          { id: 'rejected', label: 'مرفوض' }
        ].map((a) => `
          <button type="button" class="quick-status-btn${o.status === a.id ? ' current active' : ''}"
            data-set-status="${a.id}" ${o.status === a.id ? 'disabled' : ''}>${esc(a.label)}</button>`).join('')}
      </div>

      ${o.status === 'processing' ? `
      <div class="prep-confirm-bar-v3${confirmed ? ' confirmed' : ''}" data-detail-prep="${o.id}" data-prep-state="${confirmed ? '1' : '0'}">
        <div>
          <strong>${confirmed ? '✓ تم تأكيد التجهيز' : 'تأكيد اكتمال التجهيز'}</strong>
          <p style="margin:4px 0 0;font-size:0.72rem;color:var(--muted)">${confirmed ? 'اضغط لإلغاء' : 'بعد الانتهاء من التجهيز'}</p>
        </div>
        <span style="font-size:1.4rem">${confirmed ? '✓' : '○'}</span>
      </div>` : ''}

      <div class="detail-tabs">
        <button type="button" class="detail-tab${state.detailTab === 'lines' ? ' active' : ''}" data-detail-tab="lines">البنود</button>
        <button type="button" class="detail-tab${state.detailTab === 'info' ? ' active' : ''}" data-detail-tab="info">التفاصيل</button>
        <button type="button" class="detail-tab${state.detailTab === 'events' ? ' active' : ''}" data-detail-tab="events">السجل</button>
      </div>
      <div id="detailPanel" class="detail-panel active">${renderDetailTabContent(o, lines, totals)}</div>`;

    const detailRoot = document.getElementById('orderDetail');
    bindLineThumbs(detailRoot.querySelector('#detailPanel'));
    bindLineActions(detailRoot.querySelector('#detailPanel'));
    bindBarcodeActions(detailRoot.querySelector('#detailPanel'));
    bindDetailTabs(detailRoot, o, lines, totals);
    detailRoot.querySelectorAll('[data-set-status]').forEach((btn) => {
      btn.addEventListener('click', () => void setOrderStatus(o.id, btn.dataset.setStatus));
    });
    detailRoot.querySelectorAll('[data-detail-prep]').forEach((btn) => {
      btn.addEventListener('click', () => void togglePrepConfirm(Number(btn.dataset.detailPrep), btn.dataset.prepState !== '1'));
    });
    goToScreen('detail');
  } catch (e) {
    toast(e.message);
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
  } else if (status !== 'processing') {
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
    if (status === 'processing') {
      toast('تم التجهيز — الطلب يُرسل الآن لتطبيق الأدمن للترحيل');
      pushNotification('تم التجهيز', `الطلب ${data.order?.orderNo || id} جاهز للأدمن`, { tag: `done-${id}` });
    } else {
      toast(`تم تحديث الحالة: ${statusLabel(status)}`);
    }
    await openOrder(id);
    void loadOrders({ keepScreen: true });
  } catch (e) {
    toast(e.message);
  } finally {
    setOverlay(false);
  }
}

function afterLogin() {
  showApp();
  initTheme();
  void requestNotifyPermission().then((ok) => {
    if (ok) startNotifications();
  });
}

async function tryRestoreSession() {
  const token = getToken();
  if (!token) {
    showLogin();
    initTheme();
    return;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(EMP_KEY) || '{}');
    const data = await api('/me');
    state.employee = data.employee || saved;
    afterLogin();
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
    afterLogin();
    await loadOrders();
  } catch (err) {
    showLogin(err.message);
  } finally {
    setOverlay(false);
  }
});

document.getElementById('btnLogout')?.addEventListener('click', () => {
  stopNotifications();
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
  const clearBtn = document.getElementById('btnClearSearch');
  clearBtn?.classList.toggle('hidden', !state.search);
  if (state.orders.length) renderOrdersList();
});

document.getElementById('btnClearSearch')?.addEventListener('click', () => {
  const input = document.getElementById('orderSearch');
  if (input) input.value = '';
  state.search = '';
  document.getElementById('btnClearSearch')?.classList.add('hidden');
  renderOrdersList();
});

document.getElementById('btnListRefresh')?.addEventListener('click', () => void loadOrders());
document.getElementById('btnEmptyRetry')?.addEventListener('click', () => void loadOrders());

document.getElementById('btnEnableNotify')?.addEventListener('click', async () => {
  const ok = await requestNotifyPermission();
  if (ok) {
    startNotifications();
    toast('تم تفعيل الإشعارات');
  }
});

document.getElementById('darkModeToggle')?.addEventListener('change', (e) => {
  applyTheme(e.target.checked);
});

document.getElementById('lineEditForm')?.addEventListener('submit', submitLineEdit);
document.getElementById('btnLineEditCancel')?.addEventListener('click', () => {
  document.getElementById('lineEditModal')?.close();
  state.lineEditCtx = null;
});

document.getElementById('btnBarcodeClose')?.addEventListener('click', () => {
  document.getElementById('barcodeModal')?.close();
});
document.getElementById('btnCopyBarcode')?.addEventListener('click', async () => {
  const code = document.getElementById('barcodeModal')?.dataset.copyCode || '';
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    toast('تم نسخ الباركود');
  } catch {
    toast(code);
  }
});

document.getElementById('btnTogglePassword')?.addEventListener('click', () => {
  const input = document.getElementById('loginPassword');
  const btn = document.getElementById('btnTogglePassword');
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  if (btn) btn.textContent = show ? '🙈' : '👁';
});

const loginServer = document.getElementById('loginServer');
if (loginServer) loginServer.textContent = window.location.origin;

document.querySelectorAll('.bottom-nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab || 'list';
    goToScreen(tab);
  });
});

document.getElementById('btnLogoutProfile')?.addEventListener('click', () => {
  stopNotifications();
  clearSession();
  showLogin();
});

document.getElementById('btnLightboxClose')?.addEventListener('click', closeImageLightbox);
document.getElementById('imageLightbox')?.addEventListener('click', (e) => {
  if (e.target.id === 'imageLightbox') closeImageLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeImageLightbox();
    document.getElementById('barcodeModal')?.close();
  }
});

registerServiceWorker();
bindPwaUi();
bindPullToRefresh();
initTheme();
void tryRestoreSession();
