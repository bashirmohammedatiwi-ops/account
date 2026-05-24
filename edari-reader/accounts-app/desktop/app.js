const state = {
  labels: null,
  selectedSeq: null,
  selectedBranchSeq: null,
  search: '',
  allAccounts: [],
  branches: [],
  branchFilter: 'all',
  branchSearch: ''
};

const STMT_HEAD = ['مدين', 'دائن', 'البيان', 'التاريخ', 'حركة الرصيد'];

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
  if (!v || String(v).startsWith('12/30/1899')) return '';
  const d = new Date(String(v).replace(' 00:00:00', ''));
  if (Number.isNaN(d.getTime())) return esc(String(v).replace(' 00:00:00', ''));
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmtBool(v) {
  if (v === true || v === 'True' || v === '1') return 'نعم';
  if (v === false || v === 'False' || v === '0') return 'لا';
  return esc(v) || '—';
}

function balanceClass(balance) {
  if (balance < 0) return 'debt-debit';
  if (balance > 0) return 'debt-credit';
  return 'balanced';
}

function debtClass(status) {
  if (String(status).includes('مدين')) return 'debt-debit';
  if (String(status).includes('دائن')) return 'debt-credit';
  return 'balanced';
}

function setStatus(t) {
  document.getElementById('statusText').textContent = t;
}

function setOverlay(open, msg, title) {
  const el = document.getElementById('loadOverlay');
  el.classList.toggle('open', open);
  if (title) document.getElementById('loadTitle').textContent = title;
  if (msg) document.getElementById('loadMsg').textContent = msg;
}

function activateView(name) {
  document.querySelectorAll('.view-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.view === name);
    t.classList.toggle('hidden', false);
  });
  document.querySelectorAll('.view-pane').forEach((p) => {
    p.classList.toggle('active', p.id === `view-${name}`);
  });
}

function buildTreeHtml(accounts, parentSeq = '0') {
  const children = accounts.filter((a) => String(a.Master) === String(parentSeq));
  let html = '';
  for (const node of children) {
    const name = `${node.Name1 || ''} ${node.Name2 || ''}`.trim();
    const bal = Number(node.Bal || 0);
    const hasSub = Number(node.SubCount) > 0;
    const sub = hasSub ? buildTreeHtml(accounts, node.Seq) : '';
    html += `
      <div class="tree-node" data-seq="${esc(node.Seq)}">
        <div class="tree-node-row">
          <span class="tree-icon">${hasSub ? '📁' : '👤'}</span>
          <div class="tree-node-body">
            <div class="name">${esc(name || '—')}</div>
            <div class="meta">
              <span class="num-badge">${esc(node.Num)}</span>
              <span class="num ${balanceClass(bal)}">${fmtNumAlways(node.Bal)}</span>
              ${hasSub ? `<span class="sub-badge">${node.SubCount} فرع</span>` : ''}
            </div>
          </div>
        </div>
      </div>`;
    if (sub) html += `<div class="tree-children">${sub}</div>`;
  }
  return html;
}

function formatFieldValue(key, val) {
  if (val === null || val === undefined || val === '') return '—';
  if (['Bal', 'Tot1', 'Tot2', 'CBal', 'CTot1', 'CTot2', 'BalSee', 'FixBal', 'FrstStck', 'Budjet', 'Cieling', 'ExpectedPayment', 'AgentComm'].includes(key)) {
    return `<span class="num">${fmtNumAlways(val)}</span>`;
  }
  if (['FixDate', 'FixTime'].includes(key)) return fmtDate(val) || '—';
  if (['Dept', 'CloseAcc', 'CloseMatAcc', 'HideSubs', 'HideDay', 'HideName', 'Thurs'].includes(key)) return fmtBool(val);
  if (key === 'DebtStatus') return `<span class="${debtClass(val)}">${esc(val)}</span>`;
  return esc(val);
}

