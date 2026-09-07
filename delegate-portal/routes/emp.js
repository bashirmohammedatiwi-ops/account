const express = require('express');
const { signEmployee, authEmployee } = require('../lib/auth');
const {
  findEmpAccount,
  isEmpManager,
  canEmpPrepConfirm,
  mapEmployeeProfile,
  assertNotReceiptOnly,
  assertCanPrepConfirm
} = require('../lib/emp-accounts');
const { registerDevice, unregisterDevice } = require('../lib/push');
const {
  listOrders,
  loadOrder,
  setOrderStatus,
  setPrepConfirmed,
  maybeNotifyOrderProcessed,
  updateOrderLineByEmployee,
  deleteOrderLineByEmployee,
  deleteOrderByEmployee,
  employeeCanEditMappedOrder,
  orderFeed,
  orderStats,
  STATUS_LABELS,
  canonicalStatus
} = require('../lib/orders');

const router = express.Router();

const ALLOWED_STATUSES = new Set(['pending', 'processing', 'rejected']);

function enrichOrder(order, employee) {
  if (!order) return order;
  return {
    ...order,
    editable: employeeCanEditMappedOrder(order, employee),
    deletable: isEmpManager(employee),
    canPrepConfirm: canEmpPrepConfirm(employee)
  };
}

router.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const account = findEmpAccount(username, password);
  if (!account) {
    return res.status(401).json({ ok: false, error: 'بيانات الدخول غير صحيحة' });
  }
  const token = signEmployee({
    username: account.username,
    name: account.name,
    empRole: account.role
  });
  res.json({
    ok: true,
    token,
    employee: mapEmployeeProfile({
      username: account.username,
      name: account.name,
      empRole: account.role
    })
  });
});

router.get('/me', authEmployee, (req, res) => {
  res.json({
    ok: true,
    employee: mapEmployeeProfile(req.employee)
  });
});

router.get('/orders/stats', authEmployee, (_req, res) => {
  res.json({ ok: true, stats: orderStats(), labels: STATUS_LABELS });
});

router.get('/orders/feed', authEmployee, (req, res) => {
  const sinceId = Number(req.query.sinceId) || 0;
  const status = String(req.query.status || 'pending').trim();
  const filter = ALLOWED_STATUSES.has(status) ? status : 'pending';
  const sourceType = String(req.query.sourceType || '').trim();
  const feed = orderFeed({ sinceId, status: filter, sourceType });
  res.json({
    ok: true,
    ...feed,
    latest: feed.latest ? enrichOrder(feed.latest, req.employee) : null,
    newOrders: (feed.newOrders || []).map((o) => enrichOrder(o, req.employee))
  });
});

router.get('/orders', authEmployee, (req, res) => {
  const status = String(req.query.status || '').trim();
  const sourceType = String(req.query.sourceType || '').trim();
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const offset = Number(req.query.offset) || 0;
  const filter = status && ALLOWED_STATUSES.has(status) ? status : undefined;
  let orders = listOrders({
    status: filter,
    sourceType: sourceType || undefined,
    limit,
    offset
  });
  orders = orders
    .filter((o) => o.rawStatus !== 'draft' || o.submittedAt)
    .map((o) => enrichOrder(o, req.employee));
  res.json({ ok: true, orders });
});

router.get('/orders/:id', authEmployee, (req, res) => {
  const order = loadOrder(Number(req.params.id));
  if (!order) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
  if (order.rawStatus === 'draft' && !order.submittedAt) {
    return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
  }
  res.json({ ok: true, order: enrichOrder(order, req.employee) });
});

router.patch('/orders/:id/status', authEmployee, async (req, res) => {
  try {
    assertNotReceiptOnly(req.employee);
    const status = String(req.body?.status || '').trim();
    if (!ALLOWED_STATUSES.has(status) && !ALLOWED_STATUSES.has(canonicalStatus(status))) {
      return res.status(400).json({ ok: false, error: 'حالة غير صالحة — استخدم: قيد الانتظار / تم التجهيز / مرفوض' });
    }
    const uiStatus = ALLOWED_STATUSES.has(status) ? status : canonicalStatus(status);
    const orderId = Number(req.params.id);
    const order = setOrderStatus(orderId, uiStatus, {
      actorType: 'employee',
      actorId: String(req.employee.username || ''),
      note: req.body?.note || ''
    });
    if (!order) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
    let notify = null;
    if (uiStatus === 'processing') {
      notify = await maybeNotifyOrderProcessed(order.id);
    }
    res.json({ ok: true, order: enrichOrder(loadOrder(order.id), req.employee), notify });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/orders/:id/retry-admin-sync', authEmployee, async (req, res) => {
  try {
    assertNotReceiptOnly(req.employee);
    const orderId = Number(req.params.id);
    const order = loadOrder(orderId);
    if (!order) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
    const notify = await maybeNotifyOrderProcessed(orderId, { force: true });
    res.json({ ok: true, order: enrichOrder(loadOrder(orderId), req.employee), notify });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.patch('/orders/:id/prep-confirm', authEmployee, async (req, res) => {
  try {
    assertCanPrepConfirm(req.employee);
    const confirmed = req.body?.confirmed !== false;
    const orderId = Number(req.params.id);
    const order = setPrepConfirmed(orderId, confirmed, {
      actorType: 'employee',
      actorId: String(req.employee.username || ''),
      note: req.body?.note || ''
    });
    if (!order) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
    let notify = null;
    if (confirmed && canonicalStatus(order.status) === 'processing') {
      notify = await maybeNotifyOrderProcessed(orderId);
    }
    res.json({ ok: true, order: enrichOrder(loadOrder(orderId), req.employee), notify });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.patch('/orders/:orderId/lines/:lineId', authEmployee, (req, res) => {
  try {
    assertNotReceiptOnly(req.employee);
    const order = updateOrderLineByEmployee(
      Number(req.params.orderId),
      Number(req.params.lineId),
      req.body || {},
      req.employee.username || '',
      req.employee
    );
    if (!order) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
    res.json({ ok: true, order: enrichOrder(order, req.employee) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/orders/:orderId/lines/:lineId', authEmployee, (req, res) => {
  try {
    assertNotReceiptOnly(req.employee);
    const order = deleteOrderLineByEmployee(
      Number(req.params.orderId),
      Number(req.params.lineId),
      req.employee.username || '',
      req.employee
    );
    if (!order) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
    res.json({ ok: true, order: enrichOrder(order, req.employee) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/orders/:id', authEmployee, (req, res) => {
  try {
    const result = deleteOrderByEmployee(Number(req.params.id), req.employee);
    if (!result) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/devices', authEmployee, (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const platform = String(req.body?.platform || 'android').trim();
    const result = registerDevice({
      ownerType: 'employee',
      ownerId: req.employee.username || '',
      token,
      platform,
      app: 'emp'
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/devices', authEmployee, (req, res) => {
  try {
    const token = String(req.body?.token || req.query?.token || '').trim();
    const result = unregisterDevice({
      ownerType: 'employee',
      ownerId: req.employee.username || '',
      token
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
