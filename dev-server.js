// Simple local dev server to serve the PWA and route /api/notify
// Usage: FIREBASE_SERVICE_ACCOUNT_KEY='...' node dev-server.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Load FIREBASE_SERVICE_ACCOUNT_KEY from local .env files if not provided
(function ensureServiceAccountEnv() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return;
  try {
    const candidates = ['.env.development.local', '.env.local', '.env'];
    for (const file of candidates) {
      const p = path.join(process.cwd(), file);
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const m = content.match(/FIREBASE_SERVICE_ACCOUNT_KEY\s*=\s*(?:'([\s\S]*?)'|"([\s\S]*?)"|([^\r\n]+))/);
        if (m) {
          const val = m[1] || m[2] || m[3];
          if (val && val.trim()) {
            process.env.FIREBASE_SERVICE_ACCOUNT_KEY = val.trim();
            console.log('[dev-server] Loaded FIREBASE_SERVICE_ACCOUNT_KEY from', file);
            break;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[dev-server] Failed to read .env files:', e.message);
  }
})();

const notifyHandler = require('./api/notify.js');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const ROOT = process.cwd();

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  const defaultHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  res.writeHead(status, { ...defaultHeaders, ...headers });
  if (body !== undefined) res.end(body);
  else res.end();
}

function serveStatic(req, res) {
  const parsed = url.parse(req.url);
  let pathname = decodeURIComponent(parsed.pathname || '/');
  if (pathname === '/') pathname = '/index.html';
  const safePath = path.normalize(path.join(ROOT, pathname)).replace(/\\/g, '/');
  if (!safePath.startsWith(ROOT.replace(/\\/g, '/'))) {
    return send(res, 403, 'Forbidden');
  }

  fs.stat(safePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA fallback to index.html
      const fallback = path.join(ROOT, 'index.html');
      fs.readFile(fallback, (e2, data) => {
        if (e2) return send(res, 404, 'Not Found');
        return send(res, 200, data, { 'Content-Type': CONTENT_TYPES['.html'] });
      });
      return;
    }
    const ext = path.extname(safePath).toLowerCase();
    const ctype = CONTENT_TYPES[ext] || 'application/octet-stream';
    fs.readFile(safePath, (e3, data) => {
      if (e3) return send(res, 500, 'Server Error');
      return send(res, 200, data, { 'Content-Type': ctype });
    });
  });
}

function toVercelRes(nodeRes) {
  return {
    _status: 200,
    setHeader(k, v) { try { nodeRes.setHeader(k, v); } catch {} },
    status(c) { this._status = c; return this; },
    json(o) { try { nodeRes.statusCode = this._status; nodeRes.setHeader('Content-Type', 'application/json'); } catch {} ; nodeRes.end(JSON.stringify(o)); },
    end() { try { nodeRes.statusCode = this._status; } catch {}; nodeRes.end(); },
  };
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  if ((parsed.pathname || '').startsWith('/api/notify')) {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'POST, OPTIONS');
      return send(res, 204, undefined);
    }
    // Read JSON body
    let chunks = [];
    req.on('data', c => chunks.push(Buffer.from(c)));
    req.on('end', async () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body = raw;
      try { body = raw ? JSON.parse(raw) : {}; } catch {}
      const vercelReq = { method: req.method, body };
      const vercelRes = toVercelRes(res);
      try {
        await notifyHandler(vercelReq, vercelRes);
      } catch (e) {
        console.error('notify handler error', e);
        send(res, 500, 'Internal Server Error');
      }
    });
    return;
  }

  // Static files
  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(req, res);
  }
  send(res, 405, 'Method Not Allowed', { 'Allow': 'GET, HEAD' });
});

server.listen(PORT, () => {
  console.log(`[dev-server] running at http://localhost:${PORT}`);
});
