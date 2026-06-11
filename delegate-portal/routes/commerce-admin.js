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
  getProduct,
  updateProduct,
  deleteProduct,
  saveProductImage,
  lookupByBarcode,
  findEdariMaterialByCode,
  addProductByBarcode
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

router.get('/products/lookup', (req, res) => {
  const code = String(req.query.code || '').trim();
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  const product = lookupByBarcode(code, { branchId });
  if (!product) return res.status(404).json({ ok: false, error: 'المنتج غير موجود' });
  res.json({ ok: true, product });
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

router.post('/products/by-barcode', (req, res) => {
  try {
    const sectionId = Number(req.body?.sectionId);
    const barcode = String(req.body?.barcode || '').trim();
    if (!sectionId || !barcode) {
      return res.status(400).json({ ok: false, error: 'القسم والباركود مطلوبان' });
    }
    const product = addProductByBarcode(sectionId, barcode);
    res.json({ ok: true, product });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/products', (req, res) => {
  return res.status(400).json({
    ok: false,
    error: 'أضف المنتج بالباركود فقط — البيانات تُجلب من Edari'
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

router.post('/products/:id/image', (req, res) => {
  try {
    const product = saveProductImage(Number(req.params.id), req.body?.dataUrl);
    if (!product) return res.status(404).json({ ok: false, error: 'المنتج غير موجود' });
    res.json({ ok: true, product });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
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
