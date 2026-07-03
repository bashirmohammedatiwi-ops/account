/** Barcode normalization — same rules as pos-sync-desktop */

const BIDI_AND_TASHKEEL =
  /[\u064B-\u065F\u0670\u06D6-\u06ED\u200E\u200F\u202A-\u202E\uFEFF]/g;

const BARCODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_\-./+]*$/;

function normalizeBarcode(raw) {
  if (raw == null) return '';
  return String(raw)
    .replace(/\u00A0/g, ' ')
    .replace(BIDI_AND_TASHKEEL, '')
    .replace(/[^\x21-\x7E]/g, '')
    .trim();
}

function isLikelyBarcode(code) {
  if (!code || code.length < 2) return false;
  return BARCODE_PATTERN.test(code);
}

function resolveProductBarcode(fields) {
  const barcode = normalizeBarcode(fields.barcode);
  const num = normalizeBarcode(fields.productNum);

  if (barcode && isLikelyBarcode(barcode)) return barcode;
  if (num && isLikelyBarcode(num)) return num;
  if (barcode) return barcode;
  if (num) return num;
  if (fields.productCode != null && String(fields.productCode).trim()) {
    return String(fields.productCode).trim();
  }
  return '';
}

module.exports = { normalizeBarcode, isLikelyBarcode, resolveProductBarcode };
