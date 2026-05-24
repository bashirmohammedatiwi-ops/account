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
  branchFilter: 'all',
  branchSearch: ''
};

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtNum(v) {
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return '';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtNumAlways(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
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
    title.textContent = 'الشجرات';
    crumb.textContent = state.agent?.name ? `مرحباً ${state.agent.name}` : '';
    updateUserChrome();
  } else if (name === 'branches') {
    backBtn.classList.remove('hidden');
    toolbarWrap.classList.remove('hidden');
    title.textContent = state.selectedTree?.name1 || 'الفروع';
    crumb.textContent = state.selectedTree ? `شجرة ${state.selectedTree.num}` : '';
    renderTreeContext();
  } else if (name === 'statement') {
    backBtn.classList.remove('hidden');
    toolbarWrap.classList.add('hidden');
    title.textContent = state.selectedBranch?.name1 || 'كشف الحساب';
    crumb.textContent = state.selectedBranch
      ? `${state.selectedTree?.num || ''} › ${state.selectedBranch.num}`
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
    <div class="tree-context-icon">🌳</div>
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

function renderTrees() {
  document.getElementById('treesMeta').textContent = state.trees.length
    ? `${state.trees.length} شجرة`
    : 'لا توجد شجرات معيّنة';

  const list = document.getElementById('treesList');
  if (!state.trees.length) {
    list.innerHTML = '<div class="empty-state"><div class="icon">🌳</div><p>لا توجد شجرات — تواصل مع الإدارة</p></div>';
    return;
  }

  list.innerHTML = state.trees.map((t) => `
    <button type="button" class="nav-card" data-seq="${esc(t.seq)}">
      <span class="nav-card-accent tree"></span>
      <span class="nav-card-inner">
        <div class="nav-card-icon tree">🌳</div>
        <div class="nav-card-body">
          <div class="nav-card-num">${esc(t.num)}</div>
          <div class="nav-card-name">${esc(t.name1 || '—')}</div>
          <div class="nav-card-sub">${t.directChildren || 0} زبون</div>
        </div>
        <span class="nav-card-arrow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </span>
    </button>`).join('');

  list.querySelectorAll('.nav-card').forEach((btn) => {
    btn.addEventListener('click', () => openTree(btn.dataset.seq));
  });
}

function renderBranches() {
  const filtered = filterBranches(state.branches);
  document.getElementById('branchesMeta').textContent = `${filtered.length} من ${state.branches.length} فرع`;

  const list = document.getElementById('branchesList');
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><div class="icon">👥</div><p>لا توجد فروع</p></div>';
    return;
  }

  list.innerHTML = filtered.map((b) => `
    <button type="button" class="nav-card" data-seq="${esc(b.seq)}">
      <span class="nav-card-accent branch"></span>
      <span class="nav-card-inner">
        <div class="nav-card-icon branch">👤</div>
        <div class="nav-card-body">
          <div class="nav-card-num">${esc(b.num)}</div>
          <div class="nav-card-name">${esc(b.name1 || '—')}</div>
        </div>
        <span class="nav-card-arrow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </span>
    </button>`).join('');

  list.querySelectorAll('.nav-card').forEach((btn) => {
    btn.addEventListener('click', () => openBranch(btn.dataset.seq));
  });
}

async function openTree(seq) {
  state.selectedTree = state.trees.find((t) => String(t.seq) === String(seq)) || { seq };
  state.selectedBranch = null;
  state.branchSearch = '';
  document.getElementById('branchSearch').value = '';
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
    const debtLabel = acc.debtStatus || summary?.label || 'الرصيد الحالي';

    document.getElementById('stmtHero').innerHTML = `
      <div class="hero-header">
        <div class="hero-top">
          <span class="hero-num">${esc(acc.num)}</span>
          ${debtLabel ? `<span class="hero-badge ${balClass(Number(currentBal))}">${esc(debtLabel)}</span>` : ''}
        </div>
        <h2 class="hero-name">${esc(acc.name1)}</h2>
        ${acc.address ? `<p class="hero-addr">${esc(acc.address)}</p>` : ''}
      </div>
      <div class="hero-balance-wrap">
        <div class="hero-balance ${balClass(Number(currentBal))}">
          <span class="hero-balance-label">الرصيد الحالي</span>
          <span class="hero-balance-val">${fmtNumAlways(Math.abs(Number(currentBal)))}</span>
        </div>
      </div>`;

    document.getElementById('stmtStats').innerHTML = `
      <div class="stat-box stat-debit">
        <span class="stat-icon">↓</span>
        <div class="stat-body">
          <div class="k">إجمالي مدين</div>
          <div class="v">${fmtNumAlways(totalDebit)}</div>
        </div>
      </div>
      <div class="stat-box stat-credit">
        <span class="stat-icon">↑</span>
        <div class="stat-body">
          <div class="k">إجمالي دائن</div>
          <div class="v">${fmtNumAlways(totalCredit)}</div>
        </div>
      </div>
      <div class="stat-box stat-count">
        <span class="stat-icon">#</span>
        <div class="stat-body">
          <div class="k">عدد الحركات</div>
          <div class="v">${lines.length}</div>
        </div>
      </div>`;

    if (lines.length) {
      document.getElementById('stmtTableSection').classList.remove('hidden');
      document.getElementById('stmtLineCount').textContent = `${lines.length} حركة`;
      document.getElementById('stmtLines').innerHTML = lines.map((r, i) => `
        <article class="tx-row${r.debit ? ' has-debit' : r.credit ? ' has-credit' : ''}">
          <div class="tx-row-meta">
            <span class="tx-idx">${i + 1}</span>
            <span class="tx-date">${fmtDate(r.date)}</span>
          </div>
          <p class="tx-desc">${esc(r.description) || '—'}</p>
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
        </article>`).join('');
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

function goBack() {
  if (state.screen === 'statement') {
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
