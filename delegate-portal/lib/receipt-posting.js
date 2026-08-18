/**
 * Build Edari journal lines for a receipt voucher — same File12n shape as shorja_app.
 * Amount → cash (debit) / customer (credit)
 * Commission → debit commission GL / credit counter GL
 * Discount → debit discount GL / credit customer
 */

const EDARI_REF_MAX = 30;
const EDARI_EXP1_MAX = 50;

const WIN1256_AR = {
  '،': 0xA1, '؛': 0xBA, '؟': 0xBF,
  'ء': 0xC1, 'آ': 0xC2, 'أ': 0xC3, 'ؤ': 0xC4, 'إ': 0xC5, 'ئ': 0xC6,
  'ا': 0xC7, 'ب': 0xC8, 'ة': 0xC9, 'ت': 0xCA, 'ث': 0xCB, 'ج': 0xCC,
  'ح': 0xCD, 'خ': 0xCE, 'د': 0xCF, 'ذ': 0xD0, 'ر': 0xD1, 'ز': 0xD2,
  'س': 0xD3, 'ش': 0xD4, 'ص': 0xD5, 'ض': 0xD6, 'ط': 0xD7, 'ظ': 0xD8,
  'ع': 0xD9, 'غ': 0xDA, 'ـ': 0xDC, 'ف': 0xDD, 'ق': 0xDE, 'ك': 0xDF,
  'ل': 0xE1, 'م': 0xE3, 'ن': 0xE4, 'ه': 0xE5, 'و': 0xE6, 'ى': 0xEC,
  'ي': 0xED, 'ً': 0xF0, 'ٌ': 0xF1, 'ٍ': 0xF2, 'َ': 0xF3, 'ُ': 0xF5,
  'ِ': 0xF6, 'ّ': 0xF8, 'ْ': 0xFA
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function encodeWin1256Bytes(value) {
  const s = String(value ?? '');
  const out = [];
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code <= 0x7F) {
      out.push(code);
      continue;
    }
    const mapped = WIN1256_AR[ch];
    out.push(mapped != null ? mapped : 0x3F);
  }
  return Buffer.from(out);
}

function clampEdariField(value, maxBytes) {
  const s = String(value ?? '');
  if (!maxBytes || maxBytes < 1) return s;
  if (encodeWin1256Bytes(s).length <= maxBytes) return s;
  let out = '';
  for (const ch of s) {
    const next = out + ch;
    if (encodeWin1256Bytes(next).length > maxBytes) break;
    out = next;
  }
  return out;
}

