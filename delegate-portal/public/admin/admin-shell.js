/* Edari Admin — Shell v4: صفحة مستقلة لكل قسم فرعي */

const LEGACY_RV_TO_PAGE = {
  delivery: 'deliveryReceipts',
  customers: 'customerRequests'
};

const ADMIN_NAV = [
  {
    id: 'home',
    label: 'عام',
    icon: 'home',
    items: [
      { page: 'dashboard', label: 'الرئيسية', icon: 'home' }
    ]
  },
  {
    id: 'commerce',
    label: 'التجارة',
    icon: 'commerce',
    items: [
      { page: 'catalog', label: 'المنتجات', icon: 'catalog', desc: 'فروع · أقسام · باركود' },
      { page: 'orders', label: 'طلبات الشراء', icon: 'orders', desc: 'مراجعة واعتماد' }
    ]
  },
  {
    id: 'collections',
    label: 'التحصيل',
    icon: 'receipts',
    items: [
      { page: 'receipts', label: 'سندات قبض', icon: 'receipt', desc: 'مراجعة وترحيل' },
      { page: 'deliveryReceipts', label: 'وصول استلام', icon: 'delivery', desc: 'وصل مبلغ للزبون' },
      { page: 'customerRequests', label: 'زبائن جدد', icon: 'customers', desc: 'ترحيل زبون' },
      { page: 'promotionalVisits', label: 'زيادات ترويجية', icon: 'promo', desc: 'زيارات المحلات' },
      { page: 'thermalReceipt', label: 'تصميم الوصل', icon: 'thermal', desc: 'قالب 80mm' }
    ]
  },
  {
    id: 'reports',
    label: 'التقارير',
    icon: 'reports',
    items: [
      { page: 'salesReport', label: 'مبيعات الشجرات', icon: 'reports', desc: 'PDF حسب الفترة' },
      { page: 'accountStatements', label: 'كشف حساب', icon: 'delivery', desc: 'حسابات Edari' }
    ]
  },
  {
    id: 'system',
    label: 'النظام',
    icon: 'system',
    items: [
      { page: 'lan', label: 'الشبكة المحلية', icon: 'sync', desc: 'LAN · رئيسي / عميل' },
      { page: 'priceSync', label: 'مزامنة الأسعار', icon: 'price' },
      { page: 'sync', label: 'رفع البيانات', icon: 'sync' },
      { page: 'database', label: 'قاعدة البيانات', icon: 'db' }
    ]
  },
  {
    id: 'team',
    label: 'الفريق',
    icon: 'team',
    items: [
      { page: 'agents', label: 'المندوبون', icon: 'agents', desc: 'صلاحيات وشجرات' }
    ]
  }
];

const NAV_ICONS = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9 20v-6h6v6"/></svg>',
  commerce: '<svg viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/></svg>',
  catalog: '<svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
  orders: '<svg viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  receipts: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8"/></svg>',
  receipt: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  delivery: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  customers: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  promo: '<svg viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>',
  thermal: '<svg viewBox="0 0 24 24"><path d="M6 9V2h12v7"/><path d="M6 14h12v8H6z"/></svg>',
  reports: '<svg viewBox="0 0 24 24"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>',
  price: '<svg viewBox="0 0 24 24"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></svg>',
  sync: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
  db: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
  agents: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
  system: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  team: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
};

function navIcon(name) {
  return NAV_ICONS[name] || NAV_ICONS.home;
}

function resolveAdminPage(name, opts = {}) {
  if (name === 'receipts' && opts.rvTab && LEGACY_RV_TO_PAGE[opts.rvTab]) {
    return LEGACY_RV_TO_PAGE[opts.rvTab];
  }
  return name;
}

