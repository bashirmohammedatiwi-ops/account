/* Admin: invoices, catalog, orders */
const commerce = {
  branches: [],
  sections: [],
  products: [],
  selectedBranchId: null,
  selectedSectionId: null,
  selectedInvoice: null,
  selectedOrder: null
};

function commerceApi(path, opts = {}) {
  return api(`/api/admin${path}`, opts);
}

function fmtMoney(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

async function loadInvoicesPage() {
  const q = document.getElementById('invoiceSearch')?.value?.trim() || '';
  const data = await commerceApi(`/invoices?q=${encodeURIComponent(q)}&limit=100`);
  const stats = await commerceApi('/invoices/stats');
  const statsEl = document.getElementById('invoiceStats');
  if (statsEl && stats.stats) {
    statsEl.innerHTML = `
      <div class="stat-card"><div class="k">إجمالي الفواتير</div><div class="v">${fmtNumAlways(stats.stats.total)}</div></div>
      <div class="stat-card"><div class="k">اليوم</div><div class="v">${fmtNumAlways(stats.stats.todayCount)}</div></div>
      <div class="stat-card"><div class="k">هذا الأسبوع</div><div class="v">${fmtNumAlways(stats.stats.weekCount)}</div></div>`;
  }
  document.getElementById('invoicesBody').innerHTML = (data.invoices || []).map((inv) => `
    <tr>
      <td dir="ltr">${esc(inv.num)}</td>
      <td>${esc(inv.date || '—')}</td>
      <td>${esc(inv.accountName || '—')}</td>
      <td>${esc(inv.kindLabel)}</td>
      <td dir="ltr">${fmtMoney(inv.total)}</td>
      <td dir="ltr">${inv.lineCount}</td>
      <td>
        <button type="button" class="btn btn-soft btn-sm" data-inv-view="${esc(inv.seq)}">عرض</button>
        <a class="btn btn-soft btn-sm" href="${API}/api/admin/invoices/${encodeURIComponent(inv.seq)}.pdf" target="_blank">PDF</a>
      </td>
    </tr>`).join('') || '<tr><td colspan="7">لا توجد فواتير — نفّذ مزامنة أولاً</td></tr>';

  document.querySelectorAll('[data-inv-view]').forEach((btn) => {
    btn.addEventListener('click', () => openAdminInvoice(btn.dataset.invView));
  });
}

async function openAdminInvoice(seq) {
  const panel = document.getElementById('invoiceDetailPanel');
  panel.classList.remove('hidden');
  panel.innerHTML = '<p class="muted">جاري التحميل...</p>';
  const data = await commerceApi(`/invoices/${encodeURIComponent(seq)}`);
  commerce.selectedInvoice = data.invoice;
  const lines = data.lines || [];
  panel.innerHTML = `
    <div class="panel-head">
      <h3>فاتورة ${esc(data.invoice.num)} · ${esc(data.invoice.date)}</h3>
      <button type="button" class="btn btn-soft btn-sm" id="btnCloseInvoiceDetail">إغلاق</button>
    </div>
    <p><strong>${esc(data.invoice.accountName)}</strong> · ${esc(data.invoice.kindLabel)}</p>
    <p class="muted">${lines.length} بند · إجمالي ${fmtMoney(data.invoice.total)} · صافي ${fmtMoney(data.invoice.netPay)}</p>
    <div class="table-scroll">
      <table class="data-table compact">
        <thead><tr><th>الباركود</th><th>المادة</th><th>كمية</th><th>هدية</th><th>سعر</th><th>مبلغ</th></tr></thead>
        <tbody>${lines.map((l, i) => `
          <tr>
            <td dir="ltr">${esc(l.matNum || l.mat)}</td>
            <td>${esc(l.matName)}</td>
            <td dir="ltr">${l.quant}</td>
            <td dir="ltr">${l.bonus || 0}</td>
            <td dir="ltr">${fmtMoney(l.price)}</td>
            <td dir="ltr">${fmtMoney(l.lineTotal)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
  document.getElementById('btnCloseInvoiceDetail')?.addEventListener('click', () => {
    panel.classList.add('hidden');
  });
}

async function loadCatalogPage() {
  const data = await commerceApi('/catalog/branches');
  commerce.branches = data.branches || [];
  if (!commerce.selectedBranchId && commerce.branches.length) {
    commerce.selectedBranchId = commerce.branches[0].id;
  }
  renderCatalogBranches();
  await loadCatalogSections();
}

function renderCatalogBranches() {
  const el = document.getElementById('catalogBranchesList');
  if (!el) return;
  el.innerHTML = commerce.branches.map((b) => `
    <button type="button" class="tree-pick ${commerce.selectedBranchId === b.id ? 'active' : ''}" data-branch-id="${b.id}">
      <div class="tree-pick-body">
        <div class="tree-pick-name">${esc(b.name)}</div>
        <div class="tree-pick-meta">${b.isActive ? 'نشط' : 'موقوف'}</div>
      </div>
    </button>`).join('') || '<p class="muted">لا توجد فروع</p>';

  el.querySelectorAll('[data-branch-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      commerce.selectedBranchId = Number(btn.dataset.branchId);
      renderCatalogBranches();
      await loadCatalogSections();
    });
  });
}

