// --- LIGHTWEIGHT RESPONSE CACHE ---------------------------------------
// Inserts a single Express middleware that caches GET responses for the
// hub's chain-backed routes. Tuned per-route TTL so dynamic data stays
// fresh while still cutting RPC load by 100x+.
//
// IMPORTANT: This block must be inserted BEFORE the first `app.get(...)`
// call in /root/litdex-hub/server.js (after `const app = express()` /
// `app.use(express.json())`). The auto-installer script handles that.

const _cache = new Map(); // key -> { value, expires }
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
    // Evict oldest insertion (Map maintains insertion order).
    const oldest = _cache.keys().next().value;
    if (oldest) _cache.delete(oldest);
  }
}
// Tiny helper to invalidate any keys that start with a path prefix.
// Useful from POST handlers (e.g. after a user lists a domain, blow away
// /hub/marketplace/listings cache so the next read is fresh).
function invalidateCache(pathPrefix) {
  for (const k of _cache.keys()) {
    if (k.startsWith(pathPrefix)) _cache.delete(k);
  }
}
// Expose globally so route handlers can call invalidateCache(...) inline.
global.invalidateCache = invalidateCache;

function _ttlFor(path) {
  // Order matters — longest match first.
  if (path === "/hub/marketplace/listings") return 15_000;
  if (path.startsWith("/hub/marketplace/listing/")) return 15_000;
  if (path === "/hub/marketplace/all-bids") return 20_000;
  if (path.startsWith("/hub/marketplace/bids/seller/")) return 20_000;
  // /hub/marketplace/sold has its own internal cache, skip.

  if (path.startsWith("/hub/messenger/friends/")) return 30_000;
  if (path.startsWith("/hub/messenger/conversation/")) return 3_000;

  if (path.startsWith("/hub/name/reverse/")) return 24 * 60 * 60 * 1000; // 24h
  if (path.startsWith("/hub/name/resolve/")) return 24 * 60 * 60 * 1000;
  if (path.startsWith("/hub/name/available/")) return 5_000;
  if (path.startsWith("/hub/name/price/")) return 60 * 60 * 1000; // 1h

  if (path.startsWith("/hub/names/owned/")) return 30_000;

  if (path === "/hub/posts") return 5_000;
  if (path.startsWith("/hub/posts/")) return 5_000;

  return 0; // no cache
}

app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  const ttl = _ttlFor(req.path);
  if (ttl <= 0) return next();
  const key = req.originalUrl;
  const hit = _cacheGet(key);
  if (hit !== null) {
    res.set("X-Cache", "HIT");
    return res.json(hit);
  }
  // Wrap res.json so we can intercept the response body.
  const origJson = res.json.bind(res);
  res.json = (body) => {
    try {
      // Skip caching error responses or RPC bubble-ups.
      if (res.statusCode >= 400) return origJson(body);
      if (body && typeof body === "object" && typeof body.error === "string") {
        return origJson(body);
      }
      _cacheSet(key, body, ttl);
      res.set("X-Cache", "MISS");
    } catch (e) {
      // Never break the response on cache failure.
    }
    return origJson(body);
  };
  next();
});

// Auto-invalidate on writes — clear the relevant cache slice when the
// frontend POSTs anything that mutates state (post create, friend req,
// listing changes go through the chain and the read endpoint shows them
// after the next cache window). This middleware just nukes neighbouring
// caches so subsequent GETs are fresh.
app.use((req, res, next) => {
  if (req.method === "POST") {
    if (req.path.startsWith("/hub/marketplace/")) invalidateCache("/hub/marketplace/");
    else if (req.path.startsWith("/hub/messenger/")) invalidateCache("/hub/messenger/");
    else if (req.path.startsWith("/hub/name/") || req.path.startsWith("/hub/names/")) {
      invalidateCache("/hub/name/");
      invalidateCache("/hub/names/");
    } else if (req.path.startsWith("/hub/posts")) invalidateCache("/hub/posts");
  }
  next();
});

// --- END RESPONSE CACHE ---------------------------------------------
