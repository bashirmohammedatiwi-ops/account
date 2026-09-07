#!/usr/bin/env node
/**
 * إصلاح أسماء منتجات الأسعار من edari_name / edari_materials / products.
 * Usage (on server): node scripts/price-repair-names.js [--barcode 8057190176680]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const {
  repairPriceProductNames,
  getProductByBarcode,
} = require('../lib/price-catalog');

const barcodeArg = process.argv.includes('--barcode')
  ? process.argv[process.argv.indexOf('--barcode') + 1]
  : null;

if (barcodeArg) {
  const product = getProductByBarcode(barcodeArg);
  if (!product) {
    console.error(`المنتج غير موجود: ${barcodeArg}`);
    process.exit(1);
  }
  console.log(JSON.stringify({ barcode: product.barcode, name: product.name }, null, 2));
  process.exit(0);
}

const result = repairPriceProductNames({ limit: 50000 });
console.log(JSON.stringify({ ok: true, ...result }, null, 2));
