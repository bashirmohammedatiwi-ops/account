/**
 * Build Edari journal lines for a receipt voucher.
 * Amount → cash (debit) / customer (credit)
 * Commission → debit commission GL / credit counter GL
 * Discount → debit discount GL / credit customer
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function accRef(acc) {
  if (!acc) return null;
  return {
    seq: String(acc.seq || acc.accSeq || ''),
    num: String(acc.num || acc.accNum || ''),
    name: String(acc.name || acc.name1 || acc.accName || '')
  };
}

function line(acc, amount, isDebit, exp1, exp2 = '') {
  const a = accRef(acc);
  if (!a?.seq || num(amount) <= 0) return null;
  return {
    accSeq: a.seq,
    accNum: a.num,
    accName: a.name,
    amount: Math.round(num(amount)),
    isDebit: !!isDebit,
    exp1: String(exp1 || '').trim(),
    exp2: String(exp2 || '').trim()
  };
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

  const lines = [];
  if (amount > 0) {
    lines.push(line(cash, amount, true, notes || 'سند قبض', rv));
    lines.push(line(customer, amount, false, notes || 'سند قبض', rv));
  }
  if (commission > 0) {
    lines.push(line(commDebit, commission, true, 'عمولة تحصيل', rv));
    lines.push(line(commCredit, commission, false, 'عمولة تحصيل', rv));
  }
  if (discount > 0) {
    lines.push(line(disc, discount, true, 'حسم', rv));
    lines.push(line(customer, discount, false, 'حسم', rv));
  }

  return lines.filter(Boolean);
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

function sqlQuote(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

function formatEdariDate(isoOrRaw) {
  const s = String(isoOrRaw || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function buildFile12nInsertSql({ seq, num, line: ln, dateStr, billKind = 0 }) {
  const dept = ln.isDebit ? 'True' : 'False';
  return `
    INSERT INTO File12n (Seq, Num, Acc, "Date", Am, Dept, Exp1, Exp2, Remarks, BillNum, BillSeq, BillKind)
    VALUES (
      ${Number(seq)},
      ${Number(num)},
      ${Number(ln.accSeq)},
      ${sqlQuote(dateStr)},
      ${Number(ln.amount)},
      ${dept},
      ${sqlQuote(ln.exp1)},
      ${sqlQuote(ln.exp2)},
      ${sqlQuote(ln.exp2)},
      0,
      0,
      ${Number(billKind) || 0}
    )
  `.replace(/\s+/g, ' ').trim();
}

module.exports = {
  buildReceiptJournalLines,
  validatePostingAccounts,
  formatEdariDate,
  buildFile12nInsertSql,
  sqlQuote
};
