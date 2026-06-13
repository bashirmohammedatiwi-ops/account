const API = '/api/mobile';
const TOKEN_KEY = 'delegateToken';
const AGENT_KEY = 'delegateAgent';

const state = {
  agent: null,
  screen: 'home',
  trees: [],
  selectedTree: null,
  branches: [],
  selectedBranch: null,
  selectedInvoice: null,
  invoiceFromScreen: null,
  lastStatement: null,
  branchFilter: 'all',
  branchSearch: ''
};

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const ICONS = {
  tree: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 12l9 5 9-5M3 17l9 5 9-5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  branch: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M5 21v-1.5a7 7 0 0114 0V21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  chevron: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

function fmtNum(v) {
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return '';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtQty(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtMoney(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtNumAlways(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function isInvoiceLine(line) {
  if (line?.isOpening || line?.isReconciliation || !line?.hasInvoice) return false;
  if (line?.isReturnInvoice) return Number(line?.credit) > 0;
  return Number(line?.debit) > 0;
}

function invoiceLookupFor(line, accSeq) {
  const billSeq = String(line?.billSeq || '').replace(/[^0-9]/g, '');
  if (billSeq) return { ref: billSeq, by: 'seq', acc: accSeq || '' };
  const billNum = String(line?.billNum || '').replace(/[^0-9]/g, '');
  if (billNum) return { ref: billNum, by: 'num', acc: accSeq || '' };
  const fallback = String(line?.invoiceRef || '').replace(/[^0-9]/g, '');
  if (fallback) return { ref: fallback, by: 'auto', acc: accSeq || '' };
  return null;
}

function invoiceQueryString(lookup) {
  if (!lookup?.ref) return '';
  const params = new URLSearchParams();
  params.set('by', lookup.by || 'auto');
  if (lookup.acc) params.set('acc', lookup.acc);
  return `?${params.toString()}`;
}

function invoicePdfPath(ref, qs) {
  return `/invoices/${encodeURIComponent(ref)}.pdf${qs}`;
}

function invoiceRefFor(line) {
  return invoiceLookupFor(line)?.ref || '';
}

function invoiceExportRefFor(line) {
  return invoiceLookupFor(line);
}

function fmtDate(v) {
  if (!v) return '—';
  const raw = String(v).trim().replace(' 00:00:00', '');
  if (!raw) return '—';

  let d = null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  } else {
    const parts = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (parts) {
      const first = Number(parts[1]);
      const second = Number(parts[2]);
      const year = Number(parts[3]);
      if (first > 12) d = new Date(year, second - 1, first);
      else if (second > 12) d = new Date(year, first - 1, second);
      else d = new Date(year, second - 1, first);
    }
  }
  if (!d || Number.isNaN(d.getTime())) {
    d = new Date(raw);
  }
  if (Number.isNaN(d.getTime())) return esc(raw.slice(0, 10));

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function fmtBalanceDisplay(bal) {
  const n = Number(bal);
  if (Number.isNaN(n)) return '—';
  const abs = fmtNumAlways(Math.abs(n));
  if (n < 0) return `${abs} مدين`;
  if (n > 0) return `${abs} دائن`;
  return '0';
}

/** حركة الرصيد كما في Edari: 4,701,950- */
function fmtEdariRunningBalance(bal, isOpening = false) {
  if (isOpening) return '';
  const n = Number(bal);
  if (Number.isNaN(n) || n === 0) return '0';
  const abs = fmtNumAlways(Math.abs(n));
  return n < 0 ? `${abs}-` : abs;
}

function balanceClassFor(bal) {
  const n = Number(bal);
  if (Number.isNaN(n) || n === 0) return '';
  return n < 0 ? 'debit' : 'credit';
}

function amtTd(val, cls) {
  const n = Number(val);
  if (!n) return '<td class="num empty">—</td>';
  return `<td class="num ${cls || ''}" dir="ltr">${fmtNumAlways(n)}</td>`;
}

function moneyTd(val, cls) {
  const n = Number(val);
  if (Number.isNaN(n) || n === 0) return '<td class="num empty">—</td>';
  return `<td class="num ${cls || ''}" dir="ltr">${fmtMoney(n)}</td>`;
}

function qtyTd(val) {
  const n = Number(val);
  if (Number.isNaN(n) || n === 0) return '<td class="num empty">—</td>';
  return `<td class="num" dir="ltr">${fmtQty(n)}</td>`;
}

function fmtInvInt(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function invBarcodeCell(line) {
  const code = String(line.matNum || line.mat || '').trim().replace(/\s+/g, '');
  return code || '—';
}

function invMoneyTd(val, cls) {
  const n = Number(val);
  if (Number.isNaN(n) || n === 0) return '<td class="num empty">—</td>';
  return `<td class="num ${cls || ''}" dir="ltr">${fmtInvInt(n)}</td>`;
}

function invoiceLineTotal(line) {
  const q = Number(line.quant) || 0;
  const p = Number(line.price) || 0;
  const computed = Math.round(q * p);
  const stored = Math.round(Number(line.lineTotal) || 0);
  if (stored > 0 && computed > 0 && Math.abs(stored - computed) > 1) return computed;
  if (stored > 0) return stored;
  return computed;
}

/** توحيد الإجمالي والصافي مع مجموع البنود (إجمالي − حسومات) */
function reconcileInvoiceTotals(inv, lines) {
  const discount = Math.max(0, Math.round(Number(inv.discount) || 0));
  const headerTotal = Math.round(Number(inv.total) || 0);
  const headerLineCount = Number(inv.lineCount || 0);
  const linesSum = lines.reduce((s, l) => s + invoiceLineTotal(l), 0);
  let total = linesSum > 0 ? linesSum : headerTotal;
  if (
    headerTotal > 0
    && linesSum > 0
    && headerLineCount > 0
    && lines.length < headerLineCount
    && headerTotal > linesSum
  ) {
    total = headerTotal;
  } else if (headerTotal > 0 && linesSum > 0 && Math.abs(headerTotal - linesSum) <= Math.max(1, headerTotal * 0.002)) {
    total = headerTotal;
  }
  const netPay = Math.max(0, total - discount);
  return { ...inv, total, discount, netPay };
}

function bindStatementRowActions(root) {
  root.querySelectorAll('.tbl-btn-inv').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.invoiceFromScreen = 'statement';
      openInvoice(btn.dataset.invoiceRef, btn.dataset.invoiceBy || 'seq', btn.dataset.invoiceAcc || '');
    });
  });
  root.querySelectorAll('.tbl-btn-pdf').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ref = btn.dataset.exportRef;
      const by = btn.dataset.exportBy || 'seq';
      const acc = btn.dataset.exportAcc || state.selectedBranch?.seq || '';
      if (!ref) return;
      exportInvoicePdf(ref, by, acc).catch((err) => alert(err.message));
    });
  });
}

