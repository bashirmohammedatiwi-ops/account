const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret';

function signAdmin(payload) {
  return jwt.sign({ ...payload, role: 'admin' }, SECRET, { expiresIn: '12h' });
}

function signAgent(payload) {
  return jwt.sign({ ...payload, role: 'agent' }, SECRET, { expiresIn: '30d' });
}

function signEmployee(payload) {
  return jwt.sign({ ...payload, role: 'employee' }, SECRET, { expiresIn: '12h' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

function authAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.adminToken;
  if (!token) return res.status(401).json({ ok: false, error: 'غير مصرح' });
  try {
    const data = verifyToken(token);
    if (data.role !== 'admin') return res.status(403).json({ ok: false, error: 'صلاحيات غير كافية' });
    req.admin = data;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'انتهت الجلسة' });
  }
}

function authAgent(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'غير مصرح' });
  try {
    const data = verifyToken(token);
    if (data.role !== 'agent') return res.status(403).json({ ok: false, error: 'صلاحيات غير كافية' });
    req.agent = data;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'انتهت الجلسة' });
  }
}

function authEmployee(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'غير مصرح' });
  try {
    const data = verifyToken(token);
    if (data.role !== 'employee') return res.status(403).json({ ok: false, error: 'صلاحيات غير كافية' });
    req.employee = data;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'انتهت الجلسة' });
  }
}

function authSync(req, res, next) {
  const key = req.headers['x-sync-key'] || req.body?.syncKey;
  if (key !== (process.env.SYNC_API_KEY || 'edari-sync-local-key-2025')) {
    return res.status(403).json({ ok: false, error: 'مفتاح المزامنة غير صحيح' });
  }
  next();
}

module.exports = {
  signAdmin,
  signAgent,
  signEmployee,
  verifyToken,
  authAdmin,
  authAgent,
  authEmployee,
  authSync
};
