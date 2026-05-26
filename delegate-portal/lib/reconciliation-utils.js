const { journalSortKey, isValidFixDate } = require('./statement-utils');

const MATCH_TEXT_RE = /مطابقة|تصفير|ترصيد|دفعة|خصم|حسم/i;

const MATCH_SQL = `(
  Exp1 LIKE '%مطابقة%'
  OR Exp1 LIKE '%تصفير%'
  OR Exp1 LIKE '%ترصيد%'
  OR Exp1 LIKE '%دفعة%'
  OR Exp1 LIKE '%خصم%'
  OR Exp1 LIKE '%حسم%'
  OR Remarks LIKE '%مطابقة%'
  OR Remarks LIKE '%تصفير%'
  OR Remarks LIKE '%ترصيد%'
  OR Remarks LIKE '%دفعة%'
  OR Remarks LIKE '%خصم%'
  OR Remarks LIKE '%حسم%'
)`;

function movementText(row) {
  return String(row?.exp1 || row?.Exp1 || row?.Remarks || row?.remarks || '').trim();
}

function isDebitMovement(row) {
  const dept = row?.Dept ?? row?.is_debit;
  return dept === 'True' || dept === true || dept === 1 || dept === '1';
}

function isReconciliationMovement(row) {
  if (isDebitMovement(row)) return false;
  return MATCH_TEXT_RE.test(movementText(row));
}

function sameCalendarDay(left, right) {
  const a = journalSortKey({ tx_date: left }).t;
  const b = journalSortKey({ tx_date: right }).t;
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}

function findLastMatchInRows(rows = []) {
  let last = null;
  for (const row of rows) {
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
      date: account.last_match_date || '',
      source: 'account'
    };
  }

  const fromJournal = findLastMatchInRows(rows);
  if (fromJournal) {
    return { ...fromJournal, source: 'journal' };
  }

  if (isValidFixDate(account?.fix_date)) {
    const fixDayRows = rows.filter((row) => sameCalendarDay(row.tx_date || row.Date, account.fix_date));
    if (fixDayRows.length) {
      const last = fixDayRows[fixDayRows.length - 1];
      return {
        seq: String(last.seq ?? last.Seq ?? ''),
        date: last.tx_date || last.Date || account.fix_date,
        source: 'fix_date'
      };
    }
    return {
      seq: '',
      date: account.fix_date,
      source: 'fix_date_only'
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
