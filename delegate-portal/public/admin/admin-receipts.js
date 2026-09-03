/* Admin: delegate receipt vouchers */

const RECEIPT_SETTINGS_LS_KEY = 'mandob_receipt_post_accounts';

const receiptAdmin = {
  settings: {
    cash: { seq: '', num: '', name: '' },
    commissionDebit: { seq: '', num: '', name: '' },
    commissionCredit: { seq: '', num: '', name: '' },
    discount: { seq: '', num: '', name: '' }
  },
  searchTimers: {},
  settingsSaveTimer: null,
  selected: null,
  agents: [],
  filterTimer: null,
  viewMode: 'table',
  listIds: [],
  receipts: [],
  stats: {},
  detailTab: 'overview',
  quickChip: 'all',
  detailOpenSeq: 0,
  detailFocusId: null
};

function todayLocalIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseMoneyInput(raw) {
  const cleaned = String(raw ?? '').replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function formatMoneyInput(raw) {
  return parseMoneyInput(raw).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function receiptMoneyField(id, label, value, locked, { main = false, tone = '' } = {}) {
  const formatted = fmtNumAlways(Number(value || 0));
  const toneCls = tone ? ` rcv-money-field-${tone}` : '';
  const mainCls = main ? ' rcv-money-field-main' : '';
  return `
    <label class="rcv-money-field${mainCls}${toneCls}">
      <span>${label}</span>
      <div class="rcv-money-input-wrap">
        <input type="text" class="rcv-money-input num-en" id="${id}" inputmode="numeric" autocomplete="off"
          value="${formatted}" dir="ltr" ${locked ? 'readonly tabindex="-1"' : ''}>
      </div>
    </label>`;
}

function readReceiptSettingsCache() {
  try {
    const raw = localStorage.getItem(RECEIPT_SETTINGS_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeReceiptSettingsCache(settings) {
  try {
    localStorage.setItem(RECEIPT_SETTINGS_LS_KEY, JSON.stringify(settings || {}));
  } catch (_) {}
}

function mergeReceiptSettings(base, incoming) {
  const out = { ...base };
  for (const key of ['cash', 'commissionDebit', 'commissionCredit', 'discount']) {
    const acc = incoming?.[key];
    if (acc?.seq || acc?.num) out[key] = { seq: acc.seq || '', num: acc.num || '', name: acc.name || '' };
  }
  return out;
}

function receiptSettingsHasAccounts(settings) {
  return ['cash', 'commissionDebit', 'commissionCredit', 'discount']
    .some((k) => settings?.[k]?.seq || settings?.[k]?.num);
}

const RECEIPT_SETTING_FIELDS = [
  { key: 'cash', label: 'صندوق المبلغ', hint: 'صناديق الإداري', kind: 'cash', browse: 'عرض الصناديق', tone: 'cash', icon: 'M4 7h16v10H4zM8 11h8' },
  { key: 'commissionDebit', label: 'حـ/ العمولات', hint: 'مدين — حساب العمولة', kind: 'gl', tone: 'comm', icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { key: 'commissionCredit', label: 'مقابل العمولات', hint: 'دائن — حساب المقابل', kind: 'gl', tone: 'comm2', icon: 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6' },
  { key: 'discount', label: 'حـ/ الحسم', hint: 'حساب الحسم في الإداري', kind: 'gl', tone: 'disc', icon: 'M20 12H4M16 6l4 6-4 6' }
];

function rvAccLabel(acc) {
  if (!acc?.seq && !acc?.num) return 'غير محدد';
  return `${acc.num || ''} · ${acc.name || ''}`.trim();
}

function updateReceiptSettingsBadge() {
  const badge = document.getElementById('receiptSettingsBadge');
  const progress = document.getElementById('receiptSettingsProgress');
  const set = RECEIPT_SETTING_FIELDS.filter((f) => receiptAdmin.settings[f.key]?.seq).length;
  const total = RECEIPT_SETTING_FIELDS.length;
  const pct = Math.round((set / total) * 100);
  if (badge) {
    badge.textContent = `${fmtNumAlways(set)}/${fmtNumAlways(total)}`;
    badge.classList.toggle('is-complete', set === total);
  }
  if (progress) progress.style.width = `${pct}%`;
}

function renderReceiptSettings() {
  const grid = document.getElementById('receiptSettingsGrid');
  if (!grid) return;
  grid.innerHTML = RECEIPT_SETTING_FIELDS.map((f) => {
    const acc = receiptAdmin.settings[f.key] || {};
    const picked = acc.seq ? rvAccLabel(acc) : '';
    const placeholder = f.kind === 'cash'
      ? 'ابحث في صناديق الإداري...'
      : 'رقم أو اسم الحساب...';
    return `
      <div class="rcv-acc-card rcv-acc-${f.tone}${acc.seq ? ' is-set' : ''}" data-rv-card="${f.key}">
        <div class="rcv-acc-head">
          <span class="rcv-acc-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${f.icon}"/></svg></span>
          <div class="rcv-acc-meta">
            <span class="rcv-acc-label">${esc(f.label)}</span>
            <span class="rcv-acc-hint">${esc(f.hint)}</span>
          </div>
          ${f.browse ? `<button type="button" class="btn btn-soft btn-sm" data-rv-browse="${f.key}">${esc(f.browse)}</button>` : ''}
        </div>
        <div class="rcv-acc-picked${acc.seq ? '' : ' is-empty'}" data-rv-acc-picked="${f.key}">
          ${acc.seq ? `<span class="num-en" dir="ltr">${esc(acc.num)}</span> ${esc(acc.name)}` : 'غير محدد'}
        </div>
        <div class="rcv-acc-search">
          <input type="search" class="search" data-rv-acc="${f.key}" data-rv-kind="${f.kind}"
            placeholder="${esc(placeholder)}" value="" autocomplete="off">
          <div class="rcv-acc-results" data-rv-acc-results="${f.key}"></div>
        </div>
      </div>`;
  }).join('');
  updateReceiptSettingsBadge();

  grid.querySelectorAll('[data-rv-acc]').forEach((input) => {
    const key = input.dataset.rvAcc;
    const kind = input.dataset.rvKind || 'gl';
    input.addEventListener('input', () => {
      clearTimeout(receiptAdmin.searchTimers[key]);
      receiptAdmin.searchTimers[key] = setTimeout(() => searchReceiptAccount(key, input.value, kind), 220);
    });
    input.addEventListener('focus', () => {
      if (kind === 'cash') void searchReceiptAccount(key, input.value, kind);
    });
  });
  grid.querySelectorAll('[data-rv-browse]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.rvBrowse;
      const input = grid.querySelector(`[data-rv-acc="${key}"]`);
      if (input) {
        input.value = '';
        input.focus();
      }
      void searchReceiptAccount(key, '', 'cash');
    });
  });
}

async function lookupReceiptAccounts(q, kind) {
  if (window.edariDesktop?.searchEdariAccounts) {
    const data = await window.edariDesktop.searchEdariAccounts({ q, kind });
    if (!data?.ok) throw new Error(data?.error || 'فشل البحث في الإداري');
    return data;
  }
  const qs = new URLSearchParams({ q: q || '', kind: kind || '' });
  return commerceApi(`/receipts/accounts/search?${qs}`);
}

async function searchReceiptAccount(key, q, kind = 'gl') {
  const box = document.querySelector(`[data-rv-acc-results="${key}"]`);
  if (!box) return;
  const query = String(q || '').trim();
  if (kind !== 'cash' && query.length < 1) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = '<p class="muted">جاري البحث في الإداري...</p>';
  try {
    const data = await lookupReceiptAccounts(query, kind);
    const rows = data.results || [];
    const source = data.source === 'edari' ? 'الإداري' : '';
    box.innerHTML = rows.map((r) => `
      <button type="button" class="rv-acc-hit" data-seq="${esc(r.seq)}" data-num="${esc(r.num)}" data-name="${esc(r.name)}">
        <span class="rv-acc-hit-num" dir="ltr">${esc(r.num)}</span>
        <span class="rv-acc-hit-name">${esc(r.name)}</span>
      </button>`).join('') || `<p class="muted">لا توجد صناديق/حسابات مطابقة${source ? ` في ${source}` : ''}</p>`;
    box.querySelectorAll('.rv-acc-hit').forEach((btn) => {
      btn.addEventListener('click', () => {
        receiptAdmin.settings[key] = {
          seq: btn.dataset.seq,
          num: btn.dataset.num,
          name: btn.dataset.name
        };
        writeReceiptSettingsCache(receiptAdmin.settings);
        renderReceiptSettings();
        scheduleReceiptSettingsSave();
      });
    });
  } catch (err) {
    box.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}

function scheduleReceiptSettingsSave() {
  clearTimeout(receiptAdmin.settingsSaveTimer);
  receiptAdmin.settingsSaveTimer = setTimeout(() => saveReceiptSettings({ silent: true }), 400);
}

async function loadReceiptSettings() {
  const cached = readReceiptSettingsCache();
  if (cached) {
    receiptAdmin.settings = mergeReceiptSettings(receiptAdmin.settings, cached);
    renderReceiptSettings();
  }
  try {
    const data = await commerceApi('/receipts/settings');
    const serverAccounts = data.accounts || {};
    if (receiptSettingsHasAccounts(serverAccounts)) {
      receiptAdmin.settings = mergeReceiptSettings(receiptAdmin.settings, serverAccounts);
    } else if (receiptSettingsHasAccounts(receiptAdmin.settings)) {
      await saveReceiptSettings({ silent: true, skipRender: true });
    }
    writeReceiptSettingsCache(receiptAdmin.settings);
    renderReceiptSettings();
  } catch (err) {
    if (!receiptSettingsHasAccounts(receiptAdmin.settings)) showToast(err.message, 'err');
  }
}

async function saveReceiptSettings({ silent = false, skipRender = false } = {}) {
  try {
    const data = await commerceApi('/receipts/settings', {
      method: 'PUT',
      body: JSON.stringify(receiptAdmin.settings)
    });
    receiptAdmin.settings = mergeReceiptSettings(receiptAdmin.settings, data.accounts || {});
    writeReceiptSettingsCache(receiptAdmin.settings);
    if (!skipRender) renderReceiptSettings();
    if (!silent) showToast('تم حفظ حسابات الترحيل');
  } catch (err) {
    if (!silent) showToast(err.message, 'err');
  }
}

function canPostReceiptsFromDesktop() {
  return !!window.edariDesktop?.postEdariReceipt;
}

function updateReceiptPostAlert() {
  const box = document.getElementById('receiptPostAlert');
  const text = document.getElementById('receiptPostAlertText');
  if (!box || !text) return;
  const ok = canPostReceiptsFromDesktop();
  box.classList.toggle('is-connected', ok);
  text.textContent = ok
    ? 'متصل بالإداري — يمكنك اختيار الصناديق وترحيل السندات مباشرة.'
    : 'افتح تطبيق الإدارة على Windows لاختيار صناديق الإداري وترحيل السندات.';
}

function receiptStatusPill(status, label) {
  const cls = ({ pending: 'pending', reviewed: 'ready', posted: 'posted', rejected: 'rejected' })[status] || 'pending';
  return `<span class="rcv-pill rcv-pill-${cls}">${esc(label)}</span>`;
}

function receiptNetAmount(r) {
  return Math.max(0, Number(r.amount || 0) - Number(r.discount || 0));
}

function receiptSortKey(r) {
  return String(r.submittedAt || r.createdAt || r.receiptDate || '');
}

function sortReceipts(rows) {
  const mode = document.getElementById('receiptSortFilter')?.value || 'newest';
  const copy = [...rows];
  copy.sort((a, b) => {
    if (mode === 'amount-desc') return Number(b.amount || 0) - Number(a.amount || 0);
    if (mode === 'amount-asc') return Number(a.amount || 0) - Number(b.amount || 0);
    const da = receiptSortKey(a);
    const db = receiptSortKey(b);
    if (mode === 'oldest') return da.localeCompare(db);
    return db.localeCompare(da);
  });
  return copy;
}

function getReceiptActiveFilter() {
  const status = document.getElementById('receiptStatusFilter')?.value || '';
  const from = document.getElementById('receiptFromFilter')?.value || '';
  const to = document.getElementById('receiptToFilter')?.value || '';
  const agentId = document.getElementById('receiptAgentFilter')?.value || '';
  const q = document.getElementById('receiptSearchFilter')?.value?.trim() || '';
  if (agentId || q) return '';
  const today = todayLocalIso();
  if (from === today && to === today && !status) return 'today';
  if (status === 'pending' || status === 'reviewed' || status === 'posted' || status === 'unposted') {
    return status;
  }
  if (!status && !from && !to) return 'all';
  return '';
}

function syncReceiptFilterUi() {
  const active = getReceiptActiveFilter();
  receiptAdmin.quickChip = active;
  document.querySelectorAll('[data-rcv-chip]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.rcvChip === active);
  });
  document.querySelectorAll('[data-rcv-stat]').forEach((btn) => {
    const key = btn.dataset.rcvStat;
    const isActive = active === 'all' ? key === 'all' : !!active && key === active;
    btn.classList.toggle('is-active', isActive);
  });
}

function applyReceiptQuickChip(chip) {
  const statusEl = document.getElementById('receiptStatusFilter');
  const fromEl = document.getElementById('receiptFromFilter');
  const toEl = document.getElementById('receiptToFilter');
  const today = todayLocalIso();
  if (chip === 'today') {
    if (statusEl) statusEl.value = '';
    if (fromEl) fromEl.value = today;
    if (toEl) toEl.value = today;
  } else if (chip === 'all') {
    if (statusEl) statusEl.value = '';
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
  } else {
    if (statusEl) statusEl.value = chip;
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
  }
  receiptAdmin.quickChip = chip;
  void loadReceiptsPage();
}

function renderReceiptQuickMeta(s) {
  const el = document.getElementById('receiptQuickMeta');
  if (!el) return;
  el.innerHTML = `
    <span>عمولة <strong class="num-en" dir="ltr">${fmtMoney(s.totalCommission || 0)}</strong></span>
    <span>حسم <strong class="num-en" dir="ltr">${fmtMoney(s.totalDiscount || 0)}</strong></span>`;
}

function setReceiptViewMode(mode) {
  receiptAdmin.viewMode = mode === 'cards' ? 'cards' : 'table';
  document.querySelectorAll('[data-rcv-view]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.rcvView === receiptAdmin.viewMode);
  });
  document.getElementById('receiptTableWrap')?.classList.toggle('hidden', receiptAdmin.viewMode !== 'table');
  document.getElementById('receiptCardsGrid')?.classList.toggle('hidden', receiptAdmin.viewMode !== 'cards');
}

function renderReceiptStatsCards(s) {
  const el = document.getElementById('receiptStats');
  if (!el) return;
  const cards = [
    { key: 'pending', filterKey: 'pending', cls: 'pending', label: 'بانتظار المراجعة', count: s.pending, amt: s.pendingAmount },
    { key: 'reviewed', filterKey: 'reviewed', cls: 'ready', label: 'جاهز للترحيل', count: s.reviewed, amt: s.reviewedAmount },
    { key: 'posted', filterKey: 'posted', cls: 'posted', label: 'مُرحَّل', count: s.posted, amt: s.postedAmount },
    { key: 'unposted', filterKey: 'unposted', cls: 'warn', label: 'غير مُرحَّل', count: s.unpostedCount, amt: s.unpostedAmount },
    { key: 'today', filterKey: 'today', cls: 'neutral', label: 'اليوم', count: s.today, amt: null, suffix: 'سند' },
    { key: 'total', filterKey: 'all', cls: 'total', label: 'إجمالي المبالغ', count: s.totalAmount, amt: s.total, countIsMoney: true, suffix: 'سند' }
  ];
  el.innerHTML = cards.map((c) => {
    const filterKey = c.filterKey || c.key;
    const value = c.countIsMoney ? fmtMoney(c.count || 0) : fmtNumAlways(c.count || 0);
    const sub = c.countIsMoney
      ? `<span class="rcv-stat-amt num-en" dir="ltr">${fmtNumAlways(c.amt || 0)} ${c.suffix || ''}</span>`
      : (c.amt != null
        ? `<span class="rcv-stat-amt num-en" dir="ltr">${fmtMoney(c.amt || 0)}</span>`
        : `<span class="rcv-stat-amt">${c.suffix || ''}</span>`);
    return `
    <button type="button" data-rcv-stat="${filterKey}" class="rcv-stat rcv-stat-${c.cls} rcv-stat-btn">
      <span class="rcv-stat-label">${c.label}</span>
      <strong class="rcv-stat-value num-en" dir="ltr">${value}</strong>
      ${sub}
    </button>`;
  }).join('');
  el.querySelectorAll('[data-rcv-stat]').forEach((btn) => {
    btn.addEventListener('click', () => applyReceiptQuickChip(btn.dataset.rcvStat));
  });
}

function receiptAgentInitial(name) {
  const ch = String(name || '?').trim().charAt(0);
  return ch || '?';
}

function showReceiptDetailEmpty() {
  const panel = document.getElementById('receiptDetailPanel');
  if (!panel) return;
  panel.classList.remove('has-receipt');
  receiptAdmin.detailTab = 'overview';
  panel.innerHTML = `
    <div class="rcv-detail-empty" id="receiptDetailEmpty">
      <div class="rcv-detail-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h6"/></svg>
      </div>
      <strong>اختر سند قبض</strong>
      <p>اضغط «مراجعة» من الجدول لعرض التفاصيل والترحيل</p>
    </div>`;
}

function canEditReceipt(status) {
  return status !== 'posted';
}

function canPostReceipt(status) {
  return status === 'reviewed';
}

function receiptPostButtonHtml(id, status, { detail = false } = {}) {
  if (status === 'posted' || status === 'rejected') return '';
  const cls = detail ? 'btn btn-soft' : 'btn btn-primary btn-sm';
  const label = detail ? 'ترحيل للإداري' : 'ترحيل';
  if (canPostReceipt(status)) {
    const attrs = detail ? ' id="btnPostReceipt"' : ` data-post-receipt="${id}"`;
    return `<button type="button" class="${cls}"${attrs}>${label}</button>`;
  }
  return `<button type="button" class="${cls}" disabled title="احفظ المراجعة أولاً لتفعيل الترحيل">${label}</button>`;
}

function receiptRowActions(r) {
  const editable = canEditReceipt(r.status);
  return `
    <div class="rcv-row-actions">
      <button type="button" class="btn btn-soft btn-sm" data-receipt-id="${r.id}">${editable ? 'مراجعة' : 'عرض'}</button>
      <button type="button" class="btn btn-danger btn-sm" data-del-receipt="${r.id}">حذف</button>
      ${receiptPostButtonHtml(r.id, r.status)}
    </div>`;
}

function receiptFilterQuery() {
  const status = document.getElementById('receiptStatusFilter')?.value || '';
  const agentId = document.getElementById('receiptAgentFilter')?.value || '';
  const from = document.getElementById('receiptFromFilter')?.value || '';
  const to = document.getElementById('receiptToFilter')?.value || '';
  const q = document.getElementById('receiptSearchFilter')?.value?.trim() || '';
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (agentId) params.set('agentId', agentId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (q) params.set('q', q);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function loadReceiptAgents() {
  if (receiptAdmin.agents.length) return receiptAdmin.agents;
  try {
    const data = await api('/api/admin/agents');
    receiptAdmin.agents = data.agents || [];
    const sel = document.getElementById('receiptAgentFilter');
    if (sel && sel.options.length <= 1) {
      receiptAdmin.agents.forEach((a) => {
        const opt = document.createElement('option');
        opt.value = String(a.id);
        opt.textContent = a.name || a.username || `#${a.id}`;
        sel.appendChild(opt);
      });
    }
  } catch (_) {
    receiptAdmin.agents = [];
  }
  return receiptAdmin.agents;
}

function resetReceiptFilters() {
  const ids = ['receiptSearchFilter', 'receiptFromFilter', 'receiptToFilter'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const status = document.getElementById('receiptStatusFilter');
  if (status) status.value = '';
  const agent = document.getElementById('receiptAgentFilter');
  if (agent) agent.value = '';
  void loadReceiptsPage();
}

async function loadReceiptsPage() {
  const qs = receiptFilterQuery();
  const [list, stats] = await Promise.all([
    commerceApi(`/receipts${qs}`),
    commerceApi('/receipts/stats')
  ]);
  const receipts = sortReceipts(list.receipts || []);
  receiptAdmin.receipts = receipts;
  receiptAdmin.listIds = receipts.map((r) => r.id);
  receiptAdmin.stats = stats.stats || {};

  renderReceiptStatsCards(receiptAdmin.stats);
  renderReceiptQuickMeta(receiptAdmin.stats);
  syncReceiptFilterUi();

  const countEl = document.getElementById('receiptListCount');
  if (countEl) countEl.innerHTML = `<span class="num-en" dir="ltr">${fmtNumAlways(receipts.length)}</span> سند`;

  renderReceiptTableRows(receipts);
  renderReceiptCards(receipts);
  setReceiptViewMode(receiptAdmin.viewMode);
}

function bindReceiptListInteractions() {
  document.querySelectorAll('[data-receipt-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openReceiptDetail(Number(btn.dataset.receiptId));
    });
  });
  document.querySelectorAll('[data-del-receipt]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteReceiptUi(Number(btn.dataset.delReceipt));
    });
  });
  document.querySelectorAll('[data-post-receipt]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      postReceiptToEdariUi(Number(btn.dataset.postReceipt));
    });
  });
  document.querySelectorAll('[data-receipt-row]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openReceiptDetail(Number(row.dataset.receiptRow));
    });
  });
  document.querySelectorAll('[data-receipt-card]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openReceiptDetail(Number(card.dataset.receiptCard));
    });
  });
}

