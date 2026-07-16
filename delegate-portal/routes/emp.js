const express = require('express');
const { signEmployee, authEmployee } = require('../lib/auth');
const { registerDevice, unregisterDevice } = require('../lib/push');
const {
  listOrders,
  loadOrder,
  setOrderStatus,
  setPrepConfirmed,
  maybeNotifyOrderProcessed,
  updateOrderLineByEmployee,
  deleteOrderLineByEmployee,
  orderFeed,
  orderStats,
  STATUS_LABELS,
  canonicalStatus
} = require('../lib/orders');

const router = express.Router();

const EMP_USER = process.env.EMP_USER || 'allemp';
const EMP_PASS = process.env.EMP_PASS || '000000';

const ALLOWED_STATUSES = new Set(['pending', 'processing', 'rejected']);

router.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (username !== EMP_USER || password !== EMP_PASS) {
    return res.status(401).json({ ok: false, error: 'بيانات الدخول غير صحيحة' });
  }
  const token = signEmployee({ username: EMP_USER, name: 'موظف التجهيز' });
  res.json({
    ok: true,
    token,
    employee: { username: EMP_USER, name: 'موظف التجهيز' }
  });
});

router.get('/me', authEmployee, (req, res) => {
  res.json({
    ok: true,
    employee: {
      username: req.employee.username || EMP_USER,
      name: req.employee.name || 'موظف التجهيز'
    }
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
  res.json({ ok: true, ...orderFeed({ sinceId, status: filter, sourceType }) });
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
  orders = orders.filter((o) => o.rawStatus !== 'draft' || o.submittedAt);
  res.json({ ok: true, orders });
});

router.get('/orders/:id', authEmployee, (req, res) => {
  const order = loadOrder(Number(req.params.id));
  if (!order) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
  if (order.rawStatus === 'draft' && !order.submittedAt) {
    return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
  }
  res.json({ ok: true, order });
});

router.patch('/orders/:id/status', authEmployee, async (req, res) => {
  try {
    const status = String(req.body?.status || '').trim();
    if (!ALLOWED_STATUSES.has(status) && !ALLOWED_STATUSES.has(canonicalStatus(status))) {
      return res.status(400).json({ ok: false, error: 'حالة غير صالحة — استخدم: قيد الانتظار / تم التجهيز / مرفوض' });
    }
    const uiStatus = ALLOWED_STATUSES.has(status) ? status : canonicalStatus(status);
    const order = setOrderStatus(Number(req.params.id), uiStatus, {
      actorType: 'employee',
      actorId: String(req.employee.username || EMP_USER),
      note: req.body?.note || ''
    });
    if (!order) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
    let notify = null;
    if (uiStatus === 'processing') {
      notify = await maybeNotifyOrderProcessed(order.id);
    }
    res.json({ ok: true, order: loadOrder(order.id), notify });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.patch('/orders/:id/prep-confirm', authEmployee, async (req, res) => {
  try {
    const confirmed = req.body?.confirmed !== false;
    const order = setPrepConfirmed(Number(req.params.id), confirmed, {
      actorType: 'employee',
      actorId: String(req.employee.username || EMP_USER),
      note: req.body?.note || ''
    });
    if (!order) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
    let notify = null;
    if (confirmed) {
      notify = await maybeNotifyOrderProcessed(order.id);
    }
    res.json({ ok: true, order: loadOrder(order.id), notify });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.patch('/orders/:orderId/lines/:lineId', authEmployee, (req, res) => {
  try {
    const order = updateOrderLineByEmployee(
      Number(req.params.orderId),
      Number(req.params.lineId),
      req.body || {},
      req.employee.username || EMP_USER
    );
    if (!order) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
    res.json({ ok: true, order });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/orders/:orderId/lines/:lineId', authEmployee, (req, res) => {
  try {
    const order = deleteOrderLineByEmployee(
      Number(req.params.orderId),
      Number(req.params.lineId),
      req.employee.username || EMP_USER
    );
    if (!order) return res.status(404).json({ ok: false, error: 'الطلب غير موجود' });
    res.json({ ok: true, order });
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
      ownerId: req.employee.username || EMP_USER,
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
      ownerId: req.employee.username || EMP_USER,
      token
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
