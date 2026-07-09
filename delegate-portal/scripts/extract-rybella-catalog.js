/**
 * Parse Rybella PostgreSQL dump → JSON catalog (brands, categories, products, variants).
 * Usage: node scripts/extract-rybella-catalog.js [sqlPath] [outJson]
 */
const fs = require('fs');
const path = require('path');

const sqlPath = process.argv[2]
  || path.join(__dirname, '..', '_rybella-backup-tmp', 'rybella.sql');
const outPath = process.argv[3]
  || path.join(__dirname, '..', '_rybella-backup-tmp', 'catalog.json');

function unescapePg(val) {
  if (val === '\\N' || val === null || val === undefined) return null;
  let s = String(val);
  // PostgreSQL COPY escapes
  s = s.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
  return s;
}

function parseCopyBlock(sql, tableName) {
  const marker = `COPY public.${tableName} (`;
  const start = sql.indexOf(marker);
  if (start < 0) throw new Error(`COPY block not found: ${tableName}`);
  const headerEnd = sql.indexOf(') FROM stdin;', start);
  const cols = sql.slice(start + marker.length, headerEnd)
    .split(',')
    .map((c) => c.trim());
  const dataStart = headerEnd + ') FROM stdin;'.length;
  // skip newline after FROM stdin;
  let i = dataStart;
  while (i < sql.length && (sql[i] === '\r' || sql[i] === '\n')) i += 1;
  const endMarker = '\n\\.\n';
  const endAlt = '\r\n\\.\r\n';
  let end = sql.indexOf(endMarker, i);
  let endLen = endMarker.length;
  if (end < 0) {
    end = sql.indexOf(endAlt, i);
    endLen = endAlt.length;
  }
  if (end < 0) {
    // last resort: line that is exactly \.
    const lines = sql.slice(i).split(/\r?\n/);
    const rows = [];
    for (const line of lines) {
      if (line === '\\.') break;
      if (!line) continue;
      rows.push(parseCopyLine(line, cols));
    }
    return rows;
  }
  const body = sql.slice(i, end);
  return body.split(/\r?\n/).filter(Boolean).map((line) => parseCopyLine(line, cols));
}

function parseCopyLine(line, cols) {
  // Tab-separated; fields may contain escaped tabs rarely — Rybella dump uses plain tabs
  const parts = line.split('\t');
  const obj = {};
  for (let i = 0; i < cols.length; i += 1) {
    obj[cols[i]] = unescapePg(parts[i] ?? null);
  }
  return obj;
}

function num(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(v) {
  return v === 't' || v === true || v === 'true' || v === '1';
}

function isRealShade(shadeName) {
  const s = String(shadeName || '').trim();
  if (!s) return false;
  // Rybella non-shade SKUs are labeled وحدة / وحدة واحدة / وحدة واحدة etc.
  if (s.includes('وحدة') || s.includes('وحده')) return false;
  if (s.toLowerCase() === 'default' || s === '-' || s === '—') return false;
  return true;
}

function main() {
  console.log('Reading', sqlPath);
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const brands = parseCopyBlock(sql, 'brands').map((r) => ({
    id: num(r.id),
    name: String(r.name || '').trim(),
    logo: r.logo || '',
    sortOrder: num(r.sort_order)
  }));

  const categories = parseCopyBlock(sql, 'categories').map((r) => ({
    id: num(r.id),
    name: String(r.name || '').trim(),
    image: r.image || '',
    sortOrder: num(r.sort_order)
  }));

  const subcategories = parseCopyBlock(sql, 'subcategories').map((r) => ({
    id: num(r.id),
    categoryId: num(r.category_id),
    name: String(r.name || '').trim(),
    sortOrder: num(r.sort_order)
  }));

  const products = parseCopyBlock(sql, 'products')
    .filter((r) => String(r.status || 'published') === 'published')
    .map((r) => ({
      id: num(r.id),
      name: String(r.name || '').trim(),
      brandId: num(r.brand_id),
      categoryId: num(r.category_id),
      subcategoryId: r.subcategory_id ? num(r.subcategory_id) : null,
      description: r.description || '',
      mainImage: r.main_image || '',
      barcode: r.barcode || '',
      sortOrder: num(r.sort_order),
      isFeatured: bool(r.is_featured)
    }));

  const variants = parseCopyBlock(sql, 'product_variants').map((r) => ({
    id: num(r.id),
    productId: num(r.product_id),
    shadeName: String(r.shade_name || '').trim() || 'وحدة',
    colorCode: r.color_code || '',
    barcode: String(r.barcode || '').trim(),
    sku: r.sku || '',
    price: num(r.price),
    syncPrice: num(r.sync_price),
    stock: num(r.stock),
    image: r.image || ''
  })).filter((v) => {
    // skip fake/empty barcodes
    const bc = v.barcode;
    if (!bc) return false;
    if (/^0+$/.test(bc)) return false;
    if (/^1+$/.test(bc)) return false;
    if (bc === '11122211' || bc === '222223333') return false;
    return true;
  });

  const productImages = parseCopyBlock(sql, 'product_images').map((r) => ({
    productId: num(r.product_id),
    imageUrl: r.image_url || '',
    sortOrder: num(r.sort_order)
  }));

  const byProduct = new Map();
  for (const p of products) {
    byProduct.set(p.id, {
      ...p,
      variants: [],
      images: []
    });
  }
  for (const v of variants) {
    const p = byProduct.get(v.productId);
    if (p) p.variants.push(v);
  }
  for (const img of productImages) {
    const p = byProduct.get(img.productId);
    if (p) p.images.push(img);
  }

  const catalog = [];
  for (const p of byProduct.values()) {
    if (!p.variants.length) continue;
    const brand = brands.find((b) => b.id === p.brandId);
    const category = categories.find((c) => c.id === p.categoryId);
    const hasShades = p.variants.some((v) => isRealShade(v.shadeName));
    catalog.push({
      rybellaProductId: p.id,
      name: p.name,
      brandName: brand?.name || 'rybella',
      categoryName: category?.name || 'عام',
      categoryId: p.categoryId,
      description: p.description,
      mainImage: p.mainImage,
      sortOrder: p.sortOrder,
      hasShades,
      variants: p.variants.map((v) => ({
        shadeName: isRealShade(v.shadeName) ? v.shadeName : '',
        colorCode: isRealShade(v.shadeName) ? (v.colorCode || '') : '',
        barcode: v.barcode,
        image: v.image || p.mainImage || '',
        retailPriceHint: v.price,
        syncPriceHint: v.syncPrice || 0,
        stockHint: v.stock
      }))
    });
  }

  catalog.sort((a, b) => a.categoryId - b.categoryId || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const summary = {
    brands: brands.length,
    categories: categories.map((c) => c.name),
    products: catalog.length,
    variants: catalog.reduce((n, p) => n + p.variants.length, 0),
    withShades: catalog.filter((p) => p.hasShades).length
  };

  fs.writeFileSync(outPath, JSON.stringify({ summary, brands, categories, catalog }, null, 2), 'utf8');
  console.log('Wrote', outPath);
  console.log(JSON.stringify(summary, null, 2));
}

main();
