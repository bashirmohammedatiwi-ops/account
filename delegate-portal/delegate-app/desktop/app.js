const state = {
  trees: [],
  selectedTreeSeq: null,
  branches: [],
  selectedBranchSeq: null,
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

function setStatus(t) {
  document.getElementById('statusText').textContent = t;
}

function setOverlay(open, msg) {
  document.getElementById('overlay').classList.toggle('hidden', !open);
  if (msg) document.getElementById('overlayMsg').textContent = msg;
}

async function updateServerStatus() {
  const health = await window.delegateApp.health();
  document.getElementById('serverStatus').textContent = health.ok
    ? '● متصل بالسيرفر'
    : `● غير متصل — ${health.error || 'تحقق من السيرفر'}`;
  return health.ok;
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
    ? `${state.trees.length} شجرة متاحة`
    : 'لا توجد شجرات — تواصل مع الإدارة';

  document.getElementById('treesList').innerHTML = state.trees.map((t) => `
    <button class="tree-item${state.selectedTreeSeq === t.seq ? ' active' : ''}" data-seq="${esc(t.seq)}">
      <div class="tree-item-top">
        <span class="num">${esc(t.num)}</span>
        <span class="bal ${balClass(Number(t.bal))}">${fmtNumAlways(t.bal)}</span>
      </div>
      <div class="tree-name">${esc(t.name1 || '—')}</div>
      <div class="tree-meta">${t.directChildren || 0} زبون مباشر</div>
    </button>`).join('') || '<p class="empty">—</p>';

  document.querySelectorAll('.tree-item').forEach((btn) => {
    btn.addEventListener('click', () => selectTree(btn.dataset.seq));
  });
}

function renderBranchList() {
  const filtered = filterBranches(state.branches);
  document.getElementById('branchesMeta').textContent = `${filtered.length} من ${state.branches.length}`;

  document.getElementById('branchList').innerHTML = filtered.map((b) => `
    <button class="branch-item${state.selectedBranchSeq === b.seq ? ' active' : ''}" data-seq="${esc(b.seq)}">
      <div class="branch-top">
        <span class="num">${esc(b.num)}</span>
        <span class="bal ${balClass(Number(b.bal))}">${fmtNumAlways(b.bal)}</span>
      </div>
      <div class="branch-name">${esc(b.name1 || '—')}</div>
      <div class="branch-sub">${esc(b.summary?.label || b.debtStatus || '')}</div>
    </button>`).join('') || '<p class="empty">لا توجد فروع</p>';

  document.querySelectorAll('.branch-item').forEach((btn) => {
    btn.addEventListener('click', () => selectBranch(btn.dataset.seq));
  });
}

async function selectTree(seq) {
  state.selectedTreeSeq = seq;
  state.selectedBranchSeq = null;
  const tree = state.trees.find((t) => t.seq === seq);
  document.getElementById('branchesTitle').textContent = tree ? `زبائن: ${tree.name1}` : 'الزبائن';
  renderTrees();
  setOverlay(true, 'جاري تحميل الزبائن...');

  try {
    const data = await window.delegateApp.children(seq);
    state.branches = data.children || [];
    renderBranchList();
    document.getElementById('detailEmpty').classList.remove('hidden');
    document.getElementById('detailContent').classList.add('hidden');
    if (state.branches.length) await selectBranch(state.branches[0].seq);
  } catch (e) {
    setStatus(e.message);
  } finally {
    setOverlay(false);
  }
}

async function selectBranch(seq) {
  state.selectedBranchSeq = seq;
  let branch = state.branches.find((b) => String(b.seq) === String(seq));
  if (!branch) branch = { seq, num: '—', name1: '—' };
  renderBranchList();
  document.getElementById('detailEmpty').classList.add('hidden');
  document.getElementById('detailContent').classList.remove('hidden');
  document.getElementById('stmtBody').innerHTML = '<tr><td colspan="5" class="loading">جاري التحميل...</td></tr>';
  document.getElementById('stmtFoot').innerHTML = '';

  try {
    const branch = state.branches.find((b) => String(b.seq) === String(seq)) || { seq };
    const data = await window.delegateApp.statement(seq);
    const acc = data.account || branch;

    document.getElementById('detailHeader').innerHTML = `
      <div><h3>${esc(acc.name1)}</h3><p>${esc(acc.num)} ${acc.address ? '• ' + esc(acc.address) : ''}</p></div>
      <div class="hdr-bal ${balClass(Number(acc.bal))}"><span>${esc(acc.debtStatus)}</span><strong>${fmtNumAlways(acc.bal)}</strong></div>`;

    document.getElementById('detailCards').innerHTML = [
      ['إجمالي 1', fmtNumAlways(branch?.tot1)],
      ['إجمالي 2', fmtNumAlways(branch?.tot2)],
      ['الحالة', branch?.summary?.label || acc.debtStatus]
    ].map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join('');

    const { lines, totalDebit, totalCredit, summary } = data;
    document.getElementById('stmtMeta').textContent = `${lines.length} حركة • ${summary.label}`;

    document.getElementById('stmtBody').innerHTML = lines.length
      ? lines.map((r) => `
        <tr>
          <td class="num">${fmtNum(r.debit)}</td>
          <td class="num">${fmtNum(r.credit)}</td>
          <td class="desc">${esc(r.description)}</td>
          <td>${fmtDate(r.date)}</td>
          <td class="num ${balClass(r.balance)}">${fmtNumAlways(r.balance)}</td>
        </tr>`).join('')
      : '<tr><td colspan="5">لا توجد حركات</td></tr>';

    document.getElementById('stmtFoot').innerHTML = lines.length
      ? `<tr class="totals"><td class="num">${fmtNumAlways(totalDebit)}</td><td class="num">${fmtNumAlways(totalCredit)}</td><td colspan="2"><strong>المجموع</strong></td><td></td></tr>
         <tr class="final"><td class="num">${summary.side === 'debit' ? fmtNumAlways(summary.amount) : summary.amount === 0 ? '0' : ''}</td>
         <td class="num">${summary.side === 'credit' ? fmtNumAlways(summary.amount) : ''}</td>
         <td colspan="2"><strong>${esc(summary.label)}</strong></td><td></td></tr>`
      : '';

    setStatus(`${acc.name1} (${acc.num})`);
  } catch (e) {
    setStatus(e.message);
    document.getElementById('stmtBody').innerHTML = `<tr><td colspan="5">${esc(e.message)}</td></tr>`;
  }
}

async function loadTrees() {
  setOverlay(true, 'جاري التحميل...');
  try {
    const data = await window.delegateApp.trees();
    state.trees = data.trees || [];
    renderTrees();
    if (state.trees.length) await selectTree(state.trees[0].seq);
  } finally {
    setOverlay(false);
  }
}

async function connectAndLoad() {
  const serverUrl = document.getElementById('serverUrl').value.trim();
  await window.delegateApp.setServer(serverUrl);
  const ok = await updateServerStatus();
  if (!ok) {
    setStatus('تعذّر الاتصال بالسيرفر');
    return;
  }
  await loadTrees();
}

async function init() {
  document.getElementById('btnConnect').addEventListener('click', connectAndLoad);
  document.getElementById('btnRefresh').addEventListener('click', connectAndLoad);
  window.delegateApp.onRefresh(() => {
    if (state.selectedTreeSeq) selectTree(state.selectedTreeSeq);
    else connectAndLoad();
  });

  document.getElementById('branchSearch').addEventListener('input', (e) => {
    state.branchSearch = e.target.value;
    renderBranchList();
  });

  document.querySelectorAll('.chip').forEach((c) => {
    c.addEventListener('click', () => {
      state.branchFilter = c.dataset.filter;
      document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === c));
      renderBranchList();
    });
  });

  let searchTimer;
  document.getElementById('globalSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const q = e.target.value.trim();
      if (!q || q.length < 2) return;
      try {
        const data = await window.delegateApp.search(q);
        if (data.results?.length === 1) {
          await selectBranch(data.results[0].seq);
        } else if (data.results?.length > 1) {
          state.branches = data.results.map((r) => ({
            seq: r.seq, num: r.num, name1: r.name1, bal: r.bal,
            debtStatus: r.debtStatus, summary: { label: r.debtStatus }
          }));
          renderBranchList();
          setStatus(`${data.results.length} نتيجة`);
        }
      } catch (ex) {
        setStatus(ex.message);
      }
    }, 350);
  });

  const cfg = await window.delegateApp.config();
  if (cfg.serverUrl) document.getElementById('serverUrl').value = cfg.serverUrl;
  await connectAndLoad();
}

init();