async function renderBreadcrumb(seq) {
  const path = await window.accountsApp.path(seq);
  document.getElementById('breadcrumb').innerHTML = path.map((p, i) => {
    const isLast = i === path.length - 1;
    return `${i ? '<span class="sep">›</span>' : ''}<button class="crumb${isLast ? ' current' : ''}" data-seq="${esc(p.Seq)}">${esc(p.Name1 || p.Num)} <small>${esc(p.Num)}</small></button>`;
  }).join('');

  document.querySelectorAll('#breadcrumb .crumb:not(.current)').forEach((btn) => {
    btn.addEventListener('click', () => selectAccount(btn.dataset.seq));
  });
}

function renderAccountBanner(acc) {
  const el = document.getElementById('accountBanner');
  el.classList.remove('empty');
  const bal = Number(acc.Bal || 0);
  el.innerHTML = `
    <div class="banner-icon">${Number(acc.SubCount) > 0 ? '📁' : '👤'}</div>
    <div class="banner-body">
      <h2>${esc(acc.Name1)}</h2>
      <div class="banner-tags">
        <span class="tag">رقم ${esc(acc.Num)}</span>
        <span class="tag">Seq ${esc(acc.Seq)}</span>
        ${acc.Address ? `<span class="tag">📍 ${esc(acc.Address)}</span>` : ''}
        ${Number(acc.SubCount) > 0 ? `<span class="tag accent">${acc.SubCount} فرع</span>` : ''}
      </div>
    </div>
    <div class="banner-balance ${balanceClass(bal)}">
      <div class="balance-label">${esc(acc.DebtStatus)}</div>
      <div class="balance-value">${fmtNumAlways(Math.abs(bal) || 0)}</div>
    </div>`;
}

function filterBranches(list) {
  const q = state.branchSearch.trim().toLowerCase();
  return list.filter((b) => {
    const name = `${b.Name1 || ''} ${b.Name2 || ''}`.trim().toLowerCase();
    const num = String(b.Num || '');
    if (q && !name.includes(q) && !num.includes(q) && !String(b.Address || '').toLowerCase().includes(q)) return false;
    const bal = Number(b.Bal || 0);
    if (state.branchFilter === 'debit' && bal >= 0) return false;
    if (state.branchFilter === 'credit' && bal <= 0) return false;
    if (state.branchFilter === 'moves') {
      const hasActivity = Number(b.Bal) !== 0 || Number(b.Tot1) !== 0 || Number(b.Tot2) !== 0;
      if (!hasActivity) return false;
    }
    return true;
  });
}

function renderBranchList() {
  const filtered = filterBranches(state.branches);
  document.getElementById('branchesMeta').textContent = state.branches.length
    ? `معروض ${filtered.length} من ${state.branches.length} فرع`
    : '—';

  if (!filtered.length) {
    document.getElementById('branchList').innerHTML = '<div class="empty-list">لا توجد فروع مطابقة</div>';
    return;
  }

  document.getElementById('branchList').innerHTML = filtered.map((b) => {
    const bal = Number(b.Bal || 0);
    const active = String(b.Seq) === String(state.selectedBranchSeq);
    return `
      <button class="branch-item${active ? ' active' : ''}" data-seq="${esc(b.Seq)}">
        <div class="branch-item-top">
          <span class="branch-num">${esc(b.Num)}</span>
          <span class="branch-balance num ${balanceClass(bal)}">${fmtNumAlways(bal)}</span>
        </div>
        <div class="branch-name">${esc(b.Name1 || '—')}</div>
        <div class="branch-item-bottom">
          <span class="${debtClass(b.summary?.label || b.DebtStatus)}">${esc(b.summary?.label || b.DebtStatus)}</span>
          ${Number(b.Tot1) || Number(b.Tot2) ? `<span class="move-badge">${fmtNumAlways(Number(b.Tot1) + Number(b.Tot2))} مجمع</span>` : '<span class="move-badge muted">—</span>'}
        </div>
      </button>`;
  }).join('');

  document.querySelectorAll('#branchList .branch-item').forEach((btn) => {
    btn.addEventListener('click', () => selectBranch(btn.dataset.seq));
  });
}

