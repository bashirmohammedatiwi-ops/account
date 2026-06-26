/**
 * أداة تشخيص كشف حساب — تُشغَّل على السيرفر داخل الحاوية.
 * الاستخدام:
 *   docker compose exec app node diag-account.js 07725255465
 *   docker compose exec app node diag-account.js "كوزمتك عماد"
 *
 * تطبع: بيانات الحساب، عدد الحركات، مجموع المدين/الدائن، وأي تواريخ تالفة،
 * مع مقارنة مجموع الحركات بالرصيد الحالي (Bal) لكشف الحركات المفقودة.
 */
const db = require('./lib/db');
const { parseAmount, isDebitRow, parseEdariDate } = require('./lib/statement-utils');

const arg = process.argv.slice(2).join(' ').trim();
if (!arg) {
  console.error('استخدم: node diag-account.js <رقم الحساب أو جزء من الاسم أو الهاتف>');
  process.exit(1);
}

const digits = arg.replace(/\D/g, '');
let account = db.prepare('SELECT * FROM accounts WHERE num = ? OR seq = ?').get(arg, arg);

if (!account) {
  const like = `%${arg}%`;
  const candidates = db.prepare(`
    SELECT * FROM accounts
    WHERE name1 LIKE ? OR name2 LIKE ? OR address LIKE ? OR remarks LIKE ? OR num LIKE ?
    LIMIT 20
  `).all(like, like, like, like, like);
  if (digits.length >= 4) {
    account = candidates.find((c) => `${c.name1}${c.name2}${c.address}${c.remarks}${c.num}`.replace(/\D/g, '').includes(digits));
  }
  if (!account) account = candidates[0];
  if (candidates.length > 1) {
    console.log(`\nعُثر على ${candidates.length} حساب مطابق — أعرض الأول. الباقي:`);
    candidates.forEach((c) => console.log(`  seq=${c.seq} num=${c.num} | ${c.name1} | ${c.address || ''}`));
    console.log('');
  }
}

if (!account) {
  console.error('لم يُعثر على الحساب');
  process.exit(1);
}

console.log('═══════════ الحساب ═══════════');
console.log('seq:', account.seq);
console.log('num:', account.num);
console.log('name1:', account.name1);
console.log('address:', account.address);
console.log('master_seq:', account.master_seq, '| sub_count:', account.sub_count);
console.log('Bal:', account.bal, '(سالب=مدين)');
console.log('Tot1 (مدين Edari):', account.tot1, '| Tot2 (دائن Edari):', account.tot2);
console.log('FixDate:', account.fix_date, '| FixBal:', account.fix_bal);
console.log('last_match_seq:', account.last_match_seq, '| last_match_date:', account.last_match_date);

const rows = db.prepare('SELECT * FROM journal WHERE acc_seq = ? ORDER BY tx_date, seq').all(String(account.seq));

console.log('\n═══════════ الحركات ═══════════');
console.log('عدد الحركات في DB:', rows.length);

let sumDebit = 0;
let sumCredit = 0;
let badDates = 0;
for (const r of rows) {
  const am = parseAmount(r.am);
  if (isDebitRow(r)) sumDebit += am; else sumCredit += am;
  if (!parseEdariDate(r.tx_date)) badDates += 1;
}

console.log('مجموع المدين (حركات DB):', sumDebit.toLocaleString('en-US'));
console.log('مجموع الدائن (حركات DB):', sumCredit.toLocaleString('en-US'));
console.log('صافي الحركات (دائن−مدين):', (sumCredit - sumDebit).toLocaleString('en-US'));
console.log('تواريخ تالفة:', badDates);

console.log('\n═══════════ المقارنة ═══════════');
const netMovement = sumCredit - sumDebit;
const bal = parseAmount(account.bal);
const diff = bal - netMovement;
console.log('الرصيد الحالي (Bal):', bal.toLocaleString('en-US'));
console.log('صافي الحركات:', netMovement.toLocaleString('en-US'));
console.log('الفرق (رصيد افتتاحي ضمني):', diff.toLocaleString('en-US'));
if (Math.abs(diff) >= 1) {
  console.log('⚠️ يوجد فرق — حركات سابقة غير مزامَنة بقيمة', Math.abs(diff).toLocaleString('en-US'),
    diff < 0 ? '(مدين)' : '(دائن)');
} else {
  console.log('✓ مجموع الحركات يطابق الرصيد تماماً — كل الحركات مزامَنة');
}

console.log('\nمقارنة بـ Tot1/Tot2 من Edari:');
console.log('Tot1 (مدين):', parseAmount(account.tot1).toLocaleString('en-US'),
  '| فرق عن DB:', (parseAmount(account.tot1) - sumDebit).toLocaleString('en-US'));
console.log('Tot2 (دائن):', parseAmount(account.tot2).toLocaleString('en-US'),
  '| فرق عن DB:', (parseAmount(account.tot2) - sumCredit).toLocaleString('en-US'));

console.log('\n═══════════ أول 30 حركة ═══════════');
rows.slice(0, 30).forEach((r) => {
  const am = parseAmount(r.am);
  const side = isDebitRow(r) ? 'مدين ' : 'دائن';
  console.log(`${r.tx_date} | ${side} ${String(am).padStart(12)} | ${r.exp1 || r.exp2 || ''}`);
});
