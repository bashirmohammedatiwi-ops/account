const express = require('express');
const {
  listInvoices,
  invoiceStats,
  getAdminInvoice
} = require('../lib/admin-invoices');
const {
  listBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
  listSections,
  getSection,
  createSection,
  updateSection,
  deleteSection
} = require('../lib/catalog');
const {
  listProducts,
  queryProducts,
  searchEdariMaterials,
  productStats,
  getProduct,
  updateProduct,
  deleteProduct,
  deleteProductImage,
  saveProductImage,
  lookupByBarcode,
  findEdariMaterialByCode,
  edariMaterialStats,
  cacheEdariMaterial,
  addProductByBarcode,
  bulkAddByBarcode,
  bulkProductsAction,
  createProduct,
  syncProductFromEdari,
  syncSectionFromEdari,
  syncMaterialsFromEdari,
  refreshCatalogPricesFromCache,
  purgeAllCatalogProducts,
  reorderProducts,
  importProductsRows,
  exportProductsCsv
} = require('../lib/products');
const {
  listOrders,
  loadOrder,
  setOrderStatus,
  orderStats
} = require('../lib/orders');
const { buildInvoicePdf } = require('../lib/pdf-export');

const router = express.Router();

router.get('/invoices/stats', (_req, res) => {
  res.json({ ok: true, stats: invoiceStats() });
});

router.get('/invoices', (req, res) => {
  const q = String(req.query.q || '').trim();
  const dateFrom = String(req.query.from || '').trim();
  const dateTo = String(req.query.to || '').trim();
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  res.json({ ok: true, ...listInvoices({ q, dateFrom, dateTo, limit, offset }) });
});

router.get('/invoices/:ref.pdf', async (req, res) => {
  const data = getAdminInvoice(req.params.ref, req.query.acc);
  if (!data) return res.status(404).json({ ok: false, error: 'الفاتورة غير موجودة' });
  try {
    const buffer = await buildInvoicePdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${data.invoice?.num || req.params.ref}.pdf"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/invoices/:ref', (req, res) => {
  const data = getAdminInvoice(req.params.ref, req.query.acc);
  if (!data) return res.status(404).json({ ok: false, error: 'الفاتورة غير موجودة' });
  res.json({ ok: true, ...data });
});

router.get('/catalog/branches', (_req, res) => {
  res.json({ ok: true, branches: listBranches() });
});

router.post('/catalog/branches', (req, res) => {
  const { name, code, sortOrder, isActive } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'اسم الفرع مطلوب' });
  res.json({ ok: true, branch: createBranch({ name, code, sortOrder, isActive }) });
});

router.put('/catalog/branches/:id', (req, res) => {
  const branch = updateBranch(Number(req.params.id), req.body || {});
  if (!branch) return res.status(404).json({ ok: false, error: 'الفرع غير موجود' });
  res.json({ ok: true, branch });
});

router.delete('/catalog/branches/:id', (req, res) => {
  if (!deleteBranch(Number(req.params.id))) {
    return res.status(404).json({ ok: false, error: 'الفرع غير موجود' });
  }
  res.json({ ok: true });
});

router.get('/catalog/branches/:id/sections', (req, res) => {
  res.json({ ok: true, sections: listSections(Number(req.params.id)) });
});

router.post('/catalog/sections', (req, res) => {
  const { branchId, name, sortOrder, isActive } = req.body || {};
  if (!branchId || !name) return res.status(400).json({ ok: false, error: 'الفرع والاسم مطلوبان' });
  res.json({ ok: true, section: createSection({ branchId, name, sortOrder, isActive }) });
});

router.put('/catalog/sections/:id', (req, res) => {
  const section = updateSection(Number(req.params.id), req.body || {});
  if (!section) return res.status(404).json({ ok: false, error: 'القسم غير موجود' });
  res.json({ ok: true, section });
});

router.delete('/catalog/sections/:id', (req, res) => {
  if (!deleteSection(Number(req.params.id))) {
    return res.status(404).json({ ok: false, error: 'القسم غير موجود' });
  }
  res.json({ ok: true });
});

router.get('/catalog/sections/:id/products', (req, res) => {
  res.json({ ok: true, products: listProducts(Number(req.params.id)) });
});

router.get('/products/stats', (req, res) => {
  const sectionId = req.query.sectionId ? Number(req.query.sectionId) : null;
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  res.json({ ok: true, stats: productStats({ sectionId, branchId }) });
});

