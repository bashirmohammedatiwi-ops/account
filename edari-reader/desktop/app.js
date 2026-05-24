const state = {
  view: 'overview',
  fieldLabels: null,
  matPath: [{ seq: '0', name: 'الجذر' }],
  matParent: '0',
  pages: {
    materials: { page: 1, search: '' },
    accounts: { page: 1, search: '' },
    invoices: { page: 1, search: '' },
    receipts: { search: '' },
    journal: { search: '' }
  },
  live: {
    receipts: { cursor: '', stack: [''] },
    journal: { cursor: '', stack: [''] }
  },
  accounts: [],
  selectedAccountSeq: null
};

const PAGE_SIZE = 100;

const sectionLabels = {
  stats: 'الإحصائيات',
  accounts: 'الحسابات',
  cash: 'مستخدمي الصندوق',
  materialGroups: 'تصنيفات المواد',
  items: 'الأصناف',
  invoices: 'الفواتير',
  receipts: 'إيصالات POS',
  journal: 'القيود'
};

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmtNum(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return esc(v);
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtDate(v) {
  if (!v) return '—';
  return esc(String(v).replace(' 00:00:00', ''));
}

function setStatus(text, progress = '') {
  document.getElementById('statusText').textContent = text;
  document.getElementById('statusProgress').textContent = progress;
  document.getElementById('statusTime').textContent = new Date().toLocaleTimeString('ar-IQ');
}

async function ensureLabels() {
  if (state.fieldLabels) return;
  state.fieldLabels = await window.edari.fieldLabels();
}

function renderPager(containerId, section, result, onPage) {
  const el = document.getElementById(containerId);
  if (!result.total) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `
    <button class="btn" data-p="prev" ${result.page <= 1 ? 'disabled' : ''}>السابق</button>
    <span>صفحة ${result.page} / ${result.pages} (${result.total.toLocaleString('en-US')} سجل)</span>
    <button class="btn" data-p="next" ${result.page >= result.pages ? 'disabled' : ''}>التالي</button>`;
  el.querySelector('[data-p="prev"]')?.addEventListener('click', () => onPage(result.page - 1));
  el.querySelector('[data-p="next"]')?.addEventListener('click', () => onPage(result.page + 1));
}

async function exportSection(section, columns, defaultName) {
  const { data } = await window.edari.getSection(section);
  if (!data?.length) {
    setStatus('لا توجد بيانات للتصدير');
    return;
  }
  const header = columns.map((c) => c.label).join(',');
  const lines = [header];
  for (const row of data) {
    lines.push(columns.map((c) => `"${String(row[c.key] ?? '').replace(/"/g, '""')}"`).join(','));
  }
  const res = await window.edari.exportCsv({ defaultName, content: lines.join('\n') });
  if (res.ok) setStatus(`تم الحفظ: ${res.filePath}`);
}

async function initApp() {
  try {
    const status = await window.edari.status();
    const ok = status.drivers?.hasDriver;
    const badge = document.getElementById('connBadge');
    badge.textContent = ok ? `● متصل — ${status.drivers.installed[0]}` : '● ODBC غير متوفر';
    badge.classList.toggle('ok', ok);
    badge.classList.toggle('err', !ok);
    document.getElementById('dbLabel').textContent = `قاعدة ${status.conn.alias} — ${status.dataRoot}`;
    updateCacheMeta(status);
    setStatus('جاهز — جاري تحميل البيانات...');
    if (ok) syncAll();
  } catch (e) {
    setStatus(`خطأ: ${e.message}`);
  }

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  document.getElementById('btnSyncAll').addEventListener('click', () => syncAll());
  document.getElementById('syncCloseBtn').addEventListener('click', () => setSyncOverlay(false));
  window.edari.onMenuRefresh(() => syncAll());

  bindSearch('materialsSearch', 'materials', () => loadMaterials());
  bindSearch('accountsSearch', 'accounts', () => loadAccounts());
  bindSearch('invoicesSearch', 'invoices', () => loadInvoices());
  bindSearch('receiptsSearch', 'receipts', () => loadReceipts());
  bindSearch('journalSearch', 'journal', () => loadJournal());

  document.getElementById('materialsExport').addEventListener('click', async () => {
    await ensureLabels();
    await exportSection('items', state.fieldLabels.materialListColumns, 'materials.csv');
  });
  document.getElementById('accountsExport').addEventListener('click', () =>
    exportSection('accounts', [
      { key: 'Num', label: 'الرقم' }, { key: 'Name1', label: 'الاسم' }, { key: 'Name2', label: 'الاسم 2' },
      { key: 'Master', label: 'الأب' }, { key: 'Bal', label: 'الرصيد' }, { key: 'Tot1', label: 'إجمالي 1' },
      { key: 'Tot2', label: 'إجمالي 2' }, { key: 'SubCount', label: 'فروع' }, { key: 'Remarks', label: 'ملاحظات' },
      { key: 'Address', label: 'العنوان' }
    ], 'accounts.csv')
  );
  document.getElementById('invoicesExport').addEventListener('click', () =>
    exportSection('invoices', [
      { key: 'Num', label: 'الرقم' }, { key: 'Kind', label: 'النوع' }, { key: 'Date', label: 'التاريخ' },
      { key: 'Total', label: 'الإجمالي' }, { key: 'Payment', label: 'الدفع' }, { key: 'remarks', label: 'ملاحظات' }
    ], 'invoices.csv')
  );
  document.getElementById('receiptsExport').addEventListener('click', () =>
    exportSection('receipts', [
      { key: 'number', label: 'الرقم' }, { key: 'creation_date', label: 'التاريخ' },
      { key: 'total_amount', label: 'الإجمالي' }, { key: 'payment', label: 'الدفع' }, { key: 'branch', label: 'الفرع' }
    ], 'receipts.csv')
  );
  document.getElementById('journalExport').addEventListener('click', () =>
    exportSection('journal', [
      { key: 'Seq', label: 'Seq' }, { key: 'Acc', label: 'الحساب' }, { key: 'Am', label: 'المبلغ' },
      { key: 'Dept', label: 'مدين' }, { key: 'Remarks', label: 'البيان' }, { key: 'DtCreated', label: 'التاريخ' }
    ], 'journal.csv')
  );

  setView('overview');
}

function bindSearch(id, section, reload) {
  const input = document.getElementById(id);
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.pages[section].search = input.value;
      if (section === 'receipts') {
        state.live.receipts = { cursor: '', stack: [''] };
      } else if (section === 'journal') {
        state.live.journal = { cursor: '', stack: [''] };
      } else if (state.pages[section].page !== undefined) {
        state.pages[section].page = 1;
      }
      reload();
    }, 250);
  });
}