function renderReceiptTableRows(receipts) {
  document.getElementById('receiptsBody').innerHTML = receipts.map((r) => {
    const active = receiptAdmin.selected?.id === r.id ? ' is-active' : '';
    return `
    <tr class="rcv-row${active}" data-receipt-row="${r.id}">
      <td>
        <div class="rcv-cell-no">
          <span class="rcv-no num-en" dir="ltr">${esc(r.receiptNo)}</span>
          ${r.treeName ? `<small>${esc(r.treeName)}</small>` : ''}
        </div>
      </td>
      <td>
        <div class="rcv-cell-agent">
          <span class="rcv-agent-avatar">${esc(receiptAgentInitial(r.agentName))}</span>
          <span>${esc(r.agentName)}</span>
        </div>
      </td>
      <td>
        <div class="rcv-cell-customer">
          <strong>${esc(r.customerName || '—')}</strong>
          ${r.customerNum ? `<small class="num-en" dir="ltr">${esc(r.customerNum)}</small>` : ''}
        </div>
      </td>
      <td class="rcv-amt num-en" dir="ltr">${fmtMoney(r.amount)}</td>
      <td class="rcv-amt-sub num-en" dir="ltr">${fmtMoney(r.commission)}</td>
      <td class="rcv-amt-sub num-en" dir="ltr">${fmtMoney(r.discount)}</td>
      <td>${receiptStatusPill(r.status, r.statusLabel)}</td>
      <td class="rcv-date num-en" dir="ltr">${fmtDateEn(r.submittedAt || r.createdAt)}</td>
      <td>${receiptRowActions(r)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="9"><div class="rcv-empty">لا توجد سندات قبض — تظهر هنا بعد إرسال المندوب</div></td></tr>`;
  bindReceiptListInteractions();
}

function renderReceiptCards(receipts) {
  const grid = document.getElementById('receiptCardsGrid');
  if (!grid) return;
  grid.innerHTML = receipts.map((r) => {
    const active = receiptAdmin.selected?.id === r.id ? ' is-active' : '';
    return `
    <article class="rcv-card-item${active}" data-receipt-card="${r.id}">
      <div class="rcv-card-item-head">
        <div>
          <span class="rcv-card-no num-en" dir="ltr">${esc(r.receiptNo)}</span>
          ${receiptStatusPill(r.status, r.statusLabel)}
        </div>
        <span class="rcv-card-date num-en" dir="ltr">${fmtDateEn(r.submittedAt || r.createdAt)}</span>
      </div>
      <div class="rcv-card-item-body">
        <div class="rcv-card-party">
          <span class="rcv-agent-avatar sm">${esc(receiptAgentInitial(r.agentName))}</span>
          <div>
            <strong>${esc(r.agentName)}</strong>
            <small>${esc(r.customerName || '—')}${r.customerNum ? ` · <span class="num-en" dir="ltr">${esc(r.customerNum)}</span>` : ''}</small>
          </div>
        </div>
        <div class="rcv-card-amounts">
          <div><span>المبلغ</span><strong class="num-en" dir="ltr">${fmtMoney(r.amount)}</strong></div>
          <div><span>صافي</span><strong class="num-en" dir="ltr">${fmtMoney(receiptNetAmount(r))}</strong></div>
          ${Number(r.commission) ? `<div><span>عمولة</span><strong class="num-en" dir="ltr">${fmtMoney(r.commission)}</strong></div>` : ''}
        </div>
      </div>
      <div class="rcv-card-item-foot">${receiptRowActions(r)}</div>
    </article>`;
  }).join('') || '<div class="rcv-empty">لا توجد سندات قبض</div>';
  bindReceiptListInteractions();
}

function receiptEventsTimeline(events = []) {
  if (!events.length) return '<p class="rcv-muted">لا يوجد سجل بعد</p>';
  return `
    <ol class="rcv-timeline">
      ${events.slice().reverse().map((e) => `
        <li class="rcv-timeline-item">
          <span class="rcv-timeline-dot"></span>
          <div class="rcv-timeline-body">
            <strong>${esc(statusLabelFromCode(e.toStatus) || e.toStatus || 'حدث')}</strong>
            ${e.note ? `<p>${esc(e.note)}</p>` : ''}
            <time class="num-en" dir="ltr">${fmtDateEn(e.createdAt)}</time>
          </div>
        </li>`).join('')}
    </ol>`;
}

function statusLabelFromCode(code) {
  return ({ pending: 'بانتظار المراجعة', reviewed: 'جاهز للترحيل', posted: 'مُرحَّل', rejected: 'مرفوض' })[code] || '';
}

function receiptDetailNav(id) {
  const idx = receiptAdmin.listIds.indexOf(id);
  const prev = idx > 0 ? receiptAdmin.listIds[idx - 1] : null;
  const next = idx >= 0 && idx < receiptAdmin.listIds.length - 1 ? receiptAdmin.listIds[idx + 1] : null;
  return `
    <div class="rcv-detail-nav">
      <button type="button" class="btn btn-soft btn-sm" data-rcv-prev="${prev || ''}" ${prev ? '' : 'disabled'}>السابق</button>
      <span class="rcv-detail-nav-pos num-en" dir="ltr">${idx >= 0 ? fmtNumAlways(idx + 1) : '—'} / ${fmtNumAlways(receiptAdmin.listIds.length)}</span>
      <button type="button" class="btn btn-soft btn-sm" data-rcv-next="${next || ''}" ${next ? '' : 'disabled'}>التالي</button>
    </div>`;
}

function renderReceiptDetailTab(tab, r, posting, locked) {
  const customerLabel = `${r.customerNum || ''} · ${r.customerName || ''}`.trim();
  if (tab === 'journal') {
    const postingDateHint = locked ? '' : `<p class="rcv-post-hint">يُرحَّل بتاريخ اليوم: <span class="num-en" dir="ltr">${todayLocalIso()}</span></p>`;
    return `
      <div class="rcv-tab-panel">
        ${postingDateHint}
        ${journalPreviewTable(posting.lines || r.journalPreview)}
        ${posting.error ? `<p class="rcv-error">${esc(posting.error)}</p>` : ''}
        ${r.edariJournalNum ? `<p class="rcv-muted">سند قيد: <span class="num-en" dir="ltr">${esc(r.edariJournalNum)}</span> · قبض: <span class="num-en" dir="ltr">${esc(r.edariReceiptNum || r.receiptNo)}</span></p>` : ''}
      </div>`;
  }
  if (tab === 'history') {
    return `<div class="rcv-tab-panel">${receiptEventsTimeline(r.events)}</div>`;
  }
  return `
    <div class="rcv-tab-panel rcv-form">
      <section class="rcv-form-block">
        <div class="rcv-form-block-head">
          <span class="rcv-form-block-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          </span>
          <div>
            <h4 class="rcv-form-block-title">الزبون</h4>
            <p class="rcv-form-block-sub">ابحث لتغيير حساب الزبون في الإداري</p>
          </div>
        </div>
        <label class="rcv-field rcv-field-customer">
          <input type="search" class="rcv-input search" id="rvEditCustomerSearch"
            placeholder="رقم أو اسم الزبون..."
            value="${esc(customerLabel)}" ${locked ? 'readonly tabindex="-1"' : ''}>
          <small class="rcv-customer-picked" id="rvEditCustomerPicked">${esc(customerLabel || 'اختر زبوناً')}</small>
          <div class="rcv-acc-results" id="rvEditCustomerResults"></div>
        </label>
      </section>

      <section class="rcv-form-block rcv-form-block-money">
        <div class="rcv-form-block-head">
          <span class="rcv-form-block-icon tone-money" aria-hidden="true">
            <svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 12h4M7 9h6"/></svg>
          </span>
          <div>
            <h4 class="rcv-form-block-title">المبالغ</h4>
            <p class="rcv-form-block-sub">أدخل المبلغ والعمولة والحسم</p>
          </div>
        </div>
        <div class="rcv-money-grid">
          ${receiptMoneyField('rvEditAmount', 'المبلغ', r.amount, locked, { main: true })}
          ${receiptMoneyField('rvEditCommission', 'العمولة', r.commission, locked, { tone: 'comm' })}
          ${receiptMoneyField('rvEditDiscount', 'الحسم', r.discount, locked, { tone: 'disc' })}
          <label class="rcv-field rcv-field-date">
            <span>تاريخ السند</span>
            <input type="date" class="rcv-input num-en" id="rvEditDate"
              value="${esc((r.receiptDate || '').slice(0, 10))}" ${locked ? 'disabled' : ''}>
          </label>
        </div>
      </section>

      <section class="rcv-form-block">
        <div class="rcv-form-block-head">
          <span class="rcv-form-block-icon tone-notes" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M6 4h12v16H6z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>
          </span>
          <div>
            <h4 class="rcv-form-block-title">البيان والملاحظات</h4>
            <p class="rcv-form-block-sub">يُرحَّل للإداري ضمن Exp1 / Exp2 / Remarks</p>
          </div>
        </div>
        <label class="rcv-field">
          <span>ملاحظات / البيان</span>
          <textarea class="rcv-textarea" id="rvEditNotes" rows="3" placeholder="بيان سند القبض..."
            ${locked ? 'readonly tabindex="-1"' : ''}>${esc(r.notes)}</textarea>
        </label>
        <label class="rcv-field">
          <span>ملاحظة الإدارة</span>
          <textarea class="rcv-textarea rcv-textarea-admin" id="rvEditAdminNote" rows="2" placeholder="ملاحظة داخلية..."
            ${locked ? 'readonly tabindex="-1"' : ''}>${esc(r.adminNote)}</textarea>
        </label>
      </section>
      ${r.postedError ? `<p class="rcv-error">${esc(r.postedError)}</p>` : ''}
    </div>`;
}

function renderReceiptDetailContent(tab, r, posting, locked) {
  document.querySelectorAll('[data-rcv-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.rcvTab === tab);
  });
  const host = document.getElementById('receiptDetailTabHost');
  if (host) host.innerHTML = renderReceiptDetailTab(tab, r, posting, locked);
  if (!locked && tab === 'overview') {
    bindReceiptCustomerSearch();
    bindReceiptMoneyFields();
  }
}

function bindReceiptMoneyFields() {
  ['rvEditAmount', 'rvEditCommission', 'rvEditDiscount'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.readOnly) return;
    el.value = formatMoneyInput(el.value);
    el.addEventListener('focus', () => {
      const n = parseMoneyInput(el.value);
      el.value = n > 0 ? String(n) : '';
    });
    el.addEventListener('blur', () => {
      el.value = formatMoneyInput(el.value);
    });
  });
}

