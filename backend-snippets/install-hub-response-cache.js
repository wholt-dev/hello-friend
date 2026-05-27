// Installer: injects the lightweight response cache into the Hub
// server (/root/litdex-hub/server.js) so chain-backed GET routes stop
// hammering Caldera's public RPC. This is the sustainable fix for the
// "Bandwidth limit exceeded" (-31002) errors that took the Hub down.
//
// All identifiers are prefixed with `_hubResp` so they cannot collide
// with the existing `_cache` (used by the marketplace sold cache) or
// any other helper inside server.js.
//
// Server usage:
//   wget -O /tmp/install-hub-cache.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/hub-response-cache/backend-snippets/install-hub-response-cache.js"
//   node /tmp/install-hub-cache.js
//   pm2 restart litdex-hub

const fs = require('fs');
const SRC = '/root/litdex-hub/server.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

// Idempotent — if the marker is already present, bail.
if (s.includes('// CACHE_MARKER_LITDEX_HUB_V2')) {
  console.log('[install-hub-cache] already installed, nothing to do');
  process.exit(0);
}

// If a previous (broken) v1 install left `_cache` declarations behind,
// remove them so we can install cleanly.
s = s.replace(/\n\/\/ CACHE_MARKER_LITDEX_HUB_V1[\s\S]*?\/\/ END CACHE_MARKER_LITDEX_HUB_V1\s*\n/g, '\n');

const cacheBlock = `
// CACHE_MARKER_LITDEX_HUB_V2 — lightweight response cache to stop
// hammering the public RPC. All identifiers are prefixed with
// _hubResp to avoid collisions with any pre-existing _cache helpers.
const _hubRespCache = new Map();
const _HUB_RESP_MAX = 2000;

function _hubRespGet(key) {
  const entry = _hubRespCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { _hubRespCache.delete(key); return null; }
  return entry.value;
}
function _hubRespSet(key, value, ttlMs) {
  _hubRespCache.set(key, { value, expires: Date.now() + ttlMs });
  if (_hubRespCache.size > _HUB_RESP_MAX) {
    const oldest = _hubRespCache.keys().next().value;
    if (oldest) _hubRespCache.delete(oldest);
  }
}
function _hubRespInvalidate(pathPrefix) {
  for (const k of _hubRespCache.keys()) {
    if (k.startsWith(pathPrefix)) _hubRespCache.delete(k);
  }
}
global.invalidateHubCache = _hubRespInvalidate;

function _hubRespTtl(path) {
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
  const ttl = _hubRespTtl(req.path);
  if (ttl <= 0) return next();
  const key = req.originalUrl;
  const hit = _hubRespGet(key);
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
      _hubRespSet(key, body, ttl);
      res.set('X-Cache', 'MISS');
    } catch (_) {}
    return origJson(body);
  };
  next();
});

app.use((req, res, next) => {
  if (req.method === 'POST') {
    if (req.path.startsWith('/hub/marketplace/')) _hubRespInvalidate('/hub/marketplace/');
    else if (req.path.startsWith('/hub/messenger/')) _hubRespInvalidate('/hub/messenger/');
    else if (req.path.startsWith('/hub/name/') || req.path.startsWith('/hub/names/')) {
      _hubRespInvalidate('/hub/name/');
      _hubRespInvalidate('/hub/names/');
    } else if (req.path.startsWith('/hub/posts')) _hubRespInvalidate('/hub/posts');
  }
  next();
});
// END CACHE_MARKER_LITDEX_HUB_V2

`;

// Anchor: right after the first app.use(express.json(...)) line. Falls
// back to the first /hub route if the json middleware shape differs.
const jsonAnchor = /(app\.use\(\s*express\.json\s*\([^)]*\)\s*\)\s*;\s*\n)/;
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

// Quick syntax sanity is skipped because server.js is an ESM file
// (uses top-level `import`) which `new Function(s)` can't parse. We
// rely on the unique `_hubResp` prefix and the strict anchor regex
// to keep the injection safe; if anything goes wrong, the
// server.js.bak-cache backup is one cp away.
fs.writeFileSync(SRC + '.bak-cache', before);
fs.writeFileSync(SRC, s);
console.log('[install-hub-cache] response cache (v2, _hubResp prefix) installed; backup at ' + SRC + '.bak-cache');