async function loadCatalogSections() {
  if (!commerce.selectedBranchId) return;
  const data = await commerceApi(`/catalog/branches/${commerce.selectedBranchId}/sections`);
  commerce.sections = data.sections || [];
  if (!commerce.selectedSectionId && commerce.sections.length) {
    commerce.selectedSectionId = commerce.sections[0].id;
  }
  const el = document.getElementById('catalogSectionsList');
  el.innerHTML = commerce.sections.map((s) => `
    <button type="button" class="tree-pick ${commerce.selectedSectionId === s.id ? 'active' : ''}" data-section-id="${s.id}">
      <div class="tree-pick-body"><div class="tree-pick-name">${esc(s.name)}</div></div>
    </button>`).join('') || '<p class="muted">لا توجد أقسام</p>';

  el.querySelectorAll('[data-section-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      commerce.selectedSectionId = Number(btn.dataset.sectionId);
      await loadCatalogSections();
      await loadCatalogProducts();
    });
  });
  await loadCatalogProducts();
}

async function loadCatalogProducts() {
  if (!commerce.selectedSectionId) return;
  const data = await commerceApi(`/catalog/sections/${commerce.selectedSectionId}/products`);
  commerce.products = data.products || [];
  document.getElementById('catalogProductsBody').innerHTML = commerce.products.map((p) => `
    <tr>
      <td>${p.imageUrl ? `<img src="${API}${p.imageUrl}" alt="" class="product-thumb">` : '—'}</td>
      <td dir="ltr">${esc(p.barcode || p.skuNum)}</td>
      <td>${esc(p.name)}</td>
      <td dir="ltr">${fmtMoney(p.price)}</td>
      <td>${esc((p.syncedAt || p.updatedAt || '—').slice(0, 19).replace('T', ' '))}</td>
      <td>${p.isActive ? 'نشط' : 'موقوف'}</td>
      <td>
        <button type="button" class="btn btn-soft btn-sm" data-prod-edit="${p.id}">صورة / حالة</button>
        <button type="button" class="btn btn-danger btn-sm" data-prod-del="${p.id}">حذف</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="7">لا توجد منتجات — أضف بالباركود بعد مزامنة Edari</td></tr>';

  document.querySelectorAll('[data-prod-edit]').forEach((btn) => {
    btn.addEventListener('click', () => editProduct(Number(btn.dataset.prodEdit)));
  });
  document.querySelectorAll('[data-prod-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف هذا المنتج؟')) return;
      await commerceApi(`/products/${btn.dataset.prodDel}`, { method: 'DELETE' });
      await loadCatalogProducts();
    });
  });
}

async function editProduct(id) {
  const p = commerce.products.find((x) => x.id === id);
  if (!p) return;

  const active = confirm(`المنتج: ${p.name}\n\nموافق = نشط | إلغاء = موقوف`);
  await commerceApi(`/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ isActive: active })
  });

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await commerceApi(`/products/${id}/image`, {
        method: 'POST',
        body: JSON.stringify({ dataUrl: reader.result })
      });
      await loadCatalogProducts();
    };
    reader.readAsDataURL(file);
  };
  if (confirm('رفع صورة للمنتج؟')) fileInput.click();
  else await loadCatalogProducts();
}

async function loadOrdersPage() {
  const status = document.getElementById('orderStatusFilter')?.value || '';
  const data = await commerceApi(`/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`);
  const stats = await commerceApi('/orders/stats');
  document.getElementById('orderStats').innerHTML = `
    <span class="badge ok">اليوم: ${stats.stats?.todaySubmitted || 0} طلب</span>`;

  document.getElementById('ordersBody').innerHTML = (data.orders || []).map((o) => `
    <tr>
      <td dir="ltr">${esc(o.orderNo)}</td>
      <td>${esc(o.agentName)}</td>
      <td>${esc(o.customerName || '—')}</td>
      <td><span class="badge pending">${esc(o.statusLabel)}</span></td>
      <td dir="ltr">${o.lines?.length || 0}</td>
      <td dir="ltr">${fmtMoney(o.totalAmount)}</td>
      <td>${esc(o.submittedAt || o.createdAt || '—')}</td>
      <td><button type="button" class="btn btn-soft btn-sm" data-order-id="${o.id}">عرض</button></td>
    </tr>`).join('') || '<tr><td colspan="8">لا توجد طلبات</td></tr>';

  document.querySelectorAll('[data-order-id]').forEach((btn) => {
    btn.addEventListener('click', () => openOrderDetail(Number(btn.dataset.orderId)));
  });
}