function bindReceiptDetailTabHandlers() {
  const ctx = receiptAdmin.detailContext;
  if (!ctx) return;
  const { r, locked } = ctx;
  document.querySelectorAll('[data-rcv-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.rcvTab;
      if (next === receiptAdmin.detailTab) return;
      receiptAdmin.detailTab = next;
      renderReceiptDetailContent(next, ctx.r, ctx.posting, ctx.locked);
    });
  });
  document.getElementById('btnCloseReceiptDetail')?.addEventListener('click', () => {
    receiptAdmin.detailOpenSeq += 1;
    receiptAdmin.selected = null;
    receiptAdmin.detailFocusId = null;
    receiptAdmin.detailContext = null;
    showReceiptDetailEmpty();
    document.querySelectorAll('.rcv-row.is-active, .rcv-card-item.is-active').forEach((el) => el.classList.remove('is-active'));
  });
  document.querySelector('[data-rcv-prev]:not([disabled])')?.addEventListener('click', (e) => {
    const id = Number(e.currentTarget.dataset.rcvPrev);
    if (id) void openReceiptDetail(id);
  });
  document.querySelector('[data-rcv-next]:not([disabled])')?.addEventListener('click', (e) => {
    const id = Number(e.currentTarget.dataset.rcvNext);
    if (id) void openReceiptDetail(id);
  });
  if (!locked) {
    bindReceiptCustomerSearch();
    bindReceiptMoneyFields();
    document.getElementById('btnSaveReceiptEdit')?.addEventListener('click', () => saveReceiptEdit(r.id));
    document.getElementById('btnRejectReceipt')?.addEventListener('click', () => rejectReceipt(r.id));
    document.getElementById('btnPostReceipt')?.addEventListener('click', () => postReceiptToEdariUi(r.id));
  }
  document.getElementById('btnDeleteReceipt')?.addEventListener('click', () => deleteReceiptUi(r.id));
}

