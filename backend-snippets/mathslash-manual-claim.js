// Patch: stop auto-crediting points on game end. Score stays unclaimed
// in `game_rewards` until user hits POST /simple/claim-points which
// drains all unclaimed scores -> calls PointsSystem.recordQuestFor and
// marks them claimed via tx_hash.
//
// Server usage:
//   wget -O /tmp/manual-claim.js https://raw.githubusercontent.com/0xDarkSeidBull/litdex/main/backend-snippets/mathslash-manual-claim.js
//   node /tmp/manual-claim.js
//   pm2 restart litdex-game

const fs = require("fs");
const SRC = "/root/litvm-dex/game-server/mathslash_simple.js";

let s = fs.readFileSync(SRC, "utf8");
const before = s;

// 1) Disable the auto-credit line we previously added inside /simple/end.
//    The auto-call looks like: awardGamePoints(wallet, pointsEarned, sessionId || ...).catch(() => {});
const autoCallRe = /\n\s*if \(pointsEarned > 0\) \{\s*\n\s*awardGamePoints\(wallet, pointsEarned, sessionId \|\| \('end_' \+ Date\.now\(\)\)\)\.catch\(\(\) => \{\}\);\s*\n\s*\}/;
if (autoCallRe.test(s)) {
  s = s.replace(autoCallRe, "\n  // Auto-credit removed — points are claimed manually via /simple/claim-points");
}

// 2) Insert /simple/claim-points BEFORE module.exports = router;
const claimRoute = `

// POST /simple/claim-points
// Reads all unclaimed game_rewards for this wallet, sums score*0.3,
// credits PointsSystem in a single recordQuestFor call (idempotent via
// the daily questId), and marks rows claimed by stamping tx_hash.
router.post('/claim-points', async (req, res) => {
  try {
    const { wallet } = req.body || {};
    if (!wallet || !ethers.isAddress(wallet)) {
      return res.status(400).json({ success: false, error: 'Invalid wallet' });
    }
    const w = wallet.toLowerCase();
    const today = todayIST();

    const rows = db.prepare(
      \`SELECT id, score FROM game_rewards
       WHERE wallet = ? AND tx_hash = 'points_only'\`
    ).all(w);

    if (rows.length === 0) {
      return res.json({ success: false, message: 'No unclaimed points yet. Play a game first.' });
    }

    const totalScore = rows.reduce((a, r) => a + Number(r.score || 0), 0);
    const pointsToCredit = Math.floor(totalScore * 0.3);
    if (pointsToCredit <= 0) {
      return res.json({ success: false, message: 'Points round to zero — keep playing.' });
    }

    const questId = 'mathslash_claim_' + today + '_' + w.slice(2, 10);
    let txHash = null;
    try {
      const tx = await _points.recordQuestFor(wallet, pointsToCredit, questId);
      await tx.wait();
      txHash = tx.hash;
      console.log('[ClaimPts] +' + pointsToCredit + ' pts -> ' + w.slice(0, 10) + ' tx=' + txHash);
    } catch (e) {
      console.error('[ClaimPts] failed:', (e && (e.shortMessage || e.message)) || String(e));
      return res.status(500).json({ success: false, error: 'On-chain credit failed', reason: e.message });
    }

    // Mark rows claimed
    const stamp = 'claimed_' + txHash;
    const ids = rows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(
      'UPDATE game_rewards SET tx_hash = ? WHERE id IN (' + placeholders + ')'
    ).run(stamp, ...ids);

    res.json({
      success: true,
      pointsCredited: pointsToCredit,
      gamesClaimed: rows.length,
      totalScore,
      txHash,
    });
  } catch (e) {
    console.error('[ClaimPts] error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

`;
const exportRe = /module\.exports\s*=\s*router;/;
if (!exportRe.test(s)) {
  console.error("router export not found");
  process.exit(1);
}
if (!s.includes("/claim-points")) {
  s = s.replace(exportRe, claimRoute + "\nmodule.exports = router;");
}

// 3) Add a small /simple/pending/:wallet GET so the UI can show
//    "you have N unclaimed points ready to claim".
const pendingRoute = `

// GET /simple/pending/:wallet
// Returns the unclaimed score sum + estimated points for this wallet.
router.get('/pending/:wallet', (req, res) => {
  try {
    const w = String(req.params.wallet || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(w)) return res.status(400).json({ error: 'Invalid wallet' });
    const rows = db.prepare(
      \`SELECT id, score FROM game_rewards
       WHERE wallet = ? AND tx_hash = 'points_only'\`
    ).all(w);
    const totalScore = rows.reduce((a, r) => a + Number(r.score || 0), 0);
    const points = Math.floor(totalScore * 0.3);
    res.json({ wallet: w, gamesPending: rows.length, totalScore, pointsAvailable: points });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

`;
if (!s.includes('/pending/:wallet')) {
  s = s.replace(/module\.exports\s*=\s*router;/, pendingRoute + "\nmodule.exports = router;");
}

if (s === before) {
  console.error("nothing changed — patterns may have drifted");
  process.exit(1);
}

fs.writeFileSync(SRC, s);
console.log("manual claim flow patched");
