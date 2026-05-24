function getPublicBaseUrl(req) {
  const fromEnv = String(process.env.PUBLIC_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  if (req?.get?.('host')) {
    const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
    return `${proto}://${req.get('host')}`;
  }

  const port = Number(process.env.PORT || 5005);
  return `http://127.0.0.1:${port}`;
}

module.exports = { getPublicBaseUrl };
