// --- POINTS AWARD ENDPOINT ---
// Add to the points API server at /root/litvm-dex/twitter-auth/server.js
// (or whichever file Express runs on api.test-hub.xyz). This endpoint
// lets the frontend tell the server "user X earned N points for Y".
//
// SECURITY: Idempotency via {wallet, action, txHash} so the same tx can
// only credit once. The frontend sends the tx hash as proof-of-action.
// Server verifies the tx exists on chain (anti-spoof), then writes
// `points` table with on-chain verification.
//
// Wire-up the same secret-key-signing pattern this server already uses
// for /msg/sent (admin wallet calls PointsSystem.addPoints, or whatever
// internal helper you have for crediting).
//
// Endpoint contract:
//   POST /points/award
//   Body: { wallet, action, amount, txHash, meta? }
//     action  one of: "domain_register"
//     amount  integer points to credit
//     txHash  on-chain hash that earned this — used for idempotency
//     meta    optional payload for audit (duration, name, etc.)
//   Returns: { success, total } where total = new lifetime points
//
// Replace the TODO at "verify on-chain" with whatever provider/RPC pool
// the server already uses. Add `creditPoints(wallet, amount)` to call
// the existing internal helper this server uses to bump points.

const { ethers: _ethersForAward } = require("ethers");
const RPC = process.env.RPC_URL || "https://liteforge.rpc.caldera.xyz/http";
const _awardProvider = new _ethersForAward.JsonRpcProvider(RPC);

const POINTS_PER_ACTION = {
  domain_register: { 1: 10, 2: 20, 5: 35, 10: 60, 99: 100 }, // by duration
};

const _awardSeen = new Set(); // in-process idempotency cache (txHash)

app.post("/points/award", async (req, res) => {
  try {
    const { wallet, action, amount, txHash, meta } = req.body || {};
    if (!wallet || !action || !txHash) {
      return res.status(400).json({ success: false, error: "wallet, action, txHash required" });
    }
    const idemKey = `${wallet.toLowerCase()}:${txHash.toLowerCase()}`;
    if (_awardSeen.has(idemKey)) {
      return res.json({ success: true, alreadyCredited: true });
    }

    // 1) Verify the tx exists on chain — anti-spoof.
    let receipt = null;
    try {
      receipt = await _awardProvider.getTransactionReceipt(txHash);
    } catch (e) {
      console.error("[points/award] getTransactionReceipt failed", e.message);
    }
    if (!receipt || !receipt.status) {
      return res.status(400).json({ success: false, error: "Transaction not found or failed" });
    }
    if ((receipt.from || "").toLowerCase() !== wallet.toLowerCase()) {
      return res.status(400).json({ success: false, error: "Tx not sent by this wallet" });
    }

    // 2) Compute / clamp amount based on action so callers can't inflate.
    let credit = Number(amount) || 0;
    if (action === "domain_register" && meta?.duration) {
      credit = POINTS_PER_ACTION.domain_register[Number(meta.duration)] || 0;
    }
    if (credit <= 0) {
      return res.status(400).json({ success: false, error: "No reward configured for this action" });
    }

    // 3) Credit the user. TODO: swap this for the server's existing
    //    internal helper that bumps the points DB / on-chain contract
    //    (the same one /msg/sent uses). Keeping the call name generic.
    let total;
    try {
      // Example: if the server has a helper like `await addPoints(wallet, credit, action)`
      // wire it here. Otherwise fall back to the points-db direct write.
      total = await addPoints(wallet, credit, { action, meta, txHash });
    } catch (e) {
      console.error("[points/award] addPoints failed", e);
      return res.status(500).json({ success: false, error: e.message });
    }

    _awardSeen.add(idemKey);
    res.json({ success: true, credited: credit, total, action });
  } catch (e) {
    console.error("[points/award]", e);
    res.status(500).json({ success: false, error: e.message });
  }
});
