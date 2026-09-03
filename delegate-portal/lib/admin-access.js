const { authAdmin } = require('./auth');

const PUBLIC_ADMIN_PATHS = new Set([
  '/login',
  '/config',
  '/lan-info',
  '/health'
]);

function clientIp(req) {
  const raw = req.headers['x-forwarded-for']
    || req.socket?.remoteAddress
    || req.connection?.remoteAddress
    || '';
  return String(raw).split(',')[0].trim().replace(/^::ffff:/, '');
}

function isLocalClient(req) {
  const ip = clientIp(req);
  return ip === '127.0.0.1' || ip === '::1' || ip === '';
}

function adminAuthPolicy() {
  const global = process.env.ADMIN_REQUIRE_AUTH === '1';
  const lanOnly = process.env.LAN_REQUIRE_AUTH === '1';
  return { global, lanOnly, enabled: global || lanOnly };
}

function shouldRequireAdminAuth(req) {
  const { global, lanOnly } = adminAuthPolicy();
  if (global) return true;
  if (lanOnly && !isLocalClient(req)) return true;
  return false;
}

function optionalAuthAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.adminToken;
  if (!token) return next();
  try {
    const { verifyToken } = require('./auth');
    const data = verifyToken(token);
    if (data.role === 'admin') req.admin = data;
  } catch { /* ignore */ }
  next();
}

function requireAdminAuthUnlessPublic(req, res, next) {
  const path = req.path || '';
  if (PUBLIC_ADMIN_PATHS.has(path)) return next();
  if (!shouldRequireAdminAuth(req)) return optionalAuthAdmin(req, res, next);
  return authAdmin(req, res, next);
}

module.exports = {
  PUBLIC_ADMIN_PATHS,
  clientIp,
  isLocalClient,
  adminAuthPolicy,
  shouldRequireAdminAuth,
  optionalAuthAdmin,
  requireAdminAuthUnlessPublic
};