function setView(name) {
  state.view = name;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  loaders[name]?.();
}

function setSyncOverlay(open) {
  const overlay = document.getElementById('syncOverlay');
  overlay.classList.toggle('open', open);
  overlay.hidden = !open;
}

async function syncAll() {
  const log = document.getElementById('syncLog');
  const bar = document.getElementById('syncBar');
  const msg = document.getElementById('syncMessage');
  const closeBtn = document.getElementById('syncCloseBtn');
  setSyncOverlay(true);
  closeBtn.hidden = true;
  log.innerHTML = '';
  bar.style.width = '2%';
  msg.textContent = 'جاري الاتصال بقاعدة EdariNX...';
  setStatus('جاري تحميل البيانات...');

  const off = window.edari.onSyncProgress((p) => {
    if (p.phase === 'start') {
      msg.textContent = `تحميل ${sectionLabels[p.section] || p.section} (${p.step}/${p.total})`;
      bar.style.width = `${Math.max(2, ((p.step - 1) / p.total) * 100)}%`;
    }
    if (p.phase === 'loading') {
      if (p.status === 'connecting') {
        msg.textContent = 'الاتصال بـ NexusDB...';
      } else if (p.loaded) {
        msg.textContent = `${sectionLabels[p.section] || p.section}: ${p.loaded.toLocaleString('en-US')} سجل...`;
      }
    }
    if (p.phase === 'done') {
      const li = document.createElement('li');
      li.className = 'done';
      li.textContent = `✓ ${sectionLabels[p.section]} — ${p.count?.toLocaleString('en-US') || ''} (${Math.round(p.ms / 1000)}ث)`;
      log.prepend(li);
      bar.style.width = `${(p.step / p.total) * 100}%`;
    }
  });

  let ok = false;
  try {
    await window.edari.syncAll();
    const status = await window.edari.status();
    updateCacheMeta(status);
    msg.textContent = 'تم التحميل بنجاح';
    bar.style.width = '100%';
    setStatus('تم تحميل البيانات الأساسية');
    ok = true;
    try {
      await loaders[state.view]?.();
    } catch (loadErr) {
      setStatus(`تم التحميل — تحذير عند عرض البيانات: ${loadErr.message}`);
    }
  } catch (e) {
    setStatus(`فشل التحميل: ${e.message}`);
    msg.textContent = `خطأ: ${e.message}`;
    closeBtn.hidden = false;
  } finally {
    off();
    if (ok) {
      setTimeout(() => setSyncOverlay(false), 600);
    }
  }
}