function txTypeLabel(line) {
  if (line?.isOpening) return 'رصيد مدور';
  if (line?.isReconciliation) return 'ترصيد';
  if (line?.isReturnInvoice) return 'مردود';
  if (line?.debit && line?.hasInvoice) return 'فاتورة';
  if (line?.debit) return 'مدين';
  if (line?.credit) return 'دائن';
  return 'حركة';
}

function txTypeClass(line) {
  if (line?.isOpening) return 'type-opening';
  if (line?.isReconciliation) return 'type-recon';
  if (line?.isReturnInvoice) return 'type-return';
  if (line?.debit && line?.hasInvoice) return 'type-invoice';
  if (line?.debit) return 'type-debit';
  if (line?.credit) return 'type-credit';
  return 'type-neutral';
}

function renderDebtField(amount) {
  const el = document.getElementById('stmtDebtField');
  const n = Number(amount);
  const value = Number.isNaN(n) ? 0 : Math.max(0, n);
  el.classList.remove('hidden');
  el.innerHTML = `
    <span class="debt-field-label">الديون</span>
    <span class="debt-field-value">${fmtNumAlways(value)}</span>`;
}

function agentInitial(name) {
  const n = String(name || 'م').trim();
  return n.charAt(0) || 'م';
}

function resolveBranchDebtAmount(branch) {
  if (branch && branch.debtAmount != null && !Number.isNaN(Number(branch.debtAmount))) {
    return Math.max(0, Number(branch.debtAmount));
  }
  const tot1 = Number(branch?.tot1 ?? 0);
  const tot2 = Number(branch?.tot2 ?? 0);
  const net = tot1 - tot2;
  if (net > 0) return net;
  const bal = Number(branch?.bal ?? 0);
  if (bal < 0) return Math.abs(bal);
  return 0;
}

function branchDebtMeta(branch) {
  const debt = resolveBranchDebtAmount(branch);
  const bal = Number(branch?.bal ?? 0);
  if (debt > 0) {
    return {
      cls: 'has-debt',
      statusCls: 'debit',
      statusLabel: 'مدين',
      amount: fmtNumAlways(debt),
      debt
    };
  }
  if (bal > 0) {
    return {
      cls: 'credit',
      statusCls: 'credit',
      statusLabel: 'دائن',
      amount: '0',
      debt: 0
    };
  }
  return {
    cls: 'clear',
    statusCls: 'neutral',
    statusLabel: 'متعادل',
    amount: '0',
    debt: 0
  };
}

function summarizeBranchDebts(list = []) {
  let withDebt = 0;
  let totalDebt = 0;
  let credit = 0;
  let clear = 0;
  for (const b of list) {
    const meta = branchDebtMeta(b);
    if (meta.debt > 0) {
      withDebt += 1;
      totalDebt += meta.debt;
    } else if (Number(b.bal || 0) > 0) {
      credit += 1;
    } else {
      clear += 1;
    }
  }
  return { withDebt, totalDebt, credit, clear, total: list.length };
}

function branchBalanceMeta(branch) {
  const bal = Number(branch?.bal ?? 0);
  if (bal < 0) {
    return { cls: 'debit', label: 'مدين', amount: fmtNumAlways(Math.abs(bal)) };
  }
  if (bal > 0) {
    return { cls: 'credit', label: 'دائن', amount: fmtNumAlways(bal) };
  }
  return { cls: 'neutral', label: 'متعادل', amount: '0' };
}

function summarizeBranches(list = []) {
  let debit = 0;
  let credit = 0;
  let neutral = 0;
  for (const b of list) {
    const bal = Number(b.bal || 0);
    if (bal < 0) debit += 1;
    else if (bal > 0) credit += 1;
    else neutral += 1;
  }
  return { debit, credit, neutral, total: list.length };
}

function renderDashStats(elId, items) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = items.map(([label, value, tone], i) => `
    <div class="ed-metric ed-metric-${tone || 'default'}" style="--i:${i}">
      <span class="ed-metric-val">${esc(value)}</span>
      <span class="ed-metric-lbl">${esc(label)}</span>
    </div>`).join('');
}

function setSectionMeta(elId, text) {
  const el = document.getElementById(elId);
  if (el) el.textContent = text;
}

