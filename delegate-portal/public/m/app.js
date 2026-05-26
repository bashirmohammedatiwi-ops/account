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
  branchSearch: ''
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
  return Boolean(line?.clickable && line?.billSeq);
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(String(v).replace(' 00:00:00', ''));
  if (Number.isNaN(d.getTime())) return esc(String(v).slice(0, 10));
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function balClass(b) {
  if (b < 0) return 'debit';
  if (b > 0) return 'credit';
  return '';
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
  goToScreen('statement');
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
    const acc = data.account || state.selectedBranch;
    const branch = state.selectedBranch;
    const lines = data.lines || [];
    const { totalDebit, totalCredit, summary } = data;
    const currentBal = data.finalBalance ?? acc.bal ?? 0;
    const treeLabel = state.selectedTree?.num ? `شجرة ${state.selectedTree.num}` : '';

    renderDebtField(currentBal);

    document.getElementById('stmtHero').innerHTML = `
      <div class="hero-header">
        <p class="hero-title">كشف حساب</p>
        <p class="hero-subtitle">${treeLabel ? `${esc(treeLabel)} · ` : ''}${esc(acc.num)}</p>
        <h2 class="hero-name">${esc(acc.name1)}</h2>
        ${acc.address ? `<p class="hero-addr">${esc(acc.address)}</p>` : ''}
      </div>`;

    document.getElementById('stmtStats').innerHTML = `
      <div class="stat-box stat-debit">
        <div class="stat-body">
          <div class="k">مدين</div>
          <div class="v">${fmtNumAlways(totalDebit)}</div>
        </div>
      </div>
      <div class="stat-box stat-credit">
        <div class="stat-body">
          <div class="k">دائن</div>
          <div class="v">${fmtNumAlways(totalCredit)}</div>
        </div>
      </div>
      <div class="stat-box">
        <div class="stat-body">
          <div class="k">حركات</div>
          <div class="v">${lines.length}</div>
        </div>
      </div>`;

    if (lines.length) {
      document.getElementById('stmtTableSection').classList.remove('hidden');
      document.getElementById('stmtLineCount').textContent = `${lines.length} حركة`;
      document.getElementById('stmtLines').innerHTML = lines.map((r, i) => {
        const purchase = isPurchaseLine(r);
        const clickable = purchase && r.billSeq;
        return `
        <${clickable ? 'button type="button"' : 'article'} class="tx-row${clickable ? ' tx-row-link' : ''}"${clickable ? ` data-bill-seq="${esc(r.billSeq)}" aria-label="عرض الفاتورة"` : ''}>
          <div class="tx-row-meta">
            <span class="tx-idx">${i + 1}</span>
            <span class="tx-date">${fmtDate(r.date)}</span>
          </div>
          <p class="tx-desc">${esc(r.description) || '—'}</p>
          ${clickable ? '<div class="tx-invoice-hint"><span>عرض الفاتورة</span><span class="tx-invoice-arrow">›</span></div>' : ''}
          <div class="tx-amounts-grid">
            <div class="tx-amt debit-amt${r.debit ? ' has-val' : ''}">
              <span class="amt-label">مدين</span>
              <span class="amt-val">${r.debit ? fmtNumAlways(r.debit) : '—'}</span>
            </div>
            <div class="tx-amt credit-amt${r.credit ? ' has-val' : ''}">
              <span class="amt-label">دائن</span>
              <span class="amt-val">${r.credit ? fmtNumAlways(r.credit) : '—'}</span>
            </div>
          </div>
        </${clickable ? 'button' : 'article'}>`;
      }).join('');

      document.querySelectorAll('.tx-row-link').forEach((btn) => {
        btn.addEventListener('click', () => openInvoice(btn.dataset.billSeq));
      });
    } else {
      document.getElementById('stmtLines').innerHTML = `
        <div class="empty-state"><div class="icon">📋</div><p>لا توجد حركات لهذا الحساب</p></div>`;
    }

    document.getElementById('stmtTotals').innerHTML = lines.length
      ? `<div class="totals-card">
          <h3 class="totals-title">ملخص الكشف</h3>
          <div class="totals-grid">
            <div class="totals-cell">
              <span class="lbl">مجموع المدين</span>
              <span class="val debit">${fmtNumAlways(totalDebit)}</span>
            </div>
            <div class="totals-cell">
              <span class="lbl">مجموع الدائن</span>
              <span class="val credit">${fmtNumAlways(totalCredit)}</span>
            </div>
          </div>
          <div class="totals-final ${summary.side === 'debit' ? 'debit-side' : summary.side === 'credit' ? 'credit-side' : ''}">
            <div class="final-label">${esc(summary.label)}</div>
            <div class="final-amounts">
              <div class="final-slot">
                <span>مدين</span>
                <strong class="debit">${summary.side === 'debit' ? fmtNumAlways(summary.amount) : summary.amount === 0 ? '0' : '—'}</strong>
              </div>
              <div class="final-slot">
                <span>دائن</span>
                <strong class="credit">${summary.side === 'credit' ? fmtNumAlways(summary.amount) : '—'}</strong>
              </div>
            </div>
          </div>
          ${branch.tot1 != null || branch.tot2 != null ? `
          <div class="totals-extra">
            ${branch.tot1 != null ? `<span>إجمالي 1: <b dir="ltr">${fmtNumAlways(branch.tot1)}</b></span>` : ''}
            ${branch.tot2 != null ? `<span>إجمالي 2: <b dir="ltr">${fmtNumAlways(branch.tot2)}</b></span>` : ''}
          </div>` : ''}
        </div>`
      : '';
  } catch (e) {
    document.getElementById('stmtLines').innerHTML = `<div class="empty-state"><p>${esc(e.message)}</p></div>`;
  } finally {
    setOverlay(false);
  }
}