function updateCacheMeta(status) {
  const cached = status.cached || {};
  document.getElementById('cacheMeta').innerHTML = Object.entries(cached)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `<div>${sectionLabels[k] || k}: ${Number(v).toLocaleString('en-US')}</div>`)
    .join('') || '<div>لا توجد بيانات محمّلة</div>';
}

async function loadOverview() {
  const { data: stats } = await window.edari.getSection('stats');
  if (!stats) {
    document.getElementById('statsGrid').innerHTML = '<div class="stat-card"><div class="label">اضغط «تحديث كل البيانات»</div></div>';
    return;
  }
  document.getElementById('statsGrid').innerHTML = [
    ['الحسابات', stats.accounts, 'File11n'],
    ['الأصناف', stats.items, 'File13n'],
    ['الفواتير', stats.invoices, 'File15n'],
    ['إيصالات POS', stats.receipts, 'FOT_Reciepts'],
    ['القيود', stats.journal, 'File12n'],
    ['مبيعات POS', fmtNum(stats.posSalesTotal), 'إجمالي'],
    ['إجمالي الفواتير', fmtNum(stats.invoiceTotal), 'File15n']
  ].map(([label, value, hint]) => `
    <div class="stat-card"><div class="label">${label}</div><div class="value">${fmtNum(value)}</div><div class="hint">${hint}</div></div>`).join('');

  const inv = await window.edari.getSection('invoices');
  document.getElementById('recentInvoices').innerHTML = (inv.data || []).slice(0, 8).map((r) =>
    `<tr><td>${esc(r.Num)}</td><td>${fmtDate(r.Date)}</td><td class="num">${fmtNum(r.Total)}</td></tr>`
  ).join('') || '<tr><td colspan="3">—</td></tr>';

  const rec = await window.edari.queryLive({ section: 'receipts', cursor: '', limit: 8 });
  document.getElementById('recentReceipts').innerHTML = (rec.rows || []).map((r) =>
    `<tr><td>${esc(r.number)}</td><td>${fmtDate(r.creation_date)}</td><td class="num">${fmtNum(r.total_amount)}</td></tr>`
  ).join('') || '<tr><td colspan="3">—</td></tr>';
}

async function loadMaterialsTree() {
  renderMatBreadcrumb();
  const rows = await window.edari.materialsChildren(state.matParent);
  document.getElementById('materialsTree').innerHTML = rows.map((r) => {
    const isGroup = Number(r.SubCount) > 0;
    return `<div class="tree-node" data-seq="${esc(r.Seq)}" data-name="${esc(r.Name1)}" data-group="${isGroup}">
      <div class="name">${esc(r.Name1 || r.Name2 || '—')}</div>
      <div class="meta">رقم: ${esc(r.Num)} ${isGroup ? `• ${r.SubCount} فرع` : ''}</div>
    </div>`;
  }).join('') || '<div class="detail-box empty">لا توجد مجموعات</div>';

  document.querySelectorAll('#materialsTree .tree-node').forEach((node) => {
    node.addEventListener('click', async () => {
      if (node.dataset.group === 'true') {
        state.matPath.push({ seq: node.dataset.seq, name: node.dataset.name });
        state.matParent = node.dataset.seq;
        loadMaterialsTree();
        return;
      }
      state.pages.materials.search = node.dataset.name || '';
      document.getElementById('materialsSearch').value = state.pages.materials.search;
      state.pages.materials.page = 1;
      await loadMaterialsTable();
      selectMaterialRow(node.dataset.seq);
    });
  });
}

function renderMatBreadcrumb() {
  document.getElementById('matBreadcrumb').innerHTML = state.matPath.map((p, i) =>
    `<span class="crumb" data-idx="${i}">${esc(p.name)}</span>`).join(' › ');
  document.querySelectorAll('#matBreadcrumb .crumb').forEach((c) => {
    c.addEventListener('click', () => {
      const idx = Number(c.dataset.idx);
      state.matPath = state.matPath.slice(0, idx + 1);
      state.matParent = state.matPath[idx].seq;
      loadMaterialsTree();
    });
  });
}

