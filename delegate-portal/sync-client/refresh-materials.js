/**
 * Read all leaf materials from Edari File13n (prices + stock) for instant catalog refresh.
 * Usage: node sync-client/refresh-materials.js
 * Output: @MATERIALS|{"ok":true,"rows":[...],"count":N}
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const edariRoot = process.env.EDARI_READER_ROOT
  || path.join(__dirname, '..', '..', 'edari-reader');
const odbcBridge = require(path.join(edariRoot, 'lib', 'odbc-bridge'));
const { getEdariConnection } = require('./edari-connection');

async function query(sql) {
  const r = await odbcBridge.runQuery({ ...getEdariConnection(), sql });
  if (!r.ok) throw new Error(r.error || 'Query failed');
  return r.rows;
}

async function main() {
  const rows = await query(`
    SELECT Seq, Num, Name1, Name2, Barcode, SellPr1, SellPr2, SellPr3, SellPr4, SellPr5,
           Unt1, DefUnit, Bonus, Remarks, InTot, OutTot
    FROM File13n
    WHERE SubCount = 0
    ORDER BY Num
  `);
  console.log(`@MATERIALS|${JSON.stringify({ ok: true, rows, count: rows.length })}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
