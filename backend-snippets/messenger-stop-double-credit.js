// Patch: stop /msg/sent from awarding points off-chain. The Messenger
// contract already credits +2 to (total, msgDaily) inside its on-chain
// sendDirect/sendPublic flow, so the backend's recordQuestFor call was
// adding another +2 — every frontend message landed +4 total / +2
// msgDaily AND triggered the cap-reached path independently because
// the in-memory msgCount is decoupled from the on-chain counter.
//
// What this patch does:
//   1. Drops the queueQuest(...) + tx.wait() call from /msg/sent.
//   2. Drops the in-memory daily_limit gate (the contract already caps
//      msgDaily on-chain, so the cap is enforced regardless).
//   3. Keeps the lightweight bookkeeping so /msg/sent still returns
//      msgsToday for the UI counter, just without crediting points.
//
// Server usage:
//   wget -O /tmp/stop-double.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/messenger-remove-double-credit/backend-snippets/messenger-stop-double-credit.js"
//   node /tmp/stop-double.js
//   pm2 restart litdex-quest-api
//
// A backup of the original handler is written to
//   /root/litvm-dex/twitter-auth/server.js.bak-msg-double

const fs = require('fs');
const SRC = '/root/litvm-dex/twitter-auth/server.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

// The handler is currently:
//
// app.post("/msg/sent", async (req, res) => {
//   const { wallet: userWallet } = req.body;
//   if (!userWallet) return res.json({ success: false });
//   const today = new Date().toISOString().slice(0,10);
//   if (!msgCount[userWallet] || msgCount[userWallet].date !== today) {
//     msgCount[userWallet] = { date: today, count: 0 };
//   }
//   if (msgCount[userWallet].count >= 10) {
//     return res.json({ success: false, reason: "daily_limit", message: "Max 10 messages per day" });
//   }
//   try {
//     msgCount[userWallet].count++;
//     const tx = await queueQuest(userWallet, 2, `msg_${today}_${msgCount[userWallet].count}`);
//     await tx.wait();
//     console.log(`💬 Msg points → ${userWallet.slice(0,10)} +2pts`);
//     res.json({ success: true, points: 2, msgsToday: msgCount[userWallet].count });
//   } catch(e) {
//     res.json({ success: false, reason: e.message });
//   }
// });
//
// We rewrite the body of the handler so it just bumps the counter and
// returns it. No queueQuest, no tx.wait, no daily_limit short-circuit.

const handlerRe = /app\.post\(\s*["']\/msg\/sent["'][\s\S]*?\n\}\)\s*;\s*\n/;

if (!handlerRe.test(s)) {
  console.error('[stop-double] /msg/sent handler not found; inspect with:');
  console.error('  grep -n "/msg/sent" ' + SRC);
  process.exit(1);
}

const newHandler = `app.post("/msg/sent", async (req, res) => {
  // Telemetry only. The Messenger contract credits points on-chain
  // already; calling queueQuest here would double-credit.
  try {
    const { wallet: userWallet } = req.body;
    if (!userWallet) return res.json({ success: false });
    const today = new Date().toISOString().slice(0,10);
    if (!msgCount[userWallet] || msgCount[userWallet].date !== today) {
      msgCount[userWallet] = { date: today, count: 0 };
    }
    msgCount[userWallet].count++;
    res.json({ success: true, msgsToday: msgCount[userWallet].count });
  } catch (e) {
    res.json({ success: false, reason: e.message });
  }
});
`;

s = s.replace(handlerRe, newHandler);

if (s === before) {
  console.error('[stop-double] match counted but text unchanged');
  process.exit(1);
}

// Quick syntax sanity — make sure there's no orphan `} catch(e)` left.
const orphans = (s.match(/^\s*\} catch\s*\(\s*e\s*\)\s*\{\s*\n\s*res\.json\(\{ success: false, reason: e\.message \}\);\s*\n\s*\}\s*\n\s*\}\)/gm) || []);
if (orphans.length > 0) {
  console.warn('[stop-double] possible orphan catch detected, manual review suggested');
}

fs.writeFileSync(SRC + '.bak-msg-double', before);
fs.writeFileSync(SRC, s);
console.log('[stop-double] /msg/sent now telemetry-only (no recordQuestFor); backup at ' + SRC + '.bak-msg-double');
