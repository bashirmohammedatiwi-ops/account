/**
 * Live Edari File13n lookup by barcode / num (ODBC).
 */
const path = require('path');

const edariRoot = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const { getEdariConnection } = require('./edari-connection');

const MATERIAL_SELECT = `
  Seq, Num, Name1, Name2, Barcode, SellPr1, SellPr2, SellPr3, SellPr4, SellPr5,
  DefUnit, Unt1, Bonus, Remarks, InTot, OutTot
`.replace(/\s+/g, ' ').trim();

function wholesalePrice(sellPr1, _sellPr2, _sellPr3, sellPr5) {
  const w = Number(sellPr1);
  if (w > 0) return w;
  const alt = Number(sellPr5);
  if (alt > 0) return alt;
  return 0;
}

function stockQty(inTot, outTot) {
  return Number(inTot || 0) - Number(outTot || 0);
}

function mapMaterialRow(row) {
  if (!row) return null;
  const sellPr1 = Number(row.SellPr1 ?? 0);
  const sellPr2 = Number(row.SellPr2 ?? 0);
  const sellPr3 = Number(row.SellPr3 ?? 0);
  const sellPr5 = Number(row.SellPr5 ?? 0);
  const inTot = Number(row.InTot ?? 0);
  const outTot = Number(row.OutTot ?? 0);
  const qty = stockQty(inTot, outTot);
  const unitRaw = String(row.Unt1 ?? row.DefUnit ?? '').trim();
  const unit = unitRaw && unitRaw !== '0' ? unitRaw : '';
  return {
    seq: String(row.Seq ?? ''),
    num: String(row.Num ?? ''),
    barcode: String(row.Barcode || row.Num || '').trim(),
    name: String(row.Name1 ?? ''),
    name2: String(row.Name2 ?? ''),
    unit,
    sellPr1,
    sellPr2,
    sellPr3,
    sellPr5,
    priceRetail: sellPr1,
    wholesalePrice: wholesalePrice(sellPr1, sellPr2, sellPr3, sellPr5),
    price: wholesalePrice(sellPr1, sellPr2, sellPr3, sellPr5),
    bonus: Number(row.Bonus ?? 0),
    inTot,
    outTot,
    stockQty: qty,
    qty,
    remarks: String(row.Remarks ?? '')
  };
}

async function lookupEdariMaterial(code) {
  const raw = String(code ?? '').trim();
  if (!raw) return null;

  const escaped = raw.replace(/'/g, "''");
  const conditions = [`Num = '${escaped}'`];
  if (/^\d+$/.test(raw) && raw.length <= 10) {
    conditions.push(`Seq = ${raw}`);
  }
  if (!/^\d+$/.test(raw)) {
    conditions.push(`Barcode = '${escaped}'`);
  }

  const sql = `
    SELECT ${MATERIAL_SELECT}
    FROM File13n
    WHERE SubCount = 0 AND (${conditions.join(' OR ')})
  `;

  const result = await odbcBridge.runQuery({ ...getEdariConnection(), sql });
  if (!result.ok) throw new Error(result.error || 'فشل الاتصال بـ Edari');
  if (!result.rows?.length) return null;
  return mapMaterialRow(result.rows[0]);
}

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Batch lookup for catalog price refresh — only requested barcodes/nums/seqs. */
async function lookupEdariMaterialsByCodes(codes = []) {
  const unique = [...new Set(codes.map((c) => String(c ?? '').trim()).filter(Boolean))];
  if (!unique.length) return [];

  const bySeq = new Map();
  const BATCH = 60;

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const seqs = new Set();
    const nums = new Set();
    const barcodes = new Set();

    for (const code of batch) {
      if (/^\d+$/.test(code)) {
        const n = Number(code);
        if (Number.isFinite(n) && n > 0 && n <= 9999999999) seqs.add(String(n));
        nums.add(sqlQuote(code));
      } else {
        barcodes.add(sqlQuote(code));
        nums.add(sqlQuote(code));
      }
    }

    const cond = [];
    if (seqs.size) cond.push(`Seq IN (${[...seqs].join(',')})`);
    if (nums.size) cond.push(`Num IN (${[...nums].join(',')})`);
    if (barcodes.size) cond.push(`Barcode IN (${[...barcodes].join(',')})`);
    if (!cond.length) continue;

    const sql = `
      SELECT ${MATERIAL_SELECT}
      FROM File13n
      WHERE SubCount = 0 AND (${cond.join(' OR ')})
    `;
    const result = await odbcBridge.runQuery({ ...getEdariConnection(), sql });
    if (!result.ok) throw new Error(result.error || 'فشل الاتصال بـ Edari');
    for (const row of result.rows || []) {
      bySeq.set(String(row.Seq), row);
    }
  }

  return [...bySeq.values()];
}

module.exports = { lookupEdariMaterial, lookupEdariMaterialsByCodes, mapMaterialRow, wholesalePrice, stockQty };

if (require.main === module) {
  const code = process.argv[2];
  lookupEdariMaterial(code)
    .then((m) => {
      console.log(JSON.stringify(m));
      process.exit(m ? 0 : 1);
    })
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
