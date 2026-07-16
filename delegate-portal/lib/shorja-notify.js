/**
 * إشعار مركز الشورجة عند تجهيز الطلب (تم التجهيز).
 */
function getShorjaConfig() {
  const base = String(process.env.SHORJA_HUB_URL || '').replace(/\/$/, '');
  const key = String(process.env.SYNC_API_KEY || process.env.SHORJA_INTEGRATION_KEY || '').trim();
  return { base, key };
}

function buildProcessedPayload(order) {
  if (!order) return null;
  return {
    orderId: order.id,
    orderNo: order.orderNo,
    sourceType: order.sourceType || 'delegate',
    shorjaInvoiceId: order.shorjaInvoiceId || null,
    shorjaInvoiceNo: order.shorjaInvoiceNo || '',
    shorjaBranchName: order.shorjaBranchName || '',
    customerAccSeq: order.customerAccSeq || '',
    customerName: order.customerName || '',
    agentName: order.agentName || '',
    catalogBranchName: order.catalogBranchName || '',
    notes: order.notes || '',
    totalAmount: order.totalAmount || 0,
    lines: (order.lines || []).map((line) => ({
      barcode: line.barcode || '',
      matName: line.matName || '',
      quant: Number(line.quant || 0),
      bonus: Number(line.bonus || 0),
      tester: Number(line.tester || 0),
      unitPrice: Number(line.unitPrice || 0),
      lineTotal: Number(line.lineTotal || 0),
      remarks: line.remarks || ''
    }))
  };
}

async function notifyShorjaOrderProcessed(order) {
  const { base, key } = getShorjaConfig();
  if (!base) {
    return { ok: false, skipped: true, error: 'SHORJA_HUB_URL غير مضبوط' };
  }
  if (!key) {
    return { ok: false, skipped: true, error: 'SYNC_API_KEY غير مضبوط' };
  }

  const payload = buildProcessedPayload(order);
  if (!payload) return { ok: false, error: 'بيانات الطلب غير صالحة' };

  try {
    const res = await fetch(`${base}/api/sync/delegate/processed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sync-key': key
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403) {
      return {
        ok: false,
        error: 'مفتاح التكامل مرفوض — طابق SYNC_API_KEY مع DELEGATE_INTEGRATION_KEY في الشورجة'
      };
    }
    if (!res.ok || !data.ok) {
      const err = data.error || `HTTP ${res.status}`;
      console.error('[shorja-notify] فشل الإرسال:', err, { orderId: order.id, orderNo: order.orderNo });
      return { ok: false, error: err };
    }
    console.log('[shorja-notify] تم الإرسال:', order.orderNo, data.invoice?.invoiceNo || data.invoice?.id || '');
    return { ok: true, result: data };
  } catch (err) {
    console.error('[shorja-notify]', err.message, { orderId: order.id });
    return { ok: false, error: err.message || 'تعذر الاتصال بمركز الشورجة' };
  }
}

module.exports = {
  getShorjaConfig,
  buildProcessedPayload,
  notifyShorjaOrderProcessed
};
