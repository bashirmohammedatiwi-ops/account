const reports = {
  treeSeq: '',
  dateFrom: '',
  dateTo: '',
  invoices: [],
  total: 0,
  offset: 0,
  limit: 100,
  loading: false,
  hasRun: false
};

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function yearRange() {
  const now = new Date().getFullYear();
  const years = [];
  for (let y = now; y >= now - 15; y -= 1) years.push(y);
  return years;
}

function buildYearOptionsHtml() {
  return yearRange().map((y) => `<option value="${y}">${y}</option>`).join('');
}

function buildMonthOptionsHtml() {
  return AR_MONTHS.map((name, i) => {
    const n = i + 1;
    const num = String(n).padStart(2, '0');
    return `<option value="${n}">${num} — ${name}</option>`;
  }).join('');
}

function applyDatePickerValues(parts, parsed) {
  if (!parts?.day || !parts.month || !parts.year || !parsed) return;
  parts.year.value = String(parsed.year);
  parts.month.value = String(parsed.month);
  fillDayOptions(parts.day, parsed.year, parsed.month, parsed.day);
  updateDateDisplayFaces(parts);
}

function ensureDatePickerOptions(parts) {
  if (!parts?.day || !parts.month || !parts.year) return;
  if (parts.year.dataset.filled !== '1') {
    parts.year.innerHTML = buildYearOptionsHtml();
    parts.year.dataset.filled = '1';
  }
  if (parts.month.dataset.filled !== '1') {
    parts.month.innerHTML = buildMonthOptionsHtml();
    parts.month.dataset.filled = '1';
  }
}

function getDatePickerParts(rootId) {
  const root = document.getElementById(rootId);
  if (!root) return null;
  return {
    root,
    day: root.querySelector('[data-part="day"]'),
    month: root.querySelector('[data-part="month"]'),
    year: root.querySelector('[data-part="year"]'),
    faces: {
      day: root.querySelector('[data-face="day"]'),
      month: root.querySelector('[data-face="month"]'),
      year: root.querySelector('[data-face="year"]')
    }
  };
}

function updateDateDisplayFaces(parts) {
  if (!parts?.day || !parts.month || !parts.year) return;
  const day = Number(parts.day.value || 1);
  const month = Number(parts.month.value || 1);
  const year = parts.year.value || '—';
  if (parts.faces?.day) parts.faces.day.textContent = String(day).padStart(2, '0');
  if (parts.faces?.month) parts.faces.month.textContent = AR_MONTHS[month - 1] || '—';
  if (parts.faces?.year) parts.faces.year.textContent = year;
}

function fillDayOptions(daySel, year, month, selectedDay) {
  if (!daySel) return;
  const max = daysInMonth(year, month);
  const keep = Math.min(Math.max(selectedDay || 1, 1), max);
  daySel.innerHTML = Array.from({ length: max }, (_, i) => {
    const d = i + 1;
    return `<option value="${d}">${String(d).padStart(2, '0')}</option>`;
  }).join('');
  daySel.value = String(keep);
}

function setupDatePicker(rootId, initialIso) {
  const parts = getDatePickerParts(rootId);
  if (!parts?.day || !parts.month || !parts.year) return;

  const parsed = parseIsoDate(initialIso) || parseIsoDate(isoDate(new Date()));
  ensureDatePickerOptions(parts);
  applyDatePickerValues(parts, parsed);

  const refreshDays = () => {
    fillDayOptions(
      parts.day,
      Number(parts.year.value),
      Number(parts.month.value),
      Number(parts.day.value)
    );
    updateDateDisplayFaces(parts);
  };

  if (parts.root.dataset.ready === '1') return;
  parts.root.dataset.ready = '1';
  parts.year.addEventListener('change', refreshDays);
  parts.month.addEventListener('change', refreshDays);
  parts.day.addEventListener('change', () => updateDateDisplayFaces(parts));
}

function initAllDatePickers() {
  const defaults = defaultReportDates();
  setupDatePicker('reportsDateFromPicker', defaults.from);
  setupDatePicker('reportsDateToPicker', defaults.to);
}

function readDatePicker(rootId) {
  const parts = getDatePickerParts(rootId);
  if (!parts?.day || !parts.month || !parts.year) return '';
  const y = parts.year.value;
  const m = String(parts.month.value).padStart(2, '0');
  const d = String(parts.day.value).padStart(2, '0');
  if (!y || !parts.month.value || !parts.day.value) return '';
  return `${y}-${m}-${d}`;
}

function defaultReportDates() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: isoDate(from), to: isoDate(now) };
}

