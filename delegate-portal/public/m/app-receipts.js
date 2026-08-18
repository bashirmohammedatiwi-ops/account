/* Delegate receipt vouchers (سند قبض) */

const receiptsState = {
  customer: null,
  tree: null,
  list: []
};

function rvFmt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

function rvStatusClass(status) {
  return ({
    pending: 'pending',
    reviewed: 'ok',
    posted: 'ok',
    rejected: 'off'
  })[status] || 'pending';
}

function renderReceiptCustomer() {
  const el = document.getElementById('receiptCustomerLabel');
  if (!el) return;
  const c = receiptsState.customer;
  if (!c) {
    el.className = 'muted';
    el.textContent = 'اختر شجرة ثم زبوناً';
    return;
  }
  el.className = '';
  el.innerHTML = `<strong>${esc(c.name1)}</strong> <span dir="ltr">${esc(c.num || '')}</span>`;
}

function resetReceiptForm() {
  receiptsState.customer = null;
  receiptsState.tree = null;
  const amount = document.getElementById('receiptAmount');
  const commission = document.getElementById('receiptCommission');
  const discount = document.getElementById('receiptDiscount');
  const notes = document.getElementById('receiptNotes');
  if (amount) amount.value = '';
  if (commission) commission.value = '';
  if (discount) discount.value = '';
  if (notes) notes.value = '';
  renderReceiptCustomer();
}

window.receiptsOnCustomer = function receiptsOnCustomer(branch, tree) {
  receiptsState.customer = {
    seq: branch.seq,
    num: branch.num,
    name1: branch.name1
  };
  receiptsState.tree = {
    seq: tree?.seq || '',
    name1: tree?.name1 || ''
  };
  renderReceiptCustomer();
};

async function loadMyReceipts() {
  const list = document.getElementById('myReceiptsList');
  const meta = document.getElementById('myReceiptsMeta');
  if (!list) return;
  try {
    const data = await api('/receipts');
    receiptsState.list = data.receipts || [];
    const badge = document.getElementById('homeBadgeReceipts');
    const pending = receiptsState.list.filter((r) => r.status === 'pending' || r.status === 'reviewed').length;
    if (badge) {
      badge.textContent = String(pending);
      badge.classList.toggle('hidden', pending === 0);
    }
    if (meta) meta.textContent = receiptsState.list.length ? `${receiptsState.list.length} سند` : 'لا توجد سندات بعد';
    list.innerHTML = receiptsState.list.map((r) => `
      <article class="inv-order-card">
        <div class="inv-order-card-main">
          <div class="inv-order-card-head">
            <div class="inv-order-card-titles">
              <strong class="inv-order-no" dir="ltr">${esc(r.receiptNo)}</strong>
              <span class="badge ${rvStatusClass(r.status)}">${esc(r.statusLabel)}</span>
            </div>
          </div>
          <p class="inv-order-card-cust">${esc(r.customerName || '—')}</p>
          <div class="inv-order-card-stats">
            <span>مبلغ <strong dir="ltr">${rvFmt(r.amount)}</strong></span>
            ${Number(r.commission) ? `<span>عمولة <strong dir="ltr">${rvFmt(r.commission)}</strong></span>` : ''}
            ${Number(r.discount) ? `<span>حسم <strong dir="ltr">${rvFmt(r.discount)}</strong></span>` : ''}
          </div>
          ${r.notes ? `<p class="inv-order-card-notes">${esc(r.notes)}</p>` : ''}
          ${r.edariJournalNum ? `<p class="muted" dir="ltr">قيد ${esc(r.edariJournalNum)}</p>` : ''}
        </div>
        ${r.status !== 'posted' ? `
        <div class="inv-order-card-actions">
          <button type="button" class="btn danger btn-sm" data-del-receipt="${r.id}">حذف</button>
        </div>` : ''}
      </article>`).join('') || '<div class="empty-state"><p>أرسل سند قبض ليظهر هنا</p></div>';

    list.querySelectorAll('[data-del-receipt]').forEach((btn) => {
      btn.addEventListener('click', () => void deleteMyReceipt(Number(btn.dataset.delReceipt)));
    });
  } catch (err) {
    list.innerHTML = `<div class="empty-state"><p>${esc(err.message)}</p></div>`;
  }
}

async function deleteMyReceipt(id) {
  if (!confirm('حذف سند القبض؟')) return;
  setOverlay(true);
  try {
    await api(`/receipts/${id}`, { method: 'DELETE' });
    await loadMyReceipts();
  } catch (err) {
    alert(err.message);
  } finally {
    setOverlay(false);
  }
}

async function submitReceipt(e) {
  e.preventDefault();
  if (!receiptsState.customer?.seq) {
    alert('اختر زبوناً من الشجرة أولاً');
    return;
  }
  const amount = Number(document.getElementById('receiptAmount')?.value || 0);
  if (amount <= 0) {
    alert('أدخل المبلغ');
    return;
  }
  setOverlay(true);
  try {
    await api('/receipts', {
      method: 'POST',
      body: JSON.stringify({
        customerAccSeq: receiptsState.customer.seq,
        treeAccSeq: receiptsState.tree?.seq || '',
        treeName: receiptsState.tree?.name1 || '',
        amount,
        commission: Number(document.getElementById('receiptCommission')?.value || 0),
        discount: Number(document.getElementById('receiptDiscount')?.value || 0),
        notes: document.getElementById('receiptNotes')?.value || ''
      })
    });
    resetReceiptForm();
    await loadMyReceipts();
    alert('تم إرسال سند القبض للوحة التحكم');
  } catch (err) {
    alert(err.message);
  } finally {
    setOverlay(false);
  }
}

function bindReceiptsUi() {
  document.getElementById('btnReceiptPickCustomer')?.addEventListener('click', () => {
    if (typeof openCustomerPicker === 'function') openCustomerPicker('receipt');
  });
  document.getElementById('receiptForm')?.addEventListener('submit', submitReceipt);
}

window.receiptsNav = {
  applyScreen(name, { backBtn, toolbarWrap, title, crumb }) {
    if (name !== 'receipts') return false;
    backBtn.classList.remove('hidden');
    toolbarWrap.classList.add('hidden');
    title.textContent = 'سند قبض';
    crumb.textContent = 'تحصيل من الزبون · يُراجع ثم يُرحَّل';
    const kicker = document.getElementById('headerKicker');
    if (kicker) kicker.textContent = 'Edari · سند قبض';
    return true;
  },
  onScreen(name) {
    if (name === 'receipts') {
      renderReceiptCustomer();
      void loadMyReceipts();
    }
    if (name === 'home') void loadMyReceipts();
  },
  handleBack() {
    if (state.screen === 'receipts') {
      goToScreen('home');
      return true;
    }
    return false;
  },
  refresh() {
    if (state.screen !== 'receipts' && state.screen !== 'home') return false;
    void loadMyReceipts();
    return state.screen === 'receipts';
  }
};

bindReceiptsUi();
