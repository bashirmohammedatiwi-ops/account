/**
 * Edari File11n customer (new branch) — same insert shape as shorja_app,
 * except the parent tree is chosen per request instead of a fixed Shorja parent.
 */

const {
  edariSqlLiteral,
  clampEdariField,
  sqlQuote
} = require('./receipt-posting');

const EDARI_NAME1_MAX = 50;
const EDARI_ADDRESS_MAX = 50;
const EDARI_REMARKS_MAX = 50;

function normalizeName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function normalizePhone(s) {
  return normalizeName(s).replace(/[^\d+]/g, '');
}

function normalizeAddress(address, phone = '') {
  const addr = normalizeName(address);
  const ph = normalizePhone(phone);
  if (!addr) return '';
  if (ph && normalizePhone(addr) === ph) return '';
  return addr;
}

function buildEdariAccountName({ name, phone = '', address = '' }) {
  const displayName = normalizeName(name).replace(/^الزبون\s+/i, '');
  const ph = normalizePhone(phone);
  const addr = normalizeAddress(address, phone);
  if (!displayName) return clampEdariField(ph || addr, EDARI_NAME1_MAX);

  if (ph) {
    const suffix = ` - ${ph}`;
    const maxName = EDARI_NAME1_MAX - suffix.length;
    if (maxName >= 3) {
      return clampEdariField(displayName.slice(0, maxName) + suffix, EDARI_NAME1_MAX);
    }
    return clampEdariField(ph, EDARI_NAME1_MAX);
  }

  if (addr && addr !== displayName) {
    const shortAddr = addr.length > 18 ? addr.slice(0, 18) : addr;
    const suffix = ` - ${shortAddr}`;
    const maxName = EDARI_NAME1_MAX - suffix.length;
    if (maxName >= 3) {
      return clampEdariField(displayName.slice(0, maxName) + suffix, EDARI_NAME1_MAX);
    }
  }

  return clampEdariField(displayName, EDARI_NAME1_MAX);
}

function buildFile11nInsertSql({
  num,
  name1,
  parentSeq,
  address = '',
  remarks = ''
}) {
  const seq = Number(parentSeq);
  if (!Number.isFinite(seq) || seq <= 0) throw new Error('شجرة الأب غير صالحة');
  const accNum = String(num || '').trim();
  if (!accNum) throw new Error('رقم الحساب مطلوب');
  return `
    INSERT INTO File11n (Num, Name1, Master, SubCount, Bal, Tot1, Tot2, Dept, Cod, Dest, Address, Remarks)
    VALUES (
      ${sqlQuote(accNum)},
      ${edariSqlLiteral(clampEdariField(name1, EDARI_NAME1_MAX))},
      ${seq},
      0,
      0,
      0,
      0,
      0,
      1,
      4,
      ${edariSqlLiteral(clampEdariField(address, EDARI_ADDRESS_MAX))},
      ${edariSqlLiteral(clampEdariField(remarks, EDARI_REMARKS_MAX))}
    )
  `.replace(/\s+/g, ' ').trim();
}

function nextChildNumFromRows(parentNum, childNums) {
  const prefix = String(parentNum || '').trim();
  if (!prefix) throw new Error('رقم الشجرة غير صالح');
  let maxSuffix = 0;
  let pad = 0;
  for (const raw of childNums || []) {
    const num = String(raw || '').trim();
    if (!num.startsWith(prefix)) continue;
    const suffix = num.slice(prefix.length);
    if (!suffix || !/^\d+$/.test(suffix)) continue;
    pad = Math.max(pad, suffix.length);
    const n = Number(suffix);
    if (n > maxSuffix) maxSuffix = n;
  }
  const next = maxSuffix + 1;
  const width = pad || Math.max(4, String(next).length);
  return `${prefix}${String(next).padStart(width, '0')}`;
}

function bumpChildNum(num, parentPrefix) {
  const prefix = String(parentPrefix || '');
  const current = String(num || '');
  const suffixRaw = current.startsWith(prefix) ? current.slice(prefix.length) : current;
  const width = suffixRaw.length || 4;
  const suffix = Number(String(suffixRaw).replace(/\D/g, '') || 0);
  return `${prefix}${String(suffix + 1).padStart(width, '0')}`;
}

function buildSubHex(childSeqs) {
  if (!childSeqs.length) return '';
  const parts = childSeqs.map((seq) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(Number(seq), 0);
    return b;
  });
  return Buffer.concat(parts).toString('hex');
}

module.exports = {
  normalizeName,
  normalizePhone,
  normalizeAddress,
  buildEdariAccountName,
  buildFile11nInsertSql,
  nextChildNumFromRows,
  bumpChildNum,
  buildSubHex,
  EDARI_NAME1_MAX,
  EDARI_ADDRESS_MAX,
  EDARI_REMARKS_MAX
};