async function loadMaterialsTable() {
  await ensureLabels();
  const cols = state.fieldLabels.materialListColumns;
  document.getElementById('materialsHead').innerHTML = `<tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr>`;

  const p = state.pages.materials;
  const result = await window.edari.pageRows({
    section: 'items',
    page: p.page,
    pageSize: PAGE_SIZE,
    search: p.search,
    keys: ['Name1', 'Name2', 'Num', 'Barcode']
  });

  document.getElementById('materialsMeta').textContent = result.total
    ? `عرض ${result.rows.length} من ${result.total.toLocaleString('en-US')} صنف`
    : 'لا توجد أصناف — حمّل البيانات أولاً';

  document.getElementById('materialsBody').innerHTML = result.rows.map((r) => `
    <tr data-seq="${esc(r.Seq)}">
      ${cols.map((c) => {
        const val = r[c.key];
        const cls = [
          c.numeric ? 'num' : '',
          c.key === 'StockQty' ? stockClass(val) : '',
          c.key === 'SellPr4' || c.key.startsWith('SellPr') ? 'price-sell' : '',
          ['Avrg', 'CurAvrg'].includes(c.key) ? 'price-buy' : ''
        ].filter(Boolean).join(' ');
        return `<td class="${cls}">${c.numeric ? fmtNum(val) : esc(val)}</td>`;
      }).join('')}
    </tr>`).join('') || '<tr><td colspan="20">لا توجد بيانات</td></tr>';

  document.querySelectorAll('#materialsBody tr[data-seq]').forEach((tr) => {
    tr.addEventListener('click', () => selectMaterialRow(tr.dataset.seq));
  });

  renderPager('materialsPager', 'materials', result, (page) => {
    state.pages.materials.page = page;
    loadMaterialsTable();
  });
}

async function selectMaterialRow(seq) {
  document.querySelectorAll('#materialsBody tr').forEach((tr) => tr.classList.toggle('selected', tr.dataset.seq === seq));
  const item = await window.edari.itemDetail(seq);
  if (!item) return;
  await ensureLabels();
  const sections = state.fieldLabels.materialSections;
  const html = Object.values(sections).map((section) => {
    const fields = Object.entries(section.fields).map(([key, label]) => {
      let val = item[key];
      if (val === null || val === undefined || val === '') return '';
      if (['Avrg', 'CurAvrg', 'Top', 'Last', 'SellPr1', 'SellPr2', 'SellPr3', 'SellPr4', 'SellPr5'].includes(key)) val = fmtNum(val);
      return `<div class="detail-item"><div class="k">${label}</div><div class="v">${val}</div></div>`;
    }).filter(Boolean).join('');
    if (!fields) return '';
    return `<div class="detail-section"><h4>${section.title}</h4><div class="detail-grid">${fields}</div></div>`;
  }).join('');
  document.getElementById('materialDetail').innerHTML = `
    <div class="detail-item" style="margin-bottom:10px"><div class="k">الصنف</div><div class="v">${esc(item.Name1)}</div></div>
    ${html}`;
  document.getElementById('materialDetail').classList.remove('empty');
}

async function loadMaterials() {
  loadMaterialsTree();
  await loadMaterialsTable();
}

function detailItem(k, v) {
  return `<div class="detail-item"><div class="k">${k}</div><div class="v">${v ?? '—'}</div></div>`;
}

function collectDescendants(accounts, parentSeq, depth = 1) {
  const children = accounts.filter((a) => String(a.Master) === String(parentSeq));
  let all = [];
  for (const child of children) {
    all.push({ ...child, depth });
    if (Number(child.SubCount) > 0) {
      all = all.concat(collectDescendants(accounts, child.Seq, depth + 1));
    }
  }
  return all;
}

