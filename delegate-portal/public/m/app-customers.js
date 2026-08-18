/* Delegate: new customer request (زبون جديد) */

const customerReqState = { list: [] };

function crStatusClass(status) {
  return ({
    pending: 'pending',
    reviewed: 'ok',
    posted: 'ok',
    rejected: 'off'
  })[status] || 'pending';
}

async function fillCustomerTrees() {
  const sel = document.getElementById('newCustomerTree');
  if (!sel) return;
  try {
    if (!state.trees?.length) {
      const data = await api('/trees');
      state.trees = data.trees || [];
    }
  } catch {
    /* keep existing */
  }
  const current = sel.value;
  sel.innerHTML = `<option value="">اختر الشجرة</option>` + (state.trees || []).map((t) => `
    <option value="${esc(t.seq)}">${esc(t.name1 || '')} · ${esc(t.num || '')}</option>
  `).join('');
  if (current) sel.value = current;
}

function resetCustomerForm() {
  const name = document.getElementById('newCustomerName');
  const phone = document.getElementById('newCustomerPhone');
  const address = document.getElementById('newCustomerAddress');
  const notes = document.getElementById('newCustomerNotes');
  if (name) name.value = '';
  if (phone) phone.value = '';
  if (address) address.value = '';
  if (notes) notes.value = '';
}

async function loadMyCustomerRequests() {
  const list = document.getElementById('myCustomerReqsList');
  const meta = document.getElementById('myCustomerReqsMeta');
  if (!list) return;
  try {
    const data = await api('/customer-requests');
    customerReqState.list = data.requests || [];
    const badge = document.getElementById('homeBadgeCustomers');
    const pending = customerReqState.list.filter((r) => r.status === 'pending' || r.status === 'reviewed').length;
    if (badge) {
      badge.textContent = String(pending);
      badge.classList.toggle('hidden', pending === 0);
    }
    if (meta) meta.textContent = customerReqState.list.length ? `${customerReqState.list.length} طلب` : 'لا توجد طلبات بعد';
    list.innerHTML = customerReqState.list.map((r) => `
      <article class="inv-order-card">
        <div class="inv-order-card-main">
          <strong>${esc(r.name)}</strong>
          <p class="muted">${esc(r.requestNo)} · ${esc(r.treeName || r.treeNum || '')}${r.phone ? ` · ${esc(r.phone)}` : ''}</p>
        </div>
        <div class="inv-order-card-side">
          <span class="badge ${crStatusClass(r.status)}">${esc(r.statusLabel)}</span>
          ${r.status === 'posted' && r.edariNum ? `<span class="muted" dir="ltr">${esc(r.edariNum)}</span>` : ''}
          ${r.status !== 'posted' ? `<button type="button" class="btn ghost sm" data-del-creq="${r.id}">حذف</button>` : ''}
        </div>
      </article>
    `).join('') || '<p class="muted">أرسل طلب زبون جديد ليظهر هنا حتى تراجعه الإدارة</p>';
    list.querySelectorAll('[data-del-creq]').forEach((btn) => {
      btn.addEventListener('click', () => deleteMyCustomerReq(Number(btn.dataset.delCreq)));
    });
  } catch (err) {
    if (meta) meta.textContent = err.message || 'تعذر التحميل';
  }
}

async function deleteMyCustomerReq(id) {
  if (!confirm('حذف طلب الزبون؟')) return;
  try {
    await api(`/customer-requests/${id}`, { method: 'DELETE' });
    await loadMyCustomerRequests();
  } catch (err) {
    alert(err.message || 'تعذر الحذف');
  }
}

async function submitCustomerRequest(e) {
  e.preventDefault();
  const treeSel = document.getElementById('newCustomerTree');
  const name = document.getElementById('newCustomerName')?.value?.trim();
  if (!treeSel?.value) {
    alert('اختر الشجرة التي يُضاف لها الزبون');
    return;
  }
  if (!name) {
    alert('أدخل اسم الزبون');
    return;
  }
  const tree = (state.trees || []).find((t) => String(t.seq) === String(treeSel.value));
  try {
    await api('/customer-requests', {
      method: 'POST',
      body: JSON.stringify({
        treeAccSeq: treeSel.value,
        treeName: tree?.name1 || '',
        name,
        phone: document.getElementById('newCustomerPhone')?.value || '',
        address: document.getElementById('newCustomerAddress')?.value || '',
        notes: document.getElementById('newCustomerNotes')?.value || ''
      })
    });
    resetCustomerForm();
    await loadMyCustomerRequests();
    alert('أُرسل الطلب للوحة التحكم للمراجعة قبل الترحيل');
  } catch (err) {
    alert(err.message || 'تعذر إرسال الطلب');
  }
}

function bindCustomerReqsUi() {
  document.getElementById('newCustomerForm')?.addEventListener('submit', submitCustomerRequest);
}

window.customersNav = {
  applyScreen(name, { backBtn, toolbarWrap, title, crumb }) {
    if (name !== 'customers') return false;
    backBtn.classList.remove('hidden');
    toolbarWrap.classList.add('hidden');
    title.textContent = 'زبون جديد';
    crumb.textContent = 'يُراجع في لوحة التحكم ثم يُرحَّل للإداري';
    const kicker = document.getElementById('headerKicker');
    if (kicker) kicker.textContent = 'Edari · زبون جديد';
    return true;
  },
  onScreen(name) {
    if (name === 'customers') {
      void fillCustomerTrees();
      void loadMyCustomerRequests();
    }
    if (name === 'home') void loadMyCustomerRequests();
  },
  handleBack() {
    if (state.screen === 'customers') {
      goToScreen('home');
      return true;
    }
    return false;
  },
  refresh() {
    if (state.screen !== 'customers' && state.screen !== 'home') return false;
    void loadMyCustomerRequests();
    if (state.screen === 'customers') void fillCustomerTrees();
    return state.screen === 'customers';
  }
};

bindCustomerReqsUi();
