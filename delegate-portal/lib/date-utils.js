const { parseEdariDate } = require('./statement-utils');

function normalizeEdariDateIso(value) {
  const d = parseEdariDate(value);
  if (d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const raw = String(value || '').trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : '';
}

function sqlNormalizedEdariDate(column = 'i.inv_date') {
  return `(CASE
    WHEN ${column} GLOB '????-??-??*' THEN substr(${column}, 1, 10)
    WHEN ${column} LIKE '%/%/%' THEN
      (substr(${column}, -4) || '-' ||
       printf('%02d', CAST(substr(${column}, instr(${column}, '/') + 1, 2) AS INTEGER)) || '-' ||
       printf('%02d', CAST(substr(${column}, 1, instr(${column}, '/') - 1) AS INTEGER)))
    ELSE substr(${column}, 1, 10)
  END)`;
}

module.exports = {
  normalizeEdariDateIso,
  sqlNormalizedEdariDate
};
