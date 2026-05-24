const API = '/api/delegate';

const state = {
  trees: [],
  selectedTreeSeq: null,
  customers: [],
  selectedCustomerSeq: null,
  filter: 'all'
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
  document.getElementById('statusBar').textContent = t;
}

function setOverlay(open) {
  document.getElementById('overlay').classList.toggle('hidden', !open);
}

async function api(path) {
  const res = await fetch(`${API}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.id === `pane-${name}`));
}

function filterCustomers(list) {
  return list.filter((c) => {
    const bal = Number(c.bal || 0);
    if (state.filter === 'debit' && bal >= 0) return false;
    if (state.filter === 'credit' && bal <= 0) return false;
    return true;
  });
}

function renderTrees() {
  document.getElementById('treesMeta').textContent = state.trees.length
    ? `${state.trees.length} شجرة`
    : 'لا توجد شجرات — ارفع البيانات من لوحة التحكم';

  document.getElementById('treesList').innerHTML = state.trees.map((t) => `
    <button class="tree-item${state.selectedTreeSeq === t.seq ? ' active' : ''}" data-seq="${esc(t.seq)}">
      <div class="item-top">
        <span class="num">${esc(t.num)}</span>
        <span class="bal ${balClass(Number(t.bal))}">${fmtNumAlways(t.bal)}</span>
      </div>
      <div class="item-name">${esc(t.name1 || '—')}</div>
      <div class="item-sub">${t.directChildren || 0} زبون مباشر</div>
    </button>`).join('') || '<p class="empty">—</p>';

  document.querySelectorAll('.tree-item').forEach((btn) => {
    btn.addEventListener('click', () => selectTree(btn.dataset.seq));
  });
}

function renderCustomers() {
  const filtered = filterCustomers(state.customers);
  document.getElementById('customersMeta').textContent = state.customers.length
    ? `${filtered.length} من ${state.customers.length} زبون`
    : 'اختر شجرة أولاً';

  document.getElementById('customersList').innerHTML = filtered.map((c) => `
    <button class="customer-item${state.selectedCustomerSeq === c.seq ? ' active' : ''}" data-seq="${esc(c.seq)}">
      <div class="item-top">
        <span class="num">${esc(c.num)}</span>
        <span class="bal ${balClass(Number(c.bal))}">${fmtNumAlways(c.bal)}</span>
      </div>
      <div class="item-name">${esc(c.name1 || '—')}</div>
      <div class="item-sub">${esc(c.summary?.label || c.debtStatus || '')}</div>
    </button>`).join('') || '<p class="empty">لا يوجد زبائن</p>';

  document.querySelectorAll('.customer-item').forEach((btn) => {
    btn.addEventListener('click', () => selectCustomer(btn.dataset.seq));
  });
}

async function selectTree(seq) {
  state.selectedTreeSeq = seq;
  state.selectedCustomerSeq = null;
  renderTrees();
  setOverlay(true);

  try {
    const data = await api(`/accounts/${encodeURIComponent(seq)}/children`);
    state.customers = data.children || [];
    renderCustomers();
    showTab('customers');
    if (state.customers.length) await selectCustomer(state.customers[0].seq);
  } catch (e) {
    setStatus(e.message);
  } finally {
    setOverlay(false);
  }
}

async function selectCustomer(seq) {
  state.selectedCustomerSeq = seq;
  renderCustomers();
  showTab('statement');

  document.getElementById('stmtEmpty').classList.add('hidden');
  document.getElementById('stmtContent').classList.remove('hidden');
  document.getElementById('stmtBody').innerHTML = '<tr><td colspan="5">جاري التحميل...</td></tr>';
  document.getElementById('stmtFoot').innerHTML = '';
  document.getElementById('stmtSummary').innerHTML = '';

  const customer = state.customers.find((c) => String(c.seq) === String(seq)) || { seq };

  try {
    const data = await api(`/accounts/${encodeURIComponent(seq)}/statement`);
    const acc = data.account || customer;

    document.getElementById('stmtHeader').innerHTML = `
      <div>
        <h3>${esc(acc.name1)}</h3>
        <p>${esc(acc.num)}${acc.address ? ' • ' + esc(acc.address) : ''}</p>
      </div>
      <div class="hdr-bal ${balClass(Number(acc.bal))}">
        <span>${esc(acc.debtStatus)}</span>
        <strong>${fmtNumAlways(acc.bal)}</strong>
      </div>`;

    document.getElementById('stmtSummary').innerHTML = [
      ['إجمالي 1', fmtNumAlways(customer.tot1)],
      ['إجمالي 2', fmtNumAlways(customer.tot2)],
      ['الحالة', customer.summary?.label || acc.debtStatus]
    ].map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join('');

    const { lines, totalDebit, totalCredit, summary } = data;
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

    setStatus(`${acc.name1} (${acc.num}) • ${lines.length} حركة`);
  } catch (e) {
    setStatus(e.message);
    document.getElementById('stmtBody').innerHTML = `<tr><td colspan="5">${esc(e.message)}</td></tr>`;
  }
}

async function loadTrees() {
  setOverlay(true);
  try {
    const data = await api('/trees');
    state.trees = data.trees || [];
    renderTrees();
    if (state.trees.length && !state.selectedTreeSeq) {
      await selectTree(state.trees[0].seq);
    }
  } catch (e) {
    setStatus(`خطأ: ${e.message}`);
  } finally {
    setOverlay(false);
  }
}

async function refresh() {
  if (state.selectedCustomerSeq) {
    await selectCustomer(state.selectedCustomerSeq);
  } else if (state.selectedTreeSeq) {
    await selectTree(state.selectedTreeSeq);
  } else {
    await loadTrees();
  }
}

function init() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  });

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.filter = chip.dataset.filter;
      document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
      renderCustomers();
    });
  });

  document.getElementById('btnRefresh').addEventListener('click', refresh);

  let searchTimer;
  document.getElementById('globalSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const q = e.target.value.trim();
      if (!q || q.length < 2) return;
      try {
        const data = await api(`/search?q=${encodeURIComponent(q)}`);
        if (!data.results?.length) {
          setStatus('لا توجد نتائج');
          return;
        }
        state.customers = data.results.map((r) => ({
          seq: r.seq,
          num: r.num,
          name1: r.name1,
          bal: r.bal,
          debtStatus: r.debtStatus,
          summary: { label: r.debtStatus }
        }));
        renderCustomers();
        showTab('customers');
        if (data.results.length === 1) await selectCustomer(data.results[0].seq);
        else setStatus(`${data.results.length} نتيجة`);
      } catch (ex) {
        setStatus(ex.message);
      }
    }, 350);
  });

  loadTrees();
}

init();
