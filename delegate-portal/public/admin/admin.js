const API = resolveApiBase();

function resolveApiBase() {
  const saved = localStorage.getItem('backendUrl');
  if (saved) return saved.replace(/\/$/, '');

  const configured = String(window.ADMIN_CONFIG?.BACKEND_URL || '').trim();
  if (configured) {
    try {
      const cfgOrigin = new URL(configured).origin;
      if (window.location.origin && window.location.origin !== 'null' && window.location.origin === cfgOrigin) {
        return '';
      }
    } catch { /* ignore */ }
    return configured.replace(/\/$/, '');
  }

  return '';
}

function getBackendDisplayUrl() {
  return resolveApiBase() || window.location.origin || window.ADMIN_CONFIG?.BACKEND_URL || '—';
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
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function showPage(name) {
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === name));
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${name}`));
  if (name === 'trees') initExplorer();
}

async function loadDashboard() {
  const data = await api('/api/admin/dashboard');
  const { counts, last } = data;
  document.getElementById('dashStats').innerHTML = [
    ['حسابات', counts.accounts],
    ['حركات', counts.journal],
    ['مندوبون نشطون', counts.agents],
    ['شجرات', treesCache.length]
  ].map(([k, v]) => `<div class="stat-card"><div class="k">${k}</div><div class="v">${fmtNumAlways(v)}</div></div>`).join('');

  if (last) {
    const cls = last.status === 'success' ? 'ok' : last.status === 'error' ? 'off' : 'pending';
    document.getElementById('lastSyncInfo').innerHTML = `
      <span class="badge ${cls}">${last.status}</span>
      ${fmtDate(last.started_at)} — ${last.accounts_count || 0} حساب، ${last.journal_count || 0} حركة
      <br><span class="muted">${last.message || ''}</span>`;
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
    <button class="explorer-item${explorer.selectedTreeSeq === t.seq ? ' active' : ''}" data-seq="${esc(t.seq)}">
      <div class="item-top">
        <span class="acc-num">${esc(t.num)}</span>
        <span class="bal ${balClass(Number(t.bal))}">${fmtNumAlways(t.bal)}</span>
      </div>
      <div class="item-name">${esc(t.name1 || '—')}</div>
      <div class="item-sub">${t.sub_count || 0} فرع</div>
    </button>`).join('') || '<p class="empty-msg">—</p>';

  document.querySelectorAll('#explorerTrees .explorer-item').forEach((btn) => {
    btn.addEventListener('click', () => selectExplorerTree(btn.dataset.seq));
  });
}

