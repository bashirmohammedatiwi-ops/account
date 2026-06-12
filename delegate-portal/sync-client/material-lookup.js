/**
 * Live Edari File13n lookup by barcode / num (ODBC).
 */
const path = require('path');

const edariRoot = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));

const CONN = {
  mode: 'tcp',
  alias: process.env.EDARI_ALIAS || '2025',
  server: process.env.EDARI_SERVER || '127.0.0.1',
  port: Number(process.env.EDARI_PORT || 16000)
};

const MATERIAL_SELECT = `
  Seq, Num, Name1, Name2, Barcode, SellPr1, SellPr2, SellPr3, SellPr4,
  DefUnit, Unt1, Bonus, Remarks, InTot, OutTot
`.replace(/\s+/g, ' ').trim();

function wholesalePrice(sellPr1, sellPr2) {
  const w = Number(sellPr2);
  if (w > 0) return w;
  return Number(sellPr1) || 0;
}

function stockQty(inTot, outTot) {
  return Number(inTot || 0) - Number(outTot || 0);
}

function mapMaterialRow(row) {
  if (!row) return null;
  const sellPr1 = Number(row.SellPr1 ?? 0);
  const sellPr2 = Number(row.SellPr2 ?? 0);
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
    priceRetail: sellPr1,
    wholesalePrice: wholesalePrice(sellPr1, sellPr2),
    price: wholesalePrice(sellPr1, sellPr2),
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

  const result = await odbcBridge.runQuery({ ...CONN, sql });
  if (!result.ok) throw new Error(result.error || 'فشل الاتصال بـ Edari');
  if (!result.rows?.length) return null;
  return mapMaterialRow(result.rows[0]);
}

module.exports = { lookupEdariMaterial, mapMaterialRow, wholesalePrice, stockQty };

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
