/* Admin: account statements (كشف حساب) — direct from Edari, multi-account PDF */
const STMT_SAVED_KEY = 'edari_stmt_saved_accounts';
const STMT_NAMES_KEY = 'edari_stmt_account_names';
const STMT_DEFAULTS = ['131', '132', '133', '136', '138', '31209'];

const accountStatements = {
  last: null,
  selected: [],
  saved: [],
  names: {}
};

function stmtLoadPersisted() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STMT_SAVED_KEY) || 'null'); } catch { saved = null; }
  if (!Array.isArray(saved)) saved = STMT_DEFAULTS.slice();
  accountStatements.saved = saved.map(String);
  try { accountStatements.names = JSON.parse(localStorage.getItem(STMT_NAMES_KEY) || '{}') || {}; } catch { accountStatements.names = {}; }
  accountStatements.selected = accountStatements.saved.slice();
}

async function stmtHydrateFromSharedState() {
  try {
    await window.adminSharedState?.refreshIfChanged?.();
    const ui = window.adminSharedState?.getUiPrefs?.() || {};
    if (Array.isArray(ui.stmtSavedAccounts) && ui.stmtSavedAccounts.length) {
      accountStatements.saved = ui.stmtSavedAccounts.map(String);
      accountStatements.selected = accountStatements.saved.slice();
    }
    if (ui.stmtAccountNames && typeof ui.stmtAccountNames === 'object') {
      accountStatements.names = { ...accountStatements.names, ...ui.stmtAccountNames };
    }
    renderStmtSelected();
    renderStmtSaved();
    void stmtHydrateAccountNames();
  } catch { /* ignore */ }
}

function stmtPersistSaved() {
  try {
    localStorage.setItem(STMT_SAVED_KEY, JSON.stringify(accountStatements.saved));
    window.adminSharedState?.patchUiPrefs?.({
      stmtSavedAccounts: accountStatements.saved,
      stmtAccountNames: accountStatements.names,
      updatedAt: new Date().toISOString()
    });
  } catch { /* ignore */ }
}
function stmtPersistNames() {
  try {
    localStorage.setItem(STMT_NAMES_KEY, JSON.stringify(accountStatements.names));
    window.adminSharedState?.patchUiPrefs?.({
      stmtAccountNames: accountStatements.names,
      updatedAt: new Date().toISOString()
    });
  } catch { /* ignore */ }
}

function stmtAccountName(num) {
  return accountStatements.names[String(num)] || '';
}

