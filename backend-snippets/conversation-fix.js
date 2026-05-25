// Replacement body for the GET /hub/messenger/conversation/:address/:other route.
// Uses provider.call() directly so we can pass the `from` field without
// ethers v6 trying to ENS-resolve it (LiteForge has no ENS).
//
// Replace the entire existing handler in /root/litdex-hub/server.js with this.

app.get("/hub/messenger/conversation/:address/:other", async (req, res) => {
  try {
    const me = req.params.address;
    const other = req.params.other;

    // 1) Friendship check — this read works without `from` overrides.
    const areFriends = await messenger.isFriend(me, other);
    if (!areFriends) return res.status(403).json({ error: "Not friends" });

    // 2) Conversation fetch via raw eth_call so we can set msg.sender.
    //    The contract's getConversation(other) uses msg.sender to identify
    //    "me", and ethers' Contract wrapper would ENS-resolve `from`,
    //    which crashes on LiteForge.
    const data = messenger.interface.encodeFunctionData("getConversation", [other]);
    const raw = await provider.call({
      to: process.env.LIT_MESSENGER,
      data,
      from: me,
    });
    const [decoded] = messenger.interface.decodeFunctionResult("getConversation", raw);

    res.json({
      messages: decoded.map((m) => ({
        id: m[0].toString(),
        from: m[1],
        to: m[2],
        contentHash: m[3],
        msgType: m[4],
        amount: ethers.formatEther(m[5]),
        sentAt: m[6].toString(),
        read: m[7],
      })),
    });
  } catch (e) {
    console.error("[conversation]", e);
    res.status(500).json({ error: e.message });
  }
});
