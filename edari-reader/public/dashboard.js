const state = {
  view: 'overview',
  accounts: [],
  matPath: [{ seq: '0', name: 'الجذر' }],
  matParent: '0',
  itemsCursor: '0',
  itemsSearch: '',
  itemsLoaded: 0,
  itemsTotal: 0,
  invoicesCursor: '',
  invoicesSearch: '',
  receiptsCursor: '',
  journalCursor: '',
  materialColumns: [],
  materialSections: null
};

const views = {
  overview: { title: 'نظرة عامة', subtitle: 'ملخص بيانات EdariNX' },
  accounts: { title: 'شجرة الحسابات', subtitle: 'دليل الحسابات والأرصدة' },
  materials: { title: 'شجرة المواد', subtitle: 'تصنيفات وأصناف المخزون' },
  items: { title: 'المواد بالتفصيل', subtitle: 'الكميات وأسعار الشراء والبيع لكل صنف' },
  invoices: { title: 'الفواتير', subtitle: 'فواتير المبيعات والمشتريات' },
  receipts: { title: 'إيصالات POS', subtitle: 'مبيعات نقاط البيع' },
  journal: { title: 'القيود المحاسبية', subtitle: 'حركات دفتر الأستاذ' },
  cash: { title: 'مستخدمو الصندوق', subtitle: 'Cashier / الصندوق' }
};

async function api(path) {
  const res = await fetch(path);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Request failed');
  return data;
}

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

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 2800);
}

function setView(name) {
  state.view = name;
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.getElementById('viewTitle').textContent = views[name].title;
  document.getElementById('viewSubtitle').textContent = views[name].subtitle;
  loaders[name]?.();
}

async function initStatus() {
  try {
    const status = await api('/api/status');
    const ok = status.drivers.hasDriver && status.server.online;
    document.getElementById('connStatus').textContent = ok
      ? `متصل • ${status.drivers.installed.join(', ')}`
      : 'تحقق من ODBC أو nxServer';
  } catch (e) {
    document.getElementById('connStatus').textContent = 'غير متصل';
  }
}

async function loadOverview() {
  const { stats } = await api('/api/dashboard/stats');
  document.getElementById('statsGrid').innerHTML = [
    ['الحسابات', stats.accounts, 'File11n'],
    ['الأصناف', stats.items, 'File13n'],
    ['الفواتير', stats.invoices, 'File15n'],
    ['إيصالات POS', stats.receipts, 'FOT_Reciepts'],
    ['القيود', stats.journal, 'File12n'],
    ['مبيعات POS', fmtNum(stats.posSalesTotal), 'إجمالي'],
    ['إجمالي الفواتير', fmtNum(stats.invoiceTotal), 'File15n']
  ].map(([label, value, hint]) => `
    <div class="stat-card">
      <div class="label">${label}</div>
      <div class="value">${typeof value === 'string' && value.includes(',') ? value : fmtNum(value)}</div>
      <div class="hint">${hint}</div>
    </div>`).join('');

  const inv = await api('/api/dashboard/invoices?limit=5');
  document.getElementById('recentInvoices').innerHTML = inv.rows.map((r) => `
    <tr><td>${esc(r.Num)}</td><td>${fmtDate(r.Date)}</td><td class="num">${fmtNum(r.Total)}</td></tr>`).join('') || '<tr><td colspan="3">لا توجد بيانات</td></tr>';

  const rec = await api('/api/dashboard/receipts?limit=5');
  document.getElementById('recentReceipts').innerHTML = rec.rows.map((r) => `
    <tr><td>${esc(r.number)}</td><td>${fmtDate(r.creation_date)}</td><td class="num">${fmtNum(r.total_amount)}</td></tr>`).join('') || '<tr><td colspan="3">لا توجد بيانات</td></tr>';
}

function buildAccountTree(rows, parentSeq = '0', search = '') {
  const q = search.trim().toLowerCase();
  const children = rows.filter((r) => String(r.Master) === String(parentSeq));
  let html = '';
  for (const node of children) {
    const name = `${node.Name1 || ''} ${node.Name2 || ''}`.trim();
    if (q && !name.toLowerCase().includes(q) && !String(node.Num).includes(q)) {
      html += buildAccountTree(rows, node.Seq, search);
      continue;
    }
    html += `
      <div class="tree-node" data-seq="${esc(node.Seq)}" data-num="${esc(node.Num)}" data-has-sub="${node.SubCount > 0}">
        <div>
          <div class="name">${esc(name || '—')}</div>
          <div class="meta">رقم: ${esc(node.Num)} • رصيد: <span class="num">${fmtNum(node.Bal)}</span></div>
        </div>
        ${Number(node.SubCount) > 0 ? `<span class="badge">${node.SubCount} فرع</span>` : ''}
      </div>`;
    if (Number(node.SubCount) > 0) html += `<div class="tree-children" style="padding-right:16px">${buildAccountTree(rows, node.Seq, search)}</div>`;
  }
  return html;
}