function renderHomeStats() {
  const totalCustomers = state.trees.reduce((s, t) => s + (Number(t.directChildren) || 0), 0);
  renderDashStats('homeStats', [
    ['الشجرات', String(state.trees.length), 'accent'],
    ['الزبائن', fmtNumAlways(totalCustomers), 'default'],
    ['الحالة', state.trees.length ? 'نشط' : '—', 'muted']
  ]);
}

function branchInitial(name) {
  const n = String(name || 'ز').trim();
  return n.charAt(0) || 'ز';
}

function renderBranchStats(list = []) {
  const statsEl = document.getElementById('branchesStats');
  if (!statsEl) return;
  if (!list.length) {
    statsEl.classList.add('hidden');
    statsEl.innerHTML = '';
    return;
  }
  const s = summarizeBranchDebts(list);
  statsEl.classList.remove('hidden');
  statsEl.innerHTML = `
    <div class="bc-stats">
      <div class="bc-stat bc-stat-debt">
        <span class="bc-stat-val" dir="ltr">${esc(fmtNumAlways(s.totalDebt))}</span>
        <span class="bc-stat-lbl">إجمالي الديون</span>
      </div>
      <div class="bc-stat bc-stat-accent">
        <span class="bc-stat-val">${esc(String(s.withDebt))}</span>
        <span class="bc-stat-lbl">حسابات مدينة</span>
      </div>
      <div class="bc-stat bc-stat-credit">
        <span class="bc-stat-val">${esc(String(s.credit))}</span>
        <span class="bc-stat-lbl">دائن</span>
      </div>
      <div class="bc-stat bc-stat-muted">
        <span class="bc-stat-val">${esc(String(s.clear))}</span>
        <span class="bc-stat-lbl">بدون ديون</span>
      </div>
    </div>`;
}

function updateUserChrome() {
  const name = state.agent?.name || '';
  const initial = agentInitial(name);
  const avatar = document.getElementById('welcomeAvatar');
  if (avatar) avatar.textContent = initial;
  document.getElementById('welcomeName').textContent = name ? `مرحباً، ${name}` : 'مرحباً';
  document.getElementById('welcomeTreeCount').textContent = String(state.trees.length);
  const sub = document.getElementById('homeHeroSub');
  if (sub) {
    sub.textContent = state.trees.length
      ? `${state.trees.length} شجرة معيّنة — اختر شجرة للمتابعة`
      : 'لا توجد شجرات معيّنة — يرجى التواصل مع الإدارة';
  }
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setSession(token, agent) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(AGENT_KEY, JSON.stringify(agent));
  state.agent = agent;
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(AGENT_KEY);
  state.agent = null;
  state.trees = [];
  state.branches = [];
  state.selectedTree = null;
  state.selectedBranch = null;
  state.screen = 'home';
}

function renderHomeScreen() {
  const name = state.agent?.name || '';
  const initial = agentInitial(name);
  const homeAvatar = document.getElementById('homeAvatar');
  if (homeAvatar) homeAvatar.textContent = initial;
  const homeName = document.getElementById('homeWelcomeName');
  if (homeName) homeName.textContent = name ? `مرحباً، ${name}` : 'مرحباً';
  const homeSub = document.getElementById('homeWelcomeSub');
  if (homeSub) {
    homeSub.textContent = state.trees.length
      ? `${state.trees.length} شجرة · اختر تطبيقاً للمتابعة`
      : 'اختر تطبيقاً للبدء';
  }

  const treesBadge = document.getElementById('homeBadgeTrees');
  if (treesBadge) {
    if (state.trees.length > 0) {
      treesBadge.textContent = String(state.trees.length);
      treesBadge.classList.remove('hidden');
    } else {
      treesBadge.classList.add('hidden');
    }
  }

  const totalCustomers = state.trees.reduce((s, t) => s + (Number(t.directChildren) || 0), 0);
  const statsEl = document.getElementById('homeQuickStats');
  if (statsEl) {
    const activeClass = state.trees.length ? ' is-active' : '';
    statsEl.innerHTML = `
      <div class="home-stat-item">
        <span class="home-stat-val">${esc(String(state.trees.length))}</span>
        <span class="home-stat-lbl">شجرة</span>
      </div>
      <div class="home-stat-item">
        <span class="home-stat-val">${esc(fmtNumAlways(totalCustomers))}</span>
        <span class="home-stat-lbl">زبون</span>
      </div>
      <div class="home-stat-item${activeClass}">
        <span class="home-stat-val">${state.trees.length ? '●' : '—'}</span>
        <span class="home-stat-lbl">${state.trees.length ? 'نشط' : '—'}</span>
      </div>`;
  }
}

function openHomeApp(app) {
  if (app === 'accounts') goToScreen('trees');
  else if (app === 'shop') goToScreen('shop');
  else if (app === 'orders') goToScreen('my-orders');
  else if (app === 'reports') goToScreen('reports');
}

function setOverlay(open) {
  document.getElementById('overlay').classList.toggle('hidden', !open);
}

function showLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
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
    showLogin();
    throw new Error(data.error || 'انتهت الجلسة');
  }
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function fetchAuthenticatedPdf(path) {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (res.status === 401) {
    clearSession();
    showLogin();
    throw new Error('انتهت الجلسة');
  }

  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok) {
    let message = `فشل تصدير PDF (${res.status})`;
    if (contentType.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      message = data.error || message;
    } else {
      const text = await res.text().catch(() => '');
      if (text && text.length < 200) message = text;
    }
    throw new Error(message);
  }

  const isPdf = contentType.includes('application/pdf')
    || contentType.includes('application/octet-stream');
  if (!isPdf) {
    throw new Error('استجابة غير صالحة من السيرفر');
  }

  const blob = await res.blob();
  if (!blob.size) {
    throw new Error('ملف PDF فارغ');
  }
  return blob;
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadAuthenticatedPdf(path, filename) {
  setOverlay(true);
  try {
    const blob = await fetchAuthenticatedPdf(path);
    triggerBlobDownload(blob, filename);
  } finally {
    setOverlay(false);
  }
}

async function exportStatementPdf() {
  if (!state.selectedBranch?.seq) return;
  const num = state.selectedBranch.num || state.selectedBranch.seq;
  await downloadAuthenticatedPdf(
    `/accounts/${encodeURIComponent(state.selectedBranch.seq)}/statement.pdf`,
    `statement-${num}.pdf`
  );
}

async function exportInvoicePdf(refOverride, byOverride, accOverride) {
  const lookup = state.lastInvoiceLookup || {};
  const inv = state.selectedInvoice || {};
  const ref = refOverride || lookup.ref || inv.seq || inv.num;
  const by = byOverride || lookup.by || (inv.seq ? 'seq' : 'num');
  const acc = accOverride || lookup.acc || state.selectedBranch?.seq || inv.accSeq || '';
  if (!ref) {
    alert('افتح فاتورة محددة أولاً');
    return;
  }
  const label = inv.num || ref;
  const qs = invoiceQueryString({ ref, by, acc });
  await downloadAuthenticatedPdf(
    invoicePdfPath(ref, qs),
    `invoice-${label}.pdf`
  );
}

function goToScreen(name) {
  state.screen = name;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');

  const backBtn = document.getElementById('btnBack');
  const toolbarWrap = document.getElementById('toolbarWrap');
  const title = document.getElementById('screenTitle');
  const crumb = document.getElementById('breadcrumb');

  if (name === 'home') {
    backBtn.classList.add('hidden');
    toolbarWrap.classList.add('hidden');
    title.textContent = 'Edari';
    crumb.textContent = state.agent?.name ? `المندوب: ${state.agent.name}` : '';
    const kicker = document.getElementById('headerKicker');
    if (kicker) kicker.textContent = 'Edari · الرئيسية';
    renderHomeScreen();
    updateUserChrome();
  } else if (name === 'trees') {
    backBtn.classList.remove('hidden');
    toolbarWrap.classList.add('hidden');
    title.textContent = 'كشوف الحساب';
    crumb.textContent = 'الشجرات المعيّنة';
    const kicker = document.getElementById('headerKicker');
    if (kicker) kicker.textContent = 'Edari · الشجرات';
    updateUserChrome();
  } else if (name === 'branches') {
    backBtn.classList.remove('hidden');
    toolbarWrap.classList.remove('hidden');
    title.textContent = state.selectedTree?.name1 || 'الزبائن';
    crumb.textContent = state.selectedTree?.num ? `شجرة ${state.selectedTree.num}` : '';
    const kicker = document.getElementById('headerKicker');
    if (kicker) kicker.textContent = 'Edari · الزبائن';
    renderTreeContext();
  } else if (name === 'statement') {
    backBtn.classList.remove('hidden');
    toolbarWrap.classList.add('hidden');
    title.textContent = state.selectedBranch?.name1 || 'كشف الحساب';
    crumb.textContent = state.selectedBranch?.name1
      ? `كشف حساب · ${state.selectedBranch.name1}`
      : 'كشف حساب';
    const kicker = document.getElementById('headerKicker');
    if (kicker) kicker.textContent = 'Edari · الكشف';
  } else if (name === 'invoice') {
    backBtn.classList.remove('hidden');
    toolbarWrap.classList.add('hidden');
    title.textContent = 'تفاصيل الفاتورة';
    crumb.textContent = state.selectedInvoice?.num
      ? `فاتورة ${state.selectedInvoice.num}`
      : '';
    const kicker = document.getElementById('headerKicker');
    if (kicker) kicker.textContent = 'Edari · الفاتورة';
  } else if (window.reportsNav?.applyScreen?.(name, { backBtn, toolbarWrap, title, crumb })) {
    /* handled */
  } else if (window.commerceNav?.applyScreen) {
    window.commerceNav.applyScreen(name, { backBtn, toolbarWrap, title, crumb });
  }

  if (name !== 'home') {
    backBtn.classList.remove('hidden');
  }

  window.commerceNav?.onScreen?.(name);
  window.reportsNav?.onScreen?.(name);
}