function renderAdminSidebar() {
  const host = document.getElementById('sidebarNav');
  if (!host) return;
  host.innerHTML = ADMIN_NAV.map((section) => {
    const single = section.items.length === 1;
    const itemsHtml = section.items.map((item) => `
      <button type="button" class="nav-item nav-sub${single ? '' : ' nav-sub-item'}" data-page="${item.page}">
        <span class="nav-icon" aria-hidden="true">${navIcon(item.icon)}</span>
        <span class="nav-text-wrap">
          <span class="nav-text">${esc(item.label)}</span>
          ${item.desc ? `<span class="nav-desc">${esc(item.desc)}</span>` : ''}
        </span>
      </button>`).join('');
    if (single && section.id === 'home') {
      return `<div class="nav-section" data-section="${section.id}">${itemsHtml}</div>`;
    }
    return `
      <div class="nav-section" data-section="${section.id}">
        <button type="button" class="nav-section-toggle" aria-expanded="false">
          <span class="nav-section-icon" aria-hidden="true">${navIcon(section.icon)}</span>
          <span class="nav-section-label">${esc(section.label)}</span>
          <span class="nav-section-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></span>
        </button>
        <div class="nav-section-body">${itemsHtml}</div>
      </div>`;
  }).join('');

  host.querySelectorAll('.nav-section-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.nav-section');
      const willOpen = !section?.classList.contains('is-open');
      section?.classList.toggle('is-open', willOpen);
      btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
  });

  host.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
  });
}

function flattenAdminNav() {
  const out = [];
  for (const section of ADMIN_NAV) {
    for (const item of section.items) {
      out.push({
        page: item.page,
        label: item.label,
        desc: item.desc || '',
        icon: item.icon,
        section: section.label,
        sectionId: section.id
      });
    }
  }
  return out;
}

function findNavSection(page) {
  for (const section of ADMIN_NAV) {
    for (const item of section.items) {
      if (item.page === page) return { section, item };
    }
  }
  return null;
}

function updateAdminChrome(name) {
  const hit = findNavSection(name);
  document.querySelectorAll('.nav-section').forEach((el) => {
    const id = el.dataset.section;
    const section = ADMIN_NAV.find((s) => s.id === id);
    const hasActive = section?.items.some((item) => item.page === name);
    if (hasActive) {
      el.classList.add('is-open');
      el.querySelector('.nav-section-toggle')?.setAttribute('aria-expanded', 'true');
    }
  });

  document.querySelectorAll('#sidebarNav .nav-item').forEach((n) => {
    n.classList.toggle('active', n.dataset.page === name);
  });

  if (typeof setWorkspaceTone === 'function') {
    setWorkspaceTone(hit?.section?.id || null);
  }

  const crumbs = document.getElementById('pageBreadcrumbs');
  if (crumbs && hit) {
    crumbs.innerHTML = [
      `<span class="crumb-root">${esc(hit.section.label)}</span>`,
      `<span class="crumb-sep">/</span>`,
      `<span class="crumb-current">${esc(hit.item.label)}</span>`
    ].join('');
    crumbs.hidden = false;
  } else if (crumbs) {
    crumbs.hidden = true;
  }

  renderTopbarActions(name);
  if (typeof updateTopbarIcon === 'function') updateTopbarIcon(name);
}

const TOPBAR_ACTIONS = {
  dashboard: [{ label: '↻ تحديث', cls: 'btn-soft', action: 'refresh-all' }],
  catalog: [
    { label: '+ منتج', cls: 'btn-primary', target: 'btnAddProduct' },
    { label: '↻', cls: 'btn-soft', action: 'refresh-catalog', title: 'تحديث' }
  ],
  orders: [{ label: '↻ تحديث', cls: 'btn-soft', action: 'reload-orders' }],
  receipts: [
    { label: '↻ تحديث', cls: 'btn-soft', action: 'reload-receipts' },
    { label: 'تصميم الوصل', cls: 'btn-soft', action: 'goto-thermal' }
  ],
  deliveryReceipts: [{ label: '↻ تحديث', cls: 'btn-soft', action: 'reload-delivery' }],
  customerRequests: [{ label: '↻ تحديث', cls: 'btn-soft', action: 'reload-customers' }],
  promotionalVisits: [{ label: '↻ تحديث', cls: 'btn-soft', action: 'reload-promo' }],
  thermalReceipt: [{ label: 'حفظ', cls: 'btn-primary', target: 'btnThermalSave' }],
  salesReport: [
    { label: 'معاينة', cls: 'btn-soft', target: 'btnSalesReportPreview' },
    { label: 'PDF', cls: 'btn-primary', target: 'btnSalesReportPdf' }
  ],
  accountStatements: [
    { label: 'معاينة', cls: 'btn-soft', target: 'btnStmtPreview' },
    { label: 'PDF', cls: 'btn-primary', target: 'btnStmtPdf' }
  ],
  priceSync: [{ label: 'مزامنة', cls: 'btn-primary', target: 'btnPriceSyncNow' }],
  sync: [{ label: 'رفع الآن', cls: 'btn-primary', target: 'btnSyncNow' }],
  database: [
    { label: 'اختبار', cls: 'btn-soft', target: 'btnEdariTest' },
    { label: 'حفظ', cls: 'btn-primary', target: 'btnEdariSave' }
  ],
  agents: [{ label: '+ مندوب', cls: 'btn-primary', target: 'btnAddAgent' }]
};

