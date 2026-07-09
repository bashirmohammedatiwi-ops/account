/**
 * Push Rybella catalog.json + images to remote portal server.
 * Creates category sections under RyBella branch and adds products by barcode (Edari prices).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = (process.env.PORTAL_URL || 'http://187.124.23.65:5005').replace(/\/$/, '');
const BRANCH_ID = Number(process.env.BRANCH_ID || 1);
const ROOT = path.join(__dirname, '..');
const CATALOG = path.join(ROOT, '_rybella-backup-tmp', 'catalog.json');
const UPLOADS = path.join(ROOT, '_rybella-backup-tmp', 'uploads');

function request(method, apiPath, body, isJson = true) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + apiPath);
    const payload = body == null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body), 'utf8'));
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        ...(isJson && payload ? {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': payload.length
        } : (payload ? { 'Content-Length': payload.length } : {}))
      },
      timeout: 60000
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
        if (res.statusCode >= 400) {
          const err = new Error(data?.error || `HTTP ${res.statusCode}`);
          err.status = res.statusCode;
          err.data = data;
          reject(err);
          return;
        }
        resolve(data);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

function resolveImage(url) {
  if (!url) return null;
  const rel = String(url).replace(/^\/uploads\//, '').replace(/^\//, '');
  const full = path.join(UPLOADS, rel);
  if (fs.existsSync(full)) return full;
  const flat = path.join(UPLOADS, path.basename(rel));
  return fs.existsSync(flat) ? flat : null;
}

function toDataUrl(filePath) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'jpg';
  const mime = ext === 'png' ? 'image/png'
    : ext === 'webp' ? 'image/webp'
      : ext === 'gif' ? 'image/gif'
        : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function ensureSections(categories) {
  const existing = await request('GET', `/api/admin/catalog/branches/${BRANCH_ID}/sections`);
  const byName = new Map((existing.sections || []).map((s) => [s.name, s]));
  const map = new Map();
  for (const cat of categories) {
    let sec = byName.get(cat.name);
    if (!sec) {
      const created = await request('POST', '/api/admin/catalog/sections', {
        branchId: BRANCH_ID,
        name: cat.name,
        sortOrder: cat.sortOrder || 0,
        isActive: true
      });
      sec = created.section;
      console.log('Created section', cat.name, '→', sec.id);
    } else {
      console.log('Section exists', cat.name, '→', sec.id);
    }
    map.set(cat.id, sec);
    map.set(cat.name, sec);
  }
  return map;
}

async function main() {
  const catalogFile = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const catalog = catalogFile.catalog || [];
  const categories = (catalogFile.categories || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  console.log(`Pushing ${catalog.length} products to ${BASE} branch=${BRANCH_ID}`);
  const sectionMap = await ensureSections(categories);

  const stats = {
    created: 0,
    skipped: 0,
    images: 0,
    missingEdari: 0,
    errors: []
  };

  for (const item of catalog) {
    const section = sectionMap.get(item.categoryId) || sectionMap.get(item.categoryName);
    if (!section) {
      stats.errors.push({ name: item.name, error: 'no section' });
      continue;
    }
    const baseName = String(item.name || '').trim();
    const multi = item.hasShades && item.variants.some((v) => v.shadeName);

    for (let i = 0; i < item.variants.length; i += 1) {
      const v = item.variants[i];
      const barcode = String(v.barcode || '').trim();
      if (!barcode) continue;

      const shadeName = multi ? String(v.shadeName || '').trim() : '';
      const displayName = shadeName && !baseName.includes(shadeName)
        ? `${baseName} - ${shadeName}`
        : baseName;

      let product = null;
      try {
        const data = await request('POST', '/api/admin/products/by-barcode', {
          sectionId: section.id,
          barcode,
          name: displayName,
          description: item.description || '',
          sortOrder: (Number(item.sortOrder) || 0) * 100 + i,
          priceOverride: false
        });
        product = data.product;
        stats.created += 1;
      } catch (err) {
        const msg = err.message || String(err);
        if (/مُسجَّل|مسجل|already|مسبقا/i.test(msg)) {
          stats.skipped += 1;
          try {
            const found = await request('GET', `/api/admin/products/lookup?code=${encodeURIComponent(barcode)}&branchId=${BRANCH_ID}`);
            product = found.product;
          } catch { /* ignore */ }
        } else if (/غير موجودة|Edari|مادة/i.test(msg)) {
          stats.missingEdari += 1;
          stats.errors.push({ barcode, name: displayName, error: msg });
          continue;
        } else {
          stats.errors.push({ barcode, name: displayName, error: msg });
          continue;
        }
      }

      if (!product?.id) continue;

      // Best-effort shade fields (ignored if server is old)
      if (shadeName || v.colorCode) {
        try {
          await request('PUT', `/api/admin/products/${product.id}`, {
            shadeName,
            colorCode: v.colorCode || '',
            groupKey: multi ? `rybella-${item.rybellaProductId}` : '',
            name: displayName,
            description: item.description || ''
          });
        } catch { /* old server */ }
      }

      if (!product.imageUrl) {
        const imgPath = resolveImage(v.image || item.mainImage);
        if (imgPath) {
          try {
            await request('POST', `/api/admin/products/${product.id}/image`, {
              dataUrl: toDataUrl(imgPath)
            });
            stats.images += 1;
          } catch (err) {
            stats.errors.push({ barcode, error: `image: ${err.message}` });
          }
        }
      }

      if ((stats.created + stats.skipped) % 25 === 0) {
        console.log(`… progress created=${stats.created} skipped=${stats.skipped} images=${stats.images}`);
      }
    }
  }

  console.log('\n=== Push summary ===');
  console.log(JSON.stringify({
    ...stats,
    errorSample: stats.errors.slice(0, 20)
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