function applyDatePreset(preset) {
  const now = new Date();
  let from;
  let to;

  if (preset === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = now;
  } else if (preset === 'last-month') {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (preset === 'year') {
    from = new Date(now.getFullYear(), 0, 1);
    to = now;
  } else {
    return;
  }

  setupDatePicker('reportsDateFromPicker', isoDate(from));
  setupDatePicker('reportsDateToPicker', isoDate(to));

  document.querySelectorAll('.rpt-preset').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.preset === preset);
  });
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
  reports.treeSeq = sel?.value || '';
  reports.dateFrom = readDatePicker('reportsDateFromPicker');
  reports.dateTo = readDatePicker('reportsDateToPicker');
}

function renderPeriodBanner() {
  const banner = document.getElementById('reportsPeriodBanner');
  const text = document.getElementById('reportsPeriodText');
  if (!banner || !text) return;
  const from = readDatePicker('reportsDateFromPicker');
  const to = readDatePicker('reportsDateToPicker');
  if (!from || !to) {
    banner.classList.add('hidden');
    return;
  }
  text.textContent = `${fmtDate(from)}  ←  ${fmtDate(to)}`;
  banner.classList.remove('hidden');
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

function setReportsEmpty(show, message, title) {
  const empty = document.getElementById('reportsEmpty');
  const msg = document.getElementById('reportsEmptyMsg');
  const titleEl = empty?.querySelector('.rpt-empty-title');
  if (!empty) return;
  empty.classList.toggle('hidden', !show);
  if (msg && message) msg.textContent = message;
  if (titleEl && title) titleEl.textContent = title;
}

function renderReportsList() {
  const list = document.getElementById('reportsList');
  const results = document.getElementById('reportsResults');
  const meta = document.getElementById('reportsResultsMeta');
  const loadMore = document.getElementById('btnLoadMoreReports');

  if (!list) return;

  if (!reports.invoices.length) {
    results?.classList.add('hidden');
    if (reports.hasRun) {
      setReportsEmpty(true, 'لا توجد فواتير مبيعات في الفترة المحددة', 'لا توجد نتائج');
    }
    loadMore?.classList.add('hidden');
    return;
  }

  setReportsEmpty(false);
  results?.classList.remove('hidden');
  if (meta) meta.textContent = `${fmtNumAlways(reports.invoices.length)} من ${fmtNumAlways(reports.total)} فاتورة`;

  list.innerHTML = reports.invoices.map((inv) => {
    const cls = inv.isReturn ? 'is-return' : 'is-sale';
    return `
      <button type="button" class="rpt-inv ${cls}" data-seq="${esc(inv.seq)}" data-acc="${esc(inv.accSeq)}">
        <div class="rpt-inv-top">
          <span class="rpt-inv-num">فاتورة ${esc(inv.num || '—')}</span>
          <span class="rpt-inv-badge">${esc(inv.kindLabel)}</span>
        </div>
        <p class="rpt-inv-customer">${esc(inv.accountName || '—')}</p>
        <div class="rpt-inv-foot">
          <time dir="ltr">${fmtDate(inv.date)}</time>
          <strong dir="ltr">${fmtNumAlways(inv.netPay)}</strong>
        </div>
      </button>`;
  }).join('');

  loadMore?.classList.toggle('hidden', reports.invoices.length >= reports.total);
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
    reports.hasRun = true;
    if (append) reports.invoices.push(...batch);
    else reports.invoices = batch;
    reports.offset = reports.invoices.length;

    renderPeriodBanner();
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
  initAllDatePickers();
  populateReportsTreeSelect();
  document.getElementById('reportsSummary')?.classList.add('hidden');
  document.getElementById('reportsResults')?.classList.add('hidden');
  document.getElementById('reportsPeriodBanner')?.classList.add('hidden');
  if (!reports.hasRun) {
    setReportsEmpty(true, 'اختر الشجرة والفترة ثم اضغط «عرض المبيعات»', 'ابدأ التقرير');
  }
}

window.reportsNav = {
  applyScreen(name, { backBtn, toolbarWrap, title, crumb }) {
    if (name !== 'reports') return false;
    backBtn.classList.remove('hidden');
    toolbarWrap.classList.add('hidden');
    title.textContent = 'تقارير المبيعات';
    crumb.textContent = 'مبيعات · مرتجعات · صافي';
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
    if (reports.treeSeq && reports.hasRun) void loadSalesReport();
    return true;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initAllDatePickers();

  document.getElementById('btnRunReport')?.addEventListener('click', () => loadSalesReport());
  document.getElementById('btnLoadMoreReports')?.addEventListener('click', () => loadSalesReport({ append: true }));

  document.querySelectorAll('.rpt-preset').forEach((btn) => {
    btn.addEventListener('click', () => applyDatePreset(btn.dataset.preset));
  });

  document.getElementById('reportsList')?.addEventListener('click', (e) => {
    const row = e.target.closest('.rpt-inv');
    if (!row) return;
    state.invoiceFromScreen = 'reports';
    openInvoice(row.dataset.seq, 'seq', row.dataset.acc || '');
  });
});
