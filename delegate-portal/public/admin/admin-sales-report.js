/* Admin: tree sales report — daily/monthly, PDF by tree */
const PINNED_TREES_KEY = 'edari.salesPinnedTrees';
const PINNED_BRANCHES_KEY = 'edari.salesPinnedBranches';
const PREVIEW_LINES_PER_TREE = 60;

/** الفروع المعتمدة — تُعرض فوراً قبل اكتمال قراءة Edari */
const STANDARD_SALES_BRANCHES = [
  { code: '136', label: 'الفرع 136', invoiceCount: 0 },
  { code: '138', label: 'الفرع 138', invoiceCount: 0 },
  { code: '1210413', label: 'دلفري — دلفري الخط الناقل جديد (1210413)', invoiceCount: 0 },
  { code: '1210420', label: 'دلفري — دلفري بغداد (1210420)', invoiceCount: 0 }
];

const salesReport = {
  trees: [],
  selected: new Set(),
  pinned: loadPinnedTrees(),
  branches: [],
  selectedBranches: new Set(),
  pinnedBranches: loadPinnedBranches(),
  branchesLoading: false,
  lastReport: null,
  lastFilters: null
};

let salesPreviewToken = 0;
let treeSearchLiveResults = [];
let treeSearchTimer = null;
let treeSearchBusy = false;

function normalizePinnedTreeEntry(raw) {
  if (typeof raw === 'string' || typeof raw === 'number') {
    const key = String(raw);
    return { key, num: key, name1: '' };
  }
  if (raw && typeof raw === 'object') {
    const key = String(raw.key || raw.num || raw.seq || '');
    return {
      key,
      num: String(raw.num || key),
      name1: String(raw.name1 || raw.name || '')
    };
  }
  return null;
}

