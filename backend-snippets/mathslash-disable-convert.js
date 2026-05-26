// Disable zkLTC convert flow — game now credits Points only.
// On the game server:
//   wget -O /tmp/disable-convert.js https://raw.githubusercontent.com/0xDarkSeidBull/litdex/main/backend-snippets/mathslash-disable-convert.js
//   node /tmp/disable-convert.js
//   pm2 restart litdex-game

const fs = require("fs");
const SRC = "/root/litvm-dex/game-server/mathslash_simple.js";

let s = fs.readFileSync(SRC, "utf8");
const before = s;

// 1. Make /convert/request return a paused message instead of queuing zkLTC.
//    We replace the handler body but keep the route shape identical.
const convertRouteRe = /router\.post\(['"]\/convert\/request['"][\s\S]*?\n\}\);/m;
if (!convertRouteRe.test(s)) {
  console.error("/convert/request handler not found — aborting");
  process.exit(1);
}
const newConvertHandler = [
  "router.post('/convert/request', async (req, res) => {",
  "  // zkLTC payouts paused. Game now credits points-only via",
  "  // PointsSystem.recordQuestFor inside /simple/end.",
  "  return res.status(410).json({",
  "    success: false,",
  "    message: 'zkLTC payouts are paused. Your game points are credited automatically to your Points balance.',",
  "  });",
  "});",
].join("\n");
s = s.replace(convertRouteRe, newConvertHandler);

// 2. Neuter processConvertQueue + enqueueReward so any internal callers
//    (e.g. legacy /simple/end paths, admin approve) silently no-op.
const procQueueRe = /async function processConvertQueue\(\)\s*\{[\s\S]*?\n\}/m;
if (procQueueRe.test(s)) {
  s = s.replace(
    procQueueRe,
    "async function processConvertQueue() { /* zkLTC payouts paused */ }",
  );
}
const enqueueRe = /async function enqueueReward\(to, amount\)\s*\{[\s\S]*?\n\}/m;
if (enqueueRe.test(s)) {
  s = s.replace(
    enqueueRe,
    "async function enqueueReward(to, amount) { /* zkLTC payouts paused */ console.log('[Reward] skip', to, amount); return null; }",
  );
}

// 3. /convert/status/:wallet — make it return a clean paused state too,
//    so the existing UI poll doesn't show stale pending entries forever.
const statusRouteRe = /router\.get\(['"]\/convert\/status\/:wallet['"][\s\S]*?\n\}\);/m;
if (statusRouteRe.test(s)) {
  s = s.replace(
    statusRouteRe,
    [
      "router.get('/convert/status/:wallet', (req, res) => {",
      "  // zkLTC convert flow is paused — always return an idle state.",
      "  res.json({ paused: true, pending: 0, lastTx: null });",
      "});",
    ].join("\n"),
  );
}

if (s === before) {
  console.error("nothing changed — patterns may have drifted");
  process.exit(1);
}

fs.writeFileSync(SRC, s);
console.log("convert + reward queue disabled");
