const { journalSortKey, isValidFixDate, sortJournalRowsAsc, endOfCalendarDay } = require('./statement-utils');

const MATCH_TEXT_RE = /مطابقة|تصفير|ترصيد|دفعة/i;

const MATCH_SQL = `(
  Exp1 LIKE '%مطابقة%'
  OR Exp1 LIKE '%تصفير%'
  OR Exp1 LIKE '%ترصيد%'
  OR Exp1 LIKE '%دفعة%'
  OR (Exp1 LIKE '%خصم%' AND Exp1 NOT LIKE '%فات%')
  OR (Exp1 LIKE '%حسم%' AND Exp1 LIKE '%مطابقة%')
  OR Remarks LIKE '%مطابقة%'
  OR Remarks LIKE '%تصفير%'
  OR Remarks LIKE '%ترصيد%'
  OR Remarks LIKE '%دفعة%'
)`;

function movementText(row) {
  return String(row?.exp1 || row?.Exp1 || row?.remarks || row?.Remarks || '').trim();
}

function isDebitMovement(row) {
  const dept = row?.Dept ?? row?.is_debit;
  return dept === 'True' || dept === true || dept === 1 || dept === '1';
}

function normalizeBillSeq(value) {
  const seq = String(value ?? '').replace(/[^0-9]/g, '');
  return seq && seq !== '0' ? seq : '';
}

function isInvoiceLinkedCredit(row) {
  const text = movementText(row);
  if (/مردود|مرتجع/i.test(text) && /(?:فات|مبيع)/i.test(text)) return true;
  if (/فات?[او]?رة?|invoice/i.test(text)) return true;
  if (normalizeBillSeq(row?.bill_seq ?? row?.BillSeq)) {
    return /حسم|خصم/i.test(text) && !MATCH_TEXT_RE.test(text);
  }
  return false;
}

function isReconciliationMovement(row) {
  if (isDebitMovement(row)) return false;
  if (isInvoiceLinkedCredit(row)) return false;
  const text = movementText(row);
  if (!text) return false;
  if (MATCH_TEXT_RE.test(text)) return true;
  const discountOnly = '\u062E\u0635\u0645';
  if (text.trim() === discountOnly) return true;
  if (/حسم\s*\/?\s*مطابقة/i.test(text)) return true;
  return false;
}

function cutoffSortKey(cutoff) {
  if (cutoff?.seq) {
    return journalSortKey({ tx_date: cutoff.date, seq: cutoff.seq });
  }
  if (isValidFixDate(cutoff?.date)) {
    return { t: endOfCalendarDay(cutoff.date), seq: Number.MAX_SAFE_INTEGER };
  }
  return { t: 0, seq: 0 };
}

function compareCutoffs(a, b) {
  const ka = cutoffSortKey(a);
  const kb = cutoffSortKey(b);
  if (ka.t !== kb.t) return ka.t - kb.t;
  return ka.seq - kb.seq;
}

function pickLatestCutoff(candidates = []) {
  if (!candidates.length) return null;
  return [...candidates].sort(compareCutoffs).pop();
}

function findLastMatchInRows(rows = []) {
  let last = null;
  for (const row of sortJournalRowsAsc(rows)) {
    if (!isReconciliationMovement(row)) continue;
    last = {
      seq: String(row.seq ?? row.Seq ?? ''),
      date: row.tx_date || row.Date || row.date || ''
    };
  }
  return last?.seq ? last : null;
}

function resolveLastMatchCutoff(account, rows = []) {
  if (account?.last_match_seq) {
    return {
      seq: String(account.last_match_seq),
      date: account.last_match_date || account.fix_date || '',
      source: 'account'
    };
  }

  const fromJournal = findLastMatchInRows(rows);
  if (fromJournal) {
    return { ...fromJournal, source: 'journal' };
  }

  if (isValidFixDate(account?.fix_date)) {
    return {
      seq: '',
      date: account.fix_date,
      source: 'fix_date'
    };
  }

  return null;
}

function hasMatchCutoff(account, rows = []) {
  return Boolean(resolveLastMatchCutoff(account, rows));
}

module.exports = {
  MATCH_SQL,
  MATCH_TEXT_RE,
  movementText,
  isDebitMovement,
  isReconciliationMovement,
  findLastMatchInRows,
  resolveLastMatchCutoff,
  hasMatchCutoff
};