function runTopbarAction(action) {
  switch (action) {
    case 'refresh-all':
      if (typeof refreshAll === 'function') void refreshAll();
      break;
    case 'refresh-catalog':
      if (typeof loadCatalogPage === 'function') void loadCatalogPage();
      break;
    case 'reload-orders':
      if (typeof loadOrdersPage === 'function') void loadOrdersPage();
      break;
    case 'reload-receipts':
      if (typeof loadReceiptsPage === 'function') void loadReceiptsPage();
      break;
    case 'reload-delivery':
      if (typeof loadDeliveryReceiptsPage === 'function') void loadDeliveryReceiptsPage();
      break;
    case 'reload-customers':
      if (typeof loadCustomerRequestsPage === 'function') void loadCustomerRequestsPage();
      break;
    case 'reload-promo':
      if (typeof loadPromotionalVisitsPage === 'function') void loadPromotionalVisitsPage();
      break;
    case 'goto-thermal':
      if (typeof showPage === 'function') showPage('thermalReceipt');
      break;
    default:
      break;
  }
}

function renderTopbarActions(name) {
  const host = document.getElementById('topbarActions');
  if (!host) return;
  const defs = TOPBAR_ACTIONS[name] || [{ label: '↻', cls: 'btn-soft', action: 'refresh-all', title: 'تحديث' }];
  host.innerHTML = defs.map((def, i) => {
    const attrs = [`type="button"`, `class="btn btn-sm ${def.cls || 'btn-soft'}"`, `data-topbar-action="${i}"`];
    if (def.title) attrs.push(`title="${esc(def.title)}"`);
    return `<button ${attrs.join(' ')}>${esc(def.label)}</button>`;
  }).join('');

  host.querySelectorAll('[data-topbar-action]').forEach((btn) => {
    const def = defs[Number(btn.dataset.topbarAction)];
    btn.addEventListener('click', () => {
      if (def.target) document.getElementById(def.target)?.click();
      else if (def.action) runTopbarAction(def.action);
    });
  });
}

function activityTimeLabel(raw) {
  const s = String(raw || '').trim();
  if (!s) return '—';
  return s.length > 16 ? s.slice(0, 16) : s;
}

async function adminCommerceFetch(path) {
  const base = typeof getApiBase === 'function' ? getApiBase() : '';
  const auth = window.adminAuth?.authHeaders?.() || {};
  const res = await fetch(`${base}/api/admin${path}`, { cache: 'no-store', headers: auth });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function loadDashboardRecentActivity() {
  const host = document.getElementById('dashRecentActivity');
  if (!host) return;
  host.textContent = 'جاري التحميل…';
  try {
    const [recData, ordData] = await Promise.all([
      adminCommerceFetch('/receipts').catch(() => ({ receipts: [] })),
      adminCommerceFetch('/orders?limit=8').catch(() => ({ orders: [] }))
    ]);
    const items = [];
    (recData.receipts || []).slice(0, 6).forEach((r) => {
      items.push({
        kind: 'receipt',
        title: `سند ${r.receiptNo || r.id}`,
        sub: `${r.agentName || '—'} · ${r.customerName || '—'}`,
        amount: r.amount,
        time: r.receiptDate || r.createdAt,
        goto: 'receipts'
      });
    });
    (ordData.orders || []).slice(0, 5).forEach((o) => {
      items.push({
        kind: 'order',
        title: `طلب ${o.orderNo || o.id}`,
        sub: `${o.agentName || '—'} · ${o.statusLabel || o.status || ''}`,
        amount: o.total,
        time: o.createdAt,
        goto: 'orders'
      });
    });
    items.sort((a, b) => String(b.time).localeCompare(String(a.time)));

    if (!items.length) {
      host.innerHTML = '<p class="dash-recent-empty">لا يوجد نشاط حديث بعد</p>';
      return;
    }

    host.innerHTML = items.slice(0, 10).map((x) => `
      <button type="button" class="dash-recent-item kind-${x.kind}" data-goto="${x.goto}">
        <span class="dash-recent-badge">${x.kind === 'receipt' ? 'سند' : 'طلب'}</span>
        <span class="dash-recent-main">
          <strong dir="ltr">${esc(x.title)}</strong>
          <span>${esc(x.sub)}</span>
        </span>
        ${x.amount != null ? `<span class="dash-recent-amt" dir="ltr">${fmtNumAlways(x.amount)}</span>` : ''}
        <span class="dash-recent-time">${esc(activityTimeLabel(x.time))}</span>
      </button>`).join('');

    host.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => showPage(btn.dataset.goto));
    });
  } catch (_) {
    host.innerHTML = '<p class="dash-recent-empty">تعذّر تحميل النشاط</p>';
  }
}

