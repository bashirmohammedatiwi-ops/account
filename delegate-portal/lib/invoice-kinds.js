function invoiceKindLabel(kind) {
  const map = {
    0: 'فاتورة',
    1: 'فاتورة مبيعات',
    2: 'مرتجع مبيعات',
    3: 'فاتورة مشتريات',
    4: 'فاتورة مبيعات',
    5: 'مرتجع',
    6: 'فاتورة هدايا'
  };
  const k = Number(kind);
  return map[k] ?? (kind != null && kind !== '' ? `فاتورة (${kind})` : 'فاتورة مبيعات');
}

function invoiceKindShortLabel(kind) {
  const map = {
    0: 'مبيعات',
    1: 'مبيعات',
    2: 'مرتجع',
    3: 'مشتريات',
    4: 'مبيعات',
    5: 'مرتجع',
    6: 'هدية'
  };
  const k = Number(kind);
  return map[k] ?? 'مبيعات';
}

function isReturnInvoiceKind(kind) {
  const k = Number(kind);
  return k === 2 || k === 5;
}

/** نوع فاتورة الهدايا في الإداري (kind 6). */
function isGiftInvoiceKind(kind) {
  return Number(kind) === 6;
}

module.exports = {
  invoiceKindLabel,
  invoiceKindShortLabel,
  isReturnInvoiceKind,
  isGiftInvoiceKind
};