function edariSqlLiteral(value) {
  const bytes = encodeWin1256Bytes(String(value ?? '').replace(/'/g, "''"));
  let out = "'";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return `${out}'`;
}

function sqlQuote(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function accRef(acc) {
  if (!acc) return null;
  return {
    seq: String(acc.seq || acc.accSeq || ''),
    num: String(acc.num || acc.accNum || ''),
    name: String(acc.name || acc.name1 || acc.accName || '')
  };
}

function line(acc, amount, isDebit, exp1, exp2 = '', oppositeAcc = null) {
  const a = accRef(acc);
  if (!a?.seq || num(amount) <= 0) return null;
  const opp = accRef(oppositeAcc);
  return {
    accSeq: a.seq,
    accNum: a.num,
    accName: a.name,
    amount: Math.round(num(amount)),
    isDebit: !!isDebit,
    exp1: clampEdariField(String(exp1 || '').trim(), EDARI_EXP1_MAX),
    exp2: clampEdariField(String(exp2 || '').trim(), EDARI_REF_MAX),
    oppositeAccSeq: opp?.seq || ''
  };
}

function pairLines(debitAcc, creditAcc, amount, exp1, exp2) {
  const debit = line(debitAcc, amount, true, exp1, exp2, creditAcc);
  const credit = line(creditAcc, amount, false, exp1, exp2, debitAcc);
  if (!debit || !credit) return [];
  return [debit, credit];
}

function buildReceiptJournalLines(receipt, accounts = {}) {
  const amount = num(receipt.amount);
  const commission = num(receipt.commission);
  const discount = num(receipt.discount);
  const notes = String(receipt.notes || '').trim();
  const rv = `R.V ${receipt.receiptNo || receipt.receipt_no || ''}`.trim();
  const customer = accRef(accounts.customer || {
    seq: receipt.customerAccSeq,
    num: receipt.customerNum,
    name: receipt.customerName
  });
  const cash = accRef(accounts.cash);
  const commDebit = accRef(accounts.commissionDebit);
  const commCredit = accRef(accounts.commissionCredit);
  const disc = accRef(accounts.discount);

  return [
    ...pairLines(cash, customer, amount, notes || 'سند قبض', rv),
    ...pairLines(commDebit, commCredit, commission, 'عمولة تحصيل', rv),
    ...pairLines(disc, customer, discount, 'حسم', rv)
  ];
}

function validatePostingAccounts(receipt, accounts) {
  const amount = num(receipt.amount);
  const commission = num(receipt.commission);
  const discount = num(receipt.discount);
  if (amount <= 0) return 'المبلغ مطلوب';
  if (!accRef(accounts.customer)?.seq) return 'حساب الزبون غير محدد';
  if (!accRef(accounts.cash)?.seq) return 'ثبّت صندوق المبلغ من إعدادات سند القبض';
  if (commission > 0) {
    if (!accRef(accounts.commissionDebit)?.seq) return 'ثبّت حساب العمولات (مدين)';
    if (!accRef(accounts.commissionCredit)?.seq) return 'ثبّت حساب مقابل العمولات (دائن)';
  }
  if (discount > 0 && !accRef(accounts.discount)?.seq) {
    return 'ثبّت حساب الحسم';
  }
  return '';
}

function toIsoDate(isoOrRaw) {
  const s = String(isoOrRaw || '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDash) {
    return `${dmyDash[3]}-${dmyDash[2].padStart(2, '0')}-${dmyDash[1].padStart(2, '0')}`;
  }
  const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmySlash) {
    return `${dmySlash[3]}-${dmySlash[2].padStart(2, '0')}-${dmySlash[1].padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function formatEdariDate(isoOrRaw) {
  const iso = toIsoDate(isoOrRaw);
  const [y, mo, d] = iso.split('-');
  return `${d}-${mo}-${y}`;
}

function formatEdariTimestamp(isoOrRaw) {
  return `TIMESTAMP '${toIsoDate(isoOrRaw)} 12:00:00'`;
}

/** Same INSERT shape as shorja_app insertJournalEntry — Seq is AUTOINC, never set. */
function buildFile12nInsertSql({ num: bondNum, line: ln, dateStr, billKind = 0 }) {
  const dept = ln.isDebit ? 'True' : 'False';
  const exp1 = clampEdariField(ln.exp1 || 'سند قبض', EDARI_EXP1_MAX);
  const ref = clampEdariField(ln.exp2 || String(bondNum || ''), EDARI_REF_MAX);
  const forBill = 0;
  return `
    INSERT INTO File12n (Num, Acc, "Date", Am, Dept, Exp1, Exp2, BillNum, BillSeq, BillKind, BillBook, Remarks, ForBill, Ref, Two)
    VALUES (
      ${Number(bondNum)},
      ${Number(ln.accSeq)},
      ${formatEdariTimestamp(dateStr)},
      ${Math.round(num(ln.amount))},
      ${dept},
      ${edariSqlLiteral(exp1)},
      '',
      0,
      0,
      ${Number(billKind) || 0},
      0,
      '',
      ${forBill},
      ${edariSqlLiteral(ref)},
      ${Number(ln.oppositeAccSeq || ln.oppositeAcc || 0)}
    )
  `.replace(/\s+/g, ' ').trim();
}

module.exports = {
  buildReceiptJournalLines,
  validatePostingAccounts,
  formatEdariDate,
  formatEdariTimestamp,
  buildFile12nInsertSql,
  sqlQuote,
  edariSqlLiteral,
  clampEdariField,
  toIsoDate
};
