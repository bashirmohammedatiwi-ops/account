/**
 * ضغط gzip للردود النصية (JSON بالأساس).
 *
 * تقارير المبيعات وكشوف الحسابات تُنقل كـ JSON كبير إلى الأجهزة الثانوية عبر
 * الشبكة المحلية، وهي تُضغط بنسبة عالية جداً. مبني على zlib المدمج في Node
 * بلا أي حزمة إضافية.
 */
const zlib = require('zlib');

const MIN_BYTES = 1400;
const COMPRESSIBLE = /\b(json|text\/|javascript|xml|svg)/i;

function isCompressibleType(res) {
  return COMPRESSIBLE.test(String(res.getHeader('Content-Type') || ''));
}

function acceptsGzip(req) {
  return /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''));
}

function gzipResponse({ minBytes = MIN_BYTES } = {}) {
  return (req, res, next) => {
    if (!acceptsGzip(req)) return next();

    const sendRaw = res.send.bind(res);
    res.send = function send(body) {
      let buf = null;
      if (typeof body === 'string') buf = Buffer.from(body, 'utf8');
      else if (Buffer.isBuffer(body)) buf = body;

      const skip = !buf
        || buf.length < minBytes
        || res.getHeader('Content-Encoding')
        || !isCompressibleType(res);

      res.setHeader('Vary', 'Accept-Encoding');
      if (skip) return sendRaw(body);

      // Z_BEST_SPEED: الهدف تقليل زمن النقل لا حجم التخزين.
      zlib.gzip(buf, { level: zlib.constants.Z_BEST_SPEED }, (err, gz) => {
        if (err || !gz) return sendRaw(body);
        res.setHeader('Content-Encoding', 'gzip');
        res.removeHeader('Content-Length');
        sendRaw(gz);
      });
      return res;
    };

    next();
  };
}

module.exports = { gzipResponse };
