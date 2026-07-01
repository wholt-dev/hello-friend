// One-shot patch script: restores original anti-bot, sets DAILY_LIMIT=5,
// disables zkLTC payouts, and credits points via PointsSystem on each
// game end.
//
// Usage on the game server (Hetzner host):
//   wget -O /tmp/patch.js https://raw.githubusercontent.com/0xDarkSeidBull/litdex/main/backend-snippets/mathslash-points-only-patch.js
//   node /tmp/patch.js
//   node -c /root/litvm-dex/game-server/mathslash_simple.js && pm2 restart litdex-game

const fs = require("fs");
const SRC = "/root/litvm-dex/game-server/mathslash_simple.js";
const ORIG = "/root/litvm-dex/game-server/mathslash_simple.js.bak"; // pre-bot-filter snapshot
const PATCHED_BAK = "/root/litvm-dex/game-server/mathslash_simple.js.points-only.bak";

// ── 1. Restore from the true original (.bak) so any of our prior bot
//      filter / strike / proof code is removed. Save current as a
//      separate backup just in case.
if (!fs.existsSync(ORIG)) {
  console.error("Original .bak missing at", ORIG, "— aborting");
  process.exit(1);
}
try {
  fs.copyFileSync(SRC, PATCHED_BAK);
  console.log("backed up current ->", PATCHED_BAK);
} catch (e) {
  console.warn("backup skipped:", e.message);
}
fs.copyFileSync(ORIG, SRC);
console.log("restored original from .bak");

// ── 2. Lower daily limit to 5
let s = fs.readFileSync(SRC, "utf8");
s = s.replace(/const DAILY_LIMIT = \d+;/, "const DAILY_LIMIT = 5;");

// ── 3. Insert PointsSystem helper just before `const db = new Database(`
const POINTS_HOOK = `
// Points-only payout: replace zkLTC reward with PointsSystem credits.
const POINTS_ADDR = "0x18158eeF59Fcc7EE3dB4C7eB80f0B8B95Ec9E61c";
const POINTS_ABI = [
  "function recordQuestFor(address user, uint256 pts, string calldata questId) external",
];
const _points = new ethers.Contract(POINTS_ADDR, POINTS_ABI, _wallet);

const _pointsQueue = [];
let _pointsRunning = false;
async function awardGamePoints(to, pts, sessionId) {
  return new Promise((resolve) => {
    _pointsQueue.push({ to, pts, sessionId, resolve });
    processPointsQueue();
  });
}
async function processPointsQueue() {
  if (_pointsRunning) return;
  _pointsRunning = true;
  while (_pointsQueue.length > 0) {
    const { to, pts, sessionId, resolve } = _pointsQueue.shift();
    try {
      const tx = await _points.recordQuestFor(to, pts, "mathslash_" + sessionId);
      await tx.wait();
      console.log("[GamePts] +" + pts + " pts -> " + to.slice(0, 10) + " session=" + sessionId);
      resolve(tx.hash);
    } catch (e) {
      console.error("[GamePts] failed:", (e && (e.shortMessage || e.message)) || String(e));
      resolve(null); // never reject — points failure must not break /simple/end
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  _pointsRunning = false;
}

`;
const dbAnchor = "const db = new Database(";
const dbIdx = s.indexOf(dbAnchor);
if (dbIdx < 0) { console.error("could not find db anchor"); process.exit(1); }
s = s.slice(0, dbIdx) + POINTS_HOOK + s.slice(dbIdx);

// ── 4. Replace the original points/zkLTC payout block in /simple/end
//      with a points-only credit. The original is a few lines using
//      `pointsEarned = score`, `zkltcEquiv`, db insert, console log,
//      then res.json. We do a regex match on the whole region.
const blockRe = /\/\/ Points only[\s\S]*?res\.json\(\{[\s\S]*?\}\);/;
if (!blockRe.test(s)) {
  console.error("could not find original payout block — aborting");
  process.exit(1);
}
const NEW_BLOCK = [
  "// Points-only payout: 1 score -> 0.3 pts, no zkLTC transfer.",
  "  const pointsEarned = Math.floor(score * 0.3);",
  "  db.prepare('INSERT INTO game_rewards (wallet, score, zkltc_sent, tx_hash) VALUES (?,?,?,?)')",
  "    .run(w, score, '0', 'points_only');",
  "  console.log('[SimpleGame] ' + w + ' score=' + score + ' pts=' + pointsEarned);",
  "  // Fire-and-forget; failures don't block the response.",
  "  if (pointsEarned > 0) {",
  "    awardGamePoints(wallet, pointsEarned, sessionId || ('end_' + Date.now())).catch(() => {});",
  "  }",
  "  res.json({",
  "    success: true,",
  "    score,",
  "    pointsEarned,",
  "    zkltcEquiv: 0,",
  "    message: 'Points credited. zkLTC payouts paused while we tune the leaderboard.'",
  "  });",
].join("\n  ");
s = s.replace(blockRe, NEW_BLOCK);

fs.writeFileSync(SRC, s);
console.log("patch applied — restart pm2 to take effect");