function loadPinnedTrees() {
  try {
    const raw = JSON.parse(localStorage.getItem(PINNED_TREES_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizePinnedTreeEntry).filter((t) => t && t.key);
  } catch {
    return [];
  }
}

function pinnedTreeKeys() {
  return salesReport.pinned.map((p) => String(p.key));
}

function enrichPinnedTreeNames() {
  let changed = false;
  salesReport.pinned = salesReport.pinned.map((p) => {
    if (p.name1) return p;
    const t = findTreeByKey(p.key);
    if (!t?.name1) return p;
    changed = true;
    return { ...p, num: t.num || p.num, name1: t.name1 };
  });
  if (changed) savePinnedTrees({ skipServer: true });
}

function savePinnedTrees(opts = {}) {
  try {
    localStorage.setItem(PINNED_TREES_KEY, JSON.stringify(salesReport.pinned));
    if (!opts.skipServer) {
      window.adminSharedState?.patchUiPrefs?.({
        pinnedTrees: salesReport.pinned,
        updatedAt: new Date().toISOString()
      });
    }
  } catch {
    /* ignore quota/availability errors */
  }
}
function loadPinnedBranches() {
  try {
    const raw = JSON.parse(localStorage.getItem(PINNED_BRANCHES_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .map((b) => (typeof b === 'string'
        ? { code: b, label: `الفرع ${b}` }
        : { code: String(b.code || ''), label: String(b.label || `الفرع ${b.code || ''}`) }))
      .filter((b) => b.code);
  } catch {
    return [];
  }
}

function savePinnedBranches() {
  try {
    localStorage.setItem(PINNED_BRANCHES_KEY, JSON.stringify(salesReport.pinnedBranches));
    window.adminSharedState?.patchUiPrefs?.({
      pinnedBranches: salesReport.pinnedBranches,
      updatedAt: new Date().toISOString()
    });
  } catch {
    /* ignore */
  }
}

function hydratePinnedFromSharedState() {
  try {
    salesReport.pinned = loadPinnedTrees();
    salesReport.pinnedBranches = loadPinnedBranches();
    enrichPinnedTreeNames();
  } catch { /* ignore */ }
  renderPinnedTrees();
  renderPinnedBranches();
  renderTreeList();
  renderBranchList();
}

function treeKeyOf(t) {
  return String(t.num || t.seq || t.key || '');
}

function findTreeByKey(key) {
  const k = String(key);
  const fromLoaded = salesReport.trees.find((t) => String(t.num) === k || String(t.seq) === k);
  if (fromLoaded) return fromLoaded;
  const fromLive = treeSearchLiveResults.find((t) => String(t.num) === k || String(t.seq) === k);
  if (fromLive) return fromLive;
  const pinned = salesReport.pinned.find((p) => String(p.key) === k);
  if (pinned) return { seq: pinned.key, num: pinned.num || pinned.key, name1: pinned.name1 || '' };
  return null;
}

function salesTreeDisplayLabel(key) {
  const k = String(key);
  const pinned = salesReport.pinned.find((p) => String(p.key) === k);
  if (pinned?.name1) return `${pinned.num || k} — ${pinned.name1}`;
  const t = findTreeByKey(k);
  if (!t) return k;
  const num = t.num || k;
  const name = t.name1 || t.name || '';
  return name ? `${num} — ${name}` : String(num);
}

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoMonthStart(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function isoMonthEnd(d = new Date()) {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

function setSalesDateRange(from, to) {
  const fromEl = document.getElementById('salesReportDateFrom');
  const toEl = document.getElementById('salesReportDateTo');
  if (fromEl) fromEl.value = from;
  if (toEl) toEl.value = to;
}

function isoOfDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function setActiveSalesPreset(preset) {
  document.querySelectorAll('[data-sales-preset]').forEach((b) => {
    b.classList.toggle('active', b.dataset.salesPreset === preset);
  });
}

function applySalesPreset(preset) {
  const now = new Date();
  if (preset === 'today') {
    const t = isoToday();
    setSalesDateRange(t, t);
  } else if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const s = isoOfDate(y);
    setSalesDateRange(s, s);
  } else if (preset === 'month') {
    setSalesDateRange(isoMonthStart(now), isoMonthEnd(now));
  } else if (preset === 'last-month') {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    setSalesDateRange(isoMonthStart(prev), isoMonthEnd(prev));
  }
  setActiveSalesPreset(preset);
  invalidateSalesPreview();
}

function getSelectedReportTreeSeqs() {
  return [...salesReport.selected];
}

function filteredSalesReportTrees() {
  const q = (document.getElementById('salesReportTreeSearch')?.value || '').trim().toLowerCase();
  if (!q) return salesReport.trees;
  return salesReport.trees.filter((t) => {
    const hay = `${t.num} ${t.name1} ${t.seq}`.toLowerCase();
    return hay.includes(q);
  });
}

function updateSalesReportTreeHint() {
  const hint = document.getElementById('salesReportTreeHint');
  if (!hint) return;
  const total = salesReport.trees.length;
  if (!total) {
    hint.textContent = 'لا توجد شجرات مواد — تأكد أن EdariNX يعمل واتصال ODBC مضبوط في الإعدادات';
    return;
  }
  const sel = salesReport.selected.size;
  hint.textContent = sel
    ? `${sel} شجرة محددة · ${total} شجرة متاحة من Edari`
    : `اختر شجرة من القائمة المنسدلة — ${total} شجرة متاحة (086، 087، 126…)`;
}

function toggleTree(key) {
  const k = String(key || '').trim();
  if (!k) return;
  if (salesReport.selected.has(k)) salesReport.selected.delete(k);
  else salesReport.selected.add(k);
  invalidateSalesPreview();
  renderSalesReportTrees();
}

function removeSelectedTree(key) {
  salesReport.selected.delete(String(key));
  invalidateSalesPreview();
  renderSalesReportTrees();
}

function clearSelectedTrees() {
  salesReport.selected.clear();
  invalidateSalesPreview();
  renderSalesReportTrees();
}

function selectPinnedTrees() {
  if (!salesReport.pinned.length) {
    showToast('لا توجد شجرات مثبّتة — اضغط ★ بجانب الشجرة لتثبيتها', 'err');
    return false;
  }
  pinnedTreeKeys().forEach((k) => salesReport.selected.add(String(k)));
  invalidateSalesPreview();
  renderSalesReportTrees();
  return true;
}

function applyDefaultPinnedSelection() {
  salesReport.selected.clear();
  salesReport.selectedBranches.clear();
  pinnedTreeKeys().forEach((k) => salesReport.selected.add(String(k)));
  salesReport.pinnedBranches.forEach((b) => salesReport.selectedBranches.add(String(b.code)));
  renderSalesReportTrees();
  renderBranchUI();
}

function selectAllPinned(opts = {}) {
  const { silent = false } = opts;
  const hasTrees = salesReport.pinned.length > 0;
  const hasBranches = salesReport.pinnedBranches.length > 0;
  if (!hasTrees && !hasBranches) {
    if (!silent) showToast('لا توجد شجرات أو فروع مثبّتة — اضغط ★ بجانب العنصر لتثبيته', 'err');
    return;
  }
  applyDefaultPinnedSelection();
  invalidateSalesPreview();
  if (!silent) {
    const parts = [];
    if (hasTrees) parts.push(`${salesReport.pinned.length} شجرة`);
    if (hasBranches) parts.push(`${salesReport.pinnedBranches.length} فرع`);
    showToast(`تم تحديد المثبّتة: ${parts.join(' · ')}`);
  }
}

function toggleTreePin(key) {
  const k = String(key);
  const existing = salesReport.pinned.findIndex((p) => String(p.key) === k);
  if (existing >= 0) {
    salesReport.pinned = salesReport.pinned.filter((p) => String(p.key) !== k);
    salesReport.selected.delete(k);
  } else {
    const meta = treeMetaOf(findTreeByKey(k) || { num: k, name1: '', seq: k, subCount: 0 });
    salesReport.pinned = [...salesReport.pinned, {
      key: k,
      num: meta.num || k,
      name1: meta.name && meta.name !== '—' ? meta.name : ''
    }];
    salesReport.selected.add(k);
  }
  savePinnedTrees();
  invalidateSalesPreview();
  renderSalesReportTrees();
}

function treeMetaOf(t) {
  return { key: treeKeyOf(t), num: t.num || treeKeyOf(t), name: t.name1 || '—', sub: t.subCount || 0 };
}

function renderTreePickItem(t, pinnedSet) {
  const { key, num, name, sub } = treeMetaOf(t);
  const selected = salesReport.selected.has(key);
  const pinned = pinnedSet.has(key);
  return `
    <div class="pick-item${selected ? ' is-on' : ''}" data-tree="${esc(key)}" role="option" aria-selected="${selected}">
      <span class="pick-item-check" aria-hidden="true">${selected ? '✓' : ''}</span>
      <span class="pick-item-code">${esc(String(num))}</span>
      <span class="pick-item-name">${esc(name)}</span>
      <span class="pick-item-meta" title="عدد المواد">${sub}</span>
      <button type="button" class="pick-item-star${pinned ? ' is-pinned' : ''}" data-pin-tree="${esc(key)}" title="${pinned ? 'إلغاء التثبيت' : 'تثبيت'}">★</button>
    </div>`;
}

function renderTreePinCard(key) {
  const selected = salesReport.selected.has(key);
  const label = salesTreeDisplayLabel(key);
  const parts = label.split(' — ');
  const num = parts[0] || key;
  const name = parts.slice(1).join(' — ') || '—';
  return `
    <button type="button" class="pick-pin-card${selected ? ' is-on' : ''}" data-quick-tree="${esc(key)}" title="${esc(label)}">
      <span class="pick-pin-card-star" aria-hidden="true">★</span>
      <span class="pick-pin-card-code">${esc(num)}</span>
      <span class="pick-pin-card-name">${esc(name)}</span>
      ${selected ? '<span class="pick-pin-card-check" aria-hidden="true">✓</span>' : ''}
    </button>`;
}

function renderPinnedTreesSection() {
  const grid = document.getElementById('salesPinnedTreesGrid');
  const zone = document.getElementById('salesTreesPinZone');
  const empty = document.getElementById('salesPinnedTreesEmpty');
  const countEl = document.getElementById('salesPinnedTreeCount');
  if (!grid) return;
  const pinned = pinnedTreeKeys();
  if (countEl) countEl.textContent = pinned.length ? ` (${pinned.length})` : '';
  if (!pinned.length) {
    grid.innerHTML = '';
    if (zone) zone.classList.add('is-empty');
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (zone) zone.classList.remove('is-empty');
  if (empty) empty.classList.add('hidden');
  grid.innerHTML = pinned.map((key) => renderTreePinCard(key)).join('');
}

async function lookupMaterialTreesLive(q) {
  const query = String(q || '').trim();
  if (!query) {
    treeSearchLiveResults = [];
    return [];
  }
  if (window.edariDesktop?.searchEdariMaterialTrees) {
    const data = await window.edariDesktop.searchEdariMaterialTrees({ q: query });
    if (!data?.ok && data?.error) throw new Error(data.error);
    return (data.trees || data.results || []).map((t) => ({
      seq: String(t.seq || ''),
      num: String(t.num || t.seq || ''),
      name1: String(t.name1 || t.name || ''),
      subCount: Number(t.subCount ?? t.sub_count ?? 0)
    }));
  }
  const data = await api('/api/admin/edari/search-material-trees', {
    method: 'POST',
    body: JSON.stringify({ q: query })
  });
  return (data.trees || data.results || []).map((t) => ({
    seq: String(t.seq || ''),
    num: String(t.num || t.seq || ''),
    name1: String(t.name1 || t.name || ''),
    subCount: Number(t.subCount ?? t.sub_count ?? 0)
  }));
}

function scheduleTreeSearch() {
  clearTimeout(treeSearchTimer);
  treeSearchTimer = setTimeout(async () => {
    const q = (document.getElementById('salesReportTreeSearch')?.value || '').trim();
    const metaEl = document.getElementById('salesTreeListMeta');
    if (!q) {
      treeSearchLiveResults = [];
      treeSearchBusy = false;
      renderTreeList();
      return;
    }
    treeSearchBusy = true;
    if (metaEl) metaEl.textContent = 'جاري البحث في Edari…';
    try {
      treeSearchLiveResults = await lookupMaterialTreesLive(q);
    } catch (err) {
      treeSearchLiveResults = [];
      if (metaEl) metaEl.textContent = err.message;
    }
    treeSearchBusy = false;
    renderTreeList();
  }, 280);
}

function renderTreeList() {
  const list = document.getElementById('salesTreeList');
  const metaEl = document.getElementById('salesTreeListMeta');
  if (!list) return;
  const pinnedSet = new Set(pinnedTreeKeys());
  const q = (document.getElementById('salesReportTreeSearch')?.value || '').trim().toLowerCase();
  const base = q ? [] : salesReport.trees;
  const localFiltered = q
    ? salesReport.trees.filter((t) => `${t.num} ${t.name1} ${t.seq}`.toLowerCase().includes(q))
    : [];
  const liveFiltered = q ? treeSearchLiveResults : [];
  const merged = new Map();
  for (const t of [...localFiltered, ...liveFiltered, ...base]) {
    merged.set(treeKeyOf(t), t);
  }
  const present = new Set([...salesReport.trees.map(treeKeyOf), ...treeSearchLiveResults.map(treeKeyOf)]);
  const pinnedExtra = salesReport.pinned
    .filter((p) => !present.has(String(p.key)))
    .map((p) => ({
      seq: p.key,
      num: p.num || p.key,
      name1: p.name1 || '(مثبّتة)',
      subCount: 0
    }))
    .filter((t) => !q || `${t.num} ${t.name1}`.toLowerCase().includes(q));
  let trees = [...merged.values(), ...pinnedExtra];
  if (!q) trees = trees.filter((t) => !pinnedSet.has(treeKeyOf(t)));
  if (metaEl && !treeSearchBusy) {
    metaEl.textContent = trees.length ? `${trees.length} شجرة${q ? ' · Edari' : ''}` : (q ? 'لا توجد شجرات مطابقة في Edari' : '');
  }
  if (!trees.length) {
    list.innerHTML = `<div class="pick-empty">${q ? (treeSearchBusy ? 'جاري البحث…' : 'لا توجد شجرات مطابقة في Edari') : 'كل الشجرات المثبّتة أعلاه — أو ابحث لإضافة المزيد'}</div>`;
    return;
  }
  const sorted = [...trees].sort((a, b) => String(a.num || '').localeCompare(String(b.num || ''), 'ar'));
  list.innerHTML = sorted.map((t) => renderTreePickItem(t, pinnedSet)).join('');
}

function renderSelectedChips() {
  const wrap = document.getElementById('salesSelectedChips');
  const countEl = document.getElementById('salesTreeSelCount');
  if (!wrap) return;
  const keys = [...salesReport.selected];
  if (countEl) countEl.textContent = String(keys.length);
  if (!keys.length) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = keys.map((key) => {
    const label = salesTreeDisplayLabel(key);
    const num = label.split(' — ')[0] || key;
    return `
    <span class="pick-sel-chip">
      <span class="pick-sel-chip-code">${esc(num)}</span>
      <span class="pick-sel-chip-text">${esc(label)}</span>
      <button type="button" class="pick-sel-chip-x" data-remove-tree="${esc(key)}" aria-label="إزالة">×</button>
    </span>`;
  }).join('');
}

function renderPinnedQuickBar() {
  renderPinnedTreesSection();
}

function updateTreeTrigger() {
  const el = document.getElementById('salesTreeTriggerText');
  if (!el) return;
  const n = salesReport.selected.size;
  el.textContent = n ? `${n} شجرة محددة` : 'اختر الشجرات';
  el.classList.toggle('placeholder', !n);
}

function readSalesReportFilters() {
  return {
    treeSeqs: getSelectedReportTreeSeqs(),
    branches: [...salesReport.selectedBranches],
    dateFrom: document.getElementById('salesReportDateFrom')?.value || '',
    dateTo: document.getElementById('salesReportDateTo')?.value || '',
    includeSales: document.getElementById('salesFilterSales')?.checked !== false,
    includeReturns: document.getElementById('salesFilterReturns')?.checked !== false,
    onlyGifts: document.getElementById('salesFilterGifts')?.checked === true
  };
}

function salesReportQueryString(filters) {
  const qs = new URLSearchParams();
  qs.set('treeSeqs', (filters.treeSeqs || []).join(','));
  qs.set('dateFrom', filters.dateFrom || '');
  qs.set('dateTo', filters.dateTo || '');
  if (filters.branches?.length) qs.set('branches', filters.branches.join(','));
  if (!filters.includeSales) qs.set('includeSales', '0');
  if (!filters.includeReturns) qs.set('includeReturns', '0');
  if (filters.onlyGifts) qs.set('onlyGifts', '1');
  return qs.toString();
}

function branchLabelOf(code) {
  const c = String(code);
  const inList = salesReport.branches.find((b) => String(b.code) === c);
  if (inList) return inList.label || `الفرع ${c}`;
  const pinned = salesReport.pinnedBranches.find((b) => String(b.code) === c);
  return pinned?.label || `الفرع ${c}`;
}

function renderBranchPinCard(b) {
  const code = String(b.code);
  const selected = salesReport.selectedBranches.has(code);
  const label = b.label || code;
  return `
    <button type="button" class="pick-pin-card pick-pin-card-branch${selected ? ' is-on' : ''}" data-quick-branch="${esc(code)}" title="${esc(label)}">
      <span class="pick-pin-card-star" aria-hidden="true">★</span>
      <span class="pick-pin-card-code">${esc(code)}</span>
      <span class="pick-pin-card-name">${esc(label.replace(/^\d+\s*[-–]?\s*/, '') || label)}</span>
      ${selected ? '<span class="pick-pin-card-check" aria-hidden="true">✓</span>' : ''}
    </button>`;
}

function filteredBranches() {
  const q = (document.getElementById('salesBranchSearch')?.value || '').trim().toLowerCase();
  if (!q) return salesReport.branches;
  return salesReport.branches.filter((b) => `${b.code} ${b.label || ''}`.toLowerCase().includes(q));
}

async function lookupSalesBranchesLive(q) {
  const query = String(q || '').trim();
  if (!query) return [];
  const dateFrom = document.getElementById('salesReportDateFrom')?.value || '';
  const dateTo = document.getElementById('salesReportDateTo')?.value || '';
  const params = { q: query, dateFrom, dateTo };
  if (window.edariDesktop?.searchEdariSalesBranches) {
    const data = await window.edariDesktop.searchEdariSalesBranches(params);
    if (!data?.ok && data?.error) throw new Error(data.error);
    return data.branches || [];
  }
  const data = await api('/api/admin/edari/search-sales-branches', {
    method: 'POST',
    body: JSON.stringify(params)
  });
  return data.branches || [];
}

function scheduleBranchSearch() {
  clearTimeout(branchSearchTimer);
  branchSearchTimer = setTimeout(async () => {
    const q = (document.getElementById('salesBranchSearch')?.value || '').trim();
    const hint = document.getElementById('salesBranchHint');
    if (!q) {
      branchSearchLiveResults = [];
      branchSearchBusy = false;
      renderBranchList();
      return;
    }
    branchSearchBusy = true;
    if (hint) hint.textContent = 'جاري البحث في Edari…';
    try {
      branchSearchLiveResults = await lookupSalesBranchesLive(q);
    } catch (err) {
      branchSearchLiveResults = [];
      if (hint) hint.textContent = err.message || 'تعذّر البحث في الفروع';
    }
    branchSearchBusy = false;
    renderBranchList();
    updateBranchHint();
  }, 280);
}

function renderPinnedBranchesSection() {
  const grid = document.getElementById('salesPinnedBranchesGrid');
  const zone = document.getElementById('salesBranchesPinZone');
  const empty = document.getElementById('salesPinnedBranchesEmpty');
  const countEl = document.getElementById('salesPinnedBranchCount');
  if (!grid) return;
  const pinned = salesReport.pinnedBranches;
  if (countEl) countEl.textContent = pinned.length ? ` (${pinned.length})` : '';
  if (!pinned.length) {
    grid.innerHTML = '';
    if (zone) zone.classList.add('is-empty');
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (zone) zone.classList.remove('is-empty');
  if (empty) empty.classList.add('hidden');
  grid.innerHTML = pinned.map((b) => renderBranchPinCard(b)).join('');
}

function renderBranchPickItem(b, pinnedSet) {
  const code = String(b.code);
  const selected = salesReport.selectedBranches.has(code);
  const pinned = pinnedSet.has(code);
  const label = b.label || code;
  const shortName = label.replace(new RegExp(`^${code}\\s*[-–]?\\s*`), '') || label;
  return `
    <div class="pick-item pick-item-branch${selected ? ' is-on' : ''}" data-branch="${esc(code)}" role="option" aria-selected="${selected}">
      <span class="pick-item-check" aria-hidden="true">${selected ? '✓' : ''}</span>
      <span class="pick-item-code">${esc(code)}</span>
      <span class="pick-item-name">${esc(shortName)}</span>
      <span class="pick-item-meta" title="فواتير">${b.invoiceCount || 0}</span>
      <button type="button" class="pick-item-star${pinned ? ' is-pinned' : ''}" data-pin-branch="${esc(code)}" title="${pinned ? 'إلغاء التثبيت' : 'تثبيت'}">★</button>
    </div>`;
}

function renderBranchList() {
  const list = document.getElementById('salesBranchList');
  if (!list) return;
  const pinnedSet = new Set(salesReport.pinnedBranches.map((b) => String(b.code)));
  const q = (document.getElementById('salesBranchSearch')?.value || '').trim().toLowerCase();
  const base = q ? [] : filteredBranches();
  const localFiltered = q
    ? salesReport.branches.filter((b) => `${b.code} ${b.label || ''}`.toLowerCase().includes(q))
    : [];
  const liveFiltered = q ? branchSearchLiveResults : [];
  const merged = new Map();
  for (const b of [...localFiltered, ...liveFiltered, ...base]) {
    merged.set(String(b.code), b);
  }
  const present = new Set([...salesReport.branches.map((b) => String(b.code)), ...branchSearchLiveResults.map((b) => String(b.code))]);
  const pinnedExtra = salesReport.pinnedBranches
    .filter((b) => !present.has(String(b.code)))
    .map((b) => ({ code: String(b.code), label: b.label, invoiceCount: 0 }))
    .filter((b) => !q || `${b.code} ${b.label || ''}`.toLowerCase().includes(q));
  let branches = [...merged.values(), ...pinnedExtra];
  if (!q) branches = branches.filter((b) => !pinnedSet.has(String(b.code)));
  const loadingRow = (salesReport.branchesLoading || branchSearchBusy)
    ? '<div class="pick-empty"><span class="ms-inline-spin"></span> جاري تحميل الفروع…</div>'
    : '';
  if (!branches.length) {
    list.innerHTML = loadingRow || `<div class="pick-empty">${q ? 'لا فروع مطابقة' : (salesReport.branches.length ? 'الفروع المثبّتة أعلاه' : 'لا فروع في هذه الفترة')}</div>`;
    return;
  }
  const sorted = [...branches].sort((a, b) => String(a.code).localeCompare(String(b.code), 'ar'));
  list.innerHTML = loadingRow + sorted.map((b) => renderBranchPickItem(b, pinnedSet)).join('');
}

function renderBranchSelected() {
  const wrap = document.getElementById('salesBranchSelected');
  const countEl = document.getElementById('salesBranchSelCount');
  if (!wrap) return;
  const codes = [...salesReport.selectedBranches];
  if (countEl) countEl.textContent = String(codes.length);
  if (!codes.length) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = codes.map((code) => {
    const label = branchLabelOf(code);
    return `
    <span class="pick-sel-chip pick-sel-chip-branch">
      <span class="pick-sel-chip-code">${esc(String(code))}</span>
      <span class="pick-sel-chip-text">${esc(label)}</span>
      <button type="button" class="pick-sel-chip-x" data-remove-branch="${esc(String(code))}" aria-label="إزالة">×</button>
    </span>`;
  }).join('');
}

function renderBranchUI() {
  renderPinnedBranchesSection();
  renderBranchList();
  renderBranchSelected();
  updateBranchTrigger();
  updateBranchHint();
}

function updateBranchTrigger() {
  const el = document.getElementById('salesBranchTriggerText');
  if (!el) return;
  const n = salesReport.selectedBranches.size;
  el.textContent = n ? `${n} فرع محدد` : 'كل الفروع';
  el.classList.toggle('placeholder', !n);
}

function toggleBranch(code) {
  const c = String(code || '').trim();
  if (!c) return;
  if (salesReport.selectedBranches.has(c)) salesReport.selectedBranches.delete(c);
  else salesReport.selectedBranches.add(c);
  invalidateSalesPreview();
  renderBranchUI();
}

function selectPinnedBranches() {
  if (!salesReport.pinnedBranches.length) {
    showToast('لا توجد فروع مثبّتة — اضغط ★ بجانب الفرع لتثبيته', 'err');
    return false;
  }
  salesReport.pinnedBranches.forEach((b) => salesReport.selectedBranches.add(String(b.code)));
  invalidateSalesPreview();
  renderBranchUI();
  return true;
}

function toggleBranchPin(code) {
  const c = String(code);
  if (salesReport.pinnedBranches.some((b) => String(b.code) === c)) {
    salesReport.pinnedBranches = salesReport.pinnedBranches.filter((b) => String(b.code) !== c);
    salesReport.selectedBranches.delete(c);
  } else {
    salesReport.pinnedBranches = [...salesReport.pinnedBranches, { code: c, label: branchLabelOf(c) }];
    salesReport.selectedBranches.add(c);
  }
  savePinnedBranches();
  invalidateSalesPreview();
  renderBranchUI();
}

function clearSelectedBranches() {
  salesReport.selectedBranches.clear();
  invalidateSalesPreview();
  renderBranchUI();
}

function updateBranchHint() {
  const hint = document.getElementById('salesBranchHint');
  if (!hint) return;
  const q = (document.getElementById('salesBranchSearch')?.value || '').trim();
  if (branchSearchBusy) {
    hint.textContent = 'جاري البحث في Edari…';
    return;
  }
  if (q && branchSearchLiveResults.length) {
    hint.textContent = `${branchSearchLiveResults.length} فرع مطابق — اختر من القائمة`;
    return;
  }
  const total = salesReport.branches.length;
  const sel = salesReport.selectedBranches.size;
  if (salesReport.branchesLoading) {
    hint.textContent = 'جاري تحميل الفروع من Edari…';
  } else if (sel) {
    hint.textContent = `${sel} فرع محدد — الملخص الإجمالي يُحسب لهذه الفروع فقط`;
  } else if (total) {
    hint.textContent = `${total} فرع — دلفري بغداد وخط ناقل يظهران دائماً`;
  } else {
    hint.textContent = 'تُحمَّل تلقائياً حسب الفترة — اتركها فارغة لإجمالي كل الفروع';
  }
}

let branchLoadToken = 0;
let branchReloadTimer = null;
let branchSearchLiveResults = [];
let branchSearchTimer = null;
let branchSearchBusy = false;

function mergeLocalStandardBranches(branches) {
  const map = new Map((branches || []).map((b) => [String(b.code), b]));
  for (const std of STANDARD_SALES_BRANCHES) {
    if (!map.has(std.code)) map.set(std.code, { ...std });
  }
  return [...map.values()];
}

function invalidateSalesPreview() {
  salesReport.lastReport = null;
  salesReport.lastFilters = null;
  const preview = document.getElementById('salesReportPreview');
  if (preview && !preview.querySelector('.loading') && !preview.querySelector('.rpt2-kpis')) {
    preview.innerHTML = `
      <div class="report-empty">
        <span class="report-empty-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg></span>
        <strong>تم تغيير الفلاتر</strong>
        <p>اضغط معاينة أو «★ تحديد المثبّتة» لتحديث النتائج</p>
      </div>`;
  }
}

function scheduleBranchReload(opts = {}) {
  clearTimeout(branchReloadTimer);
  branchReloadTimer = setTimeout(() => { void loadSalesReportBranches(opts); }, 450);
}

async function loadSalesReportBranches(opts = {}) {
  const { silent = false } = opts;
  const dateFrom = document.getElementById('salesReportDateFrom')?.value || '';
  const dateTo = document.getElementById('salesReportDateTo')?.value || '';
  if (!dateFrom || !dateTo) {
    if (!silent) showToast('حدد تاريخ البداية والنهاية أولاً', 'err');
    return;
  }
  const token = ++branchLoadToken;
  if (!salesReport.branches.length) {
    salesReport.branches = mergeLocalStandardBranches([]);
    renderBranchUI();
  }
  const hint = document.getElementById('salesBranchHint');
  if (hint) hint.textContent = 'جاري تحديث عدد الفواتير من Edari…';
  salesReport.branchesLoading = true;
  renderBranchUI();
  try {
    let branches = [];
    if (window.edariDesktop?.listEdariSalesBranches) {
      const data = await window.edariDesktop.listEdariSalesBranches({ dateFrom, dateTo });
      if (!data?.ok) throw new Error(data?.error || 'فشل قراءة الفروع');
      branches = data.branches || [];
    } else {
      const qs = new URLSearchParams({ dateFrom, dateTo }).toString();
      const res = await api(`/api/admin/reports/sales/branches?${qs}`);
      branches = res.branches || [];
    }
    if (token !== branchLoadToken) return;
    salesReport.branches = mergeLocalStandardBranches(branches);
    salesReport.branchesLoading = false;
    renderBranchUI();
  } catch (err) {
    if (token !== branchLoadToken) return;
    salesReport.branches = mergeLocalStandardBranches(salesReport.branches);
    salesReport.branchesLoading = false;
    renderBranchUI();
    if (hint) hint.textContent = 'الفروع المعتمدة ظاهرة — تعذّر تحديث العدد من Edari';
    if (!silent) showToast(err.message, 'err');
  }
}

function renderSalesReportTrees() {
  updateSalesReportTreeHint();
  renderTreeList();
  renderSelectedChips();
  updateTreeTrigger();
  renderPinnedQuickBar();
}

function renderSalesReportPreview(report) {
  const wrap = document.getElementById('salesReportPreview');
  if (!wrap) return;
  if (!report?.sections?.length) {
    wrap.innerHTML = '<p class="muted">لا توجد نتائج</p>';
    return;
  }

  const grand = report.grandSummary || {};
  const meta = report.meta || {};
  const cats = report.systemSummary?.categories || report.grandSummary?.categories || null;
  const branchCount = (report.filters?.branches || []).length;
  const scopeText = branchCount ? `${branchCount} فرع محدد` : 'كل الفروع';
  const period = report.period || {};
  const periodText = period.dateFrom === period.dateTo
    ? `${period.dateFrom || ''}`
    : `${period.dateFrom || ''} ← ${period.dateTo || ''}`;

  const net = cats ? (Number(cats.sales?.amount || 0) - Number(cats.returns?.amount || 0)) : (grand.netAmount || 0);
  const ICONS = {
    sales: '<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>',
    gifts: '<svg viewBox="0 0 24 24"><path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7C12 7 12 2 8.5 2 6 2 6 7 12 7zM12 7s0-5 3.5-5C18 2 18 7 12 7z"/></svg>',
    returns: '<svg viewBox="0 0 24 24"><path d="M3 7v6h6M3 13a9 9 0 1 0 3-7"/></svg>',
    net: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9h4.5a2 2 0 1 1 0 4H9"/></svg>'
  };
  const kpiBlock = cats ? `
    <div class="rpt2-kpis">
      <div class="rpt2-kpi kpi-sales">
        <span class="rpt2-kpi-ic">${ICONS.sales}</span>
        <span class="rpt2-kpi-label">مبيعات</span>
        <span class="rpt2-kpi-value">${fmtMoney(cats.sales?.amount)}</span>
        <span class="rpt2-kpi-sub">العدد ${fmtMoney(cats.sales?.qty)}</span>
      </div>
      <div class="rpt2-kpi kpi-gifts">
        <span class="rpt2-kpi-ic">${ICONS.gifts}</span>
        <span class="rpt2-kpi-label">هدايا</span>
        <span class="rpt2-kpi-value">${fmtMoney(cats.gifts?.amount)}</span>
        <span class="rpt2-kpi-sub">العدد ${fmtMoney(cats.gifts?.bonus)}</span>
      </div>
      <div class="rpt2-kpi kpi-returns">
        <span class="rpt2-kpi-ic">${ICONS.returns}</span>
        <span class="rpt2-kpi-label">مردود</span>
        <span class="rpt2-kpi-value">${fmtMoney(cats.returns?.amount)}</span>
        <span class="rpt2-kpi-sub">العدد ${fmtMoney(cats.returns?.qty)}</span>
      </div>
      <div class="rpt2-kpi kpi-net">
        <span class="rpt2-kpi-ic">${ICONS.net}</span>
        <span class="rpt2-kpi-label">صافي المبيعات</span>
        <span class="rpt2-kpi-value">${fmtMoney(net)}</span>
        <span class="rpt2-kpi-sub">${grand.lineCount || 0} بند · ${report.sections.length} شجرة</span>
      </div>
    </div>` : '';

  wrap.innerHTML = `
    <div class="rpt2-results-toolbar">
      <h3 class="rpt2-results-title">الملخص الإجمالي</h3>
      <span class="muted" dir="ltr">${esc(periodText)}</span>
      <span class="rpt2-results-scope">${esc(scopeText)}</span>
    </div>
    ${kpiBlock}
    <div class="sales-legend">
      <span class="lg"><span class="lg-dot lg-gift"></span> هدية</span>
      <span class="lg"><span class="lg-dot lg-return"></span> مردود</span>
    </div>
    ${report.sections.map((section) => {
    const tree = section.tree || {};
    const summary = section.summary || {};
    const title = [tree.num, tree.name1].filter(Boolean).join(' — ') || tree.seq;
    const lines = section.lines || [];
    // totalLines يأتي من الخادم عندما تُقلَّم البنود للمعاينة.
    const totalLines = Number(section.totalLines ?? lines.length);
    return `
      <section class="sales-tree-block">
        <header class="sales-tree-head">
          <h3>شجرة مواد: ${esc(title)}</h3>
          <span class="muted">${summary.lineCount || 0} بند · كمية ${fmtMoney(summary.qtySum)} · صافي ${fmtMoney(summary.netAmount)}</span>
        </header>
        ${lines.length ? `
        <div class="table-scroll">
          <table class="data-table compact sales-lines-table">
            <thead>
              <tr>
                <th>تاريخ</th><th>فرع</th><th>نوع</th><th>قسم</th><th>باركود</th><th>المادة</th>
                <th>كم</th><th>سعر</th><th>إجمالي</th><th>بائع</th>
              </tr>
            </thead>
            <tbody>
              ${lines.slice(0, PREVIEW_LINES_PER_TREE).map((line) => `
                <tr class="${line.isGift ? 'sales-row-gift' : (line.isReturn ? 'sales-row-return' : '')}">
                  <td dir="ltr">${esc(String(line.date || '').slice(0, 10))}</td>
                  <td dir="ltr">${esc(line.branchNum || line.accountNum || '—')}</td>
                  <td>${esc(line.kindLabel)}</td>
                  <td dir="ltr">${esc(line.sectionNum || tree.num || '—')}</td>
                  <td dir="ltr">${esc(line.barcode || '—')}</td>
                  <td>${esc(line.matName || '—')}</td>
                  <td dir="ltr">${line.quant || 0}</td>
                  <td dir="ltr">${fmtMoney(line.unitPrice)}</td>
                  <td dir="ltr">${fmtMoney(line.lineTotal)}</td>
                  <td>${esc(line.sellerLabel || line.accountName || '—')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${totalLines > PREVIEW_LINES_PER_TREE ? `<p class="muted sales-lines-more">+ ${totalLines - PREVIEW_LINES_PER_TREE} بند إضافي — راجع PDF للتفاصيل الكاملة</p>` : ''}
        ` : '<p class="muted">لا توجد حركات في هذه الفترة</p>'}
      </section>`;
  }).join('')}`;
}

async function loadSalesReportTrees() {
  const hint = document.getElementById('salesReportTreeHint');
  if (hint) hint.textContent = 'جاري تحميل شجرات المواد من Edari...';
  try {
    let trees = [];
    let loadError = '';

    if (window.edariDesktop?.listEdariMaterialTrees) {
      const live = await window.edariDesktop.listEdariMaterialTrees();
      if (live?.ok === false) {
        loadError = live.error || 'فشل قراءة شجرات المواد من Edari';
      } else {
        trees = live?.trees || [];
      }
    }

    if (!trees.length && !loadError) {
      const edariApi = await api('/api/admin/edari/material-trees').catch((err) => {
        loadError = err.message;
        return { trees: [] };
      });
      trees = edariApi.trees || [];
    }

    if (!trees.length && !loadError) {
      const dbData = await api('/api/admin/reports/sales/trees').catch(() => ({ trees: [] }));
      trees = dbData.trees || [];
    }

    if (!trees.length && loadError) {
      throw new Error(loadError);
    }

    salesReport.trees = trees.map((t) => ({
      seq: t.seq,
      num: t.num || '',
      name1: t.name1 || '',
      subCount: Number(t.sub_count ?? t.subCount ?? 0)
    }));
    enrichPinnedTreeNames();
    renderSalesReportTrees();
  } catch (err) {
    renderSalesReportTrees();
    if (hint) {
      hint.textContent = `${err.message} — تحقق: EdariNX يعمل · ODBC مضبوط · إعدادات Edari`;
    }
  }
}

function base64ToPdfBlob(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}

async function querySalesReport(filters) {
  const previewPayload = { ...filters, previewLines: PREVIEW_LINES_PER_TREE };
  if (window.edariDesktop?.queryEdariSalesReport) {
    const data = await window.edariDesktop.queryEdariSalesReport(
      window.edariDesktop?.lanClient ? previewPayload : filters
    );
    if (!data?.ok) throw new Error(data?.error || 'فشل إنشاء التقرير من Edari');
    return data.report;
  }
  const res = await api(
    `/api/admin/reports/sales?${salesReportQueryString(filters)}&previewLines=${PREVIEW_LINES_PER_TREE}`
  );
  return res.report;
}

function sameSalesReportFilters(filters) {
  const prev = salesReport.lastFilters;
  if (!salesReport.lastReport || !prev || !filters) return false;
  return prev.dateFrom === filters.dateFrom
    && prev.dateTo === filters.dateTo
    && prev.includeSales === filters.includeSales
    && prev.includeReturns === filters.includeReturns
    && prev.onlyGifts === filters.onlyGifts
    && String([...(prev.treeSeqs || [])].sort().join(','))
      === String([...(filters.treeSeqs || [])].sort().join(','))
    && String([...(prev.branches || [])].sort().join(','))
      === String([...(filters.branches || [])].sort().join(','));
}

async function runSalesReportPreview() {
  const filters = readSalesReportFilters();
  if (!filters.treeSeqs.length) return showToast('اختر شجرة مواد واحدة على الأقل (مثل 086)', 'err');
  if (!filters.dateFrom || !filters.dateTo) return showToast('حدد تاريخ البداية والنهاية', 'err');

  if (sameSalesReportFilters(filters)) {
    renderSalesReportPreview(salesReport.lastReport);
    showToast('تم عرض المعاينة من الذاكرة');
    return;
  }

  const token = ++salesPreviewToken;
  const btn = document.getElementById('btnSalesReportPreview');
  const preview = document.getElementById('salesReportPreview');
  if (btn) btn.disabled = true;
  if (preview) preview.innerHTML = '<p class="muted loading">جاري الاستعلام من Edari...</p>';
  startTopLoading('جاري إنشاء المعاينة من Edari…');
  try {
    const report = await querySalesReport(filters);
    if (token !== salesPreviewToken) return;
    salesReport.lastReport = report;
    salesReport.lastFilters = {
      ...filters,
      treeSeqs: [...filters.treeSeqs],
      branches: [...(filters.branches || [])]
    };
    renderSalesReportPreview(report);
    if (!report.grandSummary?.lineCount && (report.meta?.sqlLines > 0 || report.meta?.rawLines > 0)) {
      showToast(`لا توجد بنود بعد الفلتر — وُجد ${report.meta.sqlLines ?? report.meta.rawLines} سطراً من Edari`, 'err');
    } else if (!report.grandSummary?.lineCount && report.meta?.matSeqs > 0) {
      showToast(`0 نتائج — ${report.meta.matSeqs} مادة · تحقق من التاريخ (${filters.dateFrom} → ${filters.dateTo})`, 'err');
    } else {
      showToast(report.meta?.cached ? 'تم عرض المعاينة (من الذاكرة)' : 'تم إنشاء المعاينة');
    }
  } catch (err) {
    if (token !== salesPreviewToken) return;
    if (preview) preview.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
    showToast(err.message, 'err');
  } finally {
    if (token !== salesPreviewToken) return;
    stopTopLoading();
    if (btn) btn.disabled = false;
  }
}

async function exportSalesReportPdf({ summaryOnly = false } = {}) {
  const filters = readSalesReportFilters();
  if (!filters.treeSeqs.length) return showToast('اختر شجرة مواد واحدة على الأقل (مثل 086)', 'err');
  if (!filters.dateFrom || !filters.dateTo) return showToast('حدد تاريخ البداية والنهاية', 'err');

  const btnId = summaryOnly ? 'btnSalesReportSummaryPdf' : 'btnSalesReportPdf';
  const btn = document.getElementById(btnId);
  if (btn) btn.disabled = true;
  startTopLoading(summaryOnly ? 'جاري تصدير PDF ملخص…' : 'جاري تصدير PDF…');
  const filePrefix = summaryOnly ? 'sales-trees-summary' : 'sales-trees';
  try {
    // على الجهاز الرئيسي فقط: توليد PDF داخل نفس العملية (بلا نقل شبكي).
    // الثانوي يستخدم البثّ الثنائي أدناه — أسرع كثيراً من base64 داخل JSON.
    if (window.edariDesktop?.isDesktop && window.edariDesktop?.exportEdariSalesReportPdf) {
      const payload = sameSalesReportFilters(filters)
        ? { report: salesReport.lastReport, summaryOnly }
        : { ...filters, summaryOnly };
      const data = await window.edariDesktop.exportEdariSalesReportPdf(payload);
      if (!data?.ok) throw new Error(data?.error || 'فشل تصدير PDF');
      if (!data.data) throw new Error('ملف PDF فارغ');
      const blob = base64ToPdfBlob(data.data);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename || `${filePrefix}-${filters.dateFrom}_${filters.dateTo}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast(summaryOnly ? 'تم تنزيل PDF الملخص' : 'تم تنزيل PDF');
      return;
    }

    const qs = salesReportQueryString(filters);
    const summaryQs = summaryOnly ? `${qs}&summary=1` : qs;
    const pdfBase = typeof getLanApiBase === 'function' ? getLanApiBase() : getApiBase();
    const res = await fetch(`${pdfBase}/api/admin/reports/sales.pdf?${summaryQs}`, {
      headers: { Accept: 'application/pdf', ...(window.adminAuth?.authHeaders?.() || {}) }
    });
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok) {
      let message = `فشل تصدير PDF (${res.status})`;
      if (contentType.includes('application/json')) {
        const data = await res.json().catch(() => ({}));
        message = data.error || message;
      }
      throw new Error(message);
    }
    const blob = await res.blob();
    if (!blob.size) throw new Error('ملف PDF فارغ');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filePrefix}-${filters.dateFrom}_${filters.dateTo}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(summaryOnly ? 'تم تنزيل PDF الملخص' : 'تم تنزيل PDF');
  } catch (err) {
    showToast(err.message, 'err');
  } finally {
    stopTopLoading();
    if (btn) btn.disabled = false;
  }
}

function openMsPanel(msId, open) {
  const ms = document.getElementById(msId);
  if (!ms) return;
  const panel = ms.querySelector('.ms-panel');
  const trigger = ms.querySelector('.ms-trigger');
  if (!panel || !trigger) return;
  const willOpen = open ?? panel.hidden;
  document.querySelectorAll('.ms-panel').forEach((p) => { p.hidden = true; });
  document.querySelectorAll('.ms-trigger').forEach((t) => t.setAttribute('aria-expanded', 'false'));
  panel.hidden = !willOpen;
  trigger.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) {
    const search = panel.querySelector('.ms-search');
    if (search) setTimeout(() => search.focus(), 30);
  }
}

