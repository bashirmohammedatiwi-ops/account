function resolveApiBase() {
  const remote = (
    window.edariDesktop?.backendUrl
    || window.ADMIN_CONFIG?.BACKEND_URL
    || ''
  ).trim().replace(/\/$/, '');

  const saved = (localStorage.getItem('backendUrl') || '').trim().replace(/\/$/, '');
  if (saved && !isLocalhostUrl(saved)) return saved;

  if (remote) {
    try {
      const remoteOrigin = new URL(remote).origin;
      if (window.location.origin && window.location.origin !== 'null' && window.location.origin === remoteOrigin) {
        return '';
      }
    } catch { /* ignore */ }
    return remote;
  }

  return '';
}

function getApiBase() {
  return resolveApiBase();
}

window.getApiBase = getApiBase;

function getBackendDisplayUrl() {
  return resolveApiBase() || window.location.origin || window.ADMIN_CONFIG?.BACKEND_URL || '—';
}

function isLocalhostUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

/** عنوان رفع المزامنة — يجب أن يطابق سيرفر المندوب */
function resolveSyncServerUrl() {
  const backend = (
    getBackendDisplayUrl()
    || window.edariDesktop?.backendUrl
    || window.ADMIN_CONFIG?.BACKEND_URL
    || ''
  ).replace(/\/$/, '');
  const saved = (localStorage.getItem('syncServerUrl') || '').trim().replace(/\/$/, '');
  const input = (document.getElementById('syncServerUrl')?.value || '').trim().replace(/\/$/, '');
  const candidate = input || saved || backend;

  if (candidate && backend && isLocalhostUrl(candidate) && !isLocalhostUrl(backend)) {
    return backend;
  }
  return candidate || backend;
}

function applySyncServerUrl(url) {
  const norm = String(url || '').trim().replace(/\/$/, '');
  if (!norm) return;
  localStorage.setItem('syncServerUrl', norm);
  const el = document.getElementById('syncServerUrl');
  if (el) el.value = norm;
}

function setServerStatus(state, text) {
  const dot = document.getElementById('statusDot');
  const label = document.getElementById('statusText');
  if (!dot || !label) return;
  dot.className = `status-dot ${state}`;
  label.textContent = text;
}

async function checkBackendHealth() {
  const base = resolveApiBase();
  const url = `${base}/api/health`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('offline');
    setServerStatus('on', 'متصل بالسيرفر');
    return true;
  } catch {
    setServerStatus('err', 'غير متصل');
    return false;
  }
}
let treesCache = [];