function renderTreeContext() {
  const el = document.getElementById('treeContext');
  const tree = state.selectedTree;
  if (!tree?.seq) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  const count = state.branches.length;
  const s = summarizeBranchDebts(state.branches);
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="bc-tree-top">
      <div class="bc-tree-badge">${ICONS.tree}</div>
      <div class="bc-tree-info">
        <p class="bc-tree-kicker">${esc(tree.num || '—')}</p>
        <h2 class="bc-tree-name">${esc(tree.name1 || '—')}</h2>
        <p class="bc-tree-sub">${count ? `${fmtNumAlways(count)} حساب · ${fmtNumAlways(s.withDebt)} مدين` : 'لا توجد حسابات'}</p>
      </div>
      <div class="bc-tree-debt">
        <span class="bc-tree-debt-lbl">إجمالي الديون</span>
        <span class="bc-tree-debt-val" dir="ltr">${fmtNumAlways(s.totalDebt)}</span>
      </div>
    </div>`;
}

function filterBranches(list) {
  const q = state.branchSearch.trim().toLowerCase();
  return list.filter((b) => {
    const name = String(b.name1 || '').toLowerCase();
    const num = String(b.num || '');
    if (q && !name.includes(q) && !num.includes(q)) return false;
    const bal = Number(b.bal || 0);
    const debt = resolveBranchDebtAmount(b);
    if (state.branchFilter === 'debit' && debt <= 0) return false;
    if (state.branchFilter === 'credit' && bal <= 0) return false;
    return true;
  });
}

function renderCountBar(elId, count, title, subtitle) {
  const el = document.getElementById(elId);
  if (!count && count !== 0) {
    el.innerHTML = `<div class="count-bar"><div class="count-bar-text">${esc(subtitle || title || '—')}</div></div>`;
    return;
  }
  el.innerHTML = `
    <div class="count-bar">
      <div class="count-bar-num">${count}</div>
      <div class="count-bar-text">
        ${esc(title)}
        ${subtitle ? `<span>${esc(subtitle)}</span>` : ''}
      </div>
    </div>`;
}

function renderTrees() {
  renderHomeStats();
  if (!state.trees.length) {
    setSectionMeta('treesMeta', 'لا توجد شجرات معيّنة — تواصل مع الإدارة');
  } else {
    const customers = state.trees.reduce((s, t) => s + (Number(t.directChildren) || 0), 0);
    setSectionMeta('treesMeta', `${state.trees.length} شجرة · ${fmtNumAlways(customers)} زبون`);
  }

  const list = document.getElementById('treesList');
  if (!state.trees.length) {
    list.innerHTML = '<div class="empty-state empty-state-home"><div class="icon">🌳</div><p>لا توجد شجرات — تواصل مع الإدارة</p></div>';
    return;
  }

  list.innerHTML = state.trees.map((t, i) => `
    <button type="button" class="ed-card ed-card-tree" data-seq="${esc(t.seq)}" style="--i:${i}">
      <div class="ed-card-row ed-card-row-head">
        <span class="ed-card-index">${String(i + 1).padStart(2, '0')}</span>
        <span class="ed-card-num">${esc(t.num)}</span>
      </div>
      <h4 class="ed-card-title">${esc(t.name1 || '—')}</h4>
      <div class="ed-card-meta">
        <span class="ed-meta-item">${fmtNumAlways(t.directChildren || 0)} حساب فرعي</span>
      </div>
      <div class="ed-card-foot">
        <span>استعراض الزبائن</span>
        <span class="ed-card-arrow">${ICONS.chevron}</span>
      </div>
    </button>`).join('');

  list.querySelectorAll('.ed-card').forEach((btn) => {
    btn.addEventListener('click', () => openTree(btn.dataset.seq));
  });
}

function resetBranchFilters() {
  state.branchFilter = 'all';
  state.branchSearch = '';
  document.getElementById('branchSearch').value = '';
  document.querySelectorAll('.filter-chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.filter === 'all');
  });
}

function renderBranches() {
  const filtered = filterBranches(state.branches);
  renderBranchStats(state.branches);
  renderTreeContext();

  const countEl = document.getElementById('branchesCount');
  if (countEl) {
    countEl.textContent = String(filtered.length);
    countEl.classList.toggle('hidden', !filtered.length);
  }

  if (!state.branches.length) {
    setSectionMeta('branchesMeta', 'لا يوجد زبائن في هذه الشجرة');
  } else if (filtered.length === state.branches.length) {
    setSectionMeta('branchesMeta', `${fmtNumAlways(filtered.length)} حساب — اضغط لعرض كشف الحساب`);
  } else {
    setSectionMeta('branchesMeta', `${fmtNumAlways(filtered.length)} من ${fmtNumAlways(state.branches.length)} حساب`);
  }

  const list = document.getElementById('branchesList');
  if (!filtered.length) {
    const msg = state.branches.length && (state.branchSearch || state.branchFilter !== 'all')
      ? 'لا توجد نتائج — جرّب تغيير البحث أو الفلتر'
      : 'لا يوجد زبائن في هذه الشجرة';
    list.innerHTML = `<div class="bc-empty" role="listitem"><p>${msg}</p></div>`;
    return;
  }

  list.innerHTML = filtered.map((b, i) => {
    const debt = branchDebtMeta(b);
    const initial = branchInitial(b.name1);
    return `
    <button type="button" class="bc-card bc-card-${debt.cls}" data-seq="${esc(b.seq)}" style="--i:${Math.min(i, 8)}" role="listitem">
      <div class="bc-card-inner">
        <div class="bc-card-head">
          <span class="bc-avatar" aria-hidden="true">${esc(initial)}</span>
          <div class="bc-head-text">
            <h4 class="bc-branch-name">${esc(b.name1 || '—')}</h4>
            <span class="bc-pill bc-pill-${debt.statusCls}">${esc(debt.statusLabel)}</span>
          </div>
        </div>
        <div class="bc-debt-block">
          <span class="bc-debt-label">الديون</span>
          <span class="bc-debt-amount" dir="ltr">${esc(debt.amount)}</span>
        </div>
      </div>
      <div class="bc-card-foot">
        <span>عرض كشف الحساب</span>
        <span class="bc-card-arrow">${ICONS.chevron}</span>
      </div>
    </button>`;
  }).join('');

  list.querySelectorAll('.bc-card').forEach((btn) => {
    btn.addEventListener('click', () => openBranch(btn.dataset.seq));
  });
}

async function openTree(seq) {
  state.selectedTree = state.trees.find((t) => String(t.seq) === String(seq)) || { seq };
  state.selectedBranch = null;
  resetBranchFilters();
  setOverlay(true);

  try {
    const data = await api(`/accounts/${encodeURIComponent(seq)}/children`);
    state.branches = data.children || [];
    renderBranches();
    goToScreen('branches');
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

async function openBranch(seq) {
  state.selectedBranch = state.branches.find((b) => String(b.seq) === String(seq)) || { seq };
  goToScreen('statement');
  await loadStatement(seq);
}

async function loadStatement(seq) {
  setOverlay(true);

  document.getElementById('stmtDebtField').classList.add('hidden');
  document.getElementById('stmtDebtField').innerHTML = '';
  document.getElementById('stmtHero').innerHTML = '<div class="stmt-loading">جاري تحميل الكشف...</div>';
  document.getElementById('stmtStats').innerHTML = '';
  document.getElementById('stmtLines').innerHTML = '';
  document.getElementById('stmtTotals').innerHTML = '';
  document.getElementById('stmtTableSection').classList.add('hidden');

  try {
    const data = await api(`/accounts/${encodeURIComponent(seq)}/statement`);
    state.lastStatement = data;
    renderStatement(data);
  } catch (e) {
    document.getElementById('stmtHero').innerHTML = '';
    document.getElementById('stmtTableSection').classList.add('hidden');
    document.getElementById('stmtLines').innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
  } finally {
    setOverlay(false);
  }
}

function formatStatementAccountTitle(acc) {
  const num = String(acc?.num || '').trim();
  const name = [acc?.name1, acc?.name2].filter(Boolean).join(' - ').trim() || '—';
  const address = String(acc?.address || '').trim();
  let title = name;
  if (num) title = `${title} / ${num}`;
  if (address) title += ` · العنوان: ${address}`;
  return title;
}

function formatStatementPeriod(data, acc, openingNote = '') {
  const start = data?.periodStart || acc?.fixDate;
  const end = data?.periodEnd;
  const parts = [];
  if (start && end) parts.push(`من ${fmtDate(start)} إلى ${fmtDate(end)}`);
  else if (start) parts.push(`من ${fmtDate(start)}`);
  else if (end) parts.push(`إلى ${fmtDate(end)}`);
  parts.push('العملة: دينار عراقي');
  if (openingNote) parts.push(openingNote.replace(/^ · /, ''));
  return parts.join(' · ');
}

function renderStatement(data) {
  const acc = data.account || state.selectedBranch;
  const branch = state.selectedBranch;
  const lines = data.lines || [];
  const { totalDebit, totalCredit, summary } = data;
  const currentBal = data.finalBalance ?? acc.bal ?? 0;
  const openingBal = Number(data.openingBalance ?? 0);
  const openingNote = openingBal !== 0
    ? `رصيد مدور ${fmtNumAlways(openingBal < 0 ? Math.abs(openingBal) : openingBal)}`
    : '';
  const periodNote = formatStatementPeriod(data, acc, openingNote);
  const showBranchCol = lines.some((line) => line.branch2);

  renderDebtField(data.debtAmount ?? 0);

  document.getElementById('stmtHero').innerHTML = `
    <div class="doc-panel">
      <div class="doc-head-row">
        <div class="doc-head-main">
          <span class="doc-label">كشف حساب</span>
          <strong class="doc-title">${esc(formatStatementAccountTitle(acc))}</strong>
          <span class="doc-meta-line">${esc(periodNote)}</span>
        </div>
      </div>
      <table class="doc-meta-table stmt-meta-table">
        <tbody>
          <tr>
            <th>إجمالي مدين</th><td class="debit" dir="ltr">${fmtNumAlways(totalDebit)}</td>
            <th>إجمالي دائن</th><td class="credit" dir="ltr">${fmtNumAlways(totalCredit)}</td>
            <th>عدد الحركات</th><td dir="ltr">${lines.length}</td>
            <th>رصيد الحساب</th><td class="${balanceClassFor(currentBal)}" dir="ltr">${fmtBalanceDisplay(currentBal)}</td>
          </tr>
        </tbody>
      </table>
    </div>`;

  document.getElementById('stmtStats').innerHTML = '';

  if (lines.length) {
    document.getElementById('stmtTableSection').classList.remove('hidden');
    const moveCount = lines.filter((line) => !line.isOpening).length;
    document.getElementById('stmtLineCount').textContent = `${moveCount} حركة`;
    const detailColspan = showBranchCol ? 3 : 2;
    const rows = lines.map((r) => {
      const showInvoiceBtn = isInvoiceLine(r) && !r.isOpening;
      const invoiceLookup = showInvoiceBtn ? invoiceLookupFor(r, branch.seq) : null;
      const rowClass = [
        r.isReconciliation ? 'row-recon' : '',
        r.isOpening ? 'row-opening' : ''
      ].filter(Boolean).join(' ');
      const invBtnLabel = r.isReturnInvoice ? 'مردود' : 'فاتورة';
      const actions = showInvoiceBtn && invoiceLookup
        ? `<div class="tbl-actions">
            <button type="button" class="tbl-btn tbl-btn-inv" data-invoice-ref="${esc(invoiceLookup.ref)}" data-invoice-by="${esc(invoiceLookup.by)}" data-invoice-acc="${esc(invoiceLookup.acc || branch.seq || '')}">${invBtnLabel}</button>
            <button type="button" class="tbl-btn tbl-btn-pdf" data-export-ref="${esc(invoiceLookup.ref)}" data-export-by="${esc(invoiceLookup.by || 'seq')}" data-export-acc="${esc(invoiceLookup.acc || branch.seq || '')}">PDF</button>
          </div>`
        : '<span class="num empty">—</span>';
      return `<tr class="${rowClass}">
        ${amtTd(r.debit, 'debit')}
        ${amtTd(r.credit, 'credit')}
        <td class="col-desc"><span class="stmt-desc-text">${esc(r.description) || '—'}</span></td>
        ${showBranchCol ? `<td class="col-branch">${esc(r.branch2 || '')}</td>` : ''}
        <td class="col-date">${r.isOpening ? '' : (r.date ? fmtDate(r.date) : '')}</td>
        <td class="num col-balance ${balanceClassFor(r.balance)}" dir="ltr">${fmtEdariRunningBalance(r.balance, r.isOpening)}</td>
        <td class="col-act">${actions}</td>
      </tr>`;
    }).join('');

    const stmtRoot = document.getElementById('stmtLines');
    stmtRoot.innerHTML = `
      <div class="table-scroll stmt-table-wrap">
        <table class="data-table stmt-table" dir="rtl">
          <thead>
            <tr>
              <th class="col-amt col-debit">مدين</th>
              <th class="col-amt col-credit">دائن</th>
              <th class="col-desc">البيان</th>
              ${showBranchCol ? '<th class="col-branch">الفرع 2</th>' : ''}
              <th class="col-date">التاريخ</th>
              <th class="col-amt col-balance">حركة الرصيد</th>
              <th class="col-act">إجراءات</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr class="row-total">
              <td class="num debit" dir="ltr">${fmtNumAlways(totalDebit)}</td>
              <td class="num credit" dir="ltr">${fmtNumAlways(totalCredit)}</td>
              <td colspan="${detailColspan}" class="total-label"><strong>المجموع</strong></td>
              <td></td>
              <td></td>
            </tr>
            <tr class="row-final">
              <td class="num debit" dir="ltr">${summary.side === 'debit' ? fmtNumAlways(summary.amount) : ''}</td>
              <td class="num credit" dir="ltr">${summary.side === 'credit' ? fmtNumAlways(summary.amount) : ''}</td>
              <td colspan="${detailColspan}" class="total-label"><strong>${esc(summary.label)}</strong></td>
              <td class="num col-balance" dir="ltr">${fmtEdariRunningBalance(currentBal)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
    bindStatementRowActions(stmtRoot);
  } else {
    document.getElementById('stmtLines').innerHTML = `
      <div class="empty-state"><div class="icon">📋</div><p>لا توجد حركات في كشف الحساب</p></div>`;
  }

  document.getElementById('stmtTotals').innerHTML = '';
}