router.get('/products', (req, res) => {
  const sectionId = req.query.sectionId ? Number(req.query.sectionId) : null;
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  const q = String(req.query.q || '').trim();
  const activeOnly = req.query.active === '1';
  const inactiveOnly = req.query.active === '0';
  const noImage = req.query.noImage === '1';
  const priceOverride = req.query.priceOverride === '1' ? true
    : req.query.priceOverride === '0' ? false : undefined;
  const sortBy = String(req.query.sortBy || 'sort_order');
  const sortDir = String(req.query.sortDir || 'asc');
  const limit = Number(req.query.limit) || 200;
  const offset = Number(req.query.offset) || 0;
  res.json({
    ok: true,
    ...queryProducts({
      sectionId, branchId, q, activeOnly, inactiveOnly, noImage, priceOverride,
      sortBy, sortDir, limit, offset
    })
  });
});

router.get('/products/export.csv', (req, res) => {
  const sectionId = req.query.sectionId ? Number(req.query.sectionId) : null;
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  const q = String(req.query.q || '').trim();
  const csv = exportProductsCsv({ sectionId, branchId, q, sortBy: 'sort_order', sortDir: 'asc' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="products-export.csv"');
  res.send(`\uFEFF${csv}`);
});

router.get('/products/lookup', (req, res) => {
  const code = String(req.query.code || '').trim();
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  const product = lookupByBarcode(code, { branchId });
  if (!product) return res.status(404).json({ ok: false, error: 'المنتج غير موجود' });
  res.json({ ok: true, product });
});

router.get('/products/edari-stats', (_req, res) => {
  res.json({ ok: true, stats: edariMaterialStats() });
});

router.get('/products/edari-lookup', (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!code) return res.status(400).json({ ok: false, error: 'الباركود مطلوب' });
  const material = findEdariMaterialByCode(code);
  if (!material) {
    return res.status(404).json({ ok: false, error: 'المادة غير موجودة — نفّذ مزامنة كاملة من Edari أولاً' });
  }
  res.json({ ok: true, material });
});

router.post('/products/edari-cache', (req, res) => {
  try {
    const material = cacheEdariMaterial(req.body?.material || req.body);
    if (!material) {
      return res.status(400).json({ ok: false, error: 'بيانات المادة غير كافية' });
    }
    res.json({ ok: true, material });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/products/edari-search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ ok: true, materials: [] });
  res.json({ ok: true, materials: searchEdariMaterials(q) });
});

router.get('/products/:id', (req, res) => {
  const product = getProduct(Number(req.params.id));
  if (!product) return res.status(404).json({ ok: false, error: 'المنتج غير موجود' });
  res.json({ ok: true, product });
});