async function loadAccounts() {
  if (!state.accounts.length) {
    const data = await api('/api/dashboard/accounts');
    state.accounts = data.rows;
  }
  const search = document.getElementById('accountSearch').value;
  document.getElementById('accountsTree').innerHTML = buildAccountTree(state.accounts, '0', search) || '<div class="empty-detail">لا توجد حسابات</div>';
  document.querySelectorAll('#accountsTree .tree-node').forEach((node) => {
    node.addEventListener('click', () => showAccountDetail(node.dataset.seq, node));
  });
}

async function showAccountDetail(seq, nodeEl) {
  document.querySelectorAll('#accountsTree .tree-node').forEach((n) => n.classList.remove('active'));
  nodeEl?.classList.add('active');
  const { account } = await api(`/api/dashboard/accounts/${seq}`);
  if (!account) return;
  document.getElementById('accountDetail').innerHTML = `
    <div class="detail-grid">
      ${detail('الاسم', account.Name1)}
      ${detail('الاسم 2', account.Name2)}
      ${detail('الرقم', account.Num)}
      ${detail('الرصيد', fmtNum(account.Bal))}
      ${detail('إجمالي 1', fmtNum(account.Tot1))}
      ${detail('إجمالي 2', fmtNum(account.Tot2))}
      ${detail('عدد الفروع', account.SubCount)}
      ${detail('ملاحظات', account.Remarks)}
      ${detail('العنوان', account.Address)}
    </div>`;
}

function detail(k, v) {
  return `<div class="detail-item"><div class="k">${k}</div><div class="v">${v || '—'}</div></div>`;
}

async function loadMaterials() {
  renderMatBreadcrumb();
  const data = await api(`/api/dashboard/materials?parent=${state.matParent}`);
  const tree = document.getElementById('materialsTree');
  tree.innerHTML = data.rows.map((r) => {
    const isGroup = Number(r.SubCount) > 0;
    return `
      <div class="tree-node" data-seq="${esc(r.Seq)}" data-name="${esc(r.Name1)}" data-group="${isGroup}">
        <div>
          <div class="name">${esc(r.Name1 || r.Name2 || '—')}</div>
          <div class="meta">رقم: ${esc(r.Num)} ${r.Barcode ? `• ${esc(r.Barcode)}` : ''}</div>
        </div>
        ${isGroup ? `<span class="badge">${r.SubCount}</span>` : `<span class="badge num">${fmtNum(r.SellPr1)}</span>`}
      </div>`;
  }).join('') || '<div class="empty-detail">لا توجد مجموعات</div>';

  tree.querySelectorAll('.tree-node').forEach((node) => {
    node.addEventListener('click', async () => {
      document.querySelectorAll('#materialsTree .tree-node').forEach((n) => n.classList.remove('active'));
      node.classList.add('active');
      if (node.dataset.group === 'true') {
        state.matPath.push({ seq: node.dataset.seq, name: node.dataset.name });
        state.matParent = node.dataset.seq;
        loadMaterials();
        return;
      }
      await ensureFieldLabels();
      const { item } = await api(`/api/dashboard/items/${node.dataset.seq}`);
      if (!item) {
        document.getElementById('materialDetail').innerHTML = '<div class="empty-detail">لا تفاصيل</div>';
        return;
      }
      document.getElementById('materialDetail').innerHTML = `
        <div class="detail-grid">
          ${detail('الاسم', item.Name1)}
          ${detail('الرقم', item.Num)}
          ${detail('الباركود', item.Barcode)}
          ${detail('الرصيد', `<span class="${stockClass(item.StockQty)}">${fmtNum(item.StockQty)}</span>`)}
          ${detail('متوسط الشراء', `<span class="price-buy">${fmtNum(item.Avrg)}</span>`)}
          ${detail('تكلفة حالية', `<span class="price-buy">${fmtNum(item.CurAvrg)}</span>`)}
          ${detail('سعر بيع 1', `<span class="price-sell">${fmtNum(item.SellPr1)}</span>`)}
          ${detail('سعر بيع 4', `<span class="price-sell">${fmtNum(item.SellPr4)}</span>`)}
        </div>
        <div style="margin-top:12px"><button class="btn primary mat-full" data-seq="${esc(item.Seq)}">عرض كل التفاصيل</button></div>`;
      document.querySelector('.mat-full')?.addEventListener('click', () => showFullMaterial(item));
    });
  });
}