const explorer = {
  trees: [],
  selectedTreeSeq: null,
  branches: [],
  selectedBranchSeq: null,
  branchFilter: 'all',
  branchSearch: '',
  loaded: false
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
  return Number.isNaN(n) ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtStmtBalance(bal, isOpening = false) {
  if (isOpening) return '';
  const n = Number(bal);
  if (Number.isNaN(n) || n === 0) return '0';
  const abs = fmtNumAlways(Math.abs(n));
  return n < 0 ? `${abs}-` : abs;
}

function fmtStmtDate(v) {
  if (!v) return '';
  const d = new Date(String(v).replace(' 00:00:00', ''));
  if (Number.isNaN(d.getTime())) return esc(String(v).slice(0, 10));
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function balClass(b) {
  if (b < 0) return 'debit';
  if (b > 0) return 'credit';
  return '';
}

function fmtDate(v) {
  if (!v) return '—';
  return String(v).replace('T', ' ').slice(0, 19);
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const res = await fetch(`${getApiBase()}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

const PAGE_META = {
  dashboard: { title: 'الرئيسية', sub: 'نظرة عامة واختصارات سريعة' },
  catalog: { title: 'المنتجات', sub: 'إضافة بالباركود من Edari' },
  orders: { title: 'طلبات الشراء', sub: 'طلبات المندوبين — موافقة ومتابعة' },
  sync: { title: 'رفع البيانات', sub: 'مزامنة EdariNX مع سيرفر المندوبين' },
  database: { title: 'إعدادات قاعدة البيانات', sub: 'اتصال EdariNX — Alias، المسارات، و nxServer' },
  agents: { title: 'المندوبون', sub: 'حسابات الدخول وصلاحيات الشجرات' }
};

function showPage(name) {
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === name));
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${name}`));
  const meta = PAGE_META[name] || { title: '', sub: '' };
  const titleEl = document.getElementById('pageTitle');
  const subEl = document.getElementById('pageSubtitle');
  if (titleEl) titleEl.textContent = meta.title;
  if (subEl) subEl.textContent = meta.sub;
  if (name === 'sync') {
    void loadSyncLogs();
    startSyncLogPolling();
  } else if (name === 'database') {
    void loadEdariConnectionSettings();
    stopSyncLogPolling();
  } else {
    stopSyncLogPolling();
  }
  if (window.commercePages?.[name]) void window.commercePages[name]();
}

async function loadDashboard() {
  const data = await api('/api/admin/dashboard');
  const { counts, last } = data;
  document.getElementById('dashStats').innerHTML = [
    ['حسابات', counts.accounts, 'مزامَنة'],
    ['حركات', counts.journal, 'مزامَنة'],
    ['مندوبون', counts.agents, 'نشطون']
  ].map(([k, v, note]) => `
    <div class="stat-card">
      <div class="k">${esc(k)}${note ? ` · ${esc(note)}` : ''}</div>
      <div class="v">${fmtNumAlways(v)}</div>
    </div>`).join('');

  if (last) {
    const cls = last.status === 'success' ? 'ok' : last.status === 'error' ? 'off' : 'pending';
    const msg = String(last.message || '').trim();
    document.getElementById('lastSyncInfo').innerHTML = `
      <p><span class="badge ${cls}">${esc(syncStatusLabel(last.status))}</span></p>
      <p style="margin:8px 0 0">${fmtDate(last.started_at)}</p>
      <p class="muted">${last.accounts_count || 0} حساب · ${last.journal_count || 0} حركة</p>
      ${msg ? `<p class="muted sync-last-msg">${esc(msg)}</p>` : ''}`;
  } else {
    document.getElementById('lastSyncInfo').textContent = 'لم تُنفَّذ مزامنة بعد';
  }
}

async function loadTrees() {
  const data = await api('/api/admin/trees');
  treesCache = data.trees || [];
  explorer.trees = treesCache;
  if (explorer.loaded) renderExplorerTrees();
}

function filterBranches(list) {
  const q = explorer.branchSearch.trim().toLowerCase();
  return list.filter((b) => {
    const name = String(b.name1 || '').toLowerCase();
    const num = String(b.num || '');
    if (q && !name.includes(q) && !num.includes(q)) return false;
    const bal = Number(b.bal || 0);
    if (explorer.branchFilter === 'debit' && bal >= 0) return false;
    if (explorer.branchFilter === 'credit' && bal <= 0) return false;
    return true;
  });
}

function renderExplorerTrees() {
  document.getElementById('explorerTreesMeta').textContent = explorer.trees.length
    ? `${explorer.trees.length} شجرة`
    : 'لا توجد بيانات — ارفع البيانات أولاً';

  document.getElementById('explorerTrees').innerHTML = explorer.trees.map((t) => `
    <button type="button" class="pick-item${explorer.selectedTreeSeq === t.seq ? ' active' : ''}" data-seq="${esc(t.seq)}">
      <div class="row-top">
        <span class="code">${esc(t.num)}</span>
        <span class="num ${balClass(Number(t.bal))}">${fmtNumAlways(t.bal)}</span>
      </div>
      <div class="name">${esc(t.name1 || '—')}</div>
      <div class="sub">${t.sub_count || 0} فرع</div>
    </button>`).join('') || '<p class="empty-msg">—</p>';

  document.querySelectorAll('#explorerTrees .pick-item').forEach((btn) => {
    btn.addEventListener('click', () => selectExplorerTree(btn.dataset.seq));
  });
}

function renderExplorerBranches() {
  const filtered = filterBranches(explorer.branches);
  document.getElementById('explorerBranchesMeta').textContent = explorer.branches.length
    ? `${filtered.length} من ${explorer.branches.length}`
    : 'اختر شجرة';

  document.getElementById('explorerBranches').innerHTML = filtered.map((b) => `
    <button type="button" class="pick-item${explorer.selectedBranchSeq === b.seq ? ' active' : ''}" data-seq="${esc(b.seq)}">
      <div class="row-top">
        <span class="code">${esc(b.num)}</span>
        <span class="num ${balClass(Number(b.bal))}">${fmtNumAlways(b.bal)}</span>
      </div>
      <div class="name">${esc(b.name1 || '—')}</div>
      <div class="sub">${esc(b.summary?.label || b.debtStatus || '')}</div>
    </button>`).join('') || '<p class="empty-msg">لا توجد فروع</p>';

  document.querySelectorAll('#explorerBranches .pick-item').forEach((btn) => {
    btn.addEventListener('click', () => selectExplorerBranch(btn.dataset.seq));
  });
}

async function selectExplorerTree(seq) {
  explorer.selectedTreeSeq = seq;
  explorer.selectedBranchSeq = null;
  const tree = explorer.trees.find((t) => String(t.seq) === String(seq));
  document.getElementById('explorerBranchesTitle').textContent = tree
    ? `فروع: ${tree.name1 || tree.num}`
    : 'الفروع / الزبائن';
  renderExplorerTrees();
  document.getElementById('explorerStmtEmpty').classList.remove('hidden');
  document.getElementById('explorerStmtContent').classList.add('hidden');

  try {
    const data = await api(`/api/admin/accounts/${encodeURIComponent(seq)}/children`);
    explorer.branches = data.children || [];
    renderExplorerBranches();
    if (explorer.branches.length) await selectExplorerBranch(explorer.branches[0].seq);
  } catch (e) {
    document.getElementById('explorerBranchesMeta').textContent = e.message;
  }
}

async function selectExplorerBranch(seq) {
  explorer.selectedBranchSeq = seq;
  renderExplorerBranches();

  document.getElementById('explorerStmtEmpty').classList.add('hidden');
  document.getElementById('explorerStmtContent').classList.remove('hidden');
  document.getElementById('explorerStmtBody').innerHTML = '<tr><td colspan="5" class="loading">جاري التحميل...</td></tr>';
  document.getElementById('explorerStmtFoot').innerHTML = '';
  document.getElementById('explorerStmtCards').innerHTML = '';

  const branch = explorer.branches.find((b) => String(b.seq) === String(seq)) || { seq };

  try {
    const data = await api(`/api/admin/accounts/${encodeURIComponent(seq)}/statement`);
    const acc = data.account || branch;

    document.getElementById('explorerStmtHeader').innerHTML = `
      <div>
        <h3>${esc(acc.name1)}</h3>
        <p>${esc(acc.num)}${acc.address ? ' • ' + esc(acc.address) : ''}</p>
      </div>
      <div class="hdr-bal ${balClass(Number(acc.bal ?? data.finalBalance))}">
        <span>${esc(acc.debtStatus || data.summary?.label || '')}</span>
        <strong>${fmtNumAlways(Math.abs(Number(data.finalBalance ?? acc.bal ?? 0)))}</strong>
      </div>`;

    const { lines, totalDebit, totalCredit, summary } = data;
    const debtAmount = data.debtAmount ?? Math.max(0, Number(totalDebit) - Number(totalCredit));

    document.getElementById('explorerStmtCards').innerHTML = [
      ['إجمالي مدين', fmtNumAlways(totalDebit)],
      ['إجمالي دائن', fmtNumAlways(totalCredit)],
      ['الديون', fmtNumAlways(debtAmount)],
      ['الحالة', summary?.label || acc.debtStatus]
    ].map(([k, v]) => `<div class="mini-stat"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join('');

    document.getElementById('explorerStmtMeta').textContent = `${lines.length} حركة • ${summary.label}`;

    document.getElementById('explorerStmtBody').innerHTML = lines.length
      ? lines.map((r) => `
        <tr class="${r.isOpening ? 'row-opening' : ''}">
          <td class="num">${fmtNum(r.debit)}</td>
          <td class="num">${fmtNum(r.credit)}</td>
          <td class="desc">${esc(r.description)}</td>
          <td>${r.isOpening ? '' : (r.date ? fmtStmtDate(r.date) : '')}</td>
          <td class="num ${balClass(r.balance)}">${fmtStmtBalance(r.balance, r.isOpening)}</td>
        </tr>`).join('')
      : '<tr><td colspan="5">لا توجد حركات</td></tr>';

    document.getElementById('explorerStmtFoot').innerHTML = lines.length
      ? `<tr class="totals">
          <td class="num">${fmtNumAlways(totalDebit)}</td>
          <td class="num">${fmtNumAlways(totalCredit)}</td>
          <td colspan="2"><strong>المجموع</strong></td>
          <td></td>
        </tr>
        <tr class="final">
          <td class="num">${summary.side === 'debit' ? fmtNumAlways(summary.amount) : ''}</td>
          <td class="num">${summary.side === 'credit' ? fmtNumAlways(summary.amount) : ''}</td>
          <td colspan="2"><strong>${esc(summary.label)}</strong></td>
          <td></td>
        </tr>`
      : '';
  } catch (e) {
    document.getElementById('explorerStmtBody').innerHTML = `<tr><td colspan="5">${esc(e.message)}</td></tr>`;
  }
}

async function initExplorer() {
  if (!explorer.loaded) {
    explorer.loaded = true;
    document.getElementById('branchSearch').addEventListener('input', (e) => {
      explorer.branchSearch = e.target.value;
      renderExplorerBranches();
    });
    document.querySelectorAll('#page-trees .seg-btn').forEach((chip) => {
      chip.addEventListener('click', () => {
        explorer.branchFilter = chip.dataset.filter;
        document.querySelectorAll('#page-trees .seg-btn').forEach((c) => c.classList.toggle('active', c === chip));
        renderExplorerBranches();
      });
    });
    let searchTimer;
    document.getElementById('explorerSearch').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        const q = e.target.value.trim();
        if (!q || q.length < 2) return;
        try {
          const data = await api(`/api/admin/search?q=${encodeURIComponent(q)}`);
          if (!data.results?.length) return;
          explorer.branches = data.results.map((r) => ({
            seq: r.seq,
            num: r.num,
            name1: r.name1,
            bal: r.bal,
            debtStatus: r.debtStatus,
            summary: { label: r.debtStatus }
          }));
          renderExplorerBranches();
          if (data.results.length === 1) await selectExplorerBranch(data.results[0].seq);
        } catch (ex) {
          console.error(ex);
        }
      }, 350);
    });
  }

  explorer.trees = treesCache;
  renderExplorerTrees();
  if (explorer.trees.length && !explorer.selectedTreeSeq) {
    await selectExplorerTree(explorer.trees[0].seq);
  }
}

async function loadAgents() {
  const data = await api('/api/admin/agents');
  const grid = document.getElementById('agentsGrid');
  if (!data.agents?.length) {
    grid.innerHTML = '<p class="muted">لا يوجد مندوبون — اضغط «مندوب جديد»</p>';
    return;
  }
  grid.innerHTML = data.agents.map((a) => {
    const treeCount = a.treeSeqs?.length || 0;
    return `
    <article class="agent-card">
      <div class="agent-card-head">
        <strong>${esc(a.name)}</strong>
        <span class="badge ${a.active ? 'ok' : 'off'}">${a.active ? 'نشط' : 'موقوف'}</span>
      </div>
      <div class="agent-card-meta">
        <div>@${esc(a.username)}</div>
        ${a.phone ? `<div>${esc(a.phone)}</div>` : ''}
        <div>${treeCount} شجرة مصرّحة</div>
      </div>
      <div class="agent-card-actions">
        <button type="button" class="btn btn-soft btn-sm" data-edit="${a.id}">تعديل</button>
        <button type="button" class="btn btn-danger btn-sm" data-del="${a.id}">حذف</button>
      </div>
    </article>`;
  }).join('');

  grid.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openAgentModal(Number(btn.dataset.edit)));
  });
  grid.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف هذا المندوب؟')) return;
      await api(`/api/admin/agents/${btn.dataset.del}`, { method: 'DELETE' });
      loadAgents();
    });
  });
}

async function loadSyncLogs() {
  const data = await api('/api/admin/sync/logs');
  const body = document.getElementById('syncLogsBody');
  if (!body) return;
  body.innerHTML = (data.logs || []).map((l) => {
    const cls = l.status === 'success' ? 'ok' : l.status === 'error' ? 'off' : 'pending';
    const msg = String(l.message || '').trim();
    const autoTag = /\[تلقائي\]|تلقائي|auto/i.test(msg)
      ? '<span class="badge pending sync-kind-auto">تلقائي</span>'
      : '<span class="badge sync-kind-manual">يدوي</span>';
    return `
    <tr>
      <td>${l.id}</td>
      <td>${fmtDate(l.started_at)}</td>
      <td>${fmtDate(l.finished_at)}</td>
      <td>${autoTag} <span class="badge ${cls}">${esc(syncStatusLabel(l.status))}</span></td>
      <td dir="ltr">${l.accounts_count || 0}</td>
      <td dir="ltr">${l.journal_count || 0}</td>
      <td class="sync-log-msg">${esc(msg || '—')}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7">لا يوجد سجل</td></tr>';
}

function syncStatusLabel(status) {
  if (status === 'success') return 'نجح';
  if (status === 'error') return 'فشل';
  if (status === 'running') return 'جاري';
  return status || '—';
}

let syncLogPollTimer = null;

function startSyncLogPolling() {
  stopSyncLogPolling();
  syncLogPollTimer = setInterval(() => {
    if (document.getElementById('page-sync')?.classList.contains('active') && !syncInProgress) {
      void loadSyncLogs();
    }
  }, 15000);
}

function stopSyncLogPolling() {
  if (syncLogPollTimer) clearInterval(syncLogPollTimer);
  syncLogPollTimer = null;
}

let syncActivitySource = 'manual';
const syncLiveLines = [];
const SYNC_LIVE_MAX = 40;

function updateSyncSourceBadge() {
  const badge = document.getElementById('syncSourceBadge');
  if (!badge) return;
  if (!syncInProgress) {
    badge.classList.add('hidden');
    return;
  }
  badge.classList.remove('hidden');
  badge.textContent = syncActivitySource === 'auto' ? 'رفع تلقائي' : 'رفع يدوي';
  badge.className = `badge ${syncActivitySource === 'auto' ? 'pending' : 'ok'} sync-source-badge`;
}

function appendSyncLiveLine(line, source = syncActivitySource) {
  const feed = document.getElementById('syncLiveFeed');
  if (!feed || !line) return;
  const stamp = new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  syncLiveLines.unshift({ line: String(line), stamp, source });
  if (syncLiveLines.length > SYNC_LIVE_MAX) syncLiveLines.length = SYNC_LIVE_MAX;
  feed.innerHTML = syncLiveLines.map((item) => `
    <div class="sync-live-line">
      <span class="sync-live-time">${esc(item.stamp)}</span>
      <span class="badge ${item.source === 'auto' ? 'pending' : 'ok'} sync-live-kind">${item.source === 'auto' ? 'تلقائي' : 'يدوي'}</span>
      <span class="sync-live-text">${esc(item.line)}</span>
    </div>`).join('');
}

function showSyncProgressPanel(show = true) {
  const prog = document.getElementById('syncProgress');
  if (!prog) return;
  prog.classList.toggle('hidden', !show);
}

async function handleSyncFinished(activity = {}) {
  syncInProgress = false;
  updateSyncSourceBadge();
  updateAutoSyncDisplay();

  if (activity.phase === 'complete' && activity.result) {
    const r = activity.result;
    const invPart = r.invoices ? `، ${r.invoices} فاتورة` : '';
    const linesPart = r.invoiceLines ? `، ${r.invoiceLines} بند` : '';
    applySyncProgressLine(`تم! ${r.accounts} حساب، ${r.journal} حركة${invPart}${linesPart}`);
    const bar = document.getElementById('syncProgressBar');
    const step = document.getElementById('syncProgressStep');
    if (bar) bar.style.width = '100%';
    if (step) step.textContent = 'اكتملت المزامنة';
  }

  if (activity.phase === 'error') {
    applySyncProgressLine(`خطأ: ${activity.message || 'فشل الرفع'}`);
    const bar = document.getElementById('syncProgressBar');
    if (bar) bar.style.width = '0%';
  }

  await loadSyncLogs();
  await loadDashboard();
  await loadTrees();
  if (explorer.selectedTreeSeq) await selectExplorerTree(explorer.selectedTreeSeq);

  const hideDelay = activity.source === 'auto' ? 12000 : 5000;
  setTimeout(() => {
    if (!syncInProgress) showSyncProgressPanel(false);
  }, hideDelay);
}

function initSyncLiveFeed() {
  if (window.__syncLiveFeedReady) return;
  window.__syncLiveFeedReady = true;

  if (window.edariDesktop?.onSyncProgress) {
    window.edariDesktop.onSyncProgress((line) => {
      if (!line) return;
      applySyncProgressLine(line);
      appendSyncLiveLine(line);
      showSyncProgressPanel(true);
    });
  }

  if (window.edariDesktop?.onSyncActivity) {
    window.edariDesktop.onSyncActivity(async (activity) => {
      if (activity.phase === 'start') {
        syncInProgress = true;
        syncActivitySource = activity.source === 'auto' ? 'auto' : 'manual';
        updateSyncSourceBadge();
        showSyncProgressPanel(true);
        applySyncProgressLine(activity.message || (syncActivitySource === 'auto' ? 'بدء رفع تلقائي...' : 'بدء الرفع...'));
        appendSyncLiveLine(activity.message || 'بدء الرفع', syncActivitySource);
        updateAutoSyncDisplay();
        return;
      }
      if (activity.phase === 'complete' || activity.phase === 'error') {
        appendSyncLiveLine(activity.message || (activity.phase === 'complete' ? 'اكتمل الرفع' : 'فشل الرفع'), activity.source);
        await handleSyncFinished(activity);
      }
    });
  }
}

function getSelectedSyncTreeSeqs() {
  return [...document.querySelectorAll('#syncTreeChecks input[name=syncTreeSeq]:checked')]
    .map((c) => c.value)
    .filter(Boolean);
}

function getSavedSyncTreeSeqs() {
  try {
    return JSON.parse(localStorage.getItem('syncTreeSeqs') || '[]')
      .map(String)
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** الشجرات من الواجهة، أو من localStorage إن لم تُحمَّل القائمة بعد */
function getEffectiveSyncTreeSeqs() {
  const fromDom = getSelectedSyncTreeSeqs();
  if (fromDom.length) return fromDom;
  return getSavedSyncTreeSeqs();
}

function saveSyncTreeSelection() {
  const seqs = getSelectedSyncTreeSeqs();
  localStorage.setItem('syncTreeSeqs', JSON.stringify(seqs));
  void persistBackgroundSyncSettings({ treeSeqs: seqs });
}

async function persistBackgroundSyncSettings(override = {}) {
  if (!window.edariDesktop?.saveBackgroundSyncSettings) return null;
  const treeSeqs = override.treeSeqs ?? getEffectiveSyncTreeSeqs();
  const edari = override.edari ?? readEdariForm();
  return window.edariDesktop.saveBackgroundSyncSettings({
    serverUrl: resolveSyncServerUrl(),
    syncKey: document.getElementById('syncApiKey')?.value?.trim() || '',
    treeSeqs,
    autoSyncEnabled: document.getElementById('autoSyncEnabled')?.checked !== false,
    edari,
    ...override
  });
}

const EDARI_LS_KEY = 'edariConnection';

const DEFAULT_EDARI_UI = {
  mode: 'tcp',
  alias: '2025',
  server: '127.0.0.1',
  port: 16000,
  dataRoot: 'D:\\Future of Technology\\EdariNX\\Data',
  databasePath: 'D:\\Future of Technology\\EdariNX\\Data\\2025'
};

function readEdariForm() {
  return {
    mode: document.getElementById('edariMode')?.value === 'internal' ? 'internal' : 'tcp',
    alias: document.getElementById('edariAlias')?.value?.trim() || '2025',
    server: document.getElementById('edariServer')?.value?.trim() || '127.0.0.1',
    port: Number(document.getElementById('edariPort')?.value || 16000),
    dataRoot: document.getElementById('edariDataRoot')?.value?.trim() || '',
    databasePath: document.getElementById('edariDatabasePath')?.value?.trim() || ''
  };
}

function fillEdariForm(edari = {}) {
  const e = { ...DEFAULT_EDARI_UI, ...edari };
  const modeEl = document.getElementById('edariMode');
  if (modeEl) modeEl.value = e.mode === 'internal' ? 'internal' : 'tcp';
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el != null && val != null) el.value = val;
  };
  set('edariAlias', e.alias);
  set('edariDataRoot', e.dataRoot);
  set('edariDatabasePath', e.databasePath);
  set('edariServer', e.server);
  set('edariPort', e.port);
}

function setEdariConnStatus(msg, type = '') {
  const el = document.getElementById('edariConnStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = `field-hint edari-conn-status db-conn-status${type ? ` is-${type}` : ''}`;
}

async function loadEdariConnectionSettings() {
  let edari = { ...DEFAULT_EDARI_UI };
  try {
    if (window.edariDesktop?.getEdariSettings) {
      const data = await window.edariDesktop.getEdariSettings();
      edari = { ...edari, ...(data.edari || {}) };
    } else {
      const saved = localStorage.getItem(EDARI_LS_KEY);
      if (saved) edari = { ...edari, ...JSON.parse(saved) };
    }
  } catch {
    /* ignore */
  }
  fillEdariForm(edari);
  localStorage.setItem(EDARI_LS_KEY, JSON.stringify(edari));
}

async function saveEdariConnectionSettings() {
  const edari = readEdariForm();
  localStorage.setItem(EDARI_LS_KEY, JSON.stringify(edari));
  if (window.edariDesktop?.saveEdariSettings) {
    await window.edariDesktop.saveEdariSettings(edari);
  } else {
    await persistBackgroundSyncSettings({ edari });
  }
  setEdariConnStatus('تم حفظ إعدادات قاعدة البيانات', 'ok');
}

async function testEdariConnectionSettings() {
  const edari = readEdariForm();
  setEdariConnStatus('جاري اختبار الاتصال...');
  if (!window.edariDesktop?.testEdariConnection) {
    setEdariConnStatus('اختبار الاتصال متاح من تطبيق Admin (Electron) فقط', 'warn');
    return;
  }
  try {
    const data = await window.edariDesktop.testEdariConnection(edari);
    if (!data.ok) throw new Error(data.error || 'فشل الاتصال');
    setEdariConnStatus(data.message || `تم الاتصال — ${data.alias}`, 'ok');
  } catch (e) {
    setEdariConnStatus(e.message, 'err');
  }
}

async function discoverEdariDatabases() {
  const dataRoot = document.getElementById('edariDataRoot')?.value?.trim();
  if (!dataRoot) {
    setEdariConnStatus('أدخل مجلد Data أولاً', 'err');
    return;
  }
  setEdariConnStatus('جاري البحث عن القواعد...');
  if (!window.edariDesktop?.listEdariDatabases) {
    setEdariConnStatus('الاكتشاف متاح من تطبيق Admin (Electron) فقط', 'warn');
    return;
  }
  try {
    const data = await window.edariDesktop.listEdariDatabases({ dataRoot });
    if (!data.ok) throw new Error(data.error || 'فشل الاكتشاف');
    const pick = document.getElementById('edariDatabasePick');
    const items = [];
    for (const db of data.databases || []) {
      items.push({ name: db.name, path: db.path, label: `${db.name} — ${db.tableCount} جدول` });
    }
    for (const a of data.aliases || []) {
      if (!items.some((x) => x.name === a.name)) {
        items.push({ name: a.name, path: a.path, label: `${a.name} (nxServer) — ${a.path}` });
      }
    }
    if (!items.length) {
      pick?.classList.add('hidden');
      document.getElementById('edariPickHint')?.classList.remove('hidden');
      setEdariConnStatus('لم تُعثر على قواعد في هذا المجلد', 'warn');
      return;
    }
    pick.innerHTML = `<option value="">— اختر قاعدة —</option>${items.map((it, i) =>
      `<option value="${i}">${esc(it.label)}</option>`).join('')}`;
    pick.classList.remove('hidden');
    pick._items = items;
    document.getElementById('edariPickHint')?.classList.add('hidden');
    setEdariConnStatus(`وُجد ${items.length} قاعدة — اختر من القائمة أعلاه`, 'ok');
  } catch (e) {
    setEdariConnStatus(e.message, 'err');
  }
}

function renderSyncTreeChecks(trees, selected = []) {
  const el = document.getElementById('syncTreeChecks');
  if (!el) return;
  if (!trees.length) {
    el.innerHTML = '<p class="muted">لا توجد شجرات — تأكد أن EdariNX يعمل أو ارفع بيانات كاملة مرة واحدة</p>';
    return;
  }
  el.innerHTML = trees.map((t) => `
    <label class="tree-pick">
      <input type="checkbox" name="syncTreeSeq" value="${esc(t.seq)}" ${selected.includes(String(t.seq)) ? 'checked' : ''}>
      <div class="tree-pick-body">
        <div class="tree-pick-name">${esc(t.name1 || '—')}</div>
        <div class="tree-pick-meta">${esc(t.num)} · ${t.sub_count || 0} فرع</div>
      </div>
    </label>`).join('');

  el.querySelectorAll('input[name=syncTreeSeq]').forEach((input) => {
    input.addEventListener('change', saveSyncTreeSelection);
  });
}

async function loadSyncTrees() {
  const saved = JSON.parse(localStorage.getItem('syncTreeSeqs') || '[]');
  const el = document.getElementById('syncTreeChecks');
  if (el) el.innerHTML = '<p class="muted">جاري تحميل الشجرات من EdariNX...</p>';

  try {
    let trees = [];
    if (window.edariDesktop?.listEdariTrees) {
      const data = await window.edariDesktop.listEdariTrees();
      trees = data.trees || [];
    } else {
      const data = await api('/api/admin/edari/trees').catch(() => api('/api/admin/trees'));
      trees = data.trees || [];
    }
    renderSyncTreeChecks(trees, saved.map(String));
    await persistBackgroundSyncSettings({ treeSeqs: getEffectiveSyncTreeSeqs() });
  } catch (e) {
    if (el) el.innerHTML = `<p class="muted">تعذّر تحميل الشجرات: ${esc(e.message)}</p>`;
  }
}

function renderTreeChecks(selected = []) {
  const el = document.getElementById('agentTreeChecks');
  if (!treesCache.length) {
    el.innerHTML = '<p class="muted">ارفع البيانات أولاً لعرض الشجرات</p>';
    return;
  }
  el.innerHTML = treesCache.map((t) => `
    <label class="tree-pick">
      <input type="checkbox" name="treeSeq" value="${t.seq}" ${selected.includes(t.seq) ? 'checked' : ''}>
      <div class="tree-pick-body">
        <div class="tree-pick-name">${esc(t.name1 || '—')}</div>
        <div class="tree-pick-meta">${esc(t.num)} · ${t.sub_count || 0} فرع</div>
      </div>
    </label>`).join('');
}

function openAgentModal(id = null) {
  document.getElementById('agentModal').classList.remove('hidden');
  document.getElementById('agentModalTitle').textContent = id ? 'تعديل مندوب' : 'إضافة مندوب';
  document.getElementById('agentId').value = id || '';
  document.getElementById('agentPassword').required = !id;

  if (id) {
    api('/api/admin/agents').then((data) => {
      const a = data.agents.find((x) => x.id === id);
      if (!a) return;
      document.getElementById('agentName').value = a.name;
      document.getElementById('agentPhone').value = a.phone || '';
      document.getElementById('agentUsername').value = a.username;
      document.getElementById('agentActive').checked = a.active;
      renderTreeChecks(a.treeSeqs || []);
    });
  } else {
    document.getElementById('agentForm').reset();
    document.getElementById('agentActive').checked = true;
    renderTreeChecks([]);
  }
}

function applySyncProgressLine(line) {
  const msg = document.getElementById('syncProgressMsg');
  const bar = document.getElementById('syncProgressBar');
  const step = document.getElementById('syncProgressStep');
  if (!msg) return;

  const parsed = String(line || '').match(/^@PROGRESS\|(\d+)\|(\d+)\|(\d+)\|(.+)$/);
  if (parsed) {
    const overallPct = Math.round(((Number(parsed[1]) - 1) / Number(parsed[2]) + Number(parsed[3]) / 100 / Number(parsed[2])) * 100);
    msg.textContent = parsed[4];
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, overallPct))}%`;
    if (step) step.textContent = `الخطوة ${parsed[1]} من ${parsed[2]} — ${parsed[3]}%`;
    return;
  }

  msg.textContent = line;
}

async function verifySyncTarget(serverUrl, syncKey) {
  const res = await fetch(`${serverUrl}/api/sync/status`, {
    headers: { 'X-Sync-Key': syncKey },
    cache: 'no-store'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'تعذّر التحقق من السيرفر — تأكد من العنوان ومفتاح المزامنة');
  }
  return data;
}

let syncInProgress = false;

const AUTO_SYNC_INTERVAL_SEC = 30 * 60;
const autoSync = {
  enabled: true,
  secondsLeft: AUTO_SYNC_INTERVAL_SEC
};

function canAutoSync() {
  return Boolean(window.edariDesktop?.runLocalSync);
}

function formatAutoSyncCountdown(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function setAutoSyncHint(text) {
  const hint = document.getElementById('autoSyncHint');
  if (hint) hint.textContent = text;
}

function updateAutoSyncDisplay() {
  const text = syncInProgress
    ? 'جاري المزامنة...'
    : formatAutoSyncCountdown(autoSync.secondsLeft);
  const els = [
    document.getElementById('autoSyncCountdown'),
    document.getElementById('autoSyncPillTime')
  ];
  for (const el of els) {
    if (!el) continue;
    el.textContent = text;
    el.classList.toggle('running', syncInProgress);
  }
  if (!syncInProgress && autoSync.enabled) {
    setAutoSyncHint(autoSync.secondsLeft > 0 ? 'حتى الرفع التلقائي التالي' : 'بدء الرفع الآن...');
  }
}

function applyMainAutoSyncState(state = {}) {
  autoSync.enabled = Boolean(state.enabled);
  autoSync.secondsLeft = Number(state.secondsLeft) || AUTO_SYNC_INTERVAL_SEC;
  syncInProgress = Boolean(state.syncing);
  const checkbox = document.getElementById('autoSyncEnabled');
  if (checkbox) checkbox.checked = autoSync.enabled;
  const loginChk = document.getElementById('startAtLoginEnabled');
  if (loginChk) loginChk.checked = state.startAtLogin !== false;
  updateAutoSyncDisplay();
  if (state.syncing) {
    syncActivitySource = 'auto';
    updateSyncSourceBadge();
    showSyncProgressPanel(true);
    applySyncProgressLine('رفع تلقائي جارٍ في الخلفية...');
  }
  if (autoSync.enabled) {
    setAutoSyncHint(
      state.syncing
        ? 'رفع تلقائي جارٍ في الخلفية...'
        : 'يعمل في الخلفية — العداد حتى الرفع التالي'
    );
  } else {
    setAutoSyncHint('المزامنة التلقائية متوقفة');
  }
}

async function setAutoSyncEnabled(on) {
  localStorage.setItem('autoSyncEnabled', on ? '1' : '0');
  if (window.edariDesktop?.setAutoSyncEnabled) {
    const state = await window.edariDesktop.setAutoSyncEnabled(on);
    applyMainAutoSyncState(state);
    return;
  }
  autoSync.enabled = Boolean(on);
  updateAutoSyncDisplay();
}

async function initAutoSync() {
  const sidebar = document.getElementById('autoSyncSidebar');
  const pill = document.getElementById('autoSyncPill');
  const desc = document.getElementById('syncAutoDesc');
  const bgCard = document.getElementById('backgroundSyncCard');
  if (!canAutoSync()) {
    sidebar?.classList.add('hidden');
    pill?.classList.add('hidden');
    desc?.classList.add('hidden');
    bgCard?.classList.add('hidden');
    return;
  }
  sidebar?.classList.remove('hidden');
  pill?.classList.remove('hidden');
  desc?.classList.remove('hidden');
  bgCard?.classList.remove('hidden');

  if (window.edariDesktop?.onAutoSyncState) {
    window.edariDesktop.onAutoSyncState(applyMainAutoSyncState);
  }
  if (window.edariDesktop?.getAutoSyncState) {
    const state = await window.edariDesktop.getAutoSyncState();
    applyMainAutoSyncState(state);
  }

  await persistBackgroundSyncSettings();
}

async function runSync(opts = {}) {
  const { auto = false } = opts;
  if (auto && window.edariDesktop?.runBackgroundSyncNow) {
    await persistBackgroundSyncSettings();
    await window.edariDesktop.runBackgroundSyncNow();
    return true;
  }
  if (syncInProgress) {
    if (!auto) alert('المزامنة قيد التنفيذ بالفعل');
    return false;
  }

  const serverUrl = resolveSyncServerUrl();
  const syncKey = document.getElementById('syncApiKey').value.trim();
  const backendUrl = (getBackendDisplayUrl() || '').replace(/\/$/, '');
  await persistBackgroundSyncSettings();
  const treeSeqs = getEffectiveSyncTreeSeqs();
  if (!treeSeqs.length) {
    if (auto) {
      setAutoSyncHint('تخطّي: حدد شجرة واحدة على الأقل');
      return false;
    }
    alert('حدد شجرة واحدة على الأقل للرفع');
    return false;
  }
  if (!serverUrl) {
    if (auto) {
      setAutoSyncHint('تخطّي: عنوان السيرفر غير مضبوط');
      return false;
    }
    alert('أدخل عنوان سيرفر الرفع (نفس عنوان تطبيق المندوب)');
    return false;
  }
  if (!syncKey) {
    if (auto) {
      setAutoSyncHint('تخطّي: مفتاح المزامنة فارغ');
      return false;
    }
    alert('أدخل مفتاح المزامنة (SYNC_API_KEY على السيرفر)');
    return false;
  }
  if (!auto && backendUrl && serverUrl.replace(/\/$/, '') !== backendUrl) {
    const proceed = confirm(
      `عنوان الرفع (${serverUrl}) يختلف عن سيرفر لوحة التحكم (${backendUrl}).\n\n` +
      'لن تصل التحديثات للمندوب إلا إذا كان الرفع لنفس السيرفر.\n\nمتابعة على أي حال؟'
    );
    if (!proceed) return false;
  }

  syncInProgress = true;
  syncActivitySource = 'manual';
  updateSyncSourceBadge();
  updateAutoSyncDisplay();

  applySyncServerUrl(serverUrl);
  localStorage.setItem('syncApiKey', syncKey);
  saveSyncTreeSelection();

  const bar = document.getElementById('syncProgressBar');
  const step = document.getElementById('syncProgressStep');
  showSyncProgressPanel(true);
  if (bar) bar.style.width = '0%';
  if (step) step.textContent = 'الخطوة 1 من 6';
  applySyncProgressLine('التحقق من اتصال سيرفر الرفع...');
  appendSyncLiveLine('بدء رفع يدوي...', 'manual');

  try {
    await verifySyncTarget(serverUrl, syncKey);
    applySyncProgressLine('جاري قراءة الحسابات من EdariNX...');

    let data;
    if (window.edariDesktop?.runLocalSync) {
      data = await window.edariDesktop.runLocalSync(serverUrl, syncKey, treeSeqs);
    } else {
      data = await api('/api/admin/trigger-sync', {
        method: 'POST',
        body: JSON.stringify({ serverUrl, syncKey, treeSeqs })
      });
    }
    if (!data.ok) throw new Error(data.error || 'فشل الرفع');

    const invPart = data.invoices ? `، ${data.invoices} فاتورة` : '';
    const linesPart = data.invoiceLines ? `، ${data.invoiceLines} بند` : '';
    applySyncProgressLine(`تم! ${data.accounts} حساب، ${data.journal} حركة${invPart}${linesPart}`);
    if (bar) bar.style.width = '100%';
    if (step) step.textContent = 'اكتملت المزامنة';
    await loadDashboard();
    await loadTrees();
    if (explorer.selectedTreeSeq) await selectExplorerTree(explorer.selectedTreeSeq);
    await loadSyncLogs();
    await loadAgents();
    await persistBackgroundSyncSettings();
  } catch (e) {
    applySyncProgressLine(`خطأ: ${e.message}`);
    appendSyncLiveLine(`خطأ: ${e.message}`, syncActivitySource);
    if (bar) bar.style.width = '0%';
    if (auto) {
      setAutoSyncHint(`خطأ: ${e.message}`);
    } else {
      alert(`فشل الرفع:\n${e.message}\n\nيمكنك تشغيل المزامنة يدوياً:\nnode sync-client/sync.js`);
    }
    syncInProgress = false;
    updateAutoSyncDisplay();
    return false;
  } finally {
    if (!window.edariDesktop?.onSyncActivity) {
      syncInProgress = false;
      updateAutoSyncDisplay();
      setTimeout(() => showSyncProgressPanel(false), auto ? 8000 : 5000);
    }
  }
  return true;
}

document.getElementById('btnAddAgent').addEventListener('click', () => openAgentModal());
const agentModal = document.getElementById('agentModal');
document.getElementById('agentCancel').addEventListener('click', () => agentModal.classList.add('hidden'));
agentModal?.addEventListener('click', (e) => {
  if (e.target === agentModal) agentModal.classList.add('hidden');
});
document.getElementById('btnSyncNow').addEventListener('click', async () => {
  await persistBackgroundSyncSettings();
  void runSync({ auto: false });
});
document.getElementById('autoSyncEnabled')?.addEventListener('change', (e) => {
  void setAutoSyncEnabled(e.target.checked);
});
document.getElementById('startAtLoginEnabled')?.addEventListener('change', async (e) => {
  if (window.edariDesktop?.setStartAtLogin) {
    const state = await window.edariDesktop.setStartAtLogin(e.target.checked);
    applyMainAutoSyncState(state);
  }
});
document.getElementById('syncServerUrl')?.addEventListener('change', () => { void persistBackgroundSyncSettings(); });
document.getElementById('syncApiKey')?.addEventListener('change', () => { void persistBackgroundSyncSettings(); });
document.getElementById('btnSyncTreesAll')?.addEventListener('click', () => {
  document.querySelectorAll('#syncTreeChecks input[name=syncTreeSeq]').forEach((c) => { c.checked = true; });
  saveSyncTreeSelection();
});
document.getElementById('btnSyncTreesNone')?.addEventListener('click', () => {
  document.querySelectorAll('#syncTreeChecks input[name=syncTreeSeq]').forEach((c) => { c.checked = false; });
  saveSyncTreeSelection();
});
document.getElementById('btnSyncTreesReload')?.addEventListener('click', loadSyncTrees);
document.getElementById('btnRefreshSyncLogs')?.addEventListener('click', () => { void loadSyncLogs(); });

document.getElementById('agentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('agentId').value;
  const treeSeqs = [...document.querySelectorAll('input[name=treeSeq]:checked')].map((c) => c.value);
  const body = {
    name: document.getElementById('agentName').value,
    phone: document.getElementById('agentPhone').value,
    username: document.getElementById('agentUsername').value,
    active: document.getElementById('agentActive').checked,
    treeSeqs
  };
  const pass = document.getElementById('agentPassword').value;
  if (pass) body.password = pass;

  if (id) {
    await api(`/api/admin/agents/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  } else {
    if (!pass) return alert('كلمة المرور مطلوبة');
    await api('/api/admin/agents', { method: 'POST', body: JSON.stringify(body) });
  }
  document.getElementById('agentModal').classList.add('hidden');
  loadAgents();
});

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

