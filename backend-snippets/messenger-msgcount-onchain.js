// Patch: derive the messenger daily count from the on-chain msgDaily
// counter (PointsSystem.getPoints returns msgDaily that bumps by +2
// per message), so /msg/sent and /msg/count/:wallet always agree with
// what the dashboard shows. Removes the in-memory counter that was
// resetting on every pm2 restart and drifting away from the chain.
//
// Server usage:
//   wget -O /tmp/msg-onchain.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/messenger-onchain-counter/backend-snippets/messenger-msgcount-onchain.js"
//   node /tmp/msg-onchain.js
//   pm2 restart litdex-quest-api

const fs = require('fs');
const SRC = '/root/litvm-dex/twitter-auth/server.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

// 1) Inject a helper that reads msgDaily from PointsSystem and divides
//    by 2 to get the message count. We mount it just before the
//    /msg/sent route so the closure picks up the existing `points`
//    contract handle.
const helper = `
// ── Messenger on-chain counter helper ────────────────────────────────
// PointsSystem.getPoints returns (total, deployDaily, msgDaily) where
// msgDaily increments by 2 per message. We derive the count from the
// chain instead of an in-memory map so a pm2 restart can't reset it.
const _MSG_POINTS_ABI3 = [
  'function getPoints(address) view returns (uint256, uint256, uint256)',
];
let _msgPointsContract = null;
function _getMsgPoints() {
  if (_msgPointsContract) return _msgPointsContract;
  try {
    _msgPointsContract = new ethers.Contract(
      '0x526B0629C81d3314929dB8166372F792F3da3419',
      _MSG_POINTS_ABI3,
      provider,
    );
  } catch (e) {
    console.error('[msg-onchain] contract init failed:', e.message);
  }
  return _msgPointsContract;
}
async function getMsgsTodayOnChain(wallet) {
  try {
    const c = _getMsgPoints();
    if (!c) return 0;
    const r = await c.getPoints(wallet);
    const msgDaily = Number(r[2] || 0n);
    return Math.floor(msgDaily / 2);
  } catch (e) {
    console.error('[msg-onchain] read failed:', e.message);
    return 0;
  }
}
// ── end messenger on-chain counter helper ────────────────────────────
`;

if (!s.includes('getMsgsTodayOnChain')) {
  const anchorRe = /(\napp\.post\(\s*["'`]\/msg\/sent["'`])/;
  if (!anchorRe.test(s)) {
    console.error('[msg-onchain] /msg/sent anchor not found');
    process.exit(1);
  }
  s = s.replace(anchorRe, helper + '$1');
}

// 2) Replace /msg/sent body so it reports the on-chain-derived count.
const sentHandlerRe = /app\.post\(\s*["']\/msg\/sent["'][\s\S]*?\n\}\)\s*;\s*\n/;
if (!sentHandlerRe.test(s)) {
  console.error('[msg-onchain] /msg/sent handler not found');
  process.exit(1);
}
const sentHandler = `app.post("/msg/sent", async (req, res) => {
  // Telemetry only. Contract credits points; we just return the count
  // derived from on-chain msgDaily so the UI stays in sync regardless
  // of pm2 restarts or which client triggered the send.
  try {
    const { wallet: userWallet } = req.body;
    if (!userWallet) return res.json({ success: false });
    const msgsToday = await getMsgsTodayOnChain(userWallet);
    res.json({ success: true, msgsToday });
  } catch (e) {
    res.json({ success: false, reason: e.message });
  }
});
`;
s = s.replace(sentHandlerRe, sentHandler);

// 3) Add /msg/count/:wallet that reads the same value, since the
//    frontend pings it on mount to seed msgCount. If a similar route
//    already exists we replace its body; otherwise we add it next to
//    the /msg/sent handler.
const countRouteRe = /app\.get\(\s*["']\/msg\/count\/:wallet["'][\s\S]*?\n\}\)\s*;\s*\n/;
const countHandler = `app.get("/msg/count/:wallet", async (req, res) => {
  try {
    const w = String(req.params.wallet || '');
    if (!/^0x[0-9a-fA-F]{40}$/.test(w)) {
      return res.status(400).json({ success: false, reason: 'invalid_wallet' });
    }
    const msgsToday = await getMsgsTodayOnChain(w);
    res.json({ success: true, wallet: w.toLowerCase(), msgsToday, count: msgsToday });
  } catch (e) {
    res.status(500).json({ success: false, reason: e.message });
  }
});
`;
if (countRouteRe.test(s)) {
  s = s.replace(countRouteRe, countHandler);
} else {
  // Mount it right after the /msg/sent route we just rewrote.
  s = s.replace(sentHandler, sentHandler + '\n' + countHandler);
}

if (s === before) {
  console.error('[msg-onchain] match counted but text unchanged');
  process.exit(1);
}

fs.writeFileSync(SRC + '.bak-msg-onchain', before);
fs.writeFileSync(SRC, s);
console.log('[msg-onchain] /msg/sent + /msg/count derive count from on-chain msgDaily/2; backup at ' + SRC + '.bak-msg-onchain');
