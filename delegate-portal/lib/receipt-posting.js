/**
 * Build Edari journal lines for a receipt voucher — same File12n shape as shorja_app.
 * Amount → cash (debit) / customer (credit)
 * Commission → debit commission GL / credit counter GL
 * Discount → debit discount GL / credit customer
 */

const iconv = require('iconv-lite');

const EDARI_REF_MAX = 30;
/** Observed max in live File12n — was wrongly capped at 50 before. */
const EDARI_EXP1_MAX = 107;
const EDARI_EXP2_MAX = 61;
const EDARI_FILE12N_REMARKS_MAX = 19;

function buildReceiptRef(receipt) {
  const raw = String(receipt?.receiptNo || receipt?.receipt_no || '').trim();
  if (!raw) return 'R.V';
  const tail = raw.replace(/^RV[-\s]*/i, '');
  const seq = tail.includes('-') ? tail.split('-').pop() : tail;
  const digits = String(seq || '').replace(/\D/g, '').slice(-6);
  const compact = digits || tail.slice(-8);
  return clampEdariField(`R.V ${compact}`, EDARI_REF_MAX);
}

function normalizeEdariText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\u06CC/g, '\u064A') // Persian yeh → Arabic yeh
    .replace(/\u06A9/g, '\u0643') // Persian kaf → Arabic kaf
    .replace(/\u06AF/g, '\u0642') // Persian gaf → qaf (closest in WIN1256)
    .replace(/\u067E/g, '\u0628') // Persian pe → beh
    .replace(/\u0686/g, '\u062C') // Persian che → jeem
    .replace(/\u0698/g, '\u0632') // Persian zhe → zain
    .replace(/\u200C|\u200D|\u200E|\u200F|\uFEFF/g, '') // zero-width chars
    .replace(/\r\n|\r|\n/g, ' / ') // multi-line → single Edari line
    .replace(/\s+/g, ' ')
    .trim();
}

function encodeWin1256Bytes(value) {
  const text = normalizeEdariText(value);
  if (!text) return Buffer.alloc(0);
  return iconv.encode(text, 'win1256');
}

function bytesToEdariSqlLiteral(bytes) {
  return `'${Buffer.from(bytes).toString('latin1')}'`;
}

function clampEdariField(value, maxLen) {
  let s = normalizeEdariText(value);
  if (!maxLen || maxLen < 1) return '';
  let bytes = encodeWin1256Bytes(s);
  while (bytes.length > maxLen && s.length > 0) {
    s = s.slice(0, -1);
    bytes = encodeWin1256Bytes(s);
  }
  return s;
}

function takeEdariPrefix(value, maxLen) {
  return clampEdariField(value, maxLen);
}

function splitEdariNarrative(text) {
  const full = normalizeEdariText(text);
  if (!full) return { exp1: '', noteExp2: '', noteRemarks: '' };
  const exp1 = takeEdariPrefix(full, EDARI_EXP1_MAX);
  const rest1 = full.slice(exp1.length).trim();
  const noteExp2 = takeEdariPrefix(rest1, EDARI_EXP2_MAX);
  const rest2 = rest1.slice(noteExp2.length).trim();
  const noteRemarks = takeEdariPrefix(rest2, EDARI_FILE12N_REMARKS_MAX);
  return { exp1, noteExp2, noteRemarks };
}

function journalLineDescription(line = {}) {
  return [line.exp1, line.noteExp2, line.noteRemarks]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' / ');
}

