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
  const searchWrap = document.getElementById('searchBarWrap');
  const filterBar = document.getElementById('filterBar');
  const title = document.getElementById('screenTitle');
  const crumb = document.getElementById('breadcrumb');

  if (name === 'trees') {
    backBtn.classList.add('hidden');
    searchWrap.classList.add('hidden');
    filterBar.classList.add('hidden');
    title.textContent = 'الشجرات';
    crumb.textContent = state.agent?.name ? `مرحباً ${state.agent.name}` : '';
  } else if (name === 'branches') {
    backBtn.classList.remove('hidden');
    searchWrap.classList.remove('hidden');
    filterBar.classList.remove('hidden');
    title.textContent = state.selectedTree?.name1 || 'الفروع';
    crumb.textContent = state.selectedTree ? `شجرة ${state.selectedTree.num}` : '';
  } else if (name === 'statement') {
    backBtn.classList.remove('hidden');
    searchWrap.classList.add('hidden');
    filterBar.classList.add('hidden');
    title.textContent = state.selectedBranch?.name1 || 'كشف الحساب';
    crumb.textContent = state.selectedBranch
      ? `${state.selectedTree?.num || ''} › ${state.selectedBranch.num}`
      : '';
  }
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
      <div class="nav-card-icon tree">🌳</div>
      <div class="nav-card-body">
        <div class="nav-card-num">${esc(t.num)}</div>
        <div class="nav-card-name">${esc(t.name1 || '—')}</div>
        <div class="nav-card-sub">${t.directChildren || 0} زبون</div>
      </div>
      <div class="nav-card-right">
        <div class="nav-card-bal ${balClass(Number(t.bal))}">${fmtNumAlways(t.bal)}</div>
      </div>
      <span class="nav-card-arrow">‹</span>
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
      <div class="nav-card-icon branch">👤</div>
      <div class="nav-card-body">
        <div class="nav-card-num">${esc(b.num)}</div>
        <div class="nav-card-name">${esc(b.name1 || '—')}</div>
        <span class="nav-card-badge ${balClass(Number(b.bal))}">${esc(b.summary?.label || b.debtStatus || '')}</span>
      </div>
      <div class="nav-card-right">
        <div class="nav-card-bal ${balClass(Number(b.bal))}">${fmtNumAlways(b.bal)}</div>
      </div>
      <span class="nav-card-arrow">‹</span>
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

  document.getElementById('stmtHero').innerHTML = '<p style="opacity:.8">جاري التحميل...</p>';
  document.getElementById('stmtStats').innerHTML = '';
  document.getElementById('stmtLines').innerHTML = '';
  document.getElementById('stmtTotals').innerHTML = '';

  try {
    const data = await api(`/accounts/${encodeURIComponent(seq)}/statement`);
    const acc = data.account || state.selectedBranch;
    const branch = state.selectedBranch;

    document.getElementById('stmtHero').innerHTML = `
      <div class="num">${esc(acc.num)}</div>
      <h2>${esc(acc.name1)}</h2>
      ${acc.address ? `<div class="addr">${esc(acc.address)}</div>` : ''}
      <div class="stmt-hero-bal">
        <span>${esc(acc.debtStatus || data.summary?.label || '')}</span>
        <strong>${fmtNumAlways(data.finalBalance ?? acc.bal)}</strong>
      </div>`;

    document.getElementById('stmtStats').innerHTML = [
      ['إجمالي مدين', fmtNumAlways(data.totalDebit)],
      ['إجمالي دائن', fmtNumAlways(data.totalCredit)],
      ['الحركات', String(data.lines?.length || 0)]
    ].map(([k, v]) => `<div class="stat-box"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join('');

    const lines = data.lines || [];
    document.getElementById('stmtLines').innerHTML = lines.length
      ? `<p class="stmt-section-title">حركات الحساب (${lines.length})</p>`
        + lines.map((r) => `
          <div class="tx-card">
            <div class="tx-top">
              <span class="tx-date">${fmtDate(r.date)}</span>
              <span class="tx-bal ${balClass(r.balance)}">${fmtNumAlways(r.balance)}</span>
            </div>
            <div class="tx-desc">${esc(r.description) || '—'}</div>
            <div class="tx-amounts">
              ${r.debit ? `<span class="tx-debit">مدين: ${fmtNum(r.debit)}</span>` : ''}
              ${r.credit ? `<span class="tx-credit">دائن: ${fmtNum(r.credit)}</span>` : ''}
            </div>
          </div>`).join('')
      : '<div class="empty-state"><div class="icon">📋</div><p>لا توجد حركات</p></div>';

    const { totalDebit, totalCredit, summary } = data;
    document.getElementById('stmtTotals').innerHTML = lines.length
      ? `<div class="total-row">
          <span>مجموع المدين</span><span class="val debit">${fmtNumAlways(totalDebit)}</span>
        </div>
        <div class="total-row">
          <span>مجموع الدائن</span><span class="val credit">${fmtNumAlways(totalCredit)}</span>
        </div>
        <div class="total-row final">
          <span>${esc(summary.label)}</span>
          <span class="val">${fmtNumAlways(summary.amount)}</span>
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
