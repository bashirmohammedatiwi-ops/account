const express = require('express');
const { authSync } = require('../lib/auth');
const { createShorjaOrder } = require('../lib/orders');

const router = express.Router();

router.post('/shorja/orders', authSync, (req, res) => {
  try {
    const body = req.body || {};
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!lines.length) {
      return res.status(400).json({ ok: false, error: 'أضف بنوداً للطلب' });
    }
    const order = createShorjaOrder({
      shorjaInvoiceId: body.shorjaInvoiceId,
      shorjaInvoiceNo: body.shorjaInvoiceNo,
      shorjaBranchName: body.shorjaBranchName || body.branchName,
      customerName: body.customerName,
      customerAccSeq: body.customerAccSeq || '',
      notes: body.notes || '',
      lines
    });
    res.json({ ok: true, order });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