function renderMatBreadcrumb() {
  document.getElementById('matBreadcrumb').innerHTML = state.matPath.map((p, i) => `
    <span class="crumb" data-idx="${i}">${esc(p.name)}</span>`).join('');
  document.querySelectorAll('#matBreadcrumb .crumb').forEach((c) => {
    c.addEventListener('click', () => {
      const idx = Number(c.dataset.idx);
      state.matPath = state.matPath.slice(0, idx + 1);
      state.matParent = state.matPath[idx].seq;
      loadMaterials();
    });
  });
}

function stockClass(qty) {
  const n = Number(qty);
  if (n > 0) return 'stock-positive';
  if (n === 0) return 'stock-zero';
  return 'stock-negative';
}

async function ensureFieldLabels() {
  if (state.materialColumns.length) return;
  const data = await api('/api/dashboard/field-labels');
  state.materialColumns = data.materialListColumns;
  state.materialSections = data.materialSections;
}

function renderItemsTableHead() {
  const cols = state.materialColumns;
  document.getElementById('itemsHead').innerHTML = `
    <tr>
      ${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}
      <th>تفاصيل</th>
    </tr>`;
}

function renderMaterialDetailSections(item) {
  if (!item || !state.materialSections) return '';
  return Object.values(state.materialSections).map((section) => {
    const fields = Object.entries(section.fields)
      .map(([key, label]) => {
        let val = item[key];
        if (val === null || val === undefined || val === '') return '';
        if (['Avrg', 'CurAvrg', 'Top', 'Last', 'CTop', 'CLast', 'InAm', 'PurchaseAm', 'OutAm', 'SalesAm', 'SellPr1', 'SellPr2', 'SellPr3', 'SellPr4', 'SellPr5', 'Tot1', 'Tot2', 'Tot3'].includes(key)) {
          val = fmtNum(val);
        }
        const cls = key.startsWith('SellPr') ? 'price-sell' : (['Avrg', 'CurAvrg', 'Top', 'Last'].includes(key) ? 'price-buy' : '');
        return `<div class="detail-item"><div class="k">${label}</div><div class="v ${cls}">${esc(val)}</div></div>`;
      })
      .filter(Boolean)
      .join('');
    if (!fields) return '';
    return `<div class="detail-section"><h4>${section.title}</h4><div class="detail-grid">${fields}</div></div>`;
  }).join('');
}

async function showFullMaterial(item) {
  if (!item) return;
  document.getElementById('itemDrawerContent').innerHTML = `
    <div class="detail-header">
      <div>
        <h3>${esc(item.Name1 || '—')}</h3>
        <div class="sub">رقم: ${esc(item.Num)} • باركود: ${esc(item.Barcode || '—')}</div>
      </div>
      <button class="btn" id="closeDrawer">إغلاق</button>
    </div>
    <div class="detail-sections">${renderMaterialDetailSections(item)}</div>`;
  document.getElementById('itemDrawer').classList.add('open');
  document.getElementById('closeDrawer').onclick = () => document.getElementById('itemDrawer').classList.remove('open');
}

function updateItemsCount() {
  const el = document.getElementById('itemsCount');
  if (!el) return;
  if (state.itemsTotal > 0) {
    el.textContent = `معروض: ${state.itemsLoaded.toLocaleString('en-US')} / ${state.itemsTotal.toLocaleString('en-US')}`;
  } else if (state.itemsLoaded > 0) {
    el.textContent = `معروض: ${state.itemsLoaded.toLocaleString('en-US')}`;
  } else {
    el.textContent = '';
  }
}

