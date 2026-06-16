/**
 * اشتقاق كود/تسمية الفرع — مطابق لفلترة الإداري.
 * الفرع مخزَّن في ملاحظات الفاتورة (remarks): "الفرع 136" / "الفرع دلفري".
 *   - "الفرع 136" / "الفرع 138"   → الرقم (136 / 138)
 *   - "الفرع دلفري" وغير المرقّمة  → رقم حساب الفاتورة (1210420 / 1210413)
 *   - فواتير بدون "الفرع"          → رقم حساب الفاتورة (للفلترة فقط، لا تُعرض في القائمة)
 */

function hasBranchMarker(remarks) {
  return /الفرع/u.test(String(remarks || ''));
}

function isDeliveryBranchRemarks(remarks) {
  const m = String(remarks || '').match(/الفرع\s*(\S+)/u);
  if (!m) return false;
  return !/[0-9]/.test(m[1]);
}

function deriveBranchCode(remarks, accNum) {
  const m = String(remarks || '').match(/الفرع\s*(\S+)/u);
  if (m) {
    const tok = m[1].replace(/[^0-9]/g, '');
    if (tok) return tok;
  }
  return String(accNum || '').replace(/[^0-9]/g, '');
}

/** تسمية مقروءة للفرع تُعرض في قوائم الاختيار. */
function deriveBranchLabel(remarks, accNum, accName) {
  const raw = String(remarks || '').trim();
  const m = raw.match(/الفرع\s*(\S+)/u);
  if (m) {
    const tok = m[1].replace(/[^0-9]/g, '');
    if (tok) return `الفرع ${tok}`;
    const name = String(accName || '').trim();
    const num = String(accNum || '').replace(/[^0-9]/g, '');
    if (name && num) return `دلفري — ${name} (${num})`;
    if (name) return `دلفري — ${name}`;
    return raw || 'دلفري';
  }
  return accName || String(accNum || '').replace(/[^0-9]/g, '') || '(بدون فرع)';
}

/** الفروع المعتمدة في تقرير الإداري — تظهر دائماً في القائمة حتى بدون فواتير في الفترة. */
const STANDARD_SALES_BRANCHES = [
  { code: '136', label: 'الفرع 136', remarks: 'الفرع 136' },
  { code: '138', label: 'الفرع 138', remarks: 'الفرع 138' },
  { code: '1210413', label: 'دلفري — دلفري الخط الناقل جديد (1210413)', remarks: 'الفرع دلفري' },
  { code: '1210420', label: 'دلفري — دلفري بغداد (1210420)', remarks: 'الفرع دلفري' }
];

/** دمج الفروع من الفترة مع الفروع المعتمدة (invoiceCount=0 إن لم تُستخدم). */
function mergeStandardSalesBranches(branches) {
  const map = new Map((branches || []).map((b) => [String(b.code), b]));
  for (const std of STANDARD_SALES_BRANCHES) {
    if (!map.has(std.code)) {
      map.set(std.code, { ...std, invoiceCount: 0 });
    }
  }
  return sortBranchesForList([...map.values()]);
}

/** ترتيب الفروع للعرض: مرقّمة → دلفري → الباقي، ثم بعدد الفواتير. */
function sortBranchesForList(branches) {
  const rank = (b) => {
    const code = String(b.code || '');
    if (/^\d{2,4}$/.test(code)) return 0;
    if (isDeliveryBranchRemarks(b.remarks) || /دلفري/u.test(String(b.label || ''))) return 1;
    return 2;
  };
  return [...branches].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const dc = (b.invoiceCount || 0) - (a.invoiceCount || 0);
    if (dc) return dc;
    return String(a.label || a.code).localeCompare(String(b.label || b.code), 'ar');
  });
}

/** تحويل قائمة الفروع المطلوبة إلى مجموعة أكواد رقمية (فارغة = بلا فلترة). */
function parseBranchFilter(input) {
  const list = Array.isArray(input)
    ? input
    : String(input || '').split(/[,،\s]+/);
  const codes = list
    .map((s) => String(s || '').replace(/[^0-9]/g, '').trim())
    .filter(Boolean);
  return new Set(codes);
}

module.exports = {
  deriveBranchCode,
  deriveBranchLabel,
  parseBranchFilter,
  hasBranchMarker,
  isDeliveryBranchRemarks,
  sortBranchesForList,
  mergeStandardSalesBranches,
  STANDARD_SALES_BRANCHES
};