function buildAccountTreeHtml(accounts, parentSeq = '0', search = '') {
  const q = search.trim().toLowerCase();
  const children = accounts.filter((a) => String(a.Master) === String(parentSeq));
  let html = '';
  for (const node of children) {
    const name = `${node.Name1 || ''} ${node.Name2 || ''}`.trim();
    const matches = !q || name.toLowerCase().includes(q) || String(node.Num).includes(q);
    const subHtml = Number(node.SubCount) > 0
      ? buildAccountTreeHtml(accounts, node.Seq, search)
      : '';
    if (!matches && !subHtml) continue;
    html += `
      <div class="tree-node" data-seq="${esc(node.Seq)}" data-num="${esc(node.Num)}">
        <div>
          <div class="name">${esc(name || '—')}</div>
          <div class="meta">رقم: ${esc(node.Num)} • رصيد: <span class="num">${fmtNum(node.Bal)}</span></div>
        </div>
        ${Number(node.SubCount) > 0 ? `<span class="badge">${node.SubCount} فرع</span>` : ''}
      </div>`;
    if (subHtml) html += `<div class="tree-children">${subHtml}</div>`;
  }
  return html;
}

async function showAccountDetail(seq) {
  const { data: accounts } = await window.edari.getSection('accounts');
  if (!accounts?.length) return;
  const account = accounts.find((a) => String(a.Seq) === String(seq));
  if (!account) return;

  state.selectedAccountSeq = seq;
  document.querySelectorAll('#accountsTree .tree-node').forEach((n) => {
    n.classList.toggle('active', n.dataset.seq === String(seq));
  });

  const descendants = collectDescendants(accounts, account.Seq);
  document.getElementById('accountDetail').innerHTML = `
    <div class="detail-grid">
      ${detailItem('الاسم', esc(account.Name1))}
      ${detailItem('الاسم 2', esc(account.Name2))}
      ${detailItem('الرقم', esc(account.Num))}
      ${detailItem('الحساب الأب', esc(account.Master))}
      ${detailItem('الرصيد', `<span class="num">${fmtNum(account.Bal)}</span>`)}
      ${detailItem('إجمالي 1', `<span class="num">${fmtNum(account.Tot1)}</span>`)}
      ${detailItem('إجمالي 2', `<span class="num">${fmtNum(account.Tot2)}</span>`)}
      ${detailItem('عدد الفروع المباشرة', esc(account.SubCount))}
      ${detailItem('عدد الفروع الكلي', descendants.length)}
      ${detailItem('الوجهة', esc(account.Dest))}
      ${detailItem('العنوان', esc(account.Address))}
      ${detailItem('ملاحظات', esc(account.Remarks))}
    </div>`;
  document.getElementById('accountDetail').classList.remove('empty');

  document.getElementById('accountBranchesTitle').textContent = descendants.length
    ? `الفروع التابعة (${descendants.length})`
    : 'لا توجد فروع';

  document.getElementById('accountBranchesBody').innerHTML = descendants.length
    ? descendants.map((b) => `
      <tr data-seq="${esc(b.Seq)}" class="${String(b.Seq) === String(seq) ? 'selected' : ''}">
        <td class="branch-indent">${'—'.repeat(b.depth)} ${b.depth}</td>
        <td>${esc(b.Num)}</td>
        <td>${esc(b.Name1)}${b.Name2 ? ` <span class="branch-indent">${esc(b.Name2)}</span>` : ''}</td>
        <td class="num">${fmtNum(b.Bal)}</td>
        <td class="num">${fmtNum(b.Tot1)}</td>
        <td class="num">${fmtNum(b.Tot2)}</td>
        <td class="num">${esc(b.SubCount)}</td>
        <td>${esc(b.Remarks)}</td>
      </tr>`).join('')
    : '<tr><td colspan="8" class="branch-indent">هذا حساب نهائي بدون فروع</td></tr>';

  document.querySelectorAll('#accountBranchesBody tr[data-seq]').forEach((tr) => {
    tr.addEventListener('click', () => showAccountDetail(tr.dataset.seq));
  });
}

async function loadAccounts() {
  const { data: accounts } = await window.edari.getSection('accounts');
  const search = state.pages.accounts.search;
  if (!accounts?.length) {
    document.getElementById('accountsMeta').textContent = 'حمّل البيانات أولاً (F5)';
    document.getElementById('accountsTree').innerHTML = '';
    return;
  }
  state.accounts = accounts;
  document.getElementById('accountsMeta').textContent = `${accounts.length.toLocaleString('en-US')} حساب`;
  document.getElementById('accountsTree').innerHTML = buildAccountTreeHtml(accounts, '0', search)
    || '<div class="detail-box empty">لا توجد نتائج</div>';

  document.querySelectorAll('#accountsTree .tree-node').forEach((node) => {
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      showAccountDetail(node.dataset.seq);
    });
  });

  if (state.selectedAccountSeq) {
    showAccountDetail(state.selectedAccountSeq);
  } else {
    document.getElementById('accountBranchesTitle').textContent = 'الفروع التابعة';
    document.getElementById('accountBranchesBody').innerHTML = '';
  }
}

