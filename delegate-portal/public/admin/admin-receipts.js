/* Admin: delegate receipt vouchers */

const RECEIPT_SETTINGS_LS_KEY = 'mandob_receipt_post_accounts';

const receiptAdmin = {
  settings: {
    cash: { seq: '', num: '', name: '' },
    commissionDebit: { seq: '', num: '', name: '' },
    commissionCredit: { seq: '', num: '', name: '' },
    discount: { seq: '', num: '', name: '' }
  },
  searchTimers: {},
  settingsSaveTimer: null,
  selected: null,
  agents: [],
  filterTimer: null
};

function todayLocalIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readReceiptSettingsCache() {
  try {
    const raw = localStorage.getItem(RECEIPT_SETTINGS_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeReceiptSettingsCache(settings) {
  try {
    localStorage.setItem(RECEIPT_SETTINGS_LS_KEY, JSON.stringify(settings || {}));
  } catch (_) {}
}

function mergeReceiptSettings(base, incoming) {
  const out = { ...base };
  for (const key of ['cash', 'commissionDebit', 'commissionCredit', 'discount']) {
    const acc = incoming?.[key];
    if (acc?.seq || acc?.num) out[key] = { seq: acc.seq || '', num: acc.num || '', name: acc.name || '' };
  }
  return out;
}

function receiptSettingsHasAccounts(settings) {
  return ['cash', 'commissionDebit', 'commissionCredit', 'discount']
    .some((k) => settings?.[k]?.seq || settings?.[k]?.num);
}

const RECEIPT_SETTING_FIELDS = [
  { key: 'cash', label: 'صندوق المبلغ', hint: 'صناديق الإداري', kind: 'cash', browse: 'عرض الصناديق', tone: 'cash', icon: 'M4 7h16v10H4zM8 11h8' },
  { key: 'commissionDebit', label: 'حـ/ العمولات', hint: 'مدين — حساب العمولة', kind: 'gl', tone: 'comm', icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' },
  { key: 'commissionCredit', label: 'مقابل العمولات', hint: 'دائن — حساب المقابل', kind: 'gl', tone: 'comm2', icon: 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6' },
  { key: 'discount', label: 'حـ/ الحسم', hint: 'حساب الحسم في الإداري', kind: 'gl', tone: 'disc', icon: 'M20 12H4M16 6l4 6-4 6' }
];

function rvAccLabel(acc) {
  if (!acc?.seq && !acc?.num) return 'غير محدد';
  return `${acc.num || ''} · ${acc.name || ''}`.trim();
}

function updateReceiptSettingsBadge() {
  const badge = document.getElementById('receiptSettingsBadge');
  if (!badge) return;
  const set = RECEIPT_SETTING_FIELDS.filter((f) => receiptAdmin.settings[f.key]?.seq).length;
  badge.textContent = `${fmtNumAlways(set)}/${fmtNumAlways(RECEIPT_SETTING_FIELDS.length)}`;
  badge.classList.toggle('is-complete', set === RECEIPT_SETTING_FIELDS.length);
}

function renderReceiptSettings() {
  const grid = document.getElementById('receiptSettingsGrid');
  if (!grid) return;
  grid.innerHTML = RECEIPT_SETTING_FIELDS.map((f) => {
    const acc = receiptAdmin.settings[f.key] || {};
    const picked = acc.seq ? rvAccLabel(acc) : '';
    const placeholder = f.kind === 'cash'
      ? 'ابحث في صناديق الإداري...'
      : 'رقم أو اسم الحساب...';
    return `
      <div class="rcv-acc-card rcv-acc-${f.tone}${acc.seq ? ' is-set' : ''}" data-rv-card="${f.key}">
        <div class="rcv-acc-head">
          <span class="rcv-acc-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${f.icon}"/></svg></span>
          <div class="rcv-acc-meta">
            <span class="rcv-acc-label">${esc(f.label)}</span>
            <span class="rcv-acc-hint">${esc(f.hint)}</span>
          </div>
          ${f.browse ? `<button type="button" class="btn btn-soft btn-sm" data-rv-browse="${f.key}">${esc(f.browse)}</button>` : ''}
        </div>
        <div class="rcv-acc-picked${acc.seq ? '' : ' is-empty'}" data-rv-acc-picked="${f.key}">
          ${acc.seq ? `<span class="num-en" dir="ltr">${esc(acc.num)}</span> ${esc(acc.name)}` : 'غير محدد'}
        </div>
        <div class="rcv-acc-search">
          <input type="search" class="search" data-rv-acc="${f.key}" data-rv-kind="${f.kind}"
            placeholder="${esc(placeholder)}" value="" autocomplete="off">
          <div class="rcv-acc-results" data-rv-acc-results="${f.key}"></div>
        </div>
      </div>`;
  }).join('');
  updateReceiptSettingsBadge();

  grid.querySelectorAll('[data-rv-acc]').forEach((input) => {
    const key = input.dataset.rvAcc;
    const kind = input.dataset.rvKind || 'gl';
    input.addEventListener('input', () => {
      clearTimeout(receiptAdmin.searchTimers[key]);
      receiptAdmin.searchTimers[key] = setTimeout(() => searchReceiptAccount(key, input.value, kind), 220);
    });
    input.addEventListener('focus', () => {
      if (kind === 'cash') void searchReceiptAccount(key, input.value, kind);
    });
  });
  grid.querySelectorAll('[data-rv-browse]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.rvBrowse;
      const input = grid.querySelector(`[data-rv-acc="${key}"]`);
      if (input) {
        input.value = '';
        input.focus();
      }
      void searchReceiptAccount(key, '', 'cash');
    });
  });
}

async function lookupReceiptAccounts(q, kind) {
  if (window.edariDesktop?.searchEdariAccounts) {
    const data = await window.edariDesktop.searchEdariAccounts({ q, kind });
    if (!data?.ok) throw new Error(data?.error || 'فشل البحث في الإداري');
    return data;
  }
  const qs = new URLSearchParams({ q: q || '', kind: kind || '' });
  return commerceApi(`/receipts/accounts/search?${qs}`);
}

async function searchReceiptAccount(key, q, kind = 'gl') {
  const box = document.querySelector(`[data-rv-acc-results="${key}"]`);
  if (!box) return;
  const query = String(q || '').trim();
  if (kind !== 'cash' && query.length < 1) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = '<p class="muted">جاري البحث في الإداري...</p>';
  try {
    const data = await lookupReceiptAccounts(query, kind);
    const rows = data.results || [];
    const source = data.source === 'edari' ? 'الإداري' : '';
    box.innerHTML = rows.map((r) => `
      <button type="button" class="rv-acc-hit" data-seq="${esc(r.seq)}" data-num="${esc(r.num)}" data-name="${esc(r.name)}">
        <span class="rv-acc-hit-num" dir="ltr">${esc(r.num)}</span>
        <span class="rv-acc-hit-name">${esc(r.name)}</span>
      </button>`).join('') || `<p class="muted">لا توجد صناديق/حسابات مطابقة${source ? ` في ${source}` : ''}</p>`;
    box.querySelectorAll('.rv-acc-hit').forEach((btn) => {
      btn.addEventListener('click', () => {
        receiptAdmin.settings[key] = {
          seq: btn.dataset.seq,
          num: btn.dataset.num,
          name: btn.dataset.name
        };
        writeReceiptSettingsCache(receiptAdmin.settings);
        renderReceiptSettings();
        scheduleReceiptSettingsSave();
      });
    });
  } catch (err) {
    box.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}

function scheduleReceiptSettingsSave() {
  clearTimeout(receiptAdmin.settingsSaveTimer);
  receiptAdmin.settingsSaveTimer = setTimeout(() => saveReceiptSettings({ silent: true }), 400);
}

async function loadReceiptSettings() {
  const cached = readReceiptSettingsCache();
  if (cached) {
    receiptAdmin.settings = mergeReceiptSettings(receiptAdmin.settings, cached);
    renderReceiptSettings();
  }
  try {
    const data = await commerceApi('/receipts/settings');
    const serverAccounts = data.accounts || {};
    if (receiptSettingsHasAccounts(serverAccounts)) {
      receiptAdmin.settings = mergeReceiptSettings(receiptAdmin.settings, serverAccounts);
    } else if (receiptSettingsHasAccounts(receiptAdmin.settings)) {
      await saveReceiptSettings({ silent: true, skipRender: true });
    }
    writeReceiptSettingsCache(receiptAdmin.settings);
    renderReceiptSettings();
  } catch (err) {
    if (!receiptSettingsHasAccounts(receiptAdmin.settings)) showToast(err.message, 'err');
  }
}

async function saveReceiptSettings({ silent = false, skipRender = false } = {}) {
  try {
    const data = await commerceApi('/receipts/settings', {
      method: 'PUT',
      body: JSON.stringify(receiptAdmin.settings)
    });
    receiptAdmin.settings = mergeReceiptSettings(receiptAdmin.settings, data.accounts || {});
    writeReceiptSettingsCache(receiptAdmin.settings);
    if (!skipRender) renderReceiptSettings();
    if (!silent) showToast('تم حفظ حسابات الترحيل');
  } catch (err) {
    if (!silent) showToast(err.message, 'err');
  }
}

function canPostReceiptsFromDesktop() {
  return !!window.edariDesktop?.postEdariReceipt;
}

function updateReceiptPostAlert() {
  const box = document.getElementById('receiptPostAlert');
  const text = document.getElementById('receiptPostAlertText');
  if (!box || !text) return;
  const ok = canPostReceiptsFromDesktop();
  box.classList.toggle('is-connected', ok);
  text.textContent = ok
    ? 'متصل بالإداري — يمكنك اختيار الصناديق وترحيل السندات مباشرة.'
    : 'افتح تطبيق الإدارة على Windows لاختيار صناديق الإداري وترحيل السندات.';
}

function receiptStatusPill(status, label) {
  const cls = ({ pending: 'pending', reviewed: 'ready', posted: 'posted', rejected: 'rejected' })[status] || 'pending';
  return `<span class="rcv-pill rcv-pill-${cls}">${esc(label)}</span>`;
}

function renderReceiptStatsCards(s) {
  const el = document.getElementById('receiptStats');
  if (!el) return;
  el.innerHTML = `
    <article class="rcv-stat rcv-stat-pending">
      <span class="rcv-stat-label">بانتظار المراجعة</span>
      <strong class="rcv-stat-value num-en" dir="ltr">${fmtNumAlways(s.pending || 0)}</strong>
      <span class="rcv-stat-amt num-en" dir="ltr">${fmtMoney(s.pendingAmount || 0)}</span>
    </article>
    <article class="rcv-stat rcv-stat-ready">
      <span class="rcv-stat-label">جاهز للترحيل</span>
      <strong class="rcv-stat-value num-en" dir="ltr">${fmtNumAlways(s.reviewed || 0)}</strong>
      <span class="rcv-stat-amt num-en" dir="ltr">${fmtMoney(s.reviewedAmount || 0)}</span>
    </article>
    <article class="rcv-stat rcv-stat-posted">
      <span class="rcv-stat-label">مُرحَّل</span>
      <strong class="rcv-stat-value num-en" dir="ltr">${fmtNumAlways(s.posted || 0)}</strong>
      <span class="rcv-stat-amt num-en" dir="ltr">${fmtMoney(s.postedAmount || 0)}</span>
    </article>
    <article class="rcv-stat rcv-stat-warn">
      <span class="rcv-stat-label">غير مُرحَّل</span>
      <strong class="rcv-stat-value num-en" dir="ltr">${fmtNumAlways(s.unpostedCount || 0)}</strong>
      <span class="rcv-stat-amt num-en" dir="ltr">${fmtMoney(s.unpostedAmount || 0)}</span>
    </article>
    <article class="rcv-stat rcv-stat-neutral">
      <span class="rcv-stat-label">اليوم</span>
      <strong class="rcv-stat-value num-en" dir="ltr">${fmtNumAlways(s.today || 0)}</strong>
      <span class="rcv-stat-amt">سند</span>
    </article>
    <article class="rcv-stat rcv-stat-total">
      <span class="rcv-stat-label">إجمالي المبالغ</span>
      <strong class="rcv-stat-value num-en" dir="ltr">${fmtMoney(s.totalAmount || 0)}</strong>
      <span class="rcv-stat-amt num-en" dir="ltr">${fmtNumAlways(s.total || 0)} سند</span>
    </article>`;
}

function receiptAgentInitial(name) {
  const ch = String(name || '?').trim().charAt(0);
  return ch || '?';
}

function showReceiptDetailEmpty() {
  const panel = document.getElementById('receiptDetailPanel');
  if (!panel) return;
  panel.classList.remove('has-receipt');
  panel.innerHTML = `
    <div class="rcv-detail-empty" id="receiptDetailEmpty">
      <div class="rcv-detail-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h6"/></svg>
      </div>
      <strong>اختر سند قبض</strong>
      <p>اضغط «مراجعة» من الجدول لعرض التفاصيل والترحيل</p>
    </div>`;
}

function canEditReceipt(status) {
  return status !== 'posted';
}

function receiptRowActions(r) {
  const editable = canEditReceipt(r.status);
  return `
    <div class="rcv-row-actions">
      <button type="button" class="btn btn-soft btn-sm" data-receipt-id="${r.id}">${editable ? 'مراجعة' : 'عرض'}</button>
      ${editable ? `<button type="button" class="btn btn-danger btn-sm" data-del-receipt="${r.id}">حذف</button>` : ''}
      ${r.status !== 'posted' && r.status !== 'rejected' ? `
      <button type="button" class="btn btn-primary btn-sm" data-post-receipt="${r.id}">ترحيل</button>` : ''}
    </div>`;
}

function receiptFilterQuery() {
  const status = document.getElementById('receiptStatusFilter')?.value || '';
  const agentId = document.getElementById('receiptAgentFilter')?.value || '';
  const from = document.getElementById('receiptFromFilter')?.value || '';
  const to = document.getElementById('receiptToFilter')?.value || '';
  const q = document.getElementById('receiptSearchFilter')?.value?.trim() || '';
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (agentId) params.set('agentId', agentId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (q) params.set('q', q);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function loadReceiptAgents() {
  if (receiptAdmin.agents.length) return receiptAdmin.agents;
  try {
    const data = await api('/api/admin/agents');
    receiptAdmin.agents = data.agents || [];
    const sel = document.getElementById('receiptAgentFilter');
    if (sel && sel.options.length <= 1) {
      receiptAdmin.agents.forEach((a) => {
        const opt = document.createElement('option');
        opt.value = String(a.id);
        opt.textContent = a.name || a.username || `#${a.id}`;
        sel.appendChild(opt);
      });
    }
  } catch (_) {
    receiptAdmin.agents = [];
  }
  return receiptAdmin.agents;
}

function resetReceiptFilters() {
  const ids = ['receiptSearchFilter', 'receiptFromFilter', 'receiptToFilter'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const status = document.getElementById('receiptStatusFilter');
  if (status) status.value = '';
  const agent = document.getElementById('receiptAgentFilter');
  if (agent) agent.value = '';
  void loadReceiptsPage();
}

async function loadReceiptsPage() {
  const qs = receiptFilterQuery();
  const [list, stats] = await Promise.all([
    commerceApi(`/receipts${qs}`),
    commerceApi('/receipts/stats')
  ]);
  const receipts = list.receipts || [];
  renderReceiptStatsCards(stats.stats || {});

  const countEl = document.getElementById('receiptListCount');
  if (countEl) countEl.innerHTML = `<span class="num-en" dir="ltr">${fmtNumAlways(receipts.length)}</span> سند`;

  document.getElementById('receiptsBody').innerHTML = receipts.map((r) => {
    const active = receiptAdmin.selected?.id === r.id ? ' is-active' : '';
    return `
    <tr class="rcv-row${active}" data-receipt-row="${r.id}">
      <td>
        <div class="rcv-cell-no">
          <span class="rcv-no num-en" dir="ltr">${esc(r.receiptNo)}</span>
          ${r.treeName ? `<small>${esc(r.treeName)}</small>` : ''}
        </div>
      </td>
      <td>
        <div class="rcv-cell-agent">
          <span class="rcv-agent-avatar">${esc(receiptAgentInitial(r.agentName))}</span>
          <span>${esc(r.agentName)}</span>
        </div>
      </td>
      <td>
        <div class="rcv-cell-customer">
          <strong>${esc(r.customerName || '—')}</strong>
          ${r.customerNum ? `<small class="num-en" dir="ltr">${esc(r.customerNum)}</small>` : ''}
        </div>
      </td>
      <td class="rcv-amt num-en" dir="ltr">${fmtMoney(r.amount)}</td>
      <td class="rcv-amt-sub num-en" dir="ltr">${fmtMoney(r.commission)}</td>
      <td class="rcv-amt-sub num-en" dir="ltr">${fmtMoney(r.discount)}</td>
      <td>${receiptStatusPill(r.status, r.statusLabel)}</td>
      <td class="rcv-date num-en" dir="ltr">${fmtDateEn(r.submittedAt || r.createdAt)}</td>
      <td>${receiptRowActions(r)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="9"><div class="rcv-empty">لا توجد سندات قبض — تظهر هنا بعد إرسال المندوب</div></td></tr>`;

  document.querySelectorAll('[data-receipt-id]').forEach((btn) => {
    btn.addEventListener('click', () => openReceiptDetail(Number(btn.dataset.receiptId)));
  });
  document.querySelectorAll('[data-del-receipt]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteReceiptUi(Number(btn.dataset.delReceipt));
    });
  });
  document.querySelectorAll('[data-post-receipt]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      postReceiptToEdariUi(Number(btn.dataset.postReceipt));
    });
  });
  document.querySelectorAll('[data-receipt-row]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openReceiptDetail(Number(row.dataset.receiptRow));
    });
  });
}