async function loadDashboardV4(baseData) {
  const statsHost = document.getElementById('dashStats');
  const hubsHost = document.getElementById('dashHubs');
  const pendingHost = document.getElementById('dashPending');
  const tilesHost = document.getElementById('dashSectionTiles');
  const quickHost = document.getElementById('dashQuickActions');
  const greetEl = document.getElementById('dashGreeting');
  if (!statsHost) return;

  if (greetEl && typeof dashGreeting === 'function') {
    greetEl.textContent = dashGreeting();
  }

  let commerce = {};
  try {
    const [orders, receipts, delivery, customers, promo] = await Promise.all([
      adminCommerceFetch('/orders/stats').catch(() => ({})),
      adminCommerceFetch('/receipts/stats').catch(() => ({})),
      adminCommerceFetch('/delivery-receipts/stats').catch(() => ({})),
      adminCommerceFetch('/customer-requests/stats').catch(() => ({})),
      adminCommerceFetch('/promotional-visits/stats').catch(() => ({}))
    ]);
    commerce = {
      orders: orders.stats || {},
      receipts: receipts.stats || {},
      delivery: delivery.stats || {},
      customers: customers.stats || {},
      promo: promo.stats || {}
    };
  } catch (_) {}

  const counts = baseData?.counts || {};

  if (quickHost) {
    quickHost.innerHTML = `
      <button type="button" class="dash-qa" data-goto="receipts">${navIcon('receipt')}<span>سندات قبض</span></button>
      <button type="button" class="dash-qa" data-goto="orders">${navIcon('orders')}<span>طلبات</span></button>
      <button type="button" class="dash-qa" data-goto="catalog">${navIcon('catalog')}<span>منتجات</span></button>
      <button type="button" class="dash-qa" data-goto="sync">${navIcon('sync')}<span>رفع بيانات</span></button>
      <button type="button" class="dash-qa dash-qa-cmd" id="dashOpenCmdk">${navIcon('home')}<span>⌘K انتقل</span></button>`;
    quickHost.querySelectorAll('[data-goto]').forEach((b) => {
      b.addEventListener('click', () => showPage(b.dataset.goto));
    });
    quickHost.querySelector('#dashOpenCmdk')?.addEventListener('click', () => {
      if (typeof openCmdk === 'function') openCmdk();
    });
  }

  if (tilesHost) {
    const tiles = [
      { id: 'commerce', label: 'التجارة', sub: 'منتجات · طلبات', icon: 'commerce', goto: 'catalog', tone: 'commerce' },
      { id: 'collections', label: 'التحصيل', sub: 'سندات · وصولات', icon: 'receipts', goto: 'receipts', tone: 'collections' },
      { id: 'reports', label: 'التقارير', sub: 'مبيعات · كشوف', icon: 'reports', goto: 'salesReport', tone: 'reports' },
      { id: 'system', label: 'النظام', sub: 'مزامنة · Edari', icon: 'system', goto: 'sync', tone: 'system' },
      { id: 'lan', label: 'الشبكة', sub: 'LAN · رئيسي/عميل', icon: 'sync', goto: 'lan', tone: 'system' },
      { id: 'team', label: 'الفريق', sub: 'المندوبون', icon: 'team', goto: 'agents', tone: 'team' }
    ];
    tilesHost.innerHTML = tiles.map((t) => `
      <button type="button" class="dash-section-tile tone-${t.tone}" data-goto="${t.goto}">
        <span class="dash-section-tile-icon">${navIcon(t.icon)}</span>
        <span class="dash-section-tile-body">
          <strong>${esc(t.label)}</strong>
          <span>${esc(t.sub)}</span>
        </span>
        <span class="dash-section-tile-arrow" aria-hidden="true">←</span>
      </button>`).join('');
    tilesHost.querySelectorAll('[data-goto]').forEach((b) => {
      b.addEventListener('click', () => showPage(b.dataset.goto));
    });
  }

  statsHost.innerHTML = `
    <button type="button" class="stat-card stat-card-btn tone-teal" data-goto="database">
      <span class="stat-card-icon">${navIcon('db')}</span>
      <div class="stat-card-body"><div class="k">حسابات · مزامَنة</div><div class="v">${fmtNumAlways(counts.accounts)}</div></div>
    </button>
    <button type="button" class="stat-card stat-card-btn tone-blue" data-goto="sync">
      <span class="stat-card-icon">${navIcon('reports')}</span>
      <div class="stat-card-body"><div class="k">حركات · مزامَنة</div><div class="v">${fmtNumAlways(counts.journal)}</div></div>
    </button>
    <button type="button" class="stat-card stat-card-btn tone-violet" data-goto="agents">
      <span class="stat-card-icon">${navIcon('agents')}</span>
      <div class="stat-card-body"><div class="k">مندوبون · نشطون</div><div class="v">${fmtNumAlways(counts.agents)}</div></div>
    </button>
    <button type="button" class="stat-card stat-card-btn tone-amber" data-goto="receipts">
      <span class="stat-card-icon">${navIcon('receipt')}</span>
      <div class="stat-card-body"><div class="k">سندات · بانتظار</div><div class="v">${fmtNumAlways(commerce.receipts.pending || 0)}</div></div>
    </button>
    <button type="button" class="stat-card stat-card-btn tone-cyan" data-goto="orders">
      <span class="stat-card-icon">${navIcon('orders')}</span>
      <div class="stat-card-body"><div class="k">طلبات · جديدة</div><div class="v">${fmtNumAlways(commerce.orders.pending || 0)}</div></div>
    </button>
    <button type="button" class="stat-card stat-card-btn tone-indigo" data-goto="deliveryReceipts">
      <span class="stat-card-icon">${navIcon('delivery')}</span>
      <div class="stat-card-body"><div class="k">وصولات · اليوم</div><div class="v">${fmtNumAlways(commerce.delivery.today || 0)}</div></div>
    </button>`;

  statsHost.querySelectorAll('[data-goto]').forEach((b) => {
    b.addEventListener('click', () => showPage(b.dataset.goto));
  });

  if (hubsHost) {
    hubsHost.innerHTML = `
      <article class="dash-hub tone-commerce">
        <header class="dash-hub-head"><span class="dash-hub-icon">${navIcon('commerce')}</span><div><h3>التجارة</h3><p>منتجات وطلبات</p></div></header>
        <div class="dash-hub-links">
          <button type="button" class="dash-hub-link" data-goto="catalog"><strong>المنتجات</strong><span>فروع · أقسام · باركود</span></button>
          <button type="button" class="dash-hub-link" data-goto="orders"><strong>طلبات الشراء</strong><span>${fmtNumAlways(commerce.orders.pending || 0)} بانتظار المراجعة</span></button>
        </div>
      </article>
      <article class="dash-hub tone-collections">
        <header class="dash-hub-head"><span class="dash-hub-icon">${navIcon('receipts')}</span><div><h3>التحصيل</h3><p>سندات · وصولات · زبائن</p></div></header>
        <div class="dash-hub-links">
          <button type="button" class="dash-hub-link" data-goto="receipts"><strong>سندات قبض</strong><span>${fmtNumAlways(commerce.receipts.pending || 0)} للمراجعة</span></button>
          <button type="button" class="dash-hub-link" data-goto="deliveryReceipts"><strong>وصول استلام</strong><span>${fmtNumAlways(commerce.delivery.total || 0)} وصل</span></button>
          <button type="button" class="dash-hub-link" data-goto="customerRequests"><strong>زبائن جدد</strong><span>${fmtNumAlways(commerce.customers.pending || 0)} طلب</span></button>
          <button type="button" class="dash-hub-link" data-goto="promotionalVisits"><strong>زيادات ترويجية</strong><span>${fmtNumAlways(commerce.promo.total || 0)} زيارة</span></button>
        </div>
      </article>
      <article class="dash-hub tone-reports">
        <header class="dash-hub-head"><span class="dash-hub-icon">${navIcon('reports')}</span><div><h3>التقارير</h3><p>مبيعات وكشوف</p></div></header>
        <div class="dash-hub-links">
          <button type="button" class="dash-hub-link" data-goto="salesReport"><strong>مبيعات الشجرات</strong><span>PDF</span></button>
          <button type="button" class="dash-hub-link" data-goto="accountStatements"><strong>كشف حساب</strong><span>Edari</span></button>
        </div>
      </article>
      <article class="dash-hub tone-system">
        <header class="dash-hub-head"><span class="dash-hub-icon">${navIcon('system')}</span><div><h3>النظام</h3><p>مزامنة · Edari</p></div></header>
        <div class="dash-hub-links">
          <button type="button" class="dash-hub-link" data-goto="sync"><strong>رفع البيانات</strong><span>Edari → السيرفر</span></button>
          <button type="button" class="dash-hub-link" data-goto="priceSync"><strong>مزامنة الأسعار</strong><span>تطبيق الويب</span></button>
          <button type="button" class="dash-hub-link" data-goto="agents"><strong>المندوبون</strong><span>${fmtNumAlways(counts.agents)} حساب</span></button>
        </div>
      </article>`;

    hubsHost.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => showPage(btn.dataset.goto));
    });
  }

  if (pendingHost) {
    const items = [
      { n: commerce.receipts.pending, label: 'سندات بانتظار المراجعة', goto: 'receipts', tone: 'amber' },
      { n: commerce.orders.pending, label: 'طلبات شراء جديدة', goto: 'orders', tone: 'blue' },
      { n: commerce.customers.pending, label: 'طلبات زبون جديد', goto: 'customerRequests', tone: 'teal' },
      { n: commerce.receipts.reviewed, label: 'سندات جاهزة للترحيل', goto: 'receipts', tone: 'violet' }
    ].filter((x) => Number(x.n) > 0);

    pendingHost.innerHTML = items.length
      ? items.map((x) => `
        <button type="button" class="dash-pending-item tone-${x.tone}" data-goto="${x.goto}">
          <span class="dash-pending-num">${fmtNumAlways(x.n)}</span>
          <span class="dash-pending-label">${esc(x.label)}</span>
        </button>`).join('')
      : '<p class="muted dash-pending-empty">لا توجد مهام معلّقة — كل شيء محدّث</p>';

    pendingHost.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => showPage(btn.dataset.goto));
    });
  }

  void loadDashboardRecentActivity();
}

