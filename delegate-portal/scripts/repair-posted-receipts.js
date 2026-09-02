/**
 * Repair Edari File12n lines for receipt vouchers posted from admin panel.
 *
 * Usage:
 *   node scripts/repair-posted-receipts.js --posted-on=2026-09-01
 *   node scripts/repair-posted-receipts.js --posted-on=2026-09-01 --dry-run
 *   node scripts/repair-posted-receipts.js --bonds=29640,29642
 */
const path = require('path');

process.env.EDARI_READER_ROOT = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');

const odbcBridge = require(path.join(process.env.EDARI_READER_ROOT, 'lib', 'odbc-bridge'));
const nxscriptBridge = require(path.join(process.env.EDARI_READER_ROOT, 'lib', 'nxscript-bridge'));
const { getEdariConnection } = require('../sync-client/edari-connection');
const { toIsoDate } = require('../lib/receipt-posting');

const dryRun = process.argv.includes('--dry-run');
const serverUrl = (process.env.BACKEND_URL || 'http://187.124.23.65:5005').replace(/\/$/, '');

function argValue(prefix) {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return hit ? hit.slice(prefix.length + 1).trim() : '';
}

function firstVal(row, ...keys) {
  if (!row) return undefined;
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') return row[key];
    const upper = String(key).toUpperCase();
    if (row[upper] != null && row[upper] !== '') return row[upper];
  }
  return undefined;
}

function parseEdariDateParts(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    return { day: Number(slash[1]), month: Number(slash[2]), year: Number(slash[3]) };
  }
  const dash = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dash) {
    return { day: Number(dash[1]), month: Number(dash[2]), year: Number(dash[3]) };
  }
  const iso = toIsoDate(text.slice(0, 10));
  const [y, mo, d] = iso.split('-');
  if (!y || !mo || !d) return null;
  return { year: Number(y), month: Number(mo), day: Number(d) };
}

function needsRepair(row) {
  const equalRaw = firstVal(row, 'Equal', 'equal');
  const equal = equalRaw == null || equalRaw === '' ? '0' : String(equalRaw);
  const dateRaw = String(firstVal(row, 'Date', 'date') ?? '');
  if (equal === '0') return true;
  return dateRaw.includes(':') || /\d{1,2}:\d{2}/.test(dateRaw);
}

async function query(sql) {
  const r = await odbcBridge.runQuery({ ...getEdariConnection(), sql });
  if (!r.ok) throw new Error(r.error || 'فشل قراءة Edari');
  return r.rows || [];
}

async function repairSeq(seq, parts) {
  const r = await nxscriptBridge.runFile12nRepairViaNxscript({
    ...getEdariConnection(),
    seq,
    day: parts.day,
    month: parts.month,
    year: parts.year,
    equal: 1
  });
  if (!r.ok) throw new Error(r.error || `فشل إصلاح Seq ${seq}`);
  return r;
}

async function fetchPostedBonds(postedOn) {
  const iso = toIsoDate(postedOn);
  const res = await fetch(`${serverUrl}/api/admin/receipts?status=posted`);
  if (!res.ok) throw new Error(`فشل جلب السندات من السيرفر (${res.status})`);
  const data = await res.json();
  const receipts = (data.receipts || []).filter((r) => String(r.edariPostedAt || '').startsWith(iso));
  const bonds = [...new Set(
    receipts
      .map((r) => String(r.edariJournalNum || '').trim())
      .filter((n) => /^\d+$/.test(n))
  )];
  return { receipts, bonds };
}

async function loadRowsForBonds(bonds) {
  if (!bonds.length) return [];
  const chunks = [];
  for (let i = 0; i < bonds.length; i += 40) {
    chunks.push(bonds.slice(i, i + 40));
  }
  const rows = [];
  for (const chunk of chunks) {
    const inList = chunk.join(',');
    const part = await query(
      `SELECT Seq, Num, "Date", Ref, Equal, Exp1 FROM File12n WHERE Num IN (${inList}) AND Ref LIKE 'R.V%'`
    );
    rows.push(...part);
  }
  return rows.filter(needsRepair);
}

async function main() {
  const postedOn = argValue('--posted-on');
  const bondsArg = argValue('--bonds');

  let bonds = [];
  let receiptCount = 0;
  if (bondsArg) {
    bonds = bondsArg.split(',').map((s) => s.trim()).filter((n) => /^\d+$/.test(n));
  } else if (postedOn) {
    const fetched = await fetchPostedBonds(postedOn);
    bonds = fetched.bonds;
    receiptCount = fetched.receipts.length;
    console.log(`سندات مُرحّلة في ${toIsoDate(postedOn)}: ${receiptCount} · سندات قيد: ${bonds.length}`);
  } else {
    throw new Error('استخدم --posted-on=YYYY-MM-DD أو --bonds=29640,29642');
  }

  const targets = await loadRowsForBonds(bonds);
  console.log(`قيود تحتاج إصلاح: ${targets.length} (${dryRun ? 'dry-run' : 'live'})`);

  let ok = 0;
  let fail = 0;
  for (const row of targets) {
    const seq = Number(firstVal(row, 'Seq', 'seq'));
    const parts = parseEdariDateParts(firstVal(row, 'Date', 'date'));
    if (!parts) {
      console.error(`skip Seq ${seq}: تعذّر قراءة التاريخ "${firstVal(row, 'Date', 'date')}"`);
      fail += 1;
      continue;
    }
    const label = `Seq ${seq} · قيد ${firstVal(row, 'Num', 'num')} · ${firstVal(row, 'Ref', 'ref')} · ${parts.day}/${parts.month}/${parts.year}`;
    if (dryRun) {
      console.log(`[dry-run] ${label}`);
      ok += 1;
      continue;
    }
    try {
      await repairSeq(seq, parts);
      ok += 1;
      if (ok % 25 === 0) console.log(`... ${ok}/${targets.length}`);
    } catch (err) {
      console.error(`failed ${label}: ${err.message || err}`);
      fail += 1;
    }
  }

  console.log(`Done: ${ok} ok, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
