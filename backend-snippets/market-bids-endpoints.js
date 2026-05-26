// --- MARKETPLACE BIDS HELPERS ---
// Insert this block into /root/litdex-hub/server.js BEFORE the
// `app.listen(...)` call. Provides the two endpoints the frontend uses
// for the .lit Marketplace bids UI:
//
//   GET  /hub/marketplace/all-bids
//        Returns { bidsByDomain: { name: [{bidder, amount, ...}] } }
//        for every active listing — used to show bid counts on cards.
//
//   GET  /hub/marketplace/bids/seller/:address
//        Returns { bids: [{domain, bidder, amount, ...}] } — every
//        active bid placed on listings owned by :address. Used for the
//        Profile → Incoming Bids tab.
//
// Both rely on the existing `marketplace` ethers.Contract that the rest
// of server.js already initialises near the top.

// All active bids grouped by domain — for market grid bid badges
app.get("/hub/marketplace/all-bids", async (req, res) => {
  try {
    const listings = await marketplace.getActiveListings();
    const bidsByDomain = {};
    for (const l of listings) {
      const name = l[0];
      const bids = await marketplace.getBids(name);
      bidsByDomain[name] = bids
        .filter(b => b[3]) // only active bids
        .map(b => ({
          bidder: b[0],
          amount: ethers.formatEther(b[1]),
          amountWei: b[1].toString(),
          placedAt: b[2].toString(),
        }))
        .sort((a, b) => Number(b.placedAt) - Number(a.placedAt));
    }
    res.json({ bidsByDomain });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// All pending bids on this seller's listings — for profile "Incoming Bids" tab
app.get("/hub/marketplace/bids/seller/:address", async (req, res) => {
  try {
    const seller = req.params.address.toLowerCase();
    const listings = await marketplace.getActiveListings();
    const mine = listings.filter(l => l[1].toLowerCase() === seller);

    const out = [];
    for (const l of mine) {
      const name = l[0];
      const bids = await marketplace.getBids(name);
      for (const b of bids) {
        if (!b[3]) continue; // skip cancelled/accepted
        out.push({
          domain: name,
          bidder: b[0],
          amount: ethers.formatEther(b[1]),
          amountWei: b[1].toString(),
          placedAt: b[2].toString(),
        });
      }
    }
    out.sort((a, b) => Number(b.placedAt) - Number(a.placedAt));
    res.json({ bids: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