async function openInvoice(billSeq) {
  if (!billSeq) return;
  state.selectedInvoice = { billSeq };
  goToScreen('invoice');

  const loading = document.getElementById('invoiceLoading');
  const empty = document.getElementById('invoiceEmpty');
  const content = document.getElementById('invoiceContent');
  loading.classList.remove('hidden');
  empty.classList.add('hidden');
  content.classList.add('hidden');

  try {
    const data = await api(`/invoices/${encodeURIComponent(billSeq)}`);
    const inv = data.invoice || {};
    const lines = data.lines || [];
    state.selectedInvoice = inv;

    document.getElementById('invoiceHero').innerHTML = `
      <p class="hero-title">${esc(inv.kindLabel || 'فاتورة')}</p>
      <p class="hero-subtitle">رقم ${esc(inv.num || billSeq)}</p>
      <h2 class="hero-name">${fmtMoney(inv.total)}</h2>
      ${inv.remarks ? `<p class="hero-addr">${esc(inv.remarks)}</p>` : ''}`;

    document.getElementById('invoiceMeta').innerHTML = `
      <div class="stat-box">
        <div class="stat-body">
          <div class="k">التاريخ</div>
          <div class="v">${fmtDate(inv.date)}</div>
        </div>
      </div>
      <div class="stat-box">
        <div class="stat-body">
          <div class="k">المدفوع</div>
          <div class="v">${fmtMoney(inv.payment)}</div>
        </div>
      </div>
      <div class="stat-box">
        <div class="stat-body">
          <div class="k">البنود</div>
          <div class="v">${lines.length}</div>
        </div>
      </div>`;

    document.getElementById('invoiceLineCount').textContent = `${lines.length} بند`;
    document.getElementById('invoiceLines').innerHTML = lines.length
      ? lines.map((line, i) => `
        <article class="inv-line-row">
          <div class="inv-line-top">
            <span class="inv-line-idx">${i + 1}</span>
            <span class="inv-line-mat">${esc(line.mat || '—')}</span>
            <span class="inv-line-total">${fmtMoney(line.lineTotal)}</span>
          </div>
          <p class="inv-line-name">${esc(line.matName || '—')}</p>
          <div class="inv-line-meta">
            <span>الكمية: <b dir="ltr">${fmtMoney(line.quant)}</b></span>
            <span>السعر: <b dir="ltr">${fmtMoney(line.price)}</b></span>
          </div>
        </article>`).join('')
      : '<div class="empty-state"><p>لا توجد بنود لهذه الفاتورة</p></div>';

    loading.classList.add('hidden');
    content.classList.remove('hidden');
    goToScreen('invoice');
  } catch (e) {
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
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

  tryRestoreSession();
}

init();