async function loadItems(reset = true) {
  await ensureFieldLabels();
  if (reset) {
    state.itemsCursor = '0';
    state.itemsLoaded = 0;
    renderItemsTableHead();
    if (!state.itemsTotal) {
      const { stats } = await api('/api/dashboard/stats');
      state.itemsTotal = Number(stats.items || 0);
    }
  }
  const q = state.itemsSearch ? `&search=${encodeURIComponent(state.itemsSearch)}` : '';
  const data = await api(`/api/dashboard/items?cursor=${state.itemsCursor}&limit=50${q}`);
  const body = document.getElementById('itemsBody');
  const cols = state.materialColumns;

  const rows = data.rows.map((r) => `
    <tr>
      ${cols.map((c) => {
        const val = r[c.key];
        const cls = c.key === 'StockQty' ? stockClass(val) : (c.numeric ? 'num' : '');
        const extra = c.key === 'SellPr4' ? ' price-sell' : (c.key.startsWith('SellPr') ? ' price-sell' : (['Avrg', 'CurAvrg'].includes(c.key) ? ' price-buy' : ''));
        return `<td class="${cls}${extra}">${c.numeric ? fmtNum(val) : esc(val)}</td>`;
      }).join('')}
      <td><button class="btn link item-view" data-seq="${esc(r.Seq)}">كل التفاصيل</button></td>
    </tr>`).join('');

  body.innerHTML = reset ? rows : body.innerHTML + rows;
  state.itemsLoaded += data.rows.length;
  state.itemsCursor = data.nextCursor || '0';
  document.getElementById('itemsMoreBtn').hidden = !data.hasMore;
  updateItemsCount();

  body.querySelectorAll('.item-view').forEach((btn) => {
    btn.onclick = async () => {
      const { item } = await api(`/api/dashboard/items/${btn.dataset.seq}`);
      await showFullMaterial(item);
    };
  });
}

async function exportItemsCsv() {
  toast('جاري التصدير...');
  const q = state.itemsSearch ? `?search=${encodeURIComponent(state.itemsSearch)}&limit=50000` : '?limit=50000';
  const data = await api(`/api/dashboard/items/export${q}`);
  await ensureFieldLabels();
  const cols = state.materialColumns;
  const header = [...cols.map((c) => c.label), 'Seq'];
  const lines = [header.join(',')];
  for (const row of data.rows) {
    lines.push([
      ...cols.map((c) => `"${String(row[c.key] ?? '').replace(/"/g, '""')}"`),
      `"${row.Seq}"`
    ].join(','));
  }
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `materials-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`تم تصدير ${data.count} مادة`);
}

async function loadInvoices(reset = true) {
  if (reset) state.invoicesCursor = '';
  const q = state.invoicesSearch ? `&search=${encodeURIComponent(state.invoicesSearch)}` : '';
  const cur = state.invoicesCursor ? `&cursor=${state.invoicesCursor}` : '';
  const data = await api(`/api/dashboard/invoices?limit=50${cur}${q}`);
  const body = document.getElementById('invoicesBody');
  const rows = data.rows.map((r) => `
    <tr>
      <td>${esc(r.Num)}</td>
      <td>${fmtDate(r.Date)}</td>
      <td class="num">${fmtNum(r.Total)}</td>
      <td class="num">${fmtNum(r.DisCnt)}</td>
      <td>${esc(r.count)}</td>
      <td><button class="btn link inv-lines" data-seq="${esc(r.Seq)}">البنود</button></td>
    </tr>`).join('');
  body.innerHTML = reset ? rows : body.innerHTML + rows;
  state.invoicesCursor = data.nextCursor || '';
  document.getElementById('invoicesMoreBtn').hidden = !data.hasMore;
  body.querySelectorAll('.inv-lines').forEach((btn) => {
    btn.addEventListener('click', () => showInvoiceLines(btn.dataset.seq));
  });
}

async function showInvoiceLines(seq) {
  const { rows } = await api(`/api/dashboard/invoices/${seq}/lines`);
  document.getElementById('invoiceLines').innerHTML = rows.length ? `
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>المادة</th><th>الكمية</th><th>السعر</th><th>الاسم</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td>${esc(r.BillNo)}</td>
          <td>${esc(r.Mat)}</td>
          <td class="num">${fmtNum(r.Quant)}</td>
          <td class="num">${fmtNum(r.Price)}</td>
          <td>${esc(r.MatName)}</td>
        </tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty-detail">لا بنود</div>';
}

async function loadReceipts(reset = true) {
  if (reset) state.receiptsCursor = '';
  const cur = state.receiptsCursor ? `&cursor=${state.receiptsCursor}` : '';
  const data = await api(`/api/dashboard/receipts?limit=50${cur}`);
  const body = document.getElementById('receiptsBody');
  const rows = data.rows.map((r) => `
    <tr>
      <td>${esc(r.number)}</td>
      <td>${fmtDate(r.creation_date)}</td>
      <td class="num">${fmtNum(r.total_amount)}</td>
      <td class="num">${fmtNum(r.payment)}</td>
      <td>${esc(r.branch)}</td>
      <td><button class="btn link rec-items" data-id="${esc(r.id)}">البنود</button></td>
    </tr>`).join('');
  body.innerHTML = reset ? rows : body.innerHTML + rows;
  state.receiptsCursor = data.nextCursor || '';
  document.getElementById('receiptsMoreBtn').hidden = !data.hasMore;
  body.querySelectorAll('.rec-items').forEach((btn) => {
    btn.addEventListener('click', () => showReceiptItems(btn.dataset.id));
  });
}