function renderStatementTable(data) {
  const { account, lines, totalDebit, totalCredit, summary } = data;
  document.getElementById('statementMeta').textContent = lines.length
    ? `${lines.length} حركة • ${summary.label}${summary.amount ? ` ${fmtNumAlways(summary.amount)}` : ''}`
    : 'لا توجد حركات';

  document.getElementById('statementHead').innerHTML = `<tr>${STMT_HEAD.map((h) => `<th>${h}</th>`).join('')}</tr>`;
  document.getElementById('statementBody').innerHTML = lines.length
    ? lines.map((row) => `
      <tr>
        <td class="num col-debit">${fmtNum(row.debit)}</td>
        <td class="num col-credit">${fmtNum(row.credit)}</td>
        <td class="col-desc">${esc(row.description)}</td>
        <td class="col-date">${fmtDate(row.date)}</td>
        <td class="num col-balance ${balanceClass(row.balance)}">${fmtNumAlways(row.balance)}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="empty-cell">لا توجد حركات مسجلة</td></tr>`;

  document.getElementById('statementFoot').innerHTML = lines.length
    ? `<tr class="totals-row">
        <td class="num">${fmtNumAlways(totalDebit)}</td>
        <td class="num">${fmtNumAlways(totalCredit)}</td>
        <td colspan="2"><strong>المجموع</strong></td>
        <td></td>
      </tr>
      <tr class="final-row">
        <td class="num">${summary.side === 'debit' ? fmtNumAlways(summary.amount) : summary.amount === 0 ? '0' : ''}</td>
        <td class="num">${summary.side === 'credit' ? fmtNumAlways(summary.amount) : ''}</td>
        <td colspan="2"><strong>${esc(summary.label)} ${esc(account.Name1 || '')}</strong></td>
        <td></td>
      </tr>`
    : '';
}

async function selectBranch(seq) {
  state.selectedBranchSeq = seq;
  renderBranchList();

  document.getElementById('branchPlaceholder').classList.add('hidden');
  document.getElementById('branchDetail').classList.remove('hidden');

  const acc = await window.accountsApp.get(seq);
  if (!acc) return;

  const bal = Number(acc.Bal || 0);
  document.getElementById('branchDetailHeader').innerHTML = `
    <div>
      <h3>${esc(acc.Name1)}</h3>
      <p class="detail-sub">${esc(acc.AccountTitle || acc.Num)}</p>
    </div>
    <div class="detail-header-balance ${balanceClass(bal)}">
      <span>${esc(acc.DebtStatus)}</span>
      <strong class="num">${fmtNumAlways(bal)}</strong>
    </div>`;

  document.getElementById('branchDetailCards').innerHTML = [
    ['الرقم', acc.Num],
    ['العنوان', acc.Address || '—'],
    ['إجمالي 1', fmtNumAlways(acc.Tot1)],
    ['إجمالي 2', fmtNumAlways(acc.Tot2)],
    ['تاريخ التثبيت', fmtDate(acc.FixDate) || '—'],
    ['ملاحظات', acc.Remarks || '—']
  ].map(([k, v]) => `<div class="mini-card"><div class="k">${k}</div><div class="v">${typeof v === 'string' && v.includes('num') ? v : esc(v)}</div></div>`).join('');

  document.getElementById('statementBody').innerHTML = '<tr><td colspan="5" class="loading-cell">جاري تحميل كشف الحساب...</td></tr>';
  document.getElementById('statementFoot').innerHTML = '';

  const stmt = await window.accountsApp.statement(seq);
  if (stmt) renderStatementTable(stmt);
  setStatus(`فرع: ${acc.Name1} (${acc.Num})`);
}

async function loadBranchesForAccount(acc) {
  if (Number(acc.SubCount) > 0) {
    state.branches = await window.accountsApp.childrenMeta(acc.Seq);
  } else {
    state.branches = [{ ...acc, summary: { label: acc.DebtStatus } }];
  }

  state.branchSearch = '';
  state.branchFilter = 'all';
  document.getElementById('branchSearch').value = '';
  document.querySelectorAll('.chip-btn').forEach((b) => b.classList.toggle('active', b.dataset.filter === 'all'));

  renderBranchList();

  const targetSeq = Number(acc.SubCount) > 0
    ? (state.branches[0]?.Seq || null)
    : acc.Seq;

  if (targetSeq) await selectBranch(targetSeq);
  else {
    document.getElementById('branchPlaceholder').classList.remove('hidden');
    document.getElementById('branchDetail').classList.add('hidden');
  }
}

async function renderInfoSections(acc) {
  document.getElementById('accountSections').innerHTML = Object.values(state.labels.sections).map((sec) => {
    const fields = Object.entries(sec.fields).map(([key, label]) => {
      const val = acc[key];
      if (val === null || val === undefined || val === '') return '';
      return `<div class="field"><div class="k">${label}</div><div class="v">${formatFieldValue(key, val)}</div></div>`;
    }).filter(Boolean).join('');
    if (!fields) return '';
    return `<div class="section"><h4>${sec.title}</h4><div class="grid">${fields}</div></div>`;
  }).join('');
}

async function renderGroupSummary(acc) {
  const el = document.getElementById('groupSummary');
  if (Number(acc.SubCount) === 0) {
    el.innerHTML = '<div class="empty-list">هذا حساب نهائي — لا يوجد ملخص مجموعة</div>';
    return;
  }

  el.innerHTML = '<div class="loading-cell">جاري حساب ملخص المجموعة...</div>';
  const summary = await window.accountsApp.groupSummary(acc.Seq);
  if (!summary) return;

  el.innerHTML = `
    <div class="group-hero">
      <h3>${esc(summary.reportTitle)}</h3>
      <p>${summary.customerCount} فرع/زبون • ${summary.withBalance} برصيد</p>
    </div>
    <div class="group-stats">
      <div class="group-stat debit"><div class="k">إجمالي مدين</div><div class="v num">${fmtNumAlways(summary.totalDebit)}</div></div>
      <div class="group-stat credit"><div class="k">إجمالي دائن</div><div class="v num">${fmtNumAlways(summary.totalCredit)}</div></div>
      <div class="group-stat"><div class="k">عدد الفروع</div><div class="v">${summary.customerCount}</div></div>
    </div>
    <div class="table-scroll">
      <table>
        <thead><tr><th>الرقم</th><th>الاسم</th><th>الرصيد</th><th>الحالة</th><th>إجمالي</th><th>العنوان</th></tr></thead>
        <tbody>${summary.children.map((c) => `
          <tr data-seq="${esc(c.Seq)}" class="click-row">
            <td>${esc(c.Num)}</td>
            <td>${esc(c.Name1)}</td>
            <td class="num ${balanceClass(Number(c.Bal))}">${fmtNumAlways(c.Bal)}</td>
            <td class="${debtClass(c.summary?.label)}">${esc(c.summary?.label)}</td>
            <td class="num">${fmtNumAlways(Number(c.Tot1) + Number(c.Tot2))}</td>
            <td>${esc(c.Address || '—')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  document.querySelectorAll('#groupSummary .click-row').forEach((tr) => {
    tr.addEventListener('click', async () => {
      await selectBranch(tr.dataset.seq);
      activateView('branches');
    });
  });
}

async function selectAccount(seq) {
  state.selectedSeq = seq;
  state.selectedBranchSeq = null;

  document.querySelectorAll('#accountsTree .tree-node').forEach((n) => {
    n.classList.toggle('active', n.dataset.seq === String(seq));
  });

  const acc = await window.accountsApp.get(seq);
  if (!acc) return;

  renderAccountBanner(acc);
  await renderBreadcrumb(seq);
  await renderInfoSections(acc);

  const hasBranches = Number(acc.SubCount) > 0;
  document.querySelector('[data-view="group"]').classList.toggle('hidden', !hasBranches);
  activateView('branches');

  await loadBranchesForAccount(acc);
  renderGroupSummary(acc);

  setStatus(`حساب: ${acc.Name1} (${acc.Num})`);
}

async function renderStats() {
  const stats = await window.accountsApp.stats();
  if (!stats) return;
  document.getElementById('statsRow').innerHTML = [
    ['إجمالي الحسابات', stats.total, ''],
    ['حسابات رئيسية', stats.roots, ''],
    ['حسابات نهائية', stats.leaves, ''],
    ['إجمالي مدين', fmtNumAlways(stats.totalDebit), 'debit'],
    ['إجمالي دائن', fmtNumAlways(stats.totalCredit), 'credit']
  ].map(([k, v, cls]) => `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
}

async function renderTree() {
  let accounts = state.allAccounts;
  if (state.search) accounts = await window.accountsApp.filter(state.search);

  if (!accounts.length) {
    document.getElementById('treeMeta').textContent = '0';
    document.getElementById('accountsTree').innerHTML = '<div class="empty-list">لا توجد بيانات</div>';
    return;
  }

  const html = state.search
    ? accounts.map((node) => {
      const name = `${node.Name1 || ''} ${node.Name2 || ''}`.trim();
      return `
        <div class="tree-node" data-seq="${esc(node.Seq)}">
          <div class="tree-node-row">
            <span class="tree-icon">🔍</span>
            <div class="tree-node-body">
              <div class="name">${esc(name || '—')}</div>
              <div class="meta"><span class="num-badge">${esc(node.Num)}</span> ${esc(node.ParentName || '')}</div>
            </div>
          </div>
        </div>`;
    }).join('')
    : buildTreeHtml(accounts, '0');

  document.getElementById('treeMeta').textContent = state.search ? accounts.length : state.allAccounts.length;
  document.getElementById('accountsTree').innerHTML = html;

  document.querySelectorAll('#accountsTree .tree-node').forEach((n) => {
    n.addEventListener('click', (e) => {
      e.stopPropagation();
      selectAccount(n.dataset.seq);
    });
  });
}

async function loadAll() {
  setOverlay(true, 'جاري تحميل دليل الحسابات...', 'تحميل البيانات');
  const off = window.accountsApp.onProgress((p) => {
    if (p.message) setOverlay(true, p.message, 'تحميل البيانات');
  });
  try {
    state.allAccounts = await window.accountsApp.load();
    await renderStats();
    await renderTree();
    setStatus(`تم تحميل ${state.allAccounts.length} حساب`);
    setTimeout(() => setOverlay(false), 400);
  } catch (e) {
    setOverlay(true, e.message, 'خطأ');
    setStatus(e.message);
  } finally {
    off();
  }
}

async function exportCsv() {
  if (!state.allAccounts.length) return;
  const keys = Object.keys(state.allAccounts[0]);
  const lines = [keys.join(',')];
  for (const row of state.allAccounts) {
    lines.push(keys.map((k) => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(','));
  }
  const res = await window.accountsApp.exportCsv({ name: 'accounts-full.csv', content: lines.join('\n') });
  if (res.ok) setStatus(`تم الحفظ: ${res.filePath}`);
}

function initViews() {
  document.querySelectorAll('.view-tab').forEach((tab) => {
    tab.addEventListener('click', () => activateView(tab.dataset.view));
  });

  document.querySelectorAll('.chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.branchFilter = btn.dataset.filter;
      document.querySelectorAll('.chip-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderBranchList();
    });
  });

  document.getElementById('branchSearch').addEventListener('input', (e) => {
    state.branchSearch = e.target.value;
    renderBranchList();
  });
}

async function init() {
  initViews();
  state.labels = await window.accountsApp.labels();

  const status = await window.accountsApp.status();
  const badge = document.getElementById('connBadge');
  badge.textContent = status.drivers?.hasDriver ? `● ${status.drivers.installed[0]}` : '● ODBC غير متوفر';
  badge.classList.toggle('ok', status.drivers?.hasDriver);

  document.getElementById('btnReload').addEventListener('click', () => loadAll());
  document.getElementById('btnExport').addEventListener('click', () => exportCsv());
  window.accountsApp.onRefresh(() => loadAll());

  let timer;
  document.getElementById('globalSearch').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      state.search = e.target.value;
      await renderTree();
    }, 250);
  });

  document.getElementById('quickNum').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const num = e.target.value.trim();
    if (!num) return;
    const acc = await window.accountsApp.byNum(num);
    if (acc) {
      state.search = '';
      document.getElementById('globalSearch').value = '';
      await renderTree();
      await selectAccount(acc.Seq);
      document.querySelector(`#accountsTree .tree-node[data-seq="${acc.Seq}"]`)?.scrollIntoView({ block: 'nearest' });
    } else {
      setStatus(`لم يُعثر على حساب برقم ${num}`);
    }
  });

  if (status.drivers?.hasDriver) await loadAll();
  else setStatus('ثبّت Devart ODBC Driver for NexusDB');
}

init();
