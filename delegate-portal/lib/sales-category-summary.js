const { isReturnInvoiceKind, isGiftInvoiceKind } = require('./invoice-kinds');

/** سعر السطر = سعر الفاتورة الفعلي (Price)، كما يحسبه الإداري. */
function resolveSalesUnitPrice(line) {
  return Number(line.unitPrice ?? line.price ?? line.Price ?? 0);
}

function resolveSalesLineTotal(line) {
  const quant = Number(line.quant ?? line.Quant ?? 0);
  const bonus = Number(line.bonus ?? line.OBonus ?? 0);
  const unit = resolveSalesUnitPrice(line);
  const stored = Number(line.lineTotal ?? line.line_sum ?? line.Sum ?? line.sum ?? 0);
  if (stored > 0) return Math.abs(stored);
  const computed = quant > 0 ? Math.round(quant * unit) : Math.round(bonus * unit);
  return Math.abs(computed);
}

/** Bonus qty — the recorded OBonus on the line (هدايا/بونص الفاتورة). */
function resolveSalesLineBonus(line) {
  return Number(line.bonus ?? line.OBonus ?? 0);
}

/**
 * مبيعات / هدايا / مردود — كما يصنّفها الإداري حسب نوع الفاتورة (Kind):
 *   - kind 6        → هدايا
 *   - kind 2 / 5    → مردود
 *   - غير ذلك       → مبيعات
 * إضافةً لذلك، أي بونص مسجَّل (OBonus) على سطر مبيعات يُحتسب ضمن الهدايا.
 */
function computeCategorySummary(lines) {
  const sales = { qty: 0, bonus: 0, amount: 0 };
  const gifts = { qty: 0, bonus: 0, amount: 0 };
  const returns = { qty: 0, bonus: 0, amount: 0 };

  for (const line of lines || []) {
    const quant = Number(line.quant ?? line.Quant ?? 0);
    const obonus = resolveSalesLineBonus(line);
    const kind = line.kind ?? line.InvKind;
    const isGift = line.isGift === true || isGiftInvoiceKind(kind);
    const isReturn = !isGift && (line.isReturn === true || isReturnInvoiceKind(kind));

    if (isGift) {
      const giftQty = Math.abs(quant);
      gifts.qty += giftQty;
      gifts.bonus += giftQty;
      gifts.amount += resolveSalesLineTotal(line);
      continue;
    }

    if (isReturn) {
      returns.qty += Math.abs(quant);
      returns.amount += resolveSalesLineTotal(line);
      continue;
    }

    // بونص ضمن فاتورة مبيعات = هدية بقيمتها بسعر البيع
    if (obonus > 0) {
      gifts.bonus += obonus;
      gifts.amount += Math.round(obonus * resolveSalesUnitPrice(line));
    }

    if (quant > 0) {
      sales.qty += quant;
      sales.amount += resolveSalesLineTotal(line);
    }
  }

  return { sales, gifts, returns };
}

function mergeCategorySummaries(target, source) {
  for (const key of ['sales', 'gifts', 'returns']) {
    target[key].qty += source[key].qty;
    target[key].bonus += source[key].bonus;
    target[key].amount += source[key].amount;
  }
}

module.exports = {
  resolveSalesUnitPrice,
  resolveSalesLineTotal,
  resolveSalesLineBonus,
  computeCategorySummary,
  mergeCategorySummaries
};