async function openOrderDetail(id) {
  const data = await commerceApi(`/orders/${id}`);
  const o = data.order;
  const panel = document.getElementById('orderDetailPanel');
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="panel-head">
      <h3>طلب ${esc(o.orderNo)} · ${esc(o.statusLabel)}</h3>
      <button type="button" class="btn btn-soft btn-sm" id="btnCloseOrderDetail">إغلاق</button>
    </div>
    <p><strong>${esc(o.agentName)}</strong> → ${esc(o.customerName || '—')} · ${esc(o.catalogBranchName || '')}</p>
    <div class="table-scroll"><table class="data-table compact"><thead><tr><th>مادة</th><th>باركود</th><th>كمية</th><th>سعر</th><th>مبلغ</th></tr></thead>
    <tbody>${(o.lines || []).map((l) => `
      <tr><td>${esc(l.matName)}</td><td dir="ltr">${esc(l.barcode)}</td><td dir="ltr">${l.quant}</td>
      <td dir="ltr">${fmtMoney(l.unitPrice)}</td><td dir="ltr">${fmtMoney(l.lineTotal)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="btn-row" style="margin-top:12px">
      <button type="button" class="btn btn-primary btn-sm" data-status="approved">موافقة</button>
      <button type="button" class="btn btn-soft btn-sm" data-status="under_review">مراجعة</button>
      <button type="button" class="btn btn-danger btn-sm" data-status="rejected">رفض</button>
      <button type="button" class="btn btn-soft btn-sm" data-status="processing">تنفيذ</button>
      <button type="button" class="btn btn-soft btn-sm" data-status="delivered">تم التسليم</button>
    </div>`;

  document.getElementById('btnCloseOrderDetail')?.addEventListener('click', () => panel.classList.add('hidden'));
  panel.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const note = btn.dataset.status === 'rejected' ? prompt('سبب الرفض:') : '';
      if (btn.dataset.status === 'rejected' && note == null) return;
      await commerceApi(`/orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: btn.dataset.status, note: note || '' })
      });
      await loadOrdersPage();
      await openOrderDetail(id);
    });
  });
}

function initCommerceAdmin() {
  document.getElementById('btnInvoiceSearch')?.addEventListener('click', () => loadInvoicesPage());
  document.getElementById('invoiceSearch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadInvoicesPage();
  });

  document.getElementById('btnAddBranch')?.addEventListener('click', async () => {
    const name = prompt('اسم الفرع التجاري:');
    if (!name) return;
    await commerceApi('/catalog/branches', { method: 'POST', body: JSON.stringify({ name }) });
    await loadCatalogPage();
  });

  document.getElementById('btnAddSection')?.addEventListener('click', async () => {
    if (!commerce.selectedBranchId) return alert('اختر فرعاً');
    const name = prompt('اسم القسم:');
    if (!name) return;
    await commerceApi('/catalog/sections', {
      method: 'POST',
      body: JSON.stringify({ branchId: commerce.selectedBranchId, name })
    });
    await loadCatalogSections();
  });

  document.getElementById('btnAddProduct')?.addEventListener('click', async () => {
    if (!commerce.selectedSectionId) return alert('اختر قسماً');
    const barcode = prompt('أدخل الباركود أو رقم المادة من Edari:');
    if (!barcode?.trim()) return;

    try {
      const preview = await commerceApi(`/products/edari-lookup?code=${encodeURIComponent(barcode.trim())}`);
      const m = preview.material;
      const ok = confirm(
        `من Edari:\n${m.name}\nباركود: ${m.barcode || m.num}\nالسعر: ${fmtMoney(m.price)}\n\nإضافة إلى هذا القسم؟`
      );
      if (!ok) return;

      await commerceApi('/products/by-barcode', {
        method: 'POST',
        body: JSON.stringify({ sectionId: commerce.selectedSectionId, barcode: barcode.trim() })
      });
      await loadCatalogProducts();
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById('btnPurgeProducts')?.addEventListener('click', async () => {
    const ok1 = confirm('حذف كل المنتجات من الكتalog؟\n\nلن تُحذف بيانات Edari (edari_materials) — فقط المنتجات المضافة للأقسام.');
    if (!ok1) return;
    const typed = prompt('اكتب DELETE_ALL_PRODUCTS للتأكيد:');
    if (typed !== 'DELETE_ALL_PRODUCTS') return alert('تم الإلغاء — لم يُحذف شيء');

    try {
      const data = await commerceApi('/products/purge-all', {
        method: 'POST',
        body: JSON.stringify({ confirm: 'DELETE_ALL_PRODUCTS' })
      });
      alert(data.message || `تم حذف ${data.deleted} منتج`);
      await loadCatalogProducts();
    } catch (e) {
      alert(e.message);
    }
  });

  document.getElementById('orderStatusFilter')?.addEventListener('change', () => loadOrdersPage());
}

window.commercePages = {
  invoices: loadInvoicesPage,
  catalog: loadCatalogPage,
  orders: loadOrdersPage
};

initCommerceAdmin();
