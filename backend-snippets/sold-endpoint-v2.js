// --- MARKETPLACE SOLD HISTORY (v2 — RPC-friendly) ---
// Replaces the previous /hub/marketplace/sold handler. Fixes the RPC
// "Bandwidth limit exceeded" error by:
//   1. Persisting the cache + lastBlock to a JSON file on disk so a
//      pm2 restart never re-scans the entire chain.
//   2. Chunking event scans into small block windows.
//   3. Caching aggressively (5 min) and only scanning new blocks since
//      last successful scan.
//
// Drop this in place of the existing handler in /root/litdex-hub/server.js.

const fs = require("fs");
const SOLD_CACHE_FILE = "/root/litdex-hub/sold-cache.json";
const SOLD_CHUNK = 5000;          // blocks per queryFilter call
const SOLD_TTL_MS = 5 * 60 * 1000; // serve cached for 5 min between rescans

function loadSoldCache() {
  try {
    const raw = fs.readFileSync(SOLD_CACHE_FILE, "utf8");
    const c = JSON.parse(raw);
    return {
      items: Array.isArray(c.items) ? c.items : [],
      lastBlock: Number(c.lastBlock) || 0,
      fetchedAt: Number(c.fetchedAt) || 0,
    };
  } catch { return { items: [], lastBlock: 0, fetchedAt: 0 }; }
}
function saveSoldCache(c) {
  try { fs.writeFileSync(SOLD_CACHE_FILE, JSON.stringify(c)); }
  catch (e) { console.error("[sold] cache write failed", e.message); }
}

let soldCache = loadSoldCache();

app.get("/hub/marketplace/sold", async (req, res) => {
  try {
    const now = Date.now();
    // Always serve cached first if it has anything; only refresh in background.
    if (soldCache.items.length > 0 && (now - soldCache.fetchedAt < SOLD_TTL_MS)) {
      return res.json({ sold: soldCache.items });
    }

    const latest = await provider.getBlockNumber();
    const fromBlock = soldCache.lastBlock > 0 ? soldCache.lastBlock + 1 : 0;

    if (fromBlock > latest) {
      soldCache.fetchedAt = now;
      saveSoldCache(soldCache);
      return res.json({ sold: soldCache.items });
    }

    const newItems = [];
    // Chunked scan — small windows keep RPC happy on long ranges.
    for (let start = fromBlock; start <= latest; start += SOLD_CHUNK) {
      const end = Math.min(start + SOLD_CHUNK - 1, latest);
      let soldLogs = [], acceptLogs = [];
      try {
        [soldLogs, acceptLogs] = await Promise.all([
          marketplace.queryFilter(marketplace.filters.Sold(), start, end),
          marketplace.queryFilter(marketplace.filters.BidAccepted(), start, end),
        ]);
      } catch (e) {
        console.error(`[sold] chunk ${start}-${end} failed:`, e.message);
        // Stop scanning further on RPC failure — return what we have so far,
        // mark progress up to last successful block, retry next request.
        break;
      }
      for (const log of soldLogs) {
        let ts = 0;
        try { ts = (await log.getBlock()).timestamp; } catch { /* skip */ }
        newItems.push({
          domain: log.args[0],
          seller: log.args[1],
          buyer: log.args[2],
          price: ethers.formatEther(log.args[3]),
          soldAt: ts,
          kind: "buy",
          txHash: log.transactionHash,
        });
      }
      for (const log of acceptLogs) {
        let ts = 0;
        try { ts = (await log.getBlock()).timestamp; } catch { /* skip */ }
        newItems.push({
          domain: log.args[0],
          seller: log.args[1],
          buyer: log.args[2],
          price: ethers.formatEther(log.args[3]),
          soldAt: ts,
          kind: "bid",
          txHash: log.transactionHash,
        });
      }
      soldCache.lastBlock = end;
    }

    const merged = [...newItems, ...soldCache.items];
    const seen = new Set();
    const deduped = merged.filter((it) => {
      if (seen.has(it.txHash)) return false;
      seen.add(it.txHash);
      return true;
    });
    deduped.sort((a, b) => b.soldAt - a.soldAt);
    soldCache = {
      items: deduped.slice(0, 200),
      lastBlock: soldCache.lastBlock,
      fetchedAt: now,
    };
    saveSoldCache(soldCache);
    res.json({ sold: soldCache.items });
  } catch (e) {
    console.error("[sold]", e);
    // Even on error, return cached data so the marketplace stays usable.
    if (soldCache.items.length > 0) return res.json({ sold: soldCache.items });
    res.status(500).json({ error: e.message });
  }
});