async function showReceiptItems(id) {
  const { rows } = await api(`/api/dashboard/receipts/${id}/items`);
  document.getElementById('receiptItems').innerHTML = rows.length ? `
    <div class="table-wrap"><table>
      <thead><tr><th>صنف</th><th>كمية</th><th>السعر</th><th>خصم</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td>${esc(r.article_id)}</td>
          <td class="num">${fmtNum(r.quantity)}</td>
          <td class="num">${fmtNum(r.price)}</td>
          <td class="num">${fmtNum(r.discount)}</td>
        </tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty-detail">لا بنود</div>';
}

async function loadJournal(reset = true) {
  if (reset) state.journalCursor = '';
  const cur = state.journalCursor ? `&cursor=${state.journalCursor}` : '';
  const data = await api(`/api/dashboard/journal?limit=50${cur}`);
  const body = document.getElementById('journalBody');
  const rows = data.rows.map((r) => `
    <tr>
      <td>${esc(r.Seq)}</td>
      <td>${esc(r.Acc)}</td>
      <td class="num">${fmtNum(r.Am)}</td>
      <td>${r.Dept === 'True' ? '<span class="pill yes">مدين</span>' : '<span class="pill no">دائن</span>'}</td>
      <td>${esc(r.Exp1 || r.Remarks)}</td>
      <td>${esc(r.BillSeq)}</td>
      <td>${fmtDate(r.DtCreated)}</td>
    </tr>`).join('');
  body.innerHTML = reset ? rows : body.innerHTML + rows;
  state.journalCursor = data.nextCursor || '';
  document.getElementById('journalMoreBtn').hidden = !data.hasMore;
}

async function loadCash() {
  const { rows } = await api('/api/dashboard/cash');
  document.getElementById('cashBody').innerHTML = rows.map((r) => `
    <tr>
      <td>${esc(r.Seq)}</td>
      <td>${esc(r.Name)}</td>
      <td>${esc(r.Branch)}</td>
      <td>${esc(r.UserGroup)}</td>
      <td>${esc(r.FromTime)}</td>
      <td>${esc(r.ToTime)}</td>
    </tr>`).join('') || '<tr><td colspan="6">لا بيانات</td></tr>';
}

const loaders = {
  overview: loadOverview,
  accounts: loadAccounts,
  materials: loadMaterials,
  items: () => loadItems(true),
  invoices: () => loadInvoices(true),
  receipts: () => loadReceipts(true),
  journal: () => loadJournal(true),
  cash: loadCash
};

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  if (state.view === 'accounts') state.accounts = [];
  loaders[state.view]?.();
  toast('تم التحديث');
});

document.getElementById('accountSearch').addEventListener('input', () => loadAccounts());
document.getElementById('matRootBtn').addEventListener('click', () => {
  state.matPath = [{ seq: '0', name: 'الجذر' }];
  state.matParent = '0';
  loadMaterials();
});

document.getElementById('itemSearchBtn').addEventListener('click', () => {
  state.itemsSearch = document.getElementById('itemSearch').value;
  loadItems(true);
});
document.getElementById('itemSearch').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('itemSearchBtn').click();
});

document.getElementById('invoiceSearchBtn').addEventListener('click', () => {
  state.invoicesSearch = document.getElementById('invoiceSearch').value;
  loadInvoices(true);
});

document.getElementById('itemsExportBtn').addEventListener('click', () => exportItemsCsv());

document.getElementById('itemsMoreBtn').addEventListener('click', () => loadItems(false));
document.getElementById('invoicesMoreBtn').addEventListener('click', () => loadInvoices(false));
document.getElementById('receiptsMoreBtn').addEventListener('click', () => loadReceipts(false));
document.getElementById('journalMoreBtn').addEventListener('click', () => loadJournal(false));

document.getElementById('itemDrawer').addEventListener('click', (e) => {
  if (e.target.id === 'itemDrawer') e.currentTarget.classList.remove('open');
});

async function boot() {
  try {
    await initStatus();
    setView('overview');
  } catch (e) {
    toast(e.message);
  }
}

boot();