async function loadInvoices() {
  const p = state.pages.invoices;
  const result = await window.edari.pageRows({
    section: 'invoices', page: p.page, pageSize: PAGE_SIZE, search: p.search,
    keys: ['Num', 'remarks']
  });
  document.getElementById('invoicesMeta').textContent = result.total
    ? `${result.total.toLocaleString('en-US')} فاتورة` : 'حمّل البيانات أولاً';
  document.getElementById('invoicesBody').innerHTML = result.rows.map((r) => `
    <tr data-seq="${esc(r.Seq)}">
      <td>${esc(r.Seq)}</td><td>${esc(r.Num)}</td><td>${esc(r.Kind)}</td>
      <td>${fmtDate(r.Date)}</td><td class="num">${fmtNum(r.Total)}</td><td class="num">${fmtNum(r.Payment)}</td>
      <td>${esc(r.remarks)}</td>
    </tr>`).join('') || '<tr><td colspan="7">—</td></tr>';
  document.querySelectorAll('#invoicesBody tr[data-seq]').forEach((tr) => {
    tr.addEventListener('click', async () => {
      document.querySelectorAll('#invoicesBody tr').forEach((x) => x.classList.remove('selected'));
      tr.classList.add('selected');
      const seq = tr.dataset.seq;
      const row = result.rows.find((x) => String(x.Seq) === seq);
      document.getElementById('invoiceDetail').innerHTML = `
        <div class="detail-grid">
          <div class="detail-item"><div class="k">الرقم</div><div class="v">${esc(row.Num)}</div></div>
          <div class="detail-item"><div class="k">الإجمالي</div><div class="v">${fmtNum(row.Total)}</div></div>
          <div class="detail-item"><div class="k">التاريخ</div><div class="v">${fmtDate(row.Date)}</div></div>
        </div>`;
      document.getElementById('invoiceDetail').classList.remove('empty');
      const lines = await window.edari.invoiceLines(seq);
      document.getElementById('invoiceLinesWrap').hidden = !lines.length;
      document.getElementById('invoiceLines').innerHTML = lines.map((l) => `
        <tr><td>${esc(l.BillNo)}</td><td>${esc(l.Mat)}</td><td>${esc(l.MatName)}</td>
        <td class="num">${fmtNum(l.Quant)}</td><td class="num">${fmtNum(l.Price)}</td></tr>`).join('');
    });
  });
  renderPager('invoicesPager', 'invoices', result, (page) => {
    state.pages.invoices.page = page;
    loadInvoices();
  });
}

function renderLivePager(containerId, section, result, onNav) {
  const el = document.getElementById(containerId);
  const live = state.live[section];
  const canBack = live.stack.length > 1;
  el.innerHTML = `
    <button class="btn" data-p="prev" ${canBack ? '' : 'disabled'}>السابق</button>
    <span>${result.rows.length} سجل — ${result.hasMore ? 'يوجد المزيد' : 'نهاية القائمة'}</span>
    <button class="btn" data-p="next" ${result.hasMore ? '' : 'disabled'}>التالي</button>`;
  el.querySelector('[data-p="prev"]')?.addEventListener('click', () => onNav('prev'));
  el.querySelector('[data-p="next"]')?.addEventListener('click', () => onNav('next'));
}