function initSalesReportPage() {
  applySalesPreset('today');

  document.querySelectorAll('[data-sales-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applySalesPreset(btn.dataset.salesPreset);
      scheduleBranchReload({ silent: true });
    });
  });

  document.getElementById('salesPinnedTreesGrid')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-quick-tree]');
    if (chip) toggleTree(chip.dataset.quickTree);
  });
  document.getElementById('salesPinnedBranchesGrid')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-quick-branch]');
    if (chip) toggleBranch(chip.dataset.quickBranch);
  });

  document.getElementById('salesTreeList')?.addEventListener('click', (e) => {
    const pin = e.target.closest('[data-pin-tree]');
    if (pin) { e.stopPropagation(); toggleTreePin(pin.dataset.pinTree); return; }
    const row = e.target.closest('[data-tree]');
    if (row) toggleTree(row.dataset.tree);
  });
  document.getElementById('salesSelectedChips')?.addEventListener('click', (e) => {
    const key = e.target.closest('[data-remove-tree]')?.dataset.removeTree;
    if (key) removeSelectedTree(key);
  });
  document.getElementById('salesBranchSelected')?.addEventListener('click', (e) => {
    const code = e.target.closest('[data-remove-branch]')?.dataset.removeBranch;
    if (code) toggleBranch(code);
  });
  document.getElementById('btnSalesClearTrees')?.addEventListener('click', clearSelectedTrees);
  document.getElementById('btnSalesSelectAllPinned')?.addEventListener('click', selectAllPinned);
  document.getElementById('salesReportTreeSearch')?.addEventListener('input', scheduleTreeSearch);

  // Branches: list interactions (select row / pin star)
  document.getElementById('salesBranchList')?.addEventListener('click', (e) => {
    const pin = e.target.closest('[data-pin-branch]');
    if (pin) { e.stopPropagation(); toggleBranchPin(pin.dataset.pinBranch); return; }
    const row = e.target.closest('[data-branch]');
    if (row) toggleBranch(row.dataset.branch);
  });
  document.getElementById('btnSalesClearBranches')?.addEventListener('click', clearSelectedBranches);
  document.getElementById('salesBranchSearch')?.addEventListener('input', scheduleBranchSearch);
  document.getElementById('salesBranchSearch')?.addEventListener('focus', () => {
    if (!salesReport.branches.length && !branchSearchBusy) {
      void loadSalesReportBranches({ silent: true });
    }
  });

  document.getElementById('btnSalesReportPreview')?.addEventListener('click', () => {
    void runSalesReportPreview();
  });
  document.getElementById('btnSalesReportPdf')?.addEventListener('click', () => {
    void exportSalesReportPdf();
  });
  document.getElementById('btnSalesReportSummaryPdf')?.addEventListener('click', () => {
    void exportSalesReportPdf({ summaryOnly: true });
  });

  document.addEventListener('keydown', (e) => {
    const page = document.getElementById('page-salesReport');
    if (!page?.classList.contains('active')) return;
    const salesView = document.getElementById('reportView-sales');
    if (!salesView || salesView.classList.contains('hidden')) return;
    if (e.target.matches('input, textarea, select')) return;
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      void runSalesReportPreview();
    } else if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      void exportSalesReportPdf();
    }
  });

  // Auto-reload branches when the custom dates change
  const reloadBranches = () => {
    invalidateSalesPreview();
    scheduleBranchReload({ silent: true });
  };
  document.getElementById('salesReportDateFrom')?.addEventListener('change', reloadBranches);
  document.getElementById('salesReportDateTo')?.addEventListener('change', reloadBranches);

  ['salesFilterSales', 'salesFilterReturns', 'salesFilterGifts'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', invalidateSalesPreview);
  });
}

async function loadSalesReportPage() {
  hydratePinnedFromSharedState();
  applySalesPreset('today');
  salesReport.branches = mergeLocalStandardBranches([]);
  renderBranchUI();
  await Promise.all([
    loadSalesReportTrees(),
    loadSalesReportBranches({ silent: true })
  ]);
  applyDefaultPinnedSelection();
  renderPinnedQuickBar();
}

initSalesReportPage();

window.addEventListener('admin-shared-state-changed', () => {
  hydratePinnedFromSharedState();
  applyDefaultPinnedSelection();
  renderPinnedQuickBar();
});

window.adminPages = window.adminPages || {};
window.adminPages.salesReport = loadSalesReportPage;