function edariSqlLiteral(value) {
  const bytes = encodeWin1256Bytes(String(value ?? '').replace(/'/g, "''"));
  return bytesToEdariSqlLiteral(bytes);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

function line(acc, amount, isDebit, narrative = {}, oppositeAcc = null) {
  const a = accRef(acc);
  if (!a?.seq || num(amount) <= 0) return null;
  const opp = accRef(oppositeAcc);
  const exp1 = clampEdariField(String(narrative.exp1 || 'سند قبض').trim(), EDARI_EXP1_MAX);
  const noteExp2 = clampEdariField(String(narrative.noteExp2 || '').trim(), EDARI_EXP2_MAX);
  const noteRemarks = clampEdariField(String(narrative.noteRemarks || '').trim(), EDARI_FILE12N_REMARKS_MAX);
  const receiptRef = clampEdariField(String(narrative.receiptRef || '').trim(), EDARI_REF_MAX);
  return {
    accSeq: a.seq,
    accNum: a.num,
    accName: a.name,
    amount: Math.round(num(amount)),
    isDebit: !!isDebit,
    exp1,
    noteExp2,
    noteRemarks,
    receiptRef,
    oppositeAccSeq: opp?.seq || ''
  };
}

function pairLines(debitAcc, creditAcc, amount, narrative) {
  const debit = line(debitAcc, amount, true, narrative, creditAcc);
  const credit = line(creditAcc, amount, false, narrative, debitAcc);
  if (!debit || !credit) return [];
  return [debit, credit];
}

function buildReceiptJournalLines(receipt, accounts = {}) {
  const amount = num(receipt.amount);
  const commission = num(receipt.commission);
  const discount = num(receipt.discount);
  const notes = String(receipt.notes || '').trim();
  const rv = buildReceiptRef(receipt);
  const amountNarrative = splitEdariNarrative(notes || 'سند قبض');
  if (!amountNarrative.exp1) amountNarrative.exp1 = 'سند قبض';
  amountNarrative.receiptRef = rv;
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
    ...pairLines(cash, customer, amount, amountNarrative),
    ...pairLines(commDebit, commCredit, commission, { exp1: 'عمولة تحصيل', receiptRef: rv }),
    ...pairLines(disc, customer, discount, { exp1: 'حسم', receiptRef: rv })
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

function formatEdariJournalDate(isoOrRaw) {
  const iso = toIsoDate(isoOrRaw);
  const [y, mo, d] = iso.split('-');
  return `'${d}/${mo}/${y}'`;
}

/** @deprecated use formatEdariJournalDate — journal Date must be date-only, not TIMESTAMP */
function formatEdariTimestamp(isoOrRaw) {
  return formatEdariJournalDate(isoOrRaw);
}

/** Same INSERT shape as shorja_app insertJournalEntry — Seq is AUTOINC, never set. */
function buildFile12nInsertSql({ num: bondNum, line: ln, dateStr, billKind = 0, receiptRef }) {
  const dept = ln.isDebit ? 'True' : 'False';
  const exp1 = clampEdariField(ln.exp1 || 'سند قبض', EDARI_EXP1_MAX);
  const noteExp2 = clampEdariField(ln.noteExp2 || '', EDARI_EXP2_MAX);
  const noteRemarks = clampEdariField(ln.noteRemarks || '', EDARI_FILE12N_REMARKS_MAX);
  const ref = clampEdariField(
    receiptRef || ln.receiptRef || ln.ref || String(bondNum || ''),
    EDARI_REF_MAX
  );
  return `
    INSERT INTO File12n (Num, Acc, "Date", Am, Dept, Equal, Exp1, Exp2, BillNum, BillSeq, BillKind, BillBook, Remarks, ForBill, Ref, Two)
    VALUES (
      ${Number(bondNum)},
      ${Number(ln.accSeq)},
      ${formatEdariJournalDate(dateStr)},
      ${Math.round(num(ln.amount))},
      ${dept},
      1,
      ${edariSqlLiteral(exp1)},
      ${edariSqlLiteral(noteExp2)},
      0,
      0,
      ${Number(billKind) || 0},
      0,
      ${edariSqlLiteral(noteRemarks)},
      0,
      ${edariSqlLiteral(ref)},
      ${Number(ln.oppositeAccSeq || ln.oppositeAcc || 0)}
    )
  `.replace(/\s+/g, ' ').trim();
}

module.exports = {
  buildReceiptJournalLines,
  buildReceiptRef,
  validatePostingAccounts,
  formatEdariDate,
  formatEdariJournalDate,
  formatEdariTimestamp,
  buildFile12nInsertSql,
  splitEdariNarrative,
  journalLineDescription,
  sqlQuote,
  edariSqlLiteral,
  clampEdariField,
  toIsoDate,
  EDARI_REF_MAX,
  EDARI_EXP1_MAX,
  EDARI_EXP2_MAX,
  EDARI_FILE12N_REMARKS_MAX
};
