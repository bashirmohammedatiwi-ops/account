/**
 * Serves bundled public/admin only — no database, no better-sqlite3.
 * Usage: node static-admin.js <portalDir> [port]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const portalDir = process.argv[2];
const PORT = Number(process.argv[3] || 4100);

if (!portalDir) {
  console.error('portalDir required');
  process.exit(1);
}

const ADMIN_ROOT = path.join(portalDir, 'public', 'admin');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    return send(res, 200, JSON.stringify({ ok: true, service: 'edari-admin-static' }), 'application/json');
  }

  let pathname = url.parse(req.url).pathname || '/';
  if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin/index.html';
  if (!pathname.startsWith('/admin/')) {
    return send(res, 404, 'Not found');
  }

  const rel = pathname.slice('/admin/'.length) || 'index.html';
  const file = path.normalize(path.join(ADMIN_ROOT, rel));
  if (!file.startsWith(ADMIN_ROOT)) {
    return send(res, 403, 'Forbidden');
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      if (rel !== 'index.html') {
        return fs.readFile(path.join(ADMIN_ROOT, 'index.html'), (e2, html) => {
          if (e2) return send(res, 404, 'Not found');
          send(res, 200, html, MIME['.html']);
        });
      }
      return send(res, 404, 'Not found');
    }
    send(res, 200, data, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`static-admin:${PORT}\n`);
});
