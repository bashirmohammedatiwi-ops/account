/**
 * Sanity check: LAN-owned API paths must route to LAN base on client mode.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminJs = fs.readFileSync(
  path.join(__dirname, '../../public/admin/admin.js'),
  'utf8'
);

const checks = [
  ['resolveApiBaseForPath', adminJs.includes('function resolveApiBaseForPath')],
  ['shouldUseLanApiForPath', adminJs.includes('function shouldUseLanApiForPath')],
  ['getLanApiBase export', adminJs.includes('window.getLanApiBase = getLanApiBase')],
  ['isLanClientMode fallback', adminJs.includes('resolveDataBackend()')],
  ['LAN health check', adminJs.includes('متصل بالرئيسي')],
  ['trees in lan prefixes', adminJs.includes("'trees'")],
  ['reports in lan prefixes', adminJs.includes("'reports/'")],
  ['edari in lan prefixes', adminJs.includes("'edari/'")],
];

const bridgeJs = fs.readFileSync(
  path.join(__dirname, '../../public/admin/admin-edari-bridge.js'),
  'utf8'
);
checks.push(['bridge isEdariPath reports', bridgeJs.includes("path.startsWith('/api/admin/reports/')")]);
checks.push(['bridge verifySync uses getApiBase', bridgeJs.includes('window.getApiBase')]);
checks.push(['postEdariReceipt bridge', bridgeJs.includes("'/api/admin/edari/post-receipt'")]);

const sharedJs = fs.readFileSync(
  path.join(__dirname, '../../public/admin/admin-shared-state.js'),
  'utf8'
);
checks.push(['shared-state getLanApiBase', sharedJs.includes('getLanApiBase')]);

const accessJs = fs.readFileSync(
  path.join(__dirname, '../../lib/admin-access.js'),
  'utf8'
);
checks.push(['isPrivateLanClient', accessJs.includes('function isPrivateLanClient')]);

const lanJs = fs.readFileSync(
  path.join(__dirname, '../../public/admin/admin-lan.js'),
  'utf8'
);
checks.push(['lan ping uses getLanApiBase', lanJs.includes('getLanApiBase')]);

const indexHtml = fs.readFileSync(
  path.join(__dirname, '../../public/admin/index.html'),
  'utf8'
);
const lanConnIdx = indexHtml.indexOf('admin-lan-connection.js');
const sharedIdx = indexHtml.indexOf('admin-shared-state.js');
const adminIdx = indexHtml.indexOf('admin.js');
checks.push(['lan-connection before shared-state', lanConnIdx > 0 && lanConnIdx < sharedIdx]);
checks.push(['lan-connection script present', indexHtml.includes('admin-lan-connection.js')]);

const lanConnJs = fs.readFileSync(
  path.join(__dirname, '../../public/admin/admin-lan-connection.js'),
  'utf8'
);
checks.push(['lan-connection lanFetch', lanConnJs.includes('lanFetch')]);
checks.push(['lan-connection startMonitor', lanConnJs.includes('startMonitor')]);
checks.push(['lan-connection reconnect detect', lanConnJs.includes('reconnected')]);
checks.push(['shared-state lanFetch', sharedJs.includes('adminLanConnection?.lanFetch')]);

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    console.error('FAIL:', name);
    failed += 1;
  } else {
    console.log('OK:', name);
  }
}

const routesJs = fs.readFileSync(
  path.join(__dirname, '../../routes/admin.js'),
  'utf8'
);
const requiredRoutes = [
  '/edari/trees',
  '/edari/post-receipt',
  '/reports/sales',
  '/trigger-sync',
  '/server-settings',
  '/trees',
  '/lan-info'
];
for (const route of requiredRoutes) {
  const ok = routesJs.includes(route);
  console.log(ok ? 'OK:' : 'FAIL:', `route ${route}`);
  if (!ok) failed += 1;
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll LAN routing checks passed.');
