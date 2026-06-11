const express = require('express');
const { authAgent } = require('../lib/auth');
const { canAgentAccess } = require('../lib/accounts');
const {
  listBranchesForAgent,
  listSections
} = require('../lib/catalog');
const {
  listProducts,
  getProduct,
  lookupByBarcode
} = require('../lib/products');
const {
  createOrder,
  updateOrder,
  submitOrder,
  listOrders,
  loadOrder
} = require('../lib/orders');

const router = express.Router();

router.get('/catalog/branches', authAgent, (req, res) => {
  res.json({ ok: true, branches: listBranchesForAgent(req.agent.id, { activeOnly: true }) });
});

router.get('/catalog/branches/:id/sections', authAgent, (req, res) => {
  res.json({ ok: true, sections: listSections(Number(req.params.id), { activeOnly: true }) });
});

router.get('/catalog/sections/:id/products', authAgent, (req, res) => {
  res.json({ ok: true, products: listProducts(Number(req.params.id), { activeOnly: true }) });
});

router.get('/products/lookup', authAgent, (req, res) => {
  const code = String(req.query.code || '').trim();
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  if (!code) return res.status(400).json({ ok: false, error: 'الباركود مطلوب' });
  const product = lookupByBarcode(code, { branchId, activeOnly: true });
  if (!product) return res.status(404).json({ ok: false, error: 'المنتج غير موجود في هذا الفرع' });
  res.json({ ok: true, product });
});

router.get('/products/:id', authAgent, (req, res) => {
  const product = getProduct(Number(req.params.id));
  if (!product || !product.isActive) {
    return res.status(404).json({ ok: false, error: 'المنتج غير موجود' });
  }
  res.json({ ok: true, product });
});

router.get('/orders', authAgent, (req, res) => {
  const status = String(req.query.status || '').trim();
  res.json({
    ok: true,
    orders: listOrders({ agentId: req.agent.id, status: status || undefined, limit: 100 })
  });
});

router.get('/orders/:id', authAgent, (req, res) => {
  const order = loadOrder(Number(req.params.id));
  if (!order || order.agentId !== req.agent.id) {
    return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
  }
  res.json({ ok: true, order });
});

router.post('/orders', authAgent, (req, res) => {
  const { customerAccSeq, catalogBranchId, notes, lines, submit } = req.body || {};
  if (customerAccSeq && !canAgentAccess(req.agent.id, customerAccSeq)) {
    return res.status(403).json({ ok: false, error: 'لا تملك صلاحية هذا الفرع/الزبون' });
  }
  try {
    let order = createOrder(req.agent.id, { customerAccSeq, catalogBranchId, notes, lines });
    if (submit) order = submitOrder(order.id, req.agent.id);
    res.json({ ok: true, order });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.put('/orders/:id', authAgent, (req, res) => {
  try {
    const order = updateOrder(Number(req.params.id), req.agent.id, req.body || {});
    if (!order) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
    res.json({ ok: true, order });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/orders/:id/submit', authAgent, (req, res) => {
  try {
    const order = submitOrder(Number(req.params.id), req.agent.id);
    if (!order) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
    res.json({ ok: true, order });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