async function openInvoice(ref, by = 'auto', acc = '') {
  if (!ref) return;
  const accSeq = acc || state.selectedBranch?.seq || '';
  state.lastInvoiceLookup = { ref, by, acc: accSeq };
  state.selectedInvoice = null;
  const exportBtn = document.getElementById('btnExportInvoicePdf');
  if (exportBtn) exportBtn.disabled = true;
  goToScreen('invoice');

  const loading = document.getElementById('invoiceLoading');
  const empty = document.getElementById('invoiceEmpty');
  const content = document.getElementById('invoiceContent');
  loading.classList.remove('hidden');
  empty.classList.add('hidden');
  content.classList.add('hidden');

  try {
    const data = await api(`/invoices/${encodeURIComponent(ref)}${invoiceQueryString({ ref, by, acc: accSeq })}`);
    const lines = data.lines || [];
    const inv = reconcileInvoiceTotals(data.invoice || {}, lines);
    state.selectedInvoice = inv;
    state.lastInvoiceLookup = {
      ref: String(inv.seq || ref),
      by: inv.seq ? 'seq' : by,
      acc: accSeq || String(inv.accSeq || '')
    };

    if (exportBtn) {
      exportBtn.disabled = false;
      exportBtn.textContent = '';
      exportBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12m0 0l4-4m-4 4L8 11M5 21h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        تصدير فاتورة ${esc(inv.num || ref)} PDF`;
    }
    const qtySum = lines.reduce((s, line) => s + Number(line.quant || 0), 0);

    document.getElementById('invoiceHero').innerHTML = `
      <div class="doc-panel invoice-doc">
        <div class="doc-head-row">
          <img class="doc-logo" src="assets/logo.png" alt="" width="36" height="36">
          <div class="doc-head-main">
            <span class="doc-label">شركة ديما الحياة</span>
            <strong class="doc-title">${esc(inv.kindLabel || 'فاتورة مبيعات')}</strong>
            <span class="doc-meta-line">رقم ${esc(inv.num || ref)} · ${fmtDate(inv.date)}</span>
            ${inv.remarks ? `<span class="doc-meta-line doc-meta-note">${esc(inv.remarks)}</span>` : ''}
          </div>
          <div class="doc-head-side">
            <strong class="doc-client">${esc(inv.accountName || state.selectedBranch?.name1 || '—')}</strong>
          </div>
        </div>
        <table class="doc-meta-table invoice-meta">
          <tbody>
            <tr>
              <th>عدد البنود</th><td dir="ltr">${lines.length}</td>
              <th>إجمالي الكمية</th><td dir="ltr">${fmtInvInt(qtySum)}</td>
              <th>إجمالي الفاتورة</th><td dir="ltr">${fmtInvInt(inv.total)}</td>
              <th>الصافي للدفع</th><td class="net" dir="ltr">${fmtInvInt(inv.netPay)}</td>
            </tr>
          </tbody>
        </table>
      </div>`;

    document.getElementById('invoiceMeta').innerHTML = '';
    document.getElementById('invoiceLineCount').textContent = `${lines.length} بند`;
    document.getElementById('invoiceLines').innerHTML = lines.length
      ? `<div class="table-scroll">
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
              ${lines.map((line, i) => `
              <tr>
                <td class="col-n">${i + 1}</td>
                <td class="col-barcode" dir="ltr">${esc(invBarcodeCell(line))}</td>
                <td class="col-name">${esc(line.matName || '—')}${line.remarks ? `<span class="row-note">${esc(line.remarks)}</span>` : ''}</td>
                ${qtyTd(line.quant)}
                ${qtyTd(line.bonus)}
                ${invMoneyTd(line.price)}
                ${invMoneyTd(invoiceLineTotal(line), 'net')}
              </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr class="row-sum">
                <td colspan="6" class="total-label">إجمالي الفاتورة</td>
                <td class="num" dir="ltr">${fmtInvInt(inv.total)}</td>
              </tr>
              <tr class="row-sum">
                <td colspan="6" class="total-label">الحسومات</td>
                <td class="num discount" dir="ltr">${fmtInvInt(inv.discount)}</td>
              </tr>
              <tr class="row-total">
                <td colspan="6" class="total-label">الصافي للدفع</td>
                <td class="num net" dir="ltr">${fmtInvInt(inv.netPay)}</td>
              </tr>
            </tfoot>
          </table>
        </div>`
      : '<div class="empty-state"><p>لا توجد بنود لهذه الفاتورة</p></div>';

    const totalsEl = document.getElementById('invoiceTotals');
    totalsEl.classList.add('hidden');
    totalsEl.innerHTML = '';

    loading.classList.add('hidden');
    content.classList.remove('hidden');
    goToScreen('invoice');
  } catch (e) {
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
    if (exportBtn) exportBtn.disabled = true;
    empty.innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
  }
}

function goBack() {
  if (window.commerceNav?.handleBack?.()) return;
  if (window.reportsNav?.handleBack?.()) return;
  if (state.screen === 'invoice') {
    goToScreen(state.invoiceFromScreen || 'statement');
    state.invoiceFromScreen = null;
  } else if (state.screen === 'statement') {
    goToScreen('branches');
  } else if (state.screen === 'branches') {
    state.selectedTree = null;
    state.branches = [];
    goToScreen('trees');
  } else if (state.screen === 'trees') {
    goToScreen('home');
  } else {
    goToScreen('home');
  }
}

async function loadTrees(goTo) {
  setOverlay(true);
  try {
    const data = await api('/trees');
    state.trees = data.trees || [];
    renderTrees();
    renderHomeScreen();
    updateUserChrome();
    if (goTo) goToScreen(goTo);
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

async function refresh() {
  if (window.commerceNav?.refresh?.()) return;
  if (window.reportsNav?.refresh?.()) return;
  if (state.screen === 'home') {
    await loadTrees('home');
  } else if (state.screen === 'trees') {
    await loadTrees('trees');
  } else if (state.screen === 'statement' && state.selectedBranch) {
    await openBranch(state.selectedBranch.seq);
  } else if (state.screen === 'branches' && state.selectedTree) {
    await openTree(state.selectedTree.seq);
  } else {
    await loadTrees();
  }
}

async function login(username, password) {
  const errEl = document.getElementById('loginError');
  errEl.classList.add('hidden');
  document.getElementById('btnLogin').disabled = true;

  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'فشل تسجيل الدخول');

    setSession(data.token, data.agent);
    showApp();
    updateUserChrome();
    await loadTrees('home');
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  } finally {
    document.getElementById('btnLogin').disabled = false;
  }
}

function logout() {
  clearSession();
  showLogin();
  document.getElementById('loginForm').reset();
  document.getElementById('loginError').classList.add('hidden');
}

async function tryRestoreSession() {
  const token = getToken();
  const saved = localStorage.getItem(AGENT_KEY);
  if (!token || !saved) {
    showLogin();
    return;
  }

  try {
    state.agent = JSON.parse(saved);
    const data = await api('/me');
    setSession(token, data.agent);
    showApp();
    updateUserChrome();
    await loadTrees('home');
  } catch {
    showLogin();
  }
}

function init() {
  document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    login(
      document.getElementById('loginUsername').value.trim(),
      document.getElementById('loginPassword').value
    );
  });

  document.getElementById('btnLogout').addEventListener('click', logout);
  document.getElementById('btnBack').addEventListener('click', goBack);
  document.getElementById('btnRefresh').addEventListener('click', refresh);
  document.getElementById('btnExportStatementPdf')?.addEventListener('click', () => {
    exportStatementPdf().catch((e) => alert(e.message));
  });
  document.getElementById('btnExportInvoicePdf')?.addEventListener('click', () => {
    exportInvoicePdf().catch((e) => alert(e.message));
  });

  document.getElementById('branchSearch').addEventListener('input', (e) => {
    state.branchSearch = e.target.value;
    renderBranches();
  });

  document.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.branchFilter = chip.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach((c) => c.classList.toggle('active', c === chip));
      renderBranches();
    });
  });

  document.querySelectorAll('.home-app-tile').forEach((tile) => {
    tile.addEventListener('click', () => openHomeApp(tile.dataset.app));
  });

  tryRestoreSession();
}

init();