function journalPreviewTable(lines = []) {
  if (!lines.length) return '<p class="rcv-muted">لا توجد بنود قيد — راجع المبالغ والحسابات</p>';
  return `
    <div class="rcv-journal-wrap">
      <table class="rcv-journal">
        <thead><tr><th>مدين</th><th>دائن</th><th>الحساب</th><th>البيان</th></tr></thead>
        <tbody>
          ${lines.map((ln) => `
            <tr>
              <td class="num-en" dir="ltr">${ln.isDebit ? fmtMoney(ln.amount) : '—'}</td>
              <td class="num-en" dir="ltr">${ln.isDebit ? '—' : fmtMoney(ln.amount)}</td>
              <td><span class="num-en" dir="ltr">${esc(ln.accNum)}</span> ${esc(ln.accName)}</td>
              <td>${esc([ln.exp1, ln.noteExp2, ln.noteRemarks].filter(Boolean).join(' / ') || ln.exp1)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function refreshReceiptDetailAfterListChange(preferredId) {
  await loadReceiptsPage();
  const focusId = receiptAdmin.detailFocusId ?? preferredId;
  if (focusId) await openReceiptDetail(focusId);
}

async function openReceiptDetail(id) {
  const reqSeq = ++receiptAdmin.detailOpenSeq;
  receiptAdmin.detailFocusId = id;
  const prevId = receiptAdmin.selected?.id;
  if (prevId !== id) receiptAdmin.detailTab = 'overview';

  const data = await commerceApi(`/receipts/${id}`);
  if (reqSeq !== receiptAdmin.detailOpenSeq) return;

  const r = data.receipt;
  receiptAdmin.selected = r;
  receiptAdmin.editCustomer = {
    seq: r.customerAccSeq,
    num: r.customerNum,
    name: r.customerName
  };
  const posting = data.posting || {};
  const panel = document.getElementById('receiptDetailPanel');
  panel.classList.add('has-receipt');
  const locked = !canEditReceipt(r.status);
  const tab = receiptAdmin.detailTab || 'overview';

  panel.innerHTML = `
    <div class="rcv-detail-inner">
      <div class="rcv-detail-toolbar">
        ${receiptDetailNav(id)}
        <button type="button" class="rcv-detail-close" id="btnCloseReceiptDetail" title="إغلاق">×</button>
      </div>
      <div class="rcv-detail-head">
        <div>
          <span class="rcv-detail-kicker">سند قبض</span>
          <h3 class="rcv-detail-title num-en" dir="ltr">${esc(r.receiptNo)}</h3>
          <p class="rcv-detail-sub">${esc(r.agentName)}${r.treeName ? ` · ${esc(r.treeName)}` : ''}</p>
        </div>
        ${receiptStatusPill(r.status, r.statusLabel)}
      </div>

      <div class="rcv-detail-amounts">
        <div class="rcv-detail-amt rcv-detail-amt-main">
          <span>المبلغ</span>
          <strong class="num-en" dir="ltr">${fmtMoney(r.amount)}</strong>
        </div>
        <div class="rcv-detail-amt">
          <span>عمولة</span>
          <strong class="num-en" dir="ltr">${fmtMoney(r.commission)}</strong>
        </div>
        <div class="rcv-detail-amt">
          <span>حسم</span>
          <strong class="num-en" dir="ltr">${fmtMoney(r.discount)}</strong>
        </div>
        <div class="rcv-detail-amt">
          <span>تاريخ السند</span>
          <strong class="num-en" dir="ltr">${fmtDateEn(r.receiptDate)}</strong>
        </div>
        ${r.edariPostedAt ? `<div class="rcv-detail-amt"><span>تاريخ الترحيل</span><strong class="num-en" dir="ltr">${fmtDateEn(r.edariPostedAt)}</strong></div>` : ''}
      </div>

      <div class="rcv-detail-tabs" role="tablist">
        <button type="button" class="rcv-detail-tab${tab === 'overview' ? ' is-active' : ''}" data-rcv-tab="overview">التفاصيل</button>
        <button type="button" class="rcv-detail-tab${tab === 'journal' ? ' is-active' : ''}" data-rcv-tab="journal">سند القيد</button>
        <button type="button" class="rcv-detail-tab${tab === 'history' ? ' is-active' : ''}" data-rcv-tab="history">السجل</button>
      </div>

      <div id="receiptDetailTabHost">${renderReceiptDetailTab(tab, r, posting, locked)}</div>

      ${locked ? '' : `
      <div class="rcv-detail-actions">
        <button type="button" class="btn btn-primary" id="btnSaveReceiptEdit">حفظ</button>
        ${receiptPostButtonHtml(r.id, r.status, { detail: true })}
        <button type="button" class="btn btn-soft" id="btnRejectReceipt">رفض</button>
        <button type="button" class="btn btn-danger" id="btnDeleteReceipt">حذف</button>
      </div>
      ${canPostReceipt(r.status) ? '' : '<p class="rcv-muted">راجع السند واضغط «حفظ» لتفعيل الترحيل</p>'}
      ${canPostReceiptsFromDesktop() ? '' : '<p class="rcv-muted">الترحيل من تطبيق الإدارة المكتبي فقط</p>'}`}
      ${locked ? `
      <div class="rcv-detail-actions">
        <button type="button" class="btn btn-danger" id="btnDeleteReceipt">حذف من اللوحة</button>
      </div>
      <p class="rcv-muted">الحذف يزيل السند من لوحة التحكم فقط ولا يلغي الترحيل في الإداري.</p>` : ''}
    </div>`;

  document.querySelectorAll('[data-receipt-row], [data-receipt-card]').forEach((el) => {
    const rid = Number(el.dataset.receiptRow || el.dataset.receiptCard);
    el.classList.toggle('is-active', rid === id);
  });

  receiptAdmin.detailContext = { r, posting, locked };
  bindReceiptDetailTabHandlers();
}

function bindReceiptCustomerSearch() {
  const input = document.getElementById('rvEditCustomerSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(receiptAdmin.searchTimers.customer);
    receiptAdmin.searchTimers.customer = setTimeout(
      () => searchReceiptCustomer(input.value),
      280
    );
  });
}

async function searchReceiptCustomer(q) {
  const box = document.getElementById('rvEditCustomerResults');
  const picked = document.getElementById('rvEditCustomerPicked');
  if (!box) return;
  const query = String(q || '').trim();
  if (query.length < 2) {
    box.innerHTML = '';
    return;
  }
  try {
    const data = await commerceApi(`/receipts/accounts/search?q=${encodeURIComponent(query)}`);
    const rows = data.results || [];
    box.innerHTML = rows.map((r) => `
      <button type="button" class="rv-acc-hit" data-seq="${esc(r.seq)}" data-num="${esc(r.num)}" data-name="${esc(r.name)}">
        <strong dir="ltr">${esc(r.num)}</strong> ${esc(r.name)}
      </button>`).join('') || '<p class="muted">لا نتائج</p>';
    box.querySelectorAll('.rv-acc-hit').forEach((btn) => {
      btn.addEventListener('click', () => {
        receiptAdmin.editCustomer = {
          seq: btn.dataset.seq,
          num: btn.dataset.num,
          name: btn.dataset.name
        };
        const search = document.getElementById('rvEditCustomerSearch');
        if (search) search.value = `${btn.dataset.num} ${btn.dataset.name}`.trim();
        if (picked) picked.textContent = `${btn.dataset.num} ${btn.dataset.name}`.trim();
        box.innerHTML = '';
      });
    });
  } catch (err) {
    box.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}

async function saveReceiptEdit(id) {
  try {
    await commerceApi(`/receipts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        customerAccSeq: receiptAdmin.editCustomer?.seq || undefined,
        amount: parseMoneyInput(document.getElementById('rvEditAmount')?.value),
        commission: parseMoneyInput(document.getElementById('rvEditCommission')?.value),
        discount: parseMoneyInput(document.getElementById('rvEditDiscount')?.value),
        receiptDate: document.getElementById('rvEditDate')?.value,
        notes: document.getElementById('rvEditNotes')?.value,
        adminNote: document.getElementById('rvEditAdminNote')?.value
      })
    });
    showToast('تم حفظ التعديل');
    await refreshReceiptDetailAfterListChange(id);
  } catch (err) {
    showToast(err.message, 'err');
  }
}

async function deleteReceiptUi(id) {
  const receipt = receiptAdmin.selected?.id === id
    ? receiptAdmin.selected
    : (receiptAdmin.receipts || []).find((r) => r.id === id);
  const label = receipt?.receiptNo || String(id);
  const posted = receipt?.status === 'posted';
  const msg = posted
    ? `حذف سند القبض ${label} من لوحة التحكم؟\nلن يُلغى الترحيل في الإداري — الحذف من اللوحة فقط.`
    : `حذف سند القبض ${label} نهائياً؟\nلا يمكن التراجع.`;
  if (!confirm(msg)) return;
  try {
    const path = posted ? `/receipts/${id}?force=1` : `/receipts/${id}`;
    await commerceApi(path, { method: 'DELETE' });
    showToast('تم حذف سند القبض');
    if (receiptAdmin.selected?.id === id) {
      receiptAdmin.selected = null;
      showReceiptDetailEmpty();
    }
    await loadReceiptsPage();
  } catch (err) {
    showToast(err.message, 'err');
  }
}

async function rejectReceipt(id) {
  if (!confirm('رفض سند القبض؟')) return;
  try {
    await commerceApi(`/receipts/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected', note: 'رفض من الإدارة' })
    });
    showToast('تم الرفض');
    await refreshReceiptDetailAfterListChange(id);
  } catch (err) {
    showToast(err.message, 'err');
  }
}

async function postReceiptToEdariUi(id) {
  const key = `receipt:${id}`;
  if (!beginEdariPosting(key)) {
    showToast('جاري الترحيل — انتظر', 'err');
    return;
  }
  try {
    const data = await commerceApi(`/receipts/${id}`);
    const posting = data.posting;
    if (posting?.error) {
      showToast(posting.error, 'err');
      return;
    }
    if (!canPostReceiptsFromDesktop()) {
      showToast('الاتصال بالسيرفر الرئيسي مطلوب للترحيل — تحقق من عنوان LAN', 'err');
      return;
    }
    if (data.receipt.status === 'posted') {
      showToast('السند مُرحَّل مسبقاً');
      return;
    }
    if (!canPostReceipt(data.receipt.status)) {
      showToast('راجع السند واضغط «حفظ» قبل الترحيل', 'err');
      return;
    }
    const postingDate = todayLocalIso();
    if (!confirm(`ترحيل سند ${data.receipt.receiptNo} إلى الإداري بتاريخ ${postingDate}؟`)) return;
    const result = await window.edariDesktop.postEdariReceipt({
      id,
      receiptNo: data.receipt.receiptNo,
      postingDate,
      lines: posting.lines
    });
    if (!result?.ok) {
      await commerceApi(`/receipts/${id}/posted`, {
        method: 'POST',
        body: JSON.stringify({ error: result?.error || 'فشل الترحيل' })
      });
      throw new Error(result?.error || 'فشل الترحيل');
    }
    const markBody = {
      journalNum: result.journalNum,
      receiptNum: result.receiptNum || data.receipt.receiptNo,
      postingDate,
      lines: result.lines || posting.lines
    };
    try {
      await commercePostWithRetry(`/receipts/${id}/posted`, markBody);
    } catch (markErr) {
      showToast(
        `دخل الإداري (سند قيد ${result.journalNum}) لكن تعذّر تحديث اللوحة — حدّث الصفحة`,
        'err'
      );
      await refreshReceiptDetailAfterListChange(id);
      return;
    }
    showToast(`تم الترحيل · سند قيد ${result.journalNum}`);
    await refreshReceiptDetailAfterListChange(id);
  } catch (err) {
    showToast(err.message, 'err');
  } finally {
    endEdariPosting(key);
  }
}

function initReceiptsAdmin() {
  document.getElementById('btnSaveReceiptSettings')?.addEventListener('click', () => saveReceiptSettings());
  document.getElementById('btnReceiptRefresh')?.addEventListener('click', () => loadReceiptsPage());
  document.getElementById('btnReceiptQuickReady')?.addEventListener('click', () => applyReceiptQuickChip('reviewed'));
  document.getElementById('receiptStatusFilter')?.addEventListener('change', () => loadReceiptsPage());
  document.getElementById('receiptAgentFilter')?.addEventListener('change', () => loadReceiptsPage());
  document.getElementById('receiptFromFilter')?.addEventListener('change', () => loadReceiptsPage());
  document.getElementById('receiptToFilter')?.addEventListener('change', () => loadReceiptsPage());
  document.getElementById('receiptSortFilter')?.addEventListener('change', () => {
    renderReceiptTableRows(sortReceipts(receiptAdmin.receipts));
    renderReceiptCards(sortReceipts(receiptAdmin.receipts));
  });
  document.getElementById('btnReceiptFilterReset')?.addEventListener('click', () => resetReceiptFilters());
  document.getElementById('receiptSearchFilter')?.addEventListener('input', () => {
    clearTimeout(receiptAdmin.filterTimer);
    receiptAdmin.filterTimer = setTimeout(() => loadReceiptsPage(), 280);
  });
  document.querySelectorAll('[data-rcv-chip]').forEach((btn) => {
    btn.addEventListener('click', () => applyReceiptQuickChip(btn.dataset.rcvChip));
  });
  document.querySelectorAll('[data-rcv-view]').forEach((btn) => {
    btn.addEventListener('click', () => setReceiptViewMode(btn.dataset.rcvView));
  });
  document.addEventListener('keydown', (e) => {
    if (!receiptAdmin.selected || !document.getElementById('page-receipts')?.classList.contains('active')) return;
    if (e.key === 'Escape') {
      receiptAdmin.selected = null;
      showReceiptDetailEmpty();
      document.querySelectorAll('.rcv-row.is-active, .rcv-card-item.is-active').forEach((el) => el.classList.remove('is-active'));
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const idx = receiptAdmin.listIds.indexOf(receiptAdmin.selected.id);
      const nextIdx = e.key === 'ArrowLeft' ? idx + 1 : idx - 1;
      const nextId = receiptAdmin.listIds[nextIdx];
      if (nextId) void openReceiptDetail(nextId);
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-rv-acc], [data-rv-browse], .rv-acc-results, .rcv-acc-results')) return;
    document.querySelectorAll('.rv-acc-results, .rcv-acc-results').forEach((el) => { el.innerHTML = ''; });
  });
}

window.commercePages = window.commercePages || {};
window.commercePages.receipts = async () => {
  updateReceiptPostAlert();
  await loadReceiptAgents();
  await loadReceiptSettings();
  await loadReceiptsPage();
};

initReceiptsAdmin();