function initAdminShell() {
  renderAdminSidebar();
  document.getElementById('btnDashRefreshActivity')?.addEventListener('click', () => {
    void loadDashboardRecentActivity();
  });
  document.getElementById('btnDashQuickRefresh')?.addEventListener('click', () => {
    if (typeof refreshAll === 'function') void refreshAll();
  });
  initSidebarToggle();
}

function initSidebarToggle() {
  const btn = document.getElementById('btnSidebarToggle');
  const sidebar = document.querySelector('.sidebar');
  if (!btn || !sidebar) return;
  btn.addEventListener('click', () => {
    sidebar.classList.toggle('is-open');
    document.body.classList.toggle('sidebar-open', sidebar.classList.contains('is-open'));
  });
  document.addEventListener('click', (e) => {
    if (!sidebar.classList.contains('is-open')) return;
    if (sidebar.contains(e.target) || btn.contains(e.target)) return;
    sidebar.classList.remove('is-open');
    document.body.classList.remove('sidebar-open');
  });
  sidebar.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      if (window.matchMedia('(max-width: 900px)').matches) {
        sidebar.classList.remove('is-open');
        document.body.classList.remove('sidebar-open');
      }
    });
  });
}

window.initAdminShell = initAdminShell;
window.loadDashboardRecentActivity = loadDashboardRecentActivity;
window.loadDashboardV4 = loadDashboardV4;
window.updateAdminChrome = updateAdminChrome;
window.resolveAdminPage = resolveAdminPage;
window.LEGACY_RV_TO_PAGE = LEGACY_RV_TO_PAGE;
window.flattenAdminNav = flattenAdminNav;
window.findNavSection = findNavSection;
window.navIcon = navIcon;
window.ADMIN_NAV = ADMIN_NAV;