document.querySelectorAll('.quick-card[data-goto], .shortcut[data-goto]').forEach((btn) => {
  btn.addEventListener('click', () => showPage(btn.dataset.goto));
});

async function loadConfig() {
  const data = await api('/api/admin/config');
  const base = resolveApiBase() || data.serverUrl || window.ADMIN_CONFIG?.BACKEND_URL || '';
  const mobileUrl = data.mobileUrl || `${base}/m`;
  document.getElementById('mobileAppLink').href = mobileUrl;
  document.getElementById('mobileUrlDisplay').textContent = mobileUrl;

  const syncKeyEl = document.getElementById('syncApiKey');
  if (!localStorage.getItem('syncApiKey') && data.syncApiKey) {
    syncKeyEl.value = data.syncApiKey;
  }
  const defaultServer = (base || window.ADMIN_CONFIG?.DEFAULT_SYNC_SERVER || data.serverUrl || '').replace(/\/$/, '');
  applySyncServerUrl(resolveSyncServerUrl() || defaultServer);
  if (!localStorage.getItem('backendUrl')) {
    const backendEl = document.getElementById('backendUrl');
    if (backendEl && window.ADMIN_CONFIG?.BACKEND_URL) {
      backendEl.value = window.ADMIN_CONFIG.BACKEND_URL;
    }
  }
}

