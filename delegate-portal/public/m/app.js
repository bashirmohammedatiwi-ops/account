const API = '/api/mobile';
const TOKEN_KEY = 'delegateToken';
const AGENT_KEY = 'delegateAgent';

const state = {
  agent: null,
  screen: 'trees',
  trees: [],
  selectedTree: null,
  branches: [],
  selectedBranch: null,
  selectedInvoice: null,
  branchFilter: 'all',
  branchSearch: '',
  stmtFilter: 'since-match'
};

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const ICONS = {
  tree: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 12l9 5 9-5M3 17l9 5 9-5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  branch: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M5 21v-1.5a7 7 0 0114 0V21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  chevron: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
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

function isPurchaseLine(line) {
  if (Number(line?.debit) <= 0) return false;
  return Boolean(line?.invoiceRef || line?.billSeq || line?.billNum);
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
  const d = new Date(String(v).replace(' 00:00:00', ''));
  if (Number.isNaN(d.getTime())) return esc(String(v).slice(0, 10));
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmtBalanceDisplay(bal) {
  const n = Number(bal);
  if (Number.isNaN(n)) return '—';
  const abs = fmtNumAlways(Math.abs(n));
  if (n < 0) return `${abs} مدين`;
  if (n > 0) return `${abs} دائن`;
  return '0';
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

function bindStatementRowActions(root) {
  root.querySelectorAll('.tbl-btn-inv').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
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
  if (line?.isOpening) return 'رصيد مرحّل';
  if (line?.isReconciliation) return 'ترصيد';
  if (line?.debit && line?.hasInvoice) return 'فاتورة';
  if (line?.debit) return 'مدين';
  if (line?.credit) return 'دائن';
  return 'حركة';
}

function txTypeClass(line) {
  if (line?.isOpening) return 'type-opening';
  if (line?.isReconciliation) return 'type-recon';
  if (line?.debit && line?.hasInvoice) return 'type-invoice';
  if (line?.debit) return 'type-debit';
  if (line?.credit) return 'type-credit';
  return 'type-neutral';
}

function debtDisplayAmount(bal) {
  const n = Number(bal);
  if (Number.isNaN(n) || n >= 0) return 0;
  return Math.abs(n);
}

function renderDebtField(bal) {
  const el = document.getElementById('stmtDebtField');
  const amount = debtDisplayAmount(bal);
  el.classList.remove('hidden');
  el.innerHTML = `
    <span class="debt-field-label">الديون</span>
    <span class="debt-field-value">${fmtNumAlways(amount)}</span>`;
}

function agentInitial(name) {
  const n = String(name || 'م').trim();
  return n.charAt(0) || 'م';
}

function updateUserChrome() {
  const name = state.agent?.name || '';
  const initial = agentInitial(name);
  document.getElementById('userAvatar').textContent = initial;
  document.getElementById('userName').textContent = name;
  document.getElementById('welcomeName').textContent = name;
  document.getElementById('welcomeTreeCount').textContent = String(state.trees.length);
  document.getElementById('headerUser').classList.toggle('hidden', !name);
  document.getElementById('welcomeBanner').classList.toggle('hidden', !name);
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
  state.screen = 'trees';
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

async function downloadAuthenticatedPdf(path, filename) {
  setOverlay(true);
  try {
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
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } finally {
    setOverlay(false);
  }
}

async function exportStatementPdf() {
  if (!state.selectedBranch?.seq) return;
  const params = new URLSearchParams();
  if (state.selectedTree?.num) {
    params.set('tree', `شجرة ${state.selectedTree.num}`);
  }
  if (state.stmtFilter === 'all') {
    params.set('since', 'all');
  } else {
    params.set('since', 'match');
  }
  const qs = `?${params.toString()}`;
  const num = state.selectedBranch.num || state.selectedBranch.seq;
  await downloadAuthenticatedPdf(
    `/accounts/${encodeURIComponent(state.selectedBranch.seq)}/statement.pdf${qs}`,
    `statement-${num}.pdf`
  );
}

function statementSinceQuery() {
  return state.stmtFilter === 'all' ? '?since=all' : '?since=match';
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

  if (name === 'trees') {
    backBtn.classList.add('hidden');
    toolbarWrap.classList.add('hidden');
    document.getElementById('headerUser').classList.remove('hidden');
    title.textContent = 'الشجرات';
    crumb.textContent = state.agent?.name ? `مرحباً ${state.agent.name}` : '';
    updateUserChrome();
  } else if (name === 'branches') {
    backBtn.classList.remove('hidden');
    toolbarWrap.classList.remove('hidden');
    document.getElementById('headerUser').classList.add('hidden');
    title.textContent = state.selectedTree?.name1 || 'الفروع';
    crumb.textContent = state.selectedTree ? `شجرة ${state.selectedTree.num}` : '';
    renderTreeContext();
  } else if (name === 'statement') {
    backBtn.classList.remove('hidden');
    toolbarWrap.classList.add('hidden');
    document.getElementById('headerUser').classList.add('hidden');
    title.textContent = state.selectedBranch?.name1 || 'كشف الحساب';
    crumb.textContent = state.selectedBranch
      ? `كشف حساب · ${state.selectedBranch.num}`
      : '';
  } else if (name === 'invoice') {
    backBtn.classList.remove('hidden');
    toolbarWrap.classList.add('hidden');
    document.getElementById('headerUser').classList.add('hidden');
    title.textContent = 'تفاصيل الفاتورة';
    crumb.textContent = state.selectedInvoice?.num
      ? `فاتورة ${state.selectedInvoice.num}`
      : '';
  }
}

function renderTreeContext() {
  const el = document.getElementById('treeContext');
  if (!state.selectedTree) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="tree-context-icon">${ICONS.tree}</div>
    <div>
      <div class="tree-context-num">${esc(state.selectedTree.num)}</div>
      <div class="tree-context-name">${esc(state.selectedTree.name1 || '—')}</div>
    </div>`;
}

function filterBranches(list) {
  const q = state.branchSearch.trim().toLowerCase();
  return list.filter((b) => {
    const name = String(b.name1 || '').toLowerCase();
    const num = String(b.num || '');
    if (q && !name.includes(q) && !num.includes(q)) return false;
    const bal = Number(b.bal || 0);
    if (state.branchFilter === 'debit' && bal >= 0) return false;
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
  if (!state.trees.length) {
    renderCountBar('treesMeta', null, 'لا توجد شجرات', 'تواصل مع الإدارة');
  } else {
    renderCountBar('treesMeta', state.trees.length, 'شجرة', 'إجمالي الشجرات المعيّنة');
  }

  const list = document.getElementById('treesList');
  if (!state.trees.length) {
    list.innerHTML = '<div class="empty-state"><div class="icon">🌳</div><p>لا توجد شجرات — تواصل مع الإدارة</p></div>';
    return;
  }

  list.innerHTML = state.trees.map((t) => `
    <button type="button" class="nav-card" data-seq="${esc(t.seq)}">
      <div class="nav-card-icon tree">${ICONS.tree}</div>
      <div class="nav-card-body">
        <div class="nav-card-top">
          <div class="nav-card-name">${esc(t.name1 || '—')}</div>
          <span class="nav-card-num">${esc(t.num)}</span>
        </div>
        <div class="nav-card-sub">${t.directChildren || 0} زبون</div>
      </div>
      <span class="nav-card-arrow">${ICONS.chevron}</span>
    </button>`).join('');

  list.querySelectorAll('.nav-card').forEach((btn) => {
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
  if (!state.branches.length) {
    renderCountBar('branchesMeta', 0, 'فرع', 'لا توجد فروع في هذه الشجرة');
  } else if (filtered.length === state.branches.length) {
    renderCountBar('branchesMeta', filtered.length, 'فرع', 'إجمالي الفروع في الشجرة');
  } else {
    renderCountBar('branchesMeta', filtered.length, 'فرع', `من ${state.branches.length} فرع`);
  }

  const list = document.getElementById('branchesList');
  if (!filtered.length) {
    const msg = state.branches.length && (state.branchSearch || state.branchFilter !== 'all')
      ? 'لا توجد نتائج — جرّب تغيير البحث أو الفلتر'
      : 'لا توجد فروع في هذه الشجرة';
    list.innerHTML = `<div class="empty-state"><div class="icon">👥</div><p>${msg}</p></div>`;
    return;
  }

  list.innerHTML = filtered.map((b) => `
    <button type="button" class="nav-card" data-seq="${esc(b.seq)}">
      <div class="nav-card-icon branch">${ICONS.branch}</div>
      <div class="nav-card-body">
        <div class="nav-card-top">
          <div class="nav-card-name">${esc(b.name1 || '—')}</div>
          <span class="nav-card-num">${esc(b.num)}</span>
        </div>
      </div>
      <span class="nav-card-arrow">${ICONS.chevron}</span>
    </button>`).join('');

  list.querySelectorAll('.nav-card').forEach((btn) => {
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
  state.stmtFilter = 'since-match';
  syncStmtFilterChips();
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
    const data = await api(`/accounts/${encodeURIComponent(seq)}/statement${statementSinceQuery()}`);
    renderStatement(data);
  } catch (e) {
    document.getElementById('stmtLines').innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
  } finally {
    setOverlay(false);
  }
}

function syncStmtFilterChips() {
  document.querySelectorAll('.stmt-filter-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.stmtFilter === state.stmtFilter);
  });
}

function renderStatement(data) {
  const acc = data.account || state.selectedBranch;
  const branch = state.selectedBranch;
  const lines = data.lines || [];
  const { totalDebit, totalCredit, summary } = data;
  const currentBal = data.finalBalance ?? acc.bal ?? 0;
  const treeLabel = state.selectedTree?.num ? `شجرة ${state.selectedTree.num}` : '';
  const openingBal = Number(data.openingBalance ?? 0);
  const openingNote = data.sinceLastMatch && openingBal !== 0
    ? ` · مرحّل ${fmtNumAlways(openingBal < 0 ? Math.abs(openingBal) : openingBal)}`
    : '';
  const matchNote = data.sinceLastMatch && data.lastMatch?.date
    ? `من ${fmtDate(data.lastMatch.date)}${openingNote}`
    : (state.stmtFilter === 'since-match' && !data.hasMatchCutoff
      ? 'لا مطابقة — نفّذ مزامنة'
      : '');

  renderDebtField(currentBal);

  document.getElementById('stmtHero').innerHTML = `
    <div class="doc-panel">
      <div class="doc-head-row">
        <div class="doc-head-main">
          <span class="doc-label">كشف حساب</span>
          <strong class="doc-title">${esc(acc.name1)}</strong>
          <span class="doc-meta-line">${treeLabel ? `${esc(treeLabel)} · ` : ''}حساب ${esc(acc.num)}${acc.address ? ` · ${esc(acc.address)}` : ''}${matchNote ? ` · ${esc(matchNote)}` : ''}</span>
        </div>
      </div>
      <table class="doc-meta-table">
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
    document.getElementById('stmtLineCount').textContent = `${lines.length} حركة`;
    let moveNum = 0;
    const rows = lines.map((r) => {
      const showInvoiceBtn = isPurchaseLine(r) && !r.isOpening;
      const invoiceLookup = showInvoiceBtn ? invoiceLookupFor(r, branch.seq) : null;
      const idxLabel = r.isOpening ? '∗' : String(++moveNum);
      const rowClass = [
        r.isReconciliation ? 'row-recon' : '',
        r.isOpening ? 'row-opening' : ''
      ].filter(Boolean).join(' ');
      const actions = showInvoiceBtn && invoiceLookup
        ? `<div class="tbl-actions">
            <button type="button" class="tbl-btn tbl-btn-inv" data-invoice-ref="${esc(invoiceLookup.ref)}" data-invoice-by="${esc(invoiceLookup.by)}" data-invoice-acc="${esc(invoiceLookup.acc || branch.seq || '')}">فاتورة</button>
            <button type="button" class="tbl-btn tbl-btn-pdf" data-export-ref="${esc(invoiceLookup.ref)}" data-export-by="${esc(invoiceLookup.by || 'seq')}" data-export-acc="${esc(invoiceLookup.acc || branch.seq || '')}">PDF</button>
          </div>`
        : '<span class="num empty">—</span>';
      return `<tr class="${rowClass}">
        <td class="col-n">${idxLabel}</td>
        <td class="col-date">${fmtDate(r.date)}</td>
        <td class="col-desc"><span class="row-tag ${txTypeClass(r)}">${txTypeLabel(r)}</span>${esc(r.description) || '—'}</td>
        ${amtTd(r.debit, 'debit')}
        ${amtTd(r.credit, 'credit')}
        <td class="num ${balanceClassFor(r.balance)}" dir="ltr">${fmtBalanceDisplay(r.balance)}</td>
        <td class="col-act">${actions}</td>
      </tr>`;
    }).join('');

    const extraRow = branch.tot1 != null || branch.tot2 != null
      ? `<tr class="row-extra"><td colspan="7">${branch.tot1 != null ? `إجمالي 1: <b dir="ltr">${fmtNumAlways(branch.tot1)}</b>` : ''}${branch.tot2 != null ? `${branch.tot1 != null ? ' · ' : ''}إجمالي 2: <b dir="ltr">${fmtNumAlways(branch.tot2)}</b>` : ''}</td></tr>`
      : '';

    const stmtRoot = document.getElementById('stmtLines');
    stmtRoot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table stmt-table" dir="rtl">
          <thead>
            <tr>
              <th class="col-n">م</th>
              <th class="col-date">التاريخ</th>
              <th class="col-desc">البيان</th>
              <th class="col-amt col-debit">مدين</th>
              <th class="col-amt col-credit">دائن</th>
              <th class="col-amt col-balance">رصيد الحساب</th>
              <th class="col-act">إجراءات</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr class="row-total">
              <td colspan="3" class="total-label">${esc(summary.label)}</td>
              <td class="num debit" dir="ltr">${fmtNumAlways(totalDebit)}</td>
              <td class="num credit" dir="ltr">${fmtNumAlways(totalCredit)}</td>
              <td class="num ${summary.side === 'debit' ? 'debit' : summary.side === 'credit' ? 'credit' : ''}" dir="ltr">${fmtNumAlways(summary.amount)}</td>
              <td></td>
            </tr>
            ${extraRow}
          </tfoot>
        </table>
      </div>`;
    bindStatementRowActions(stmtRoot);
  } else {
    document.getElementById('stmtLines').innerHTML = `
      <div class="empty-state"><div class="icon">📋</div><p>${state.stmtFilter === 'since-match' ? 'لا توجد حركات بعد آخر مطابقة' : 'لا توجد حركات لهذا الحساب'}</p></div>`;
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
    const inv = data.invoice || {};
    const lines = data.lines || [];
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
      <div class="doc-panel">
        <div class="doc-head-row">
          <img class="doc-logo" src="assets/logo.png" alt="" width="36" height="36">
          <div class="doc-head-main">
            <span class="doc-label">${esc(inv.kindLabel || 'فاتورة مبيعات')}</span>
            <strong class="doc-title">${esc(inv.accountName || state.selectedBranch?.name1 || '—')}</strong>
            <span class="doc-meta-line">شركة ديما الحياة · رقم ${esc(inv.num || ref)} · ${fmtDate(inv.date)}${inv.accountNum ? ` · حساب ${esc(inv.accountNum)}` : ''}</span>
          </div>
        </div>
        <table class="doc-meta-table">
          <tbody>
            <tr>
              <th>عدد البنود</th><td dir="ltr">${lines.length}</td>
              <th>إجمالي الكمية</th><td dir="ltr">${fmtQty(qtySum)}</td>
              <th>إجمالي الفاتورة</th><td dir="ltr">${fmtMoney(inv.total)}</td>
              <th>الصافي للدفع</th><td class="net" dir="ltr">${fmtMoney(inv.netPay)}</td>
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
                <th class="col-mat">رقم الصنف</th>
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
                <td class="col-mat" dir="ltr">${esc(line.matNum || line.mat || '—')}</td>
                <td class="col-name">${esc(line.matName || '—')}${line.remarks ? `<span class="row-note">${esc(line.remarks)}</span>` : ''}</td>
                ${qtyTd(line.quant)}
                ${qtyTd(line.bonus)}
                ${moneyTd(line.price)}
                ${moneyTd(line.lineTotal, 'net')}
              </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr class="row-sum">
                <td colspan="6" class="total-label">إجمالي الفاتورة</td>
                <td class="num" dir="ltr">${fmtMoney(inv.total)}</td>
              </tr>
              <tr class="row-sum">
                <td colspan="6" class="total-label">الحسومات</td>
                <td class="num discount" dir="ltr">${fmtMoney(inv.discount)}</td>
              </tr>
              <tr class="row-total">
                <td colspan="6" class="total-label">الصافي للدفع</td>
                <td class="num net" dir="ltr">${fmtMoney(inv.netPay)}</td>
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
  if (state.screen === 'invoice') {
    goToScreen('statement');
  } else if (state.screen === 'statement') {
    goToScreen('branches');
  } else if (state.screen === 'branches') {
    state.selectedTree = null;
    state.branches = [];
    goToScreen('trees');
  }
}

async function loadTrees() {
  setOverlay(true);
  try {
    const data = await api('/trees');
    state.trees = data.trees || [];
    renderTrees();
    updateUserChrome();
    goToScreen('trees');
  } catch (e) {
    alert(e.message);
  } finally {
    setOverlay(false);
  }
}

async function refresh() {
  if (state.screen === 'statement' && state.selectedBranch) {
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
    await loadTrees();
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
    await loadTrees();
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

  document.querySelectorAll('.stmt-filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (state.stmtFilter === chip.dataset.stmtFilter) return;
      state.stmtFilter = chip.dataset.stmtFilter;
      syncStmtFilterChips();
      if (state.selectedBranch?.seq) {
        loadStatement(state.selectedBranch.seq).catch((e) => alert(e.message));
      }
    });
  });

  tryRestoreSession();
}

init();