function journalPreviewTable(lines = []) {
  if (!lines.length) return '<p class="rcv-muted">لا توجد بنود قيد — راجع المبالغ والحسابات</p>';
  return `
    <div class="rcv-journal-wrap">
      <table class="rcv-journal">
        <thead><tr><th>مدين</th><th>دائن</th><th>الحساب</th><th>البيان</th></tr></thead>
        <tbody>
          ${lines.map((ln) => `
            <tr>
              <td class="num-en" dir="ltr">${ln.isDebit ? fmtMoney(ln.amount) : '—'}</td>
              <td class="num-en" dir="ltr">${ln.isDebit ? '—' : fmtMoney(ln.amount)}</td>
              <td><span class="num-en" dir="ltr">${esc(ln.accNum)}</span> ${esc(ln.accName)}</td>
              <td>${esc(ln.exp1)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function openReceiptDetail(id) {
  const data = await commerceApi(`/receipts/${id}`);
  const r = data.receipt;
  receiptAdmin.selected = r;
  receiptAdmin.editCustomer = {
    seq: r.customerAccSeq,
    num: r.customerNum,
    name: r.customerName
  };
  const posting = data.posting || {};
  const panel = document.getElementById('receiptDetailPanel');
  panel.classList.add('has-receipt');
  const locked = !canEditReceipt(r.status);
  const customerLabel = `${r.customerNum || ''} · ${r.customerName || ''}`.trim();
  const postingDateHint = locked ? '' : `<p class="rcv-post-hint">يُرحَّل بتاريخ اليوم: <span class="num-en" dir="ltr">${todayLocalIso()}</span></p>`;

  panel.innerHTML = `
    <div class="rcv-detail-inner">
      <div class="rcv-detail-head">
        <div>
          <span class="rcv-detail-kicker">سند قبض</span>
          <h3 class="rcv-detail-title num-en" dir="ltr">${esc(r.receiptNo)}</h3>
          <p class="rcv-detail-sub">${esc(r.agentName)}${r.treeName ? ` · ${esc(r.treeName)}` : ''}</p>
        </div>
        ${receiptStatusPill(r.status, r.statusLabel)}
      </div>

      <div class="rcv-detail-amounts">
        <div class="rcv-detail-amt rcv-detail-amt-main">
          <span>المبلغ</span>
          <strong class="num-en" dir="ltr">${fmtMoney(r.amount)}</strong>
        </div>
        <div class="rcv-detail-amt">
          <span>عمولة</span>
          <strong class="num-en" dir="ltr">${fmtMoney(r.commission)}</strong>
        </div>
        <div class="rcv-detail-amt">
          <span>حسم</span>
          <strong class="num-en" dir="ltr">${fmtMoney(r.discount)}</strong>
        </div>
        <div class="rcv-detail-amt">
          <span>تاريخ السند</span>
          <strong class="num-en" dir="ltr">${fmtDateEn(r.receiptDate)}</strong>
        </div>
      </div>

      <label class="rcv-field">
        <span>الزبون</span>
        <input type="search" class="search" id="rvEditCustomerSearch"
          placeholder="بحث لتغيير الزبون..."
          value="${esc(customerLabel)}" ${locked ? 'readonly' : ''}>
        <small id="rvEditCustomerPicked">${esc(customerLabel || 'اختر زبوناً')}</small>
        <div class="rcv-acc-results" id="rvEditCustomerResults"></div>
      </label>

      <div class="rcv-edit-grid">
        <label class="rcv-field"><span>المبلغ</span>
          <input type="number" class="num-en" id="rvEditAmount" min="0" step="1" value="${r.amount}" ${locked ? 'readonly' : ''}></label>
        <label class="rcv-field"><span>العمولة</span>
          <input type="number" class="num-en" id="rvEditCommission" min="0" step="1" value="${r.commission}" ${locked ? 'readonly' : ''}></label>
        <label class="rcv-field"><span>الحسم</span>
          <input type="number" class="num-en" id="rvEditDiscount" min="0" step="1" value="${r.discount}" ${locked ? 'readonly' : ''}></label>
        <label class="rcv-field"><span>تاريخ السند</span>
          <input type="date" class="num-en" id="rvEditDate" value="${esc((r.receiptDate || '').slice(0, 10))}" ${locked ? 'readonly' : ''}></label>
      </div>

      <label class="rcv-field"><span>ملاحظات / البيان</span>
        <textarea id="rvEditNotes" rows="2" ${locked ? 'readonly' : ''}>${esc(r.notes)}</textarea></label>
      <label class="rcv-field"><span>ملاحظة الإدارة</span>
        <textarea id="rvEditAdminNote" rows="2" ${locked ? 'readonly' : ''}>${esc(r.adminNote)}</textarea></label>

      <div class="rcv-journal-block">
        <h4>معاينة سند القيد</h4>
        ${postingDateHint}
        ${journalPreviewTable(posting.lines || r.journalPreview)}
        ${posting.error ? `<p class="rcv-error">${esc(posting.error)}</p>` : ''}
      </div>

      ${r.edariJournalNum ? `<p class="rcv-muted">سند قيد: <span class="num-en" dir="ltr">${esc(r.edariJournalNum)}</span> · قبض: <span class="num-en" dir="ltr">${esc(r.edariReceiptNum || r.receiptNo)}</span></p>` : ''}
      ${r.postedError ? `<p class="rcv-error">${esc(r.postedError)}</p>` : ''}

      ${locked ? '' : `
      <div class="rcv-detail-actions">
        <button type="button" class="btn btn-primary" id="btnSaveReceiptEdit">حفظ</button>
        <button type="button" class="btn btn-soft" id="btnPostReceipt">ترحيل للإداري</button>
        <button type="button" class="btn btn-soft" id="btnRejectReceipt">رفض</button>
        <button type="button" class="btn btn-danger" id="btnDeleteReceipt">حذف</button>
      </div>
      ${canPostReceiptsFromDesktop() ? '' : '<p class="rcv-muted">الترحيل من تطبيق الإدارة المكتبي فقط</p>'}`}
    </div>`;

  document.querySelectorAll('[data-receipt-row]').forEach((row) => {
    row.classList.toggle('is-active', Number(row.dataset.receiptRow) === id);
  });

  if (!locked) {
    bindReceiptCustomerSearch();
    document.getElementById('btnSaveReceiptEdit')?.addEventListener('click', () => saveReceiptEdit(r.id));
    document.getElementById('btnDeleteReceipt')?.addEventListener('click', () => deleteReceiptUi(r.id));
    document.getElementById('btnRejectReceipt')?.addEventListener('click', () => rejectReceipt(r.id));
    document.getElementById('btnPostReceipt')?.addEventListener('click', () => postReceiptToEdariUi(r.id));
  }
}

function bindReceiptCustomerSearch() {
  const input = document.getElementById('rvEditCustomerSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(receiptAdmin.searchTimers.customer);
    receiptAdmin.searchTimers.customer = setTimeout(
      () => searchReceiptCustomer(input.value),
      280
    );
  });
}

async function searchReceiptCustomer(q) {
  const box = document.getElementById('rvEditCustomerResults');
  const picked = document.getElementById('rvEditCustomerPicked');
  if (!box) return;
  const query = String(q || '').trim();
  if (query.length < 2) {
    box.innerHTML = '';
    return;
  }
  try {
    const data = await commerceApi(`/receipts/accounts/search?q=${encodeURIComponent(query)}`);
    const rows = data.results || [];
    box.innerHTML = rows.map((r) => `
      <button type="button" class="rv-acc-hit" data-seq="${esc(r.seq)}" data-num="${esc(r.num)}" data-name="${esc(r.name)}">
        <strong dir="ltr">${esc(r.num)}</strong> ${esc(r.name)}
      </button>`).join('') || '<p class="muted">لا نتائج</p>';
    box.querySelectorAll('.rv-acc-hit').forEach((btn) => {
      btn.addEventListener('click', () => {
        receiptAdmin.editCustomer = {
          seq: btn.dataset.seq,
          num: btn.dataset.num,
          name: btn.dataset.name
        };
        const search = document.getElementById('rvEditCustomerSearch');
        if (search) search.value = `${btn.dataset.num} ${btn.dataset.name}`.trim();
        if (picked) picked.textContent = `${btn.dataset.num} ${btn.dataset.name}`.trim();
        box.innerHTML = '';
      });
    });
  } catch (err) {
    box.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}

async function saveReceiptEdit(id) {
  try {
    await commerceApi(`/receipts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        customerAccSeq: receiptAdmin.editCustomer?.seq || undefined,
        amount: document.getElementById('rvEditAmount')?.value,
        commission: document.getElementById('rvEditCommission')?.value,
        discount: document.getElementById('rvEditDiscount')?.value,
        receiptDate: document.getElementById('rvEditDate')?.value,
        notes: document.getElementById('rvEditNotes')?.value,
        adminNote: document.getElementById('rvEditAdminNote')?.value
      })
    });
    showToast('تم حفظ التعديل');
    await loadReceiptsPage();
    await openReceiptDetail(id);
  } catch (err) {
    showToast(err.message, 'err');
  }
}

async function deleteReceiptUi(id) {
  const selected = receiptAdmin.selected;
  const label = selected?.id === id ? selected.receiptNo : String(id);
  if (!confirm(`حذف سند القبض ${label} نهائياً؟\nلا يمكن التراجع، ولن يُرحَّل للإداري.`)) return;
  try {
    await commerceApi(`/receipts/${id}`, { method: 'DELETE' });
    showToast('تم حذف سند القبض');
    if (receiptAdmin.selected?.id === id) {
      receiptAdmin.selected = null;
      showReceiptDetailEmpty();
    }
    await loadReceiptsPage();
  } catch (err) {
    showToast(err.message, 'err');
  }
}

async function rejectReceipt(id) {
  if (!confirm('رفض سند القبض؟')) return;
  try {
    await commerceApi(`/receipts/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected', note: 'رفض من الإدارة' })
    });
    showToast('تم الرفض');
    await loadReceiptsPage();
    await openReceiptDetail(id);
  } catch (err) {
    showToast(err.message, 'err');
  }
}

async function postReceiptToEdariUi(id) {
  try {
    const data = await commerceApi(`/receipts/${id}`);
    const posting = data.posting;
    if (posting?.error) {
      showToast(posting.error, 'err');
      return;
    }
    if (!canPostReceiptsFromDesktop()) {
      showToast('افتح تطبيق الإدارة على Windows للترحيل', 'err');
      return;
    }
    if (data.receipt.status === 'posted') {
      showToast('السند مُرحَّل مسبقاً');
      return;
    }
    const postingDate = todayLocalIso();
    if (!confirm(`ترحيل سند ${data.receipt.receiptNo} إلى الإداري بتاريخ ${postingDate}؟`)) return;
    const result = await window.edariDesktop.postEdariReceipt({
      receiptNo: data.receipt.receiptNo,
      postingDate,
      lines: posting.lines
    });
    if (!result?.ok) {
      await commerceApi(`/receipts/${id}/posted`, {
        method: 'POST',
        body: JSON.stringify({ error: result?.error || 'فشل الترحيل' })
      });
      throw new Error(result?.error || 'فشل الترحيل');
    }
    await commerceApi(`/receipts/${id}/posted`, {
      method: 'POST',
      body: JSON.stringify({
        journalNum: result.journalNum,
        receiptNum: result.receiptNum || data.receipt.receiptNo,
        postingDate,
        lines: result.lines || posting.lines
      })
    });
    showToast(`تم الترحيل · سند قيد ${result.journalNum}`);
    await loadReceiptsPage();
    await openReceiptDetail(id);
  } catch (err) {
    showToast(err.message, 'err');
  }
}

function initReceiptsAdmin() {
  document.getElementById('btnSaveReceiptSettings')?.addEventListener('click', () => saveReceiptSettings());
  document.getElementById('receiptStatusFilter')?.addEventListener('change', () => loadReceiptsPage());
  document.getElementById('receiptAgentFilter')?.addEventListener('change', () => loadReceiptsPage());
  document.getElementById('receiptFromFilter')?.addEventListener('change', () => loadReceiptsPage());
  document.getElementById('receiptToFilter')?.addEventListener('change', () => loadReceiptsPage());
  document.getElementById('btnReceiptFilterReset')?.addEventListener('click', () => resetReceiptFilters());
  document.getElementById('receiptSearchFilter')?.addEventListener('input', () => {
    clearTimeout(receiptAdmin.filterTimer);
    receiptAdmin.filterTimer = setTimeout(() => loadReceiptsPage(), 280);
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-rv-acc], [data-rv-browse], .rv-acc-results, .rcv-acc-results')) return;
    document.querySelectorAll('.rv-acc-results, .rcv-acc-results').forEach((el) => { el.innerHTML = ''; });
  });
}

window.commercePages = window.commercePages || {};
window.commercePages.receipts = async () => {
  updateReceiptPostAlert();
  await loadReceiptAgents();
  await loadReceiptSettings();
  await loadReceiptsPage();
};

initReceiptsAdmin();
