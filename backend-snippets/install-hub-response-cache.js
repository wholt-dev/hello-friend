// Installer: injects the lightweight response cache into the Hub
// server (/root/litdex-hub/server.js) so chain-backed GET routes stop
// hammering Caldera's public RPC. This is the sustainable fix for the
// "Bandwidth limit exceeded" (-31002) errors that just took the Hub
// down — most pages re-read the same data over and over (listings,
// names, posts), so a 5-30 second TTL cache cuts RPC load by 100x+
// while still keeping reads fresh.
//
// Server usage:
//   wget -O /tmp/install-hub-cache.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/hub-response-cache/backend-snippets/install-hub-response-cache.js"
//   node /tmp/install-hub-cache.js
//   pm2 restart litdex-hub
//
// What this does:
//   1. Reads /root/litdex-hub/server.js
//   2. If the cache block is already present (idempotent marker), exits
//   3. Otherwise injects the cache helpers + middleware right after the
//      first `app.use(express.json(...))` line and before the first
//      `app.get(...)` route — same anchor logic the manual snippet
//      already documents.
//   4. Backs up the original to /root/litdex-hub/server.js.bak-cache

const fs = require('fs');
const SRC = '/root/litdex-hub/server.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

// Idempotent — if the cache marker is already present, bail.
if (s.includes('// CACHE_MARKER_LITDEX_HUB_V1')) {
  console.log('[install-hub-cache] already installed, nothing to do');
  process.exit(0);
}

const cacheBlock = `
// CACHE_MARKER_LITDEX_HUB_V1 — lightweight response cache to stop
// hammering the public RPC. Per-route TTL keeps dynamic data fresh.
const _cache = new Map();
const _MAX_CACHE_SIZE = 2000;

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { _cache.delete(key); return null; }
  return entry.value;
}
function _cacheSet(key, value, ttlMs) {
  _cache.set(key, { value, expires: Date.now() + ttlMs });
  if (_cache.size > _MAX_CACHE_SIZE) {
    const oldest = _cache.keys().next().value;
    if (oldest) _cache.delete(oldest);
  }
}
function invalidateCache(pathPrefix) {
  for (const k of _cache.keys()) {
    if (k.startsWith(pathPrefix)) _cache.delete(k);
  }
}
global.invalidateCache = invalidateCache;

function _ttlFor(path) {
  if (path === '/hub/marketplace/listings') return 15000;
  if (path.startsWith('/hub/marketplace/listing/')) return 15000;
  if (path === '/hub/marketplace/all-bids') return 20000;
  if (path.startsWith('/hub/marketplace/bids/seller/')) return 20000;
  if (path.startsWith('/hub/messenger/friends/')) return 30000;
  if (path.startsWith('/hub/messenger/conversation/')) return 3000;
  if (path.startsWith('/hub/name/reverse/')) return 24 * 60 * 60 * 1000;
  if (path.startsWith('/hub/name/resolve/')) return 24 * 60 * 60 * 1000;
  if (path.startsWith('/hub/name/available/')) return 5000;
  if (path.startsWith('/hub/name/price/')) return 60 * 60 * 1000;
  if (path.startsWith('/hub/names/owned/')) return 30000;
  if (path === '/hub/posts') return 5000;
  if (path.startsWith('/hub/posts/')) return 5000;
  if (path === '/hub/listings') return 15000;
  if (path.startsWith('/hub/friends/')) return 30000;
  return 0;
}

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const ttl = _ttlFor(req.path);
  if (ttl <= 0) return next();
  const key = req.originalUrl;
  const hit = _cacheGet(key);
  if (hit !== null) {
    res.set('X-Cache', 'HIT');
    return res.json(hit);
  }
  const origJson = res.json.bind(res);
  res.json = (body) => {
    try {
      if (res.statusCode >= 400) return origJson(body);
      if (body && typeof body === 'object' && typeof body.error === 'string') {
        return origJson(body);
      }
      _cacheSet(key, body, ttl);
      res.set('X-Cache', 'MISS');
    } catch (_) {}
    return origJson(body);
  };
  next();
});

app.use((req, res, next) => {
  if (req.method === 'POST') {
    if (req.path.startsWith('/hub/marketplace/')) invalidateCache('/hub/marketplace/');
    else if (req.path.startsWith('/hub/messenger/')) invalidateCache('/hub/messenger/');
    else if (req.path.startsWith('/hub/name/') || req.path.startsWith('/hub/names/')) {
      invalidateCache('/hub/name/');
      invalidateCache('/hub/names/');
    } else if (req.path.startsWith('/hub/posts')) invalidateCache('/hub/posts');
  }
  next();
});
// END CACHE_MARKER_LITDEX_HUB_V1

`;

// Anchor: right after the first app.use(express.json(...)) line. Falls
// back to the first app.get(...) if json middleware isn't present in
// that exact form.
const jsonAnchor = /(app\.use\(\s*express\.json\s*\(\s*\)\s*\)\s*;\s*\n)/;
const getAnchor = /(\napp\.(?:get|post)\(\s*['"`]\/hub\/)/;

if (jsonAnchor.test(s)) {
  s = s.replace(jsonAnchor, '$1' + cacheBlock);
} else if (getAnchor.test(s)) {
  s = s.replace(getAnchor, cacheBlock + '$1');
} else {
  console.error('[install-hub-cache] no anchor found; inspect server.js manually');
  process.exit(1);
}

if (s === before) {
  console.error('[install-hub-cache] match counted but text unchanged');
  process.exit(1);
}

fs.writeFileSync(SRC + '.bak-cache', before);
fs.writeFileSync(SRC, s);
console.log('[install-hub-cache] response cache installed; backup at ' + SRC + '.bak-cache');