router.post('/products/by-barcode', (req, res) => {
  try {
    const body = req.body || {};
    const sectionId = Number(body.sectionId);
    const barcode = String(body.barcode || '').trim();
    if (!sectionId || !barcode) {
      return res.status(400).json({ ok: false, error: 'القسم والباركود مطلوبان' });
    }
    if (body.material?.seq) cacheEdariMaterial(body.material);
    const product = addProductByBarcode(sectionId, barcode, {
      name: body.name,
      material: body.material,
      bonusDefault: body.bonusDefault,
      minOrderQty: body.minOrderQty,
      sortOrder: body.sortOrder,
      isActive: body.isActive,
      priceOverride: body.priceOverride,
      price: body.price,
      description: body.description
    });
    res.json({ ok: true, product });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/products/bulk-by-barcode', (req, res) => {
  try {
    const sectionId = Number(req.body?.sectionId);
    const barcodes = Array.isArray(req.body?.barcodes) ? req.body.barcodes : [];
    if (!sectionId || !barcodes.length) {
      return res.status(400).json({ ok: false, error: 'القسم وقائمة الباركود مطلوبان' });
    }
    const result = bulkAddByBarcode(sectionId, barcodes);
    res.json({ ok: true, ...result, message: `أُضيف ${result.added} منتج` });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/products/bulk', (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const action = String(req.body?.action || '').trim();
    if (!ids.length || !action) {
      return res.status(400).json({ ok: false, error: 'حدد منتجات ونوع العملية' });
    }
    const result = bulkProductsAction(ids, action, req.body?.payload || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/products/reorder', (req, res) => {
  try {
    const sectionId = Number(req.body?.sectionId);
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];
    if (!sectionId || !orderedIds.length) {
      return res.status(400).json({ ok: false, error: 'القسم وترتيب المنتجات مطلوبان' });
    }
    const result = reorderProducts(sectionId, orderedIds);
    res.json({ ok: true, ...result, message: `تم تحديث ترتيب ${result.reordered} منتج` });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/products/import', (req, res) => {
  try {
    const sectionId = Number(req.body?.sectionId);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!sectionId || !rows.length) {
      return res.status(400).json({ ok: false, error: 'القسم وصفوف الاستيراد مطلوبان' });
    }
    const result = importProductsRows(sectionId, rows);
    res.json({
      ok: true,
      ...result,
      message: `أُنشئ ${result.created} · حُدّث ${result.updated} · تخطّي ${result.skipped}`
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/catalog/sections/:id/sync-products', (req, res) => {
  try {
    const result = syncSectionFromEdari(Number(req.params.id));
    res.json({
      ok: true,
      ...result,
      message: `تم تحديث ${result.updated} من ${result.total} منتج من Edari`
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/products/sync-materials', (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) {
      return res.status(400).json({ ok: false, error: 'صفوف المواد مطلوبة' });
    }
    const result = syncMaterialsFromEdari(rows);
    res.json({
      ok: true,
      ...result,
      message: `تم تحديث ${result.productsUpdated} منتج · ${result.materials} مادة`
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/products/refresh-prices', (req, res) => {
  try {
    const sectionId = req.body?.sectionId != null ? Number(req.body.sectionId) : null;
    const branchId = req.body?.branchId != null ? Number(req.body.branchId) : null;
    const result = refreshCatalogPricesFromCache({ sectionId, branchId });
    res.json({
      ok: true,
      ...result,
      message: `تم تحديث ${result.updated} من ${result.total} منتج من الذاكرة المؤقتة`
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/products/purge-all', (req, res) => {
  const confirm = String(req.body?.confirm || '').trim();
  if (confirm !== 'DELETE_ALL_PRODUCTS') {
    return res.status(400).json({
      ok: false,
      error: 'أرسل confirm: "DELETE_ALL_PRODUCTS" للتأكيد'
    });
  }
  try {
    const result = purgeAllCatalogProducts();
    res.json({ ok: true, ...result, message: `تم حذف ${result.deleted} منتج من الكتalog` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/products', (_req, res) => {
  res.status(400).json({
    ok: false,
    error: 'أضف المنتج بالباركود من Edari — الاسم والسعر يُجلبان تلقائياً'
  });
});

router.put('/products/:id', (req, res) => {
  const product = updateProduct(Number(req.params.id), req.body || {});
  if (!product) return res.status(404).json({ ok: false, error: 'المنتج غير موجود' });
  res.json({ ok: true, product });
});

router.delete('/products/:id', (req, res) => {
  if (!deleteProduct(Number(req.params.id))) {
    return res.status(404).json({ ok: false, error: 'المنتج غير موجود' });
  }
  res.json({ ok: true });
});

router.post('/products/:id/sync-edari', (req, res) => {
  try {
    const product = syncProductFromEdari(Number(req.params.id));
    res.json({ ok: true, product, message: 'تم التحديث من Edari' });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/products/:id/image', (req, res) => {
  try {
    const product = saveProductImage(Number(req.params.id), req.body?.dataUrl);
    if (!product) return res.status(404).json({ ok: false, error: 'المنتج غير موجود' });
    res.json({ ok: true, product });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/products/:id/image', (req, res) => {
  const product = deleteProductImage(Number(req.params.id));
  if (!product) return res.status(404).json({ ok: false, error: 'المنتج غير موجود' });
  res.json({ ok: true, product });
});


router.get('/orders/stats', (_req, res) => {
  res.json({ ok: true, stats: orderStats() });
});

router.get('/orders', (req, res) => {
  const status = String(req.query.status || '').trim();
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  res.json({
    ok: true,
    orders: listOrders({ status: status || undefined, limit, offset })
  });
});

router.get('/orders/:id', (req, res) => {
  const order = loadOrder(Number(req.params.id));
  if (!order) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
  res.json({ ok: true, order });
});

router.patch('/orders/:id/status', (req, res) => {
  try {
    const order = setOrderStatus(Number(req.params.id), req.body?.status, {
      actorType: 'admin',
      actorId: 'admin',
      note: req.body?.note || ''
    });
    if (!order) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
    res.json({ ok: true, order });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