function stmtNormalizeNums(input) {
  return String(input || '')
    .split(/[,،\s\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stmtAddAccounts(nums) {
  let added = 0;
  for (const n of nums) {
    const num = String(n).trim();
    if (num && !accountStatements.selected.includes(num)) {
      accountStatements.selected.push(num);
      added++;
    }
  }
  if (added) {
    renderStmtSelected();
    renderStmtSaved();
  }
  return added;
}

function stmtRemoveAccount(num) {
  accountStatements.selected = accountStatements.selected.filter((n) => n !== String(num));
  renderStmtSelected();
  renderStmtSaved();
}

function renderStmtSelected() {
  const wrap = document.getElementById('stmtSelectedChips');
  if (!wrap) return;
  const sel = accountStatements.selected;
  if (!sel.length) {
    wrap.innerHTML = '<span class="muted sales-chips-empty">لم تُحدَّد حسابات بعد — أضف رقم حساب أو اختر من القائمة المحفوظة</span>';
    return;
  }
  wrap.innerHTML = sel.map((num) => {
    const name = stmtAccountName(num);
    const label = name ? `${num} — ${name}` : num;
    return `<span class="sales-chip">
      <button type="button" class="sales-chip-x" data-stmt-remove="${esc(num)}" title="إزالة">×</button>
      <span class="sales-chip-text" dir="rtl">${esc(label)}</span>
    </span>`;
  }).join('');
}

function renderStmtSaved() {
  const bar = document.getElementById('stmtSavedBar');
  if (!bar) return;
  const saved = accountStatements.saved;
  if (!saved.length) {
    bar.innerHTML = '<span class="muted sales-chips-empty">لا توجد قائمة محفوظة — حدّد حسابات ثم اضغط «حفظ التحديد»</span>';
    return;
  }
  bar.innerHTML = saved.map((num) => {
    const name = stmtAccountName(num);
    const label = name ? `${num} — ${name}` : num;
    const active = accountStatements.selected.includes(num);
    return `<span class="sales-pin-chip ${active ? 'active' : ''}">
      <button type="button" class="sales-pin-pick" data-stmt-pick="${esc(num)}">${esc(label)}</button>
      <button type="button" class="sales-pin-x" data-stmt-unsave="${esc(num)}" title="حذف من المحفوظة">×</button>
    </span>`;
  }).join('');
}

function stmtSaveCurrent() {
  if (!accountStatements.selected.length) return showToast('لا يوجد تحديد لحفظه', 'err');
  const merged = [...accountStatements.saved];
  accountStatements.selected.forEach((n) => { if (!merged.includes(n)) merged.push(n); });
  accountStatements.saved = merged;
  stmtPersistSaved();
  renderStmtSaved();
  showToast('تم حفظ القائمة');
}

function stmtUnsave(num) {
  accountStatements.saved = accountStatements.saved.filter((n) => n !== String(num));
  stmtPersistSaved();
  renderStmtSaved();
}

function stmtPickSaved(num) {
  if (accountStatements.selected.includes(String(num))) {
    stmtRemoveAccount(num);
  } else {
    stmtAddAccounts([num]);
  }
}

function cacheStmtNames(result) {
  let changed = false;
  for (const s of result?.statements || []) {
    const acc = s.account || {};
    if (acc.num && acc.name1) {
      accountStatements.names[String(acc.num)] = acc.name1;
      changed = true;
    }
  }
  if (changed) {
    stmtPersistNames();
    renderStmtSelected();
    renderStmtSaved();
  }
}

function readStmtAccountNums() {
  return accountStatements.selected.slice();
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

function setStmtDateRange(from, to) {
  const fromEl = document.getElementById('stmtDateFrom');
  const toEl = document.getElementById('stmtDateTo');
  if (fromEl) fromEl.value = from;
  if (toEl) toEl.value = to;
}

function setActiveStmtPreset(preset) {
  document.querySelectorAll('[data-stmt-preset]').forEach((b) => {
    b.classList.toggle('active', b.dataset.stmtPreset === preset);
  });
}

function applyStmtPreset(preset) {
  const now = new Date();
  if (preset === 'today') {
    const t = isoToday();
    setStmtDateRange(t, t);
  } else if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const s = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    setStmtDateRange(s, s);
  } else if (preset === 'month') {
    setStmtDateRange(isoMonthStart(now), isoMonthEnd(now));
  } else if (preset === 'last-month') {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    setStmtDateRange(isoMonthStart(prev), isoMonthEnd(prev));
  }
  setActiveStmtPreset(preset);
}

function readStmtFilters() {
  return {
    accounts: readStmtAccountNums(),
    dateFrom: document.getElementById('stmtDateFrom')?.value || '',
    dateTo: document.getElementById('stmtDateTo')?.value || ''
  };
}

async function queryAccountStatements(filters) {
  let lastErr = null;
  if (window.edariDesktop?.queryEdariAccountStatements) {
    try {
      const data = await window.edariDesktop.queryEdariAccountStatements(filters);
      if (data?.ok === false) throw new Error(data?.error || 'فشل إنشاء كشف الحساب من Edari');
      return data;
    } catch (err) {
      lastErr = err;
    }
  }
  if (typeof api === 'function') {
    try {
      const data = await api('/api/admin/edari/account-statements', {
        method: 'POST',
        body: JSON.stringify(filters)
      });
      if (data?.ok === false) throw new Error(data?.error || 'فشل إنشاء كشف الحساب من Edari');
      return data;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    lastErr?.message
    || 'تعذّر الاتصال بالجهاز الرئيسي لقراءة كشف الحساب — تحقق من LAN'
  );
}

/** يجلب أسماء الحسابات المحفوظة من Edari حتى تظهر بالاسم لا بالرقم فقط. */
async function stmtHydrateAccountNames() {
  const wanted = [...new Set([...accountStatements.saved, ...accountStatements.selected])]
    .map(String)
    .filter((num) => num && !accountStatements.names[num]);
  if (!wanted.length) return;

  try {
    let data = null;
    if (window.edariDesktop?.searchEdariAccounts) {
      data = await window.edariDesktop.searchEdariAccounts({ nums: wanted });
    } else if (typeof api === 'function') {
      data = await api('/api/admin/edari/search-accounts', {
        method: 'POST',
        body: JSON.stringify({ nums: wanted })
      });
    }
    let changed = false;
    for (const row of data?.results || []) {
      const num = String(row.num || '');
      const name = String(row.name || row.name1 || '');
      if (num && name && accountStatements.names[num] !== name) {
        accountStatements.names[num] = name;
        changed = true;
      }
    }
    if (changed) {
      stmtPersistNames();
      renderStmtSelected();
      renderStmtSaved();
    }
  } catch { /* الأرقام تبقى ظاهرة بدون أسماء */ }
}

function renderStmtPreview(result) {
  const wrap = document.getElementById('stmtPreview');
  if (!wrap) return;
  const statements = result?.statements || [];
  if (!statements.length) {
    wrap.innerHTML = '<p class="muted">لا توجد حسابات مطابقة</p>';
    return;
  }
  const missing = result.missing || [];
  const missingNote = missing.length
    ? `<p class="muted">حسابات غير موجودة: <span dir="ltr">${esc(missing.join('، '))}</span></p>`
    : '';

  const period = result.period || {};
  const periodText = period.dateFrom && period.dateTo
    ? (period.dateFrom === period.dateTo ? period.dateFrom : `${period.dateFrom} ← ${period.dateTo}`)
    : '';

  const totalDebit = statements.reduce((a, s) => a + Number(s.totalDebit || 0), 0);
  const totalCredit = statements.reduce((a, s) => a + Number(s.totalCredit || 0), 0);
  const netAmount = totalDebit - totalCredit;
  const netLabel = netAmount >= 0 ? 'مدين' : 'دائن';
  const ICONS = {
    debit: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
    credit: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    net: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9h4.5a2 2 0 1 1 0 4H9"/></svg>',
    accounts: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></svg>'
  };

  wrap.innerHTML = `
    <div class="rpt2-results-toolbar">
      <h3 class="rpt2-results-title">ملخص كشوف الحسابات</h3>
      ${periodText ? `<span class="muted" dir="ltr">${esc(periodText)}</span>` : ''}
      <span class="rpt2-results-scope">${statements.length} حساب</span>
    </div>
    <div class="rpt2-kpis">
      <div class="rpt2-kpi kpi-returns">
        <span class="rpt2-kpi-ic">${ICONS.debit}</span>
        <span class="rpt2-kpi-label">إجمالي مدين</span>
        <span class="rpt2-kpi-value">${fmtMoney(totalDebit)}</span>
        <span class="rpt2-kpi-sub">${statements.length} حساب</span>
      </div>
      <div class="rpt2-kpi kpi-sales">
        <span class="rpt2-kpi-ic">${ICONS.credit}</span>
        <span class="rpt2-kpi-label">إجمالي دائن</span>
        <span class="rpt2-kpi-value">${fmtMoney(totalCredit)}</span>
        <span class="rpt2-kpi-sub">${result.meta?.requested || statements.length} مطلوب</span>
      </div>
      <div class="rpt2-kpi kpi-net">
        <span class="rpt2-kpi-ic">${ICONS.net}</span>
        <span class="rpt2-kpi-label">الرصيد الصافي</span>
        <span class="rpt2-kpi-value">${fmtMoney(Math.abs(netAmount))}</span>
        <span class="rpt2-kpi-sub">${netLabel}</span>
      </div>
      <div class="rpt2-kpi kpi-gifts">
        <span class="rpt2-kpi-ic">${ICONS.accounts}</span>
        <span class="rpt2-kpi-label">الحسابات</span>
        <span class="rpt2-kpi-value">${statements.length}</span>
        <span class="rpt2-kpi-sub">${missing.length ? `${missing.length} غير موجود` : 'كلها موجودة'}</span>
      </div>
    </div>
    ${missingNote}
    <div class="table-scroll">
      <table class="data-table compact">
        <thead>
          <tr><th>الحساب</th><th>الاسم</th><th>حركات</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr>
        </thead>
        <tbody>
          ${statements.map((s) => {
    const acc = s.account || {};
    const sum = s.summary || {};
    return `
            <tr>
              <td dir="ltr">${esc(acc.num || '—')}</td>
              <td>${esc(acc.name1 || '—')}</td>
              <td dir="ltr">${s.lineCount || 0}</td>
              <td dir="ltr">${fmtMoney(s.totalDebit)}</td>
              <td dir="ltr">${fmtMoney(s.totalCredit)}</td>
              <td dir="ltr">${esc(sum.label || '')} ${fmtMoney(sum.amount || 0)}</td>
            </tr>`;
  }).join('')}
        </tbody>
      </table>
    </div>`;
}

async function runStmtPreview() {
  const filters = readStmtFilters();
  if (!filters.accounts.length) return showToast('اختر حساباً واحداً على الأقل', 'err');
  if (!filters.dateFrom || !filters.dateTo) return showToast('حدد تاريخ البداية والنهاية', 'err');
  const btn = document.getElementById('btnStmtPreview');
  const wrap = document.getElementById('stmtPreview');
  if (btn) btn.disabled = true;
  if (wrap) wrap.innerHTML = '<p class="muted loading">جاري الاستعلام من Edari...</p>';
  startTopLoading('جاري إنشاء كشف الحساب…');
  try {
    const result = await queryAccountStatements(filters);
    accountStatements.last = result;
    cacheStmtNames(result);
    renderStmtPreview(result);
    showToast(`تم جلب ${result.statements?.length || 0} كشف حساب`);
  } catch (err) {
    if (wrap) wrap.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
    showToast(err.message, 'err');
  } finally {
    stopTopLoading();
    if (btn) btn.disabled = false;
  }
}

async function exportStmtPdf() {
  const filters = readStmtFilters();
  if (!filters.accounts.length) return showToast('اختر حساباً واحداً على الأقل', 'err');
  if (!filters.dateFrom || !filters.dateTo) return showToast('حدد تاريخ البداية والنهاية', 'err');
  const btn = document.getElementById('btnStmtPdf');
  if (btn) btn.disabled = true;
  startTopLoading('جاري تصدير PDF…');
  try {
    // الرئيسي: توليد داخل العملية. الثانوي: بثّ ثنائي عبر LAN بدل base64.
    if (window.edariDesktop?.isDesktop && window.edariDesktop?.exportEdariAccountStatementsPdf) {
      const data = await window.edariDesktop.exportEdariAccountStatementsPdf(filters);
      if (!data?.ok) throw new Error(data?.error || 'فشل تصدير PDF');
      if (!data.data) throw new Error('ملف PDF فارغ');
      downloadPdfBlob(base64ToPdfBlob(data.data), data.filename || 'account-statements.pdf');
      const miss = (data.missing || []).length;
      showToast(miss ? `تم تنزيل PDF · ${miss} حساب غير موجود` : 'تم تنزيل PDF');
      return;
    }

    const qs = new URLSearchParams({
      accounts: filters.accounts.join(','),
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo
    }).toString();
    const base = typeof getLanApiBase === 'function' ? getLanApiBase() : getApiBase();
    const res = await fetch(`${base}/api/admin/reports/account-statements.pdf?${qs}`, {
      headers: { Accept: 'application/pdf', ...(window.adminAuth?.authHeaders?.() || {}) }
    });
    if (!res.ok) {
      let message = `فشل تصدير PDF (${res.status})`;
      if (String(res.headers.get('content-type') || '').includes('application/json')) {
        const data = await res.json().catch(() => ({}));
        message = data.error || message;
      }
      throw new Error(message);
    }
    const blob = await res.blob();
    if (!blob.size) throw new Error('ملف PDF فارغ');
    downloadPdfBlob(blob, `account-statements-${filters.dateFrom}_${filters.dateTo}.pdf`);
    const miss = Number(res.headers.get('X-Statements-Missing') || 0);
    showToast(miss ? `تم تنزيل PDF · ${miss} حساب غير موجود` : 'تم تنزيل PDF');
  } catch (err) {
    showToast(err.message, 'err');
  } finally {
    stopTopLoading();
    if (btn) btn.disabled = false;
  }
}

function downloadPdfBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function stmtAddFromInput() {
  const input = document.getElementById('stmtAccountInput');
  if (!input) return;
  const nums = stmtNormalizeNums(input.value);
  if (!nums.length) return;
  const added = stmtAddAccounts(nums);
  input.value = '';
  input.focus();
  if (!added) showToast('الحساب مُحدَّد مسبقاً', 'err');
}

let stmtSearchTimer = null;

async function searchStmtAccountsLive(q) {
  const box = document.getElementById('stmtSearchResults');
  if (!box) return;
  const query = String(q || '').trim();
  if (query.length < 1) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = '<p class="muted">جاري البحث في Edari…</p>';
  try {
    let data = null;
    if (window.edariDesktop?.searchEdariAccounts) {
      data = await window.edariDesktop.searchEdariAccounts({ q: query, kind: 'gl' });
    } else {
      data = await api('/api/admin/edari/search-accounts', {
        method: 'POST',
        body: JSON.stringify({ q: query, kind: 'gl' })
      });
    }
    const rows = data?.results || [];
    box.innerHTML = rows.map((r) => `
      <button type="button" class="rv-acc-hit" data-num="${esc(r.num)}" data-name="${esc(r.name)}">
        <span class="rv-acc-hit-num" dir="ltr">${esc(r.num)}</span>
        <span class="rv-acc-hit-name">${esc(r.name)}</span>
      </button>`).join('') || '<p class="muted">لا توجد حسابات مطابقة في Edari</p>';
    box.querySelectorAll('.rv-acc-hit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const num = btn.dataset.num;
        if (num) {
          if (btn.dataset.name) accountStatements.names[num] = btn.dataset.name;
          stmtAddAccounts([num]);
          stmtPersistNames();
        }
        box.innerHTML = '';
        const input = document.getElementById('stmtAccountInput');
        if (input) input.value = '';
      });
    });
  } catch (err) {
    box.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}

function scheduleStmtSearch() {
  clearTimeout(stmtSearchTimer);
  stmtSearchTimer = setTimeout(() => {
    const q = document.getElementById('stmtAccountInput')?.value || '';
    void searchStmtAccountsLive(q);
  }, 260);
}

function initAccountStatements() {
  stmtLoadPersisted();
  void stmtHydrateFromSharedState();
  void stmtHydrateAccountNames();
  applyStmtPreset('today');
  renderStmtSelected();
  renderStmtSaved();

  document.querySelectorAll('[data-stmt-preset]').forEach((btn) => {
    btn.addEventListener('click', () => applyStmtPreset(btn.dataset.stmtPreset));
  });

  document.getElementById('btnStmtAdd')?.addEventListener('click', stmtAddFromInput);
  document.getElementById('stmtAccountInput')?.addEventListener('input', scheduleStmtSearch);
  document.getElementById('stmtAccountInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      stmtAddFromInput();
    }
  });
  document.getElementById('btnStmtSaveList')?.addEventListener('click', stmtSaveCurrent);

  document.getElementById('stmtSelectedChips')?.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-stmt-remove]');
    if (rm) stmtRemoveAccount(rm.getAttribute('data-stmt-remove'));
  });
  document.getElementById('stmtSavedBar')?.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-stmt-pick]');
    if (pick) { stmtPickSaved(pick.getAttribute('data-stmt-pick')); return; }
    const uns = e.target.closest('[data-stmt-unsave]');
    if (uns) stmtUnsave(uns.getAttribute('data-stmt-unsave'));
  });

  document.getElementById('btnStmtPreview')?.addEventListener('click', () => {
    void runStmtPreview();
  });
  document.getElementById('btnStmtPdf')?.addEventListener('click', () => {
    void exportStmtPdf();
  });
}

initAccountStatements();

window.adminPages = window.adminPages || {};
window.adminPages.accountStatements = () => {
  stmtLoadPersisted();
  void stmtHydrateFromSharedState();
  void stmtHydrateAccountNames();
  applyStmtPreset('today');
  renderStmtSelected();
  renderStmtSaved();
};

window.addEventListener('admin-shared-state-changed', () => {
  void stmtHydrateFromSharedState();
});
