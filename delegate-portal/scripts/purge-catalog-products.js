#!/usr/bin/env node
/** One-time: delete all catalog products (not edari_materials cache). */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('../lib/db');
const { purgeAllCatalogProducts } = require('../lib/products');

const result = purgeAllCatalogProducts();
console.log(`✓ Deleted ${result.deleted} catalog product(s), removed ${result.imagesRemoved} image file(s).`);
