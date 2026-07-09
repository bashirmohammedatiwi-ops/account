const express = require('express');
const { signEmployee, authEmployee } = require('../lib/auth');
const {
  listOrders,
  loadOrder,
  setOrderStatus,
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

router.get('/orders', authEmployee, (req, res) => {
  const status = String(req.query.status || '').trim();
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const offset = Number(req.query.offset) || 0;
  const filter = status && ALLOWED_STATUSES.has(status) ? status : undefined;
  let orders = listOrders({ status: filter, limit, offset });
  // Hide pure drafts that were never submitted (optional: keep if mapped to pending)
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

router.patch('/orders/:id/status', authEmployee, (req, res) => {
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
    res.json({ ok: true, order });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