function renderExplorerBranches() {
  const filtered = filterBranches(explorer.branches);
  document.getElementById('explorerBranchesMeta').textContent = explorer.branches.length
    ? `${filtered.length} من ${explorer.branches.length}`
    : 'اختر شجرة';

  document.getElementById('explorerBranches').innerHTML = filtered.map((b) => `
    <button class="explorer-item${explorer.selectedBranchSeq === b.seq ? ' active' : ''}" data-seq="${esc(b.seq)}">
      <div class="item-top">
        <span class="acc-num">${esc(b.num)}</span>
        <span class="bal ${balClass(Number(b.bal))}">${fmtNumAlways(b.bal)}</span>
      </div>
      <div class="item-name">${esc(b.name1 || '—')}</div>
      <div class="item-sub">${esc(b.summary?.label || b.debtStatus || '')}</div>
    </button>`).join('') || '<p class="empty-msg">لا توجد فروع</p>';

  document.querySelectorAll('#explorerBranches .explorer-item').forEach((btn) => {
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
        <strong>${fmtNumAlways(data.finalBalance ?? acc.bal)}</strong>
      </div>`;

    document.getElementById('explorerStmtCards').innerHTML = [
      ['إجمالي مدين', fmtNumAlways(data.totalDebit)],
      ['إجمالي دائن', fmtNumAlways(data.totalCredit)],
      ['الحالة', data.summary?.label || acc.debtStatus]
    ].map(([k, v]) => `<div class="stmt-card"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join('');

    const { lines, totalDebit, totalCredit, summary } = data;
    document.getElementById('explorerStmtMeta').textContent = `${lines.length} حركة • ${summary.label}`;

    document.getElementById('explorerStmtBody').innerHTML = lines.length
      ? lines.map((r) => `
        <tr>
          <td class="num">${fmtNum(r.debit)}</td>
          <td class="num">${fmtNum(r.credit)}</td>
          <td class="desc">${esc(r.description)}</td>
          <td>${fmtStmtDate(r.date)}</td>
          <td class="num ${balClass(r.balance)}">${fmtNumAlways(r.balance)}</td>
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
          <td class="num">${summary.side === 'debit' ? fmtNumAlways(summary.amount) : summary.amount === 0 ? '0' : ''}</td>
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
    document.querySelectorAll('#page-trees .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        explorer.branchFilter = chip.dataset.filter;
        document.querySelectorAll('#page-trees .chip').forEach((c) => c.classList.toggle('active', c === chip));
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
  document.getElementById('agentsBody').innerHTML = data.agents.map((a) => {
    const treeLabels = a.treeSeqs.map((seq) => {
      const t = treesCache.find((x) => x.seq === seq);
      return t ? `${t.num}` : seq;
    }).join(', ') || '—';
    return `
      <tr>
        <td>${a.name}</td>
        <td>${a.phone || '—'}</td>
        <td>${a.username}</td>
        <td>${treeLabels}</td>
        <td><span class="badge ${a.active ? 'ok' : 'off'}">${a.active ? 'نشط' : 'موقوف'}</span></td>
        <td>
          <button class="btn sm" data-edit="${a.id}">تعديل</button>
          <button class="btn sm danger" data-del="${a.id}">حذف</button>
        </td>
      </tr>`;
  }).join('') || '<tr><td colspan="6">لا يوجد مندوبون</td></tr>';

  document.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openAgentModal(Number(btn.dataset.edit)));
  });
  document.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف هذا المندوب؟')) return;
      await api(`/api/admin/agents/${btn.dataset.del}`, { method: 'DELETE' });
      loadAgents();
    });
  });
}

async function loadSyncLogs() {
  const data = await api('/api/admin/sync/logs');
  document.getElementById('syncLogsBody').innerHTML = (data.logs || []).map((l) => `
    <tr>
      <td>${l.id}</td>
      <td>${fmtDate(l.started_at)}</td>
      <td>${fmtDate(l.finished_at)}</td>
      <td><span class="badge ${l.status === 'success' ? 'ok' : l.status === 'error' ? 'off' : 'pending'}">${l.status}</span></td>
      <td>${l.accounts_count || 0}</td>
      <td>${l.journal_count || 0}</td>
      <td>${l.message || ''}</td>
    </tr>`).join('') || '<tr><td colspan="7">لا يوجد سجل</td></tr>';
}

function getSelectedSyncTreeSeqs() {
  return [...document.querySelectorAll('#syncTreeChecks input[name=syncTreeSeq]:checked')]
    .map((c) => c.value);
}

function saveSyncTreeSelection() {
  localStorage.setItem('syncTreeSeqs', JSON.stringify(getSelectedSyncTreeSeqs()));
}

function renderSyncTreeChecks(trees, selected = []) {
  const el = document.getElementById('syncTreeChecks');
  if (!el) return;
  if (!trees.length) {
    el.innerHTML = '<p class="muted">لا توجد شجرات — تأكد أن EdariNX يعمل أو ارفع بيانات كاملة مرة واحدة</p>';
    return;
  }
  el.innerHTML = trees.map((t) => `
    <label>
      <input type="checkbox" name="syncTreeSeq" value="${esc(t.seq)}" ${selected.includes(String(t.seq)) ? 'checked' : ''}>
      ${esc(t.num)} — ${esc(t.name1 || '')} (${t.sub_count || 0} فرع)
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
    <label>
      <input type="checkbox" name="treeSeq" value="${t.seq}" ${selected.includes(t.seq) ? 'checked' : ''}>
      ${t.num} — ${t.name1 || ''} (${t.sub_count} فرع)
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

async function runSync() {
  const serverUrl = document.getElementById('syncServerUrl').value.trim();
  const syncKey = document.getElementById('syncApiKey').value.trim();
  const treeSeqs = getSelectedSyncTreeSeqs();
  if (!treeSeqs.length) {
    alert('حدد شجرة واحدة على الأقل للرفع');
    return;
  }

  localStorage.setItem('syncServerUrl', serverUrl);
  localStorage.setItem('syncApiKey', syncKey);
  saveSyncTreeSelection();

  const prog = document.getElementById('syncProgress');
  const bar = document.getElementById('syncProgressBar');
  const step = document.getElementById('syncProgressStep');
  prog.classList.remove('hidden');
  if (bar) bar.style.width = '0%';
  if (step) step.textContent = 'الخطوة 1 من 6';
  applySyncProgressLine('جاري قراءة الحسابات من EdariNX...');

  let stopProgress = null;
  if (window.edariDesktop?.onSyncProgress) {
    stopProgress = window.edariDesktop.onSyncProgress((line) => {
      if (line) applySyncProgressLine(line);
    });
  }

  try {
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
  } catch (e) {
    applySyncProgressLine(`خطأ: ${e.message}`);
    if (bar) bar.style.width = '0%';
    alert(`فشل الرفع:\n${e.message}\n\nيمكنك تشغيل المزامنة يدوياً:\nnode sync-client/sync.js`);
  } finally {
    stopProgress?.();
    setTimeout(() => prog.classList.add('hidden'), 5000);
  }
}

document.getElementById('btnAddAgent').addEventListener('click', () => openAgentModal());
document.getElementById('agentCancel').addEventListener('click', () => document.getElementById('agentModal').classList.add('hidden'));
document.getElementById('btnSyncNow').addEventListener('click', runSync);
document.getElementById('btnSyncTreesAll')?.addEventListener('click', () => {
  document.querySelectorAll('#syncTreeChecks input[name=syncTreeSeq]').forEach((c) => { c.checked = true; });
  saveSyncTreeSelection();
});
document.getElementById('btnSyncTreesNone')?.addEventListener('click', () => {
  document.querySelectorAll('#syncTreeChecks input[name=syncTreeSeq]').forEach((c) => { c.checked = false; });
  saveSyncTreeSelection();
});
document.getElementById('btnSyncTreesReload')?.addEventListener('click', loadSyncTrees);

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
  const defaultServer = window.ADMIN_CONFIG?.DEFAULT_SYNC_SERVER || data.serverUrl || base;
  if (!localStorage.getItem('syncServerUrl') && defaultServer) {
    document.getElementById('syncServerUrl').value = defaultServer;
  }
  if (!localStorage.getItem('backendUrl')) {
    const backendEl = document.getElementById('backendUrl');
    if (backendEl && window.ADMIN_CONFIG?.BACKEND_URL) {
      backendEl.value = window.ADMIN_CONFIG.BACKEND_URL;
    }
  }
  const urlLabel = document.getElementById('backendUrlLabel');
  if (urlLabel) urlLabel.textContent = getBackendDisplayUrl();
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
  await loadDashboard();
  await loadAgents();
  await loadSyncLogs();
}

const savedUrl = localStorage.getItem('syncServerUrl');
const savedKey = localStorage.getItem('syncApiKey');
const savedBackend = localStorage.getItem('backendUrl');
if (savedUrl) document.getElementById('syncServerUrl').value = savedUrl;
if (savedKey) document.getElementById('syncApiKey').value = savedKey;
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

refreshAll();
