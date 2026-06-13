const reports = {
  treeSeq: '',
  dateFrom: '',
  dateTo: '',
  invoices: [],
  total: 0,
  offset: 0,
  limit: 100,
  loading: false
};

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultReportDates() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: isoDate(from), to: isoDate(now) };
}

function populateReportsTreeSelect() {
  const sel = document.getElementById('reportsTreeSelect');
  if (!sel) return;
  const prev = reports.treeSeq || sel.value;
  sel.innerHTML = '<option value="">— اختر شجرة —</option>' + (state.trees || []).map((t) =>
    `<option value="${esc(t.seq)}">${esc(t.num || '—')} · ${esc(t.name1 || '—')}</option>`
  ).join('');
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  else if (state.trees.length === 1) {
    sel.value = String(state.trees[0].seq);
    reports.treeSeq = sel.value;
  }
}

function readReportFilters() {
  const sel = document.getElementById('reportsTreeSelect');
  const fromEl = document.getElementById('reportsDateFrom');
  const toEl = document.getElementById('reportsDateTo');
  reports.treeSeq = sel?.value || '';
  reports.dateFrom = fromEl?.value || '';
  reports.dateTo = toEl?.value || '';
}

function renderReportsSummary(summary) {
  const box = document.getElementById('reportsSummary');
  if (!box) return;
  box.classList.remove('hidden');
  document.getElementById('reportsSalesAmount').textContent = fmtNumAlways(summary.salesAmount);
  document.getElementById('reportsReturnsAmount').textContent = fmtNumAlways(summary.returnsAmount);
  document.getElementById('reportsNetSales').textContent = fmtNumAlways(summary.netSales);
  document.getElementById('reportsSalesCount').textContent = `${fmtNumAlways(summary.salesCount)} فاتورة`;
  document.getElementById('reportsReturnsCount').textContent = `${fmtNumAlways(summary.returnCount)} مرتجع`;
  document.getElementById('reportsTotalCount').textContent = `${fmtNumAlways(summary.invoiceCount)} إجمالي`;
}

function renderReportsList() {
  const list = document.getElementById('reportsList');
  const results = document.getElementById('reportsResults');
  const empty = document.getElementById('reportsEmpty');
  const meta = document.getElementById('reportsResultsMeta');
  const loadMore = document.getElementById('btnLoadMoreReports');

  if (!list) return;

  if (!reports.invoices.length) {
    results?.classList.add('hidden');
    empty?.classList.remove('hidden');
    const msg = document.getElementById('reportsEmptyMsg');
    if (msg) msg.textContent = 'لا توجد فواتير مبيعات في هذه الفترة';
    loadMore?.classList.add('hidden');
    return;
  }

  empty?.classList.add('hidden');
  results?.classList.remove('hidden');
  if (meta) meta.textContent = `${fmtNumAlways(reports.invoices.length)} من ${fmtNumAlways(reports.total)}`;

  list.innerHTML = reports.invoices.map((inv) => {
    const amtClass = inv.isReturn ? 'is-return' : 'is-sale';
    return `
      <button type="button" class="reports-row ${amtClass}" data-seq="${esc(inv.seq)}" data-acc="${esc(inv.accSeq)}">
        <div class="reports-row-main">
          <span class="reports-row-num">فاتورة ${esc(inv.num || '—')}</span>
          <span class="reports-row-kind">${esc(inv.kindLabel)}</span>
        </div>
        <div class="reports-row-sub">
          <span>${esc(inv.accountName || '—')}</span>
          <span class="reports-row-date">${fmtDate(inv.date)}</span>
        </div>
        <div class="reports-row-amt" dir="ltr">${fmtNumAlways(inv.netPay)}</div>
      </button>`;
  }).join('');

  if (loadMore) {
    loadMore.classList.toggle('hidden', reports.invoices.length >= reports.total);
  }
}

async function loadSalesReport({ append = false } = {}) {
  readReportFilters();
  if (!reports.treeSeq) {
    alert('يرجى اختيار الشجرة');
    return;
  }
  if (!reports.dateFrom || !reports.dateTo) {
    alert('يرجى تحديد الفترة الزمنية');
    return;
  }
  if (reports.dateFrom > reports.dateTo) {
    alert('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
    return;
  }

  if (!append) {
    reports.offset = 0;
    reports.invoices = [];
  }

  reports.loading = true;
  setOverlay(true);
  try {
    const qs = new URLSearchParams({
      treeSeq: reports.treeSeq,
      dateFrom: reports.dateFrom,
      dateTo: reports.dateTo,
      limit: String(reports.limit),
      offset: String(reports.offset)
    });
    const data = await api(`/reports/sales?${qs.toString()}`);
    const batch = data.invoices || [];
    reports.total = Number(data.total || 0);
    if (append) reports.invoices.push(...batch);
    else reports.invoices = batch;
    reports.offset = reports.invoices.length;

    renderReportsSummary(data.summary || {});
    renderReportsList();
  } catch (e) {
    alert(e.message);
  } finally {
    reports.loading = false;
    setOverlay(false);
  }
}

function initReportsScreen() {
  const defaults = defaultReportDates();
  const fromEl = document.getElementById('reportsDateFrom');
  const toEl = document.getElementById('reportsDateTo');
  if (fromEl && !fromEl.value) fromEl.value = defaults.from;
  if (toEl && !toEl.value) toEl.value = defaults.to;
  populateReportsTreeSelect();

  const empty = document.getElementById('reportsEmpty');
  empty?.classList.remove('hidden');
  document.getElementById('reportsSummary')?.classList.add('hidden');
  document.getElementById('reportsResults')?.classList.add('hidden');
}

window.reportsNav = {
  applyScreen(name, { backBtn, toolbarWrap, title, crumb }) {
    if (name !== 'reports') return false;
    backBtn.classList.remove('hidden');
    toolbarWrap.classList.add('hidden');
    title.textContent = 'تقارير المبيعات';
    crumb.textContent = 'فلتر حسب الشجرة والفترة';
    const kicker = document.getElementById('headerKicker');
    if (kicker) kicker.textContent = 'Edari · التقارير';
    return true;
  },

  onScreen(name) {
    if (name === 'reports') initReportsScreen();
  },

  handleBack() {
    if (state.screen === 'reports') {
      goToScreen('home');
      return true;
    }
    return false;
  },

  refresh() {
    if (state.screen !== 'reports') return false;
    populateReportsTreeSelect();
    if (reports.treeSeq) void loadSalesReport();
    return true;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnRunReport')?.addEventListener('click', () => loadSalesReport());
  document.getElementById('btnLoadMoreReports')?.addEventListener('click', () => loadSalesReport({ append: true }));

  document.getElementById('reportsList')?.addEventListener('click', (e) => {
    const row = e.target.closest('.reports-row');
    if (!row) return;
    state.invoiceFromScreen = 'reports';
    openInvoice(row.dataset.seq, 'seq', row.dataset.acc || '');
  });
});
