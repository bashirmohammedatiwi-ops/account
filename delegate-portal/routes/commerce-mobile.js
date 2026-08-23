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
  lookupByBarcode,
  groupProductsByShade
} = require('../lib/products');
const {
  createOrder,
  updateOrder,
  submitOrder,
  listOrders,
  loadOrder,
  deleteOrderByAgent
} = require('../lib/orders');
const { resolveOrderCustomer } = require('../lib/customer-requests');

const router = express.Router();

router.get('/catalog/branches', authAgent, (req, res) => {
  res.json({ ok: true, branches: listBranchesForAgent(req.agent.id, { activeOnly: true }) });
});

router.get('/catalog/branches/:id/sections', authAgent, (req, res) => {
  res.json({ ok: true, sections: listSections(Number(req.params.id), { activeOnly: true }) });
});

router.get('/catalog/sections/:id/products', authAgent, (req, res) => {
  try {
    const products = listProducts(Number(req.params.id), { activeOnly: true });
    const groups = groupProductsByShade(products);
    res.json({ ok: true, products, groups });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'فشل تحميل المنتجات' });
  }
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
  const { customerAccSeq, customerRequestId, catalogBranchId, notes, lines, submit } = req.body || {};
  try {
    resolveOrderCustomer(req.agent.id, { customerAccSeq, customerRequestId });
  } catch (err) {
    return res.status(403).json({ ok: false, error: err.message });
  }
  try {
    let order = createOrder(req.agent.id, { customerAccSeq, customerRequestId, catalogBranchId, notes, lines });
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

router.delete('/orders/:id', authAgent, (req, res) => {
  try {
    const result = deleteOrderByAgent(Number(req.params.id), req.agent.id);
    if (!result) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

const {
  createReceipt,
  listReceipts,
  loadReceipt,
  deleteReceipt
} = require('../lib/receipts');

router.get('/receipts', authAgent, (req, res) => {
  const status = String(req.query.status || '').trim();
  res.json({
    ok: true,
    receipts: listReceipts({
      agentId: req.agent.id,
      status: status || undefined,
      limit: 100
    })
  });
});

router.get('/receipts/:id', authAgent, (req, res) => {
  const receipt = loadReceipt(Number(req.params.id));
  if (!receipt || receipt.agentId !== req.agent.id) {
    return res.status(404).json({ ok: false, error: 'سند القبض غير موجود' });
  }
  res.json({ ok: true, receipt });
});

router.post('/receipts', authAgent, (req, res) => {
  const body = req.body || {};
  if (body.customerAccSeq && !canAgentAccess(req.agent.id, body.customerAccSeq)) {
    return res.status(403).json({ ok: false, error: 'لا تملك صلاحية هذا الزبون' });
  }
  try {
    const receipt = createReceipt(req.agent.id, body);
    res.json({ ok: true, receipt });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/receipts/:id', authAgent, (req, res) => {
  try {
    const result = deleteReceipt(Number(req.params.id), { agentId: req.agent.id });
    if (!result) return res.status(404).json({ ok: false, error: 'سند القبض غير موجود' });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

const {
  createCustomerRequest,
  listCustomerRequests,
  loadCustomerRequest,
  deleteCustomerRequest
} = require('../lib/customer-requests');

router.get('/customer-requests', authAgent, (req, res) => {
  const status = String(req.query.status || '').trim();
  res.json({
    ok: true,
    requests: listCustomerRequests({
      agentId: req.agent.id,
      status: status || undefined,
      limit: 100
    })
  });
});

router.get('/customer-requests/:id', authAgent, (req, res) => {
  const request = loadCustomerRequest(Number(req.params.id));
  if (!request || request.agentId !== req.agent.id) {
    return res.status(404).json({ ok: false, error: 'طلب الزبون غير موجود' });
  }
  res.json({ ok: true, request });
});

router.post('/customer-requests', authAgent, (req, res) => {
  try {
    const request = createCustomerRequest(req.agent.id, req.body || {});
    res.json({ ok: true, request });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/customer-requests/:id', authAgent, (req, res) => {
  try {
    const result = deleteCustomerRequest(Number(req.params.id), { agentId: req.agent.id });
    if (!result) return res.status(404).json({ ok: false, error: 'طلب الزبون غير موجود' });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

const { listGovernorates } = require('../lib/iraq-governorates');
const {
  createPromotionalVisit,
  listPromotionalVisits,
  loadPromotionalVisit,
  deletePromotionalVisit,
  OUTCOME_LABELS
} = require('../lib/promotional-visits');

router.get('/governorates', authAgent, (_req, res) => {
  res.json({ ok: true, governorates: listGovernorates() });
});

router.get('/promotional-visits/outcomes', authAgent, (_req, res) => {
  res.json({
    ok: true,
    outcomes: Object.entries(OUTCOME_LABELS).map(([code, label]) => ({ code, label }))
  });
});

router.get('/promotional-visits', authAgent, (req, res) => {
  const status = String(req.query.status || '').trim();
  res.json({
    ok: true,
    visits: listPromotionalVisits({
      agentId: req.agent.id,
      status: status || undefined,
      limit: 100
    })
  });
});

router.get('/promotional-visits/:id', authAgent, (req, res) => {
  const visit = loadPromotionalVisit(Number(req.params.id));
  if (!visit || visit.agentId !== req.agent.id) {
    return res.status(404).json({ ok: false, error: 'الزيارة غير موجودة' });
  }
  res.json({ ok: true, visit });
});

router.post('/promotional-visits', authAgent, (req, res) => {
  try {
    const visit = createPromotionalVisit(req.agent.id, req.body || {});
    res.json({ ok: true, visit });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/promotional-visits/:id', authAgent, (req, res) => {
  try {
    const result = deletePromotionalVisit(Number(req.params.id), { agentId: req.agent.id });
    if (!result) return res.status(404).json({ ok: false, error: 'الزيارة غير موجودة' });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
