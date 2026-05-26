// --- POINTS AWARD ENDPOINT (domain register only) ---
// Add to /root/litvm-dex/twitter-auth/server.js BEFORE app.listen(3002)
// Hooks into the existing `queueQuest()` helper used by /msg/sent so
// points get credited via the same on-chain admin wallet path.
//
// Endpoint:
//   POST /points/award
//   Body: { wallet, action, txHash, meta?: { duration, name } }
//   Awards: 1Y=10  2Y=20  5Y=35  10Y=60  Forever(99)=100
//
// Idempotency: questId encodes the txHash so a retry credits 0 points
// (recordQuestFor on-chain checks isQuestDone).

const POINTS_PER_DURATION = { 1: 10, 2: 20, 5: 35, 10: 60, 99: 100 };

app.post("/points/award", async (req, res) => {
  try {
    const { wallet: userWallet, action, txHash, meta } = req.body || {};
    if (!userWallet || !action || !txHash) {
      return res.json({ success: false, reason: "missing_fields" });
    }
    if (action !== "domain_register") {
      return res.json({ success: false, reason: "unsupported_action" });
    }
    const duration = Number(meta?.duration);
    const pts = POINTS_PER_DURATION[duration] || 0;
    if (pts <= 0) {
      return res.json({ success: false, reason: "no_reward_for_duration" });
    }

    // Verify the tx exists on chain and was sent by this wallet — anti-spoof.
    let receipt = null;
    try {
      receipt = await provider.getTransactionReceipt(txHash);
    } catch (e) {
      console.error("[points/award] receipt fetch failed:", e.message);
    }
    if (!receipt || !receipt.status) {
      return res.json({ success: false, reason: "tx_not_found_or_failed" });
    }
    if ((receipt.from || "").toLowerCase() !== userWallet.toLowerCase()) {
      return res.json({ success: false, reason: "tx_not_from_wallet" });
    }

    // questId carries the txHash so the contract's `isQuestDone` check
    // makes this idempotent — replays credit 0 points.
    const questId = `domain_${txHash.toLowerCase()}`;

    // Re-use the same queue the messenger flow uses so we don't fight
    // for the relayer nonce.
    const tx = await queueQuest(userWallet, pts, questId);
    await tx.wait();
    console.log(`🪪 Domain register points → ${userWallet.slice(0, 10)} +${pts}pts (${meta?.name || ""}.lit, ${duration}y)`);
    res.json({ success: true, points: pts, action, name: meta?.name, duration });
  } catch (e) {
    console.error("[points/award] error:", e.message);
    res.json({ success: false, reason: e.message });
  }
});
