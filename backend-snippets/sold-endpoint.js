// --- MARKETPLACE SOLD HISTORY ---
// Indexes Sold + BidAccepted events from chain (no DB needed).
// Inject this block in /root/litdex-hub/server.js BEFORE the `app.listen(...)` line.
// Requires `marketplace`, `provider`, `ethers`, `app` already declared above.

let soldCache = { items: [], lastBlock: 0, fetchedAt: 0 };

app.get("/hub/marketplace/sold", async (req, res) => {
  try {
    const now = Date.now();
    if (now - soldCache.fetchedAt < 30000 && soldCache.items.length > 0) {
      return res.json({ sold: soldCache.items });
    }
    const latest = await provider.getBlockNumber();
    const fromBlock = soldCache.lastBlock > 0 ? soldCache.lastBlock + 1 : 0;
    const [soldLogs, acceptLogs] = await Promise.all([
      marketplace.queryFilter(marketplace.filters.Sold(), fromBlock, latest),
      marketplace.queryFilter(marketplace.filters.BidAccepted(), fromBlock, latest),
    ]);
    const newItems = [];
    for (const log of soldLogs) {
      const block = await log.getBlock();
      newItems.push({
        domain: log.args[0],
        seller: log.args[1],
        buyer: log.args[2],
        price: ethers.formatEther(log.args[3]),
        soldAt: block.timestamp,
        kind: "buy",
        txHash: log.transactionHash,
      });
    }
    for (const log of acceptLogs) {
      const block = await log.getBlock();
      newItems.push({
        domain: log.args[0],
        seller: log.args[1],
        buyer: log.args[2],
        price: ethers.formatEther(log.args[3]),
        soldAt: block.timestamp,
        kind: "bid",
        txHash: log.transactionHash,
      });
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
      lastBlock: latest,
      fetchedAt: now,
    };
    res.json({ sold: soldCache.items });
  } catch (e) {
    console.error("[sold]", e);
    res.status(500).json({ error: e.message });
  }
});