function saveBackendUrl() {
  const url = document.getElementById('backendUrl').value.trim().replace(/\/$/, '');
  if (!url) return alert('أدخل عنوان الباك اند');
  localStorage.setItem('backendUrl', url);
  location.reload();
}

async function refreshAll() {
  await checkBackendHealth();
  await loadConfig();
  await loadTrees();
  await loadSyncTrees();
  await loadEdariConnectionSettings();
  await loadDashboard();
  await loadAgents();
  await loadSyncLogs();
  await initAutoSync();
  initSyncLiveFeed();
}

const savedKey = localStorage.getItem('syncApiKey');
const savedBackend = localStorage.getItem('backendUrl');
if (savedKey) document.getElementById('syncApiKey').value = savedKey;
applySyncServerUrl(resolveSyncServerUrl());
if (savedBackend) document.getElementById('backendUrl').value = savedBackend;

document.getElementById('backendUrl')?.addEventListener('change', saveBackendUrl);
document.getElementById('backendUrl')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveBackendUrl();
});

document.getElementById('btnCopyMobileUrl').addEventListener('click', async () => {
  const url = document.getElementById('mobileUrlDisplay').textContent;
  try {
    await navigator.clipboard.writeText(url);
    alert('تم نسخ الرابط');
  } catch {
    prompt('انسخ الرابط:', url);
  }
});

document.getElementById('btnEdariSave')?.addEventListener('click', () => void saveEdariConnectionSettings());
document.getElementById('btnEdariTest')?.addEventListener('click', () => void testEdariConnectionSettings());
document.getElementById('btnEdariDiscover')?.addEventListener('click', () => void discoverEdariDatabases());
document.getElementById('edariDatabasePick')?.addEventListener('change', (e) => {
  const pick = e.target;
  const item = pick._items?.[Number(pick.value)];
  if (!item) return;
  const aliasEl = document.getElementById('edariAlias');
  const pathEl = document.getElementById('edariDatabasePath');
  if (aliasEl) aliasEl.value = item.name;
  if (pathEl) pathEl.value = item.path;
  setEdariConnStatus(`تم اختيار ${item.name}`, 'ok');
});

refreshAll();