async function loadReceipts() {
  const p = state.pages.receipts;
  const live = state.live.receipts;
  const result = await window.edari.pageRows({
    section: 'receipts',
    cursor: live.cursor,
    pageSize: PAGE_SIZE,
    search: p.search
  });
  document.getElementById('receiptsMeta').textContent = result.live
    ? 'تحميل مباشر من قاعدة البيانات'
    : `${result.total?.toLocaleString('en-US') || 0} إيصال`;
  document.getElementById('receiptsBody').innerHTML = result.rows.map((r) => `
    <tr data-id="${esc(r.id)}">
      <td>${esc(r.id)}</td><td>${esc(r.number)}</td><td>${fmtDate(r.creation_date)}</td>
      <td class="num">${fmtNum(r.total_amount)}</td><td class="num">${fmtNum(r.payment)}</td><td>${esc(r.branch)}</td>
    </tr>`).join('') || '<tr><td colspan="6">—</td></tr>';
  document.querySelectorAll('#receiptsBody tr[data-id]').forEach((tr) => {
    tr.addEventListener('click', async () => {
      document.querySelectorAll('#receiptsBody tr').forEach((x) => x.classList.remove('selected'));
      tr.classList.add('selected');
      const id = tr.dataset.id;
      const row = result.rows.find((x) => String(x.id) === id);
      document.getElementById('receiptDetail').innerHTML = `
        <div class="detail-grid">
          <div class="detail-item"><div class="k">الرقم</div><div class="v">${esc(row.number)}</div></div>
          <div class="detail-item"><div class="k">الإجمالي</div><div class="v">${fmtNum(row.total_amount)}</div></div>
        </div>`;
      document.getElementById('receiptDetail').classList.remove('empty');
      const items = await window.edari.receiptItems(id);
      document.getElementById('receiptItemsWrap').hidden = !items.length;
      document.getElementById('receiptItems').innerHTML = items.map((l) => `
        <tr><td>${esc(l.article_id)}</td><td class="num">${fmtNum(l.quantity)}</td>
        <td class="num">${fmtNum(l.price)}</td><td class="num">${fmtNum(l.discount)}</td></tr>`).join('');
    });
  });
  if (result.live) {
    renderLivePager('receiptsPager', 'receipts', result, (dir) => {
      if (dir === 'next' && result.nextCursor) {
        live.stack.push(result.nextCursor);
        live.cursor = result.nextCursor;
      } else if (dir === 'prev' && live.stack.length > 1) {
        live.stack.pop();
        live.cursor = live.stack[live.stack.length - 1];
      }
      loadReceipts();
    });
  } else {
    renderPager('receiptsPager', 'receipts', result, (page) => {
      state.pages.receipts.page = page;
      loadReceipts();
    });
  }
}

async function loadJournal() {
  const p = state.pages.journal;
  const live = state.live.journal;
  const result = await window.edari.pageRows({
    section: 'journal',
    cursor: live.cursor,
    pageSize: PAGE_SIZE,
    search: p.search
  });
  document.getElementById('journalMeta').textContent = result.live
    ? 'تحميل مباشر من قاعدة البيانات'
    : `${result.total?.toLocaleString('en-US') || 0} قيد`;
  document.getElementById('journalBody').innerHTML = result.rows.map((r) => `
    <tr>
      <td>${esc(r.Seq)}</td><td>${esc(r.Acc)}</td><td class="num">${fmtNum(r.Am)}</td>
      <td>${esc(r.Dept)}</td><td>${esc(r.Remarks)}</td><td>${esc(r.BillNum)}</td><td>${fmtDate(r.DtCreated)}</td>
    </tr>`).join('') || '<tr><td colspan="7">—</td></tr>';
  if (result.live) {
    renderLivePager('journalPager', 'journal', result, (dir) => {
      if (dir === 'next' && result.nextCursor) {
        live.stack.push(result.nextCursor);
        live.cursor = result.nextCursor;
      } else if (dir === 'prev' && live.stack.length > 1) {
        live.stack.pop();
        live.cursor = live.stack[live.stack.length - 1];
      }
      loadJournal();
    });
  } else {
    renderPager('journalPager', 'journal', result, (page) => {
      state.pages.journal.page = page;
      loadJournal();
    });
  }
}

async function loadCash() {
  const { data } = await window.edari.getSection('cash');
  document.getElementById('cashBody').innerHTML = (data || []).map((r) => `
    <tr><td>${esc(r.Seq)}</td><td>${esc(r.Name)}</td><td>${esc(r.Branch)}</td>
    <td>${esc(r.UserGroup)}</td><td>${esc(r.FromTime)}</td><td>${esc(r.ToTime)}</td></tr>`).join('') || '<tr><td colspan="6">حمّل البيانات أولاً</td></tr>';
}

function stockClass(qty) {
  const n = Number(qty);
  if (n > 0) return 'stock-positive';
  if (n === 0) return 'stock-zero';
  return 'stock-negative';
}

const loaders = {
  overview: loadOverview,
  materials: loadMaterials,
  accounts: loadAccounts,
  invoices: loadInvoices,
  receipts: loadReceipts,
  journal: loadJournal,
  cash: loadCash
};

initApp();
