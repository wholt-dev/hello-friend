// ════════════════════════════════════════════════════════════════
//  LIT LIMBO — backend route (set target multiplier, RNG must hit)
//  Drop into: /root/litvm-dex/game-server/litlimbo.js
//  Mount: app.use('/litlimbo', require('./litlimbo'));
//
//  Player picks a target multiplier T (1.01..100). Server rolls a
//  hidden multiplier H from a 1/u distribution clamped to [1, 1000].
//  Win iff H >= T. Payout on win = stake × T (capped at 100x).
//
//  Win chance = 0.99 / T   (97% RTP from edge factor; 0.99 cap also
//  ensures 1.01x is not 99% prob — it's ~98%, slightly less).
//  Hidden roll formula: H = floor(1e8 * 0.99 / (u + epsilon)) / 1e8
//  where u in (0, 1) is HMAC-derived. This makes verifying trivial.
// ════════════════════════════════════════════════════════════════
const { ethers } = require("ethers");
const express = require('express');
const router = express.Router();
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const Database = require('better-sqlite3');
const crypto = require('crypto');
require('dotenv').config({ path: '../.env' });

const _provider = new ethers.JsonRpcProvider(
  'https://liteforge.rpc.caldera.xyz/http',
  ethers.Network.from({ chainId: 4441, name: 'litvm' }),
  { staticNetwork: true, polling: false, timeout: 20000 }
);
const _wallet = new ethers.Wallet(process.env.PRIVATE_KEY, _provider);
const POINTS_ADDR = "0x526B0629C81d3314929dB8166372F792F3da3419";
const POINTS_ABI = [
  "function recordQuestFor(address user, uint256 pts, string calldata questId) external",
  "function spendPoints(address user, uint256 amount) external",
  "function getPoints(address user) view returns (uint256 total, uint256 deployDaily, uint256 msgDaily)",
];
const _points = new ethers.Contract(POINTS_ADDR, POINTS_ABI, _wallet);
async function readOnChainPoints(w) { try { const [t] = await _points.getPoints(w); return Number(t); } catch { return null; } }

const db = new Database('./simple_game.db');
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS litlimbo_daily (
    wallet TEXT NOT NULL, date TEXT NOT NULL,
    games_played INTEGER DEFAULT 0,
    PRIMARY KEY (wallet, date)
  );
  CREATE TABLE IF NOT EXISTS litlimbo_rounds (
    round_id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    server_seed TEXT NOT NULL,
    seed_hash TEXT NOT NULL,
    stake INTEGER NOT NULL,
    target_x100 INTEGER,
    rolled_x100 INTEGER,
    awarded INTEGER DEFAULT 0,
    won INTEGER DEFAULT 0,
    settled INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS litlimbo_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL, round_id TEXT,
    delta INTEGER NOT NULL, reason TEXT NOT NULL,
    tx_hash TEXT, ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lledger_wallet ON litlimbo_ledger(wallet);
`);

const STAKE = 5;
const DAILY_LIMIT = 20;
const RTP_X100 = 99;
const MAX_TARGET_X100 = 10000;        // 100.00x
const MIN_TARGET_X100 = 101;          // 1.01x
const ROUND_TTL_MS = 60 * 1000;
const PEPPER = process.env.LITLIMBO_PEPPER || process.env.PUMPDUMP_PEPPER || 'CHANGE_ME_LONG_RANDOM';
const startLimiter = rateLimit({ windowMs: 60000, max: 30, keyGenerator: (req) => ipKeyGenerator(req), message: { error: 'rate_limited' } });

const _txQueue = [];
let _txRunning = false;
function enqTx(fn) { return new Promise((res) => { _txQueue.push({ fn, res }); pumpTx(); }); }
async function pumpTx() {
  if (_txRunning) return; _txRunning = true;
  while (_txQueue.length > 0) {
    const { fn, res } = _txQueue.shift();
    try { const tx = await fn(); await tx.wait(); res(tx.hash); }
    catch (e) { console.error('[LL-Tx]', e.shortMessage || e.message); res(null); }
    await new Promise(r => setTimeout(r, 250));
  }
  _txRunning = false;
}
const awardPoints = (to, pts, qid) => enqTx(() => _points.recordQuestFor(to, BigInt(pts), qid));
const spendStake  = (from, amt)    => enqTx(() => _points.spendPoints(from, BigInt(amt)));

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const hmac   = (k, m) => crypto.createHmac('sha256', String(k)).update(String(m)).digest('hex');
const sign   = (rid) => hmac(PEPPER, rid);
const todayIST = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

setInterval(() => {
  try { db.prepare('UPDATE litlimbo_rounds SET settled = 1 WHERE settled = 0 AND expires_at < ?').run(Date.now()); } catch {}
}, 60_000).unref();

// Roll: u in (0,1) -> H = (RTP/100) / u, capped at 1000x.
function rollFromSeed(serverSeed, roundId) {
  const h = hmac(serverSeed, roundId);
  const u = (parseInt(h.slice(0, 8), 16) >>> 0) / 0x100000000;   // (0,1)
  const safe = Math.max(u, 1e-7);
  const H = (RTP_X100 / 100) / safe;
  return Math.min(1000, Math.max(1.0, H));
}

router.get('/stats/:wallet', async (req, res) => {
  try {
    const w = String(req.params.wallet || '').toLowerCase();
    if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });
    const today = todayIST();
    const dr = db.prepare('SELECT games_played FROM litlimbo_daily WHERE wallet=? AND date=?').get(w, today);
    const played = dr?.games_played || 0;
    const lr = db.prepare(`SELECT COALESCE(SUM(delta), 0) AS total FROM litlimbo_ledger WHERE wallet = ? AND reason = ?`).get(w, 'cashout');
    const totalWon = lr?.total || 0;
    const br = db.prepare('SELECT MAX(rolled_x100) AS best_roll FROM litlimbo_rounds WHERE wallet = ? AND won = 1').get(w);
    const onChain = await readOnChainPoints(w);
    res.json({
      pointsBalance: onChain ?? 0,
      gamesPlayed: played,
      gamesLeft: Math.max(0, DAILY_LIMIT - played),
      dailyLimit: DAILY_LIMIT,
      stake: STAKE,
      rtp: RTP_X100 / 100,
      maxTarget: MAX_TARGET_X100 / 100,
      minTarget: MIN_TARGET_X100 / 100,
      bestRoll: ((br?.best_roll || 0) / 100),
      lifetimeWon: totalWon,
    });
  } catch (e) { console.error('[/litlimbo/stats]', e.message); res.status(500).json({ error: 'stats_failed' }); }
});

router.post('/start', startLimiter, async (req, res) => {
  try {
    const { wallet } = req.body || {};
    if (!wallet) return res.status(400).json({ error: 'wallet_required' });
    const w = String(wallet).toLowerCase();
    if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });

    const today = todayIST();
    const dr = db.prepare('SELECT games_played FROM litlimbo_daily WHERE wallet=? AND date=?').get(w, today);
    const played = dr?.games_played || 0;
    if (played >= DAILY_LIMIT) return res.status(429).json({ error: 'daily_limit_reached', gamesLeft: 0 });

    const bal = await readOnChainPoints(w);
    if (bal != null && bal < STAKE) return res.status(402).json({ error: 'need_min_points', need: STAKE, have: bal });

    db.prepare(`INSERT INTO litlimbo_daily (wallet, date, games_played) VALUES (?, ?, 1)
                ON CONFLICT(wallet, date) DO UPDATE SET games_played = games_played + 1`).run(w, today);

    const roundId    = crypto.randomBytes(16).toString('hex');
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const seedHash   = sha256(serverSeed);
    const now = Date.now();
    db.prepare(`INSERT INTO litlimbo_rounds (round_id, wallet, server_seed, seed_hash, stake, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`).run(roundId, w, serverSeed, seedHash, STAKE, now, now + ROUND_TTL_MS);

    const burnHash = await spendStake(w, STAKE);
    if (!burnHash) {
      db.prepare('UPDATE litlimbo_rounds SET settled = 1 WHERE round_id = ?').run(roundId);
      return res.status(502).json({ error: 'stake_spend_failed' });
    }
    db.prepare(`INSERT INTO litlimbo_ledger (wallet, round_id, delta, reason, tx_hash, ts)
                VALUES (?, ?, ?, 'entry', ?, ?)`).run(w, roundId, -STAKE, burnHash, now);

    res.json({
      roundId, token: sign(roundId), seedHash,
      stake: STAKE, rtp: RTP_X100 / 100,
      maxTarget: MAX_TARGET_X100 / 100, minTarget: MIN_TARGET_X100 / 100,
      gamesLeft: Math.max(0, DAILY_LIMIT - (played + 1)), dailyLimit: DAILY_LIMIT,
      entryTxHash: burnHash,
    });
  } catch (e) { console.error('[/litlimbo/start]', e.message); res.status(500).json({ error: 'start_failed' }); }
});

router.post('/play', async (req, res) => {
  try {
    const { roundId, token, target } = req.body || {};
    if (!roundId || !token) return res.status(400).json({ error: 'bad_request' });
    if (sign(roundId) !== token) return res.status(403).json({ error: 'bad_token' });
    const tX100 = Math.round(Number(target) * 100);
    if (!Number.isFinite(tX100) || tX100 < MIN_TARGET_X100 || tX100 > MAX_TARGET_X100) {
      return res.status(400).json({ error: 'bad_target' });
    }

    const r = db.prepare('SELECT * FROM litlimbo_rounds WHERE round_id = ?').get(roundId);
    if (!r) return res.status(404).json({ error: 'round_not_found' });
    if (r.settled) return res.status(409).json({ error: 'already_settled' });
    if (r.expires_at < Date.now()) {
      db.prepare('UPDATE litlimbo_rounds SET settled = 1 WHERE round_id = ?').run(roundId);
      return res.status(410).json({ error: 'round_expired' });
    }

    const rolled = rollFromSeed(r.server_seed, roundId);
    const rolledX100 = Math.round(rolled * 100);
    const won = rolledX100 >= tX100;
    const awarded = won ? Math.floor((r.stake * tX100) / 100) : 0;

    db.prepare(`UPDATE litlimbo_rounds
                SET settled = 1, target_x100 = ?, rolled_x100 = ?, awarded = ?, won = ?
                WHERE round_id = ?`).run(tX100, rolledX100, awarded, won ? 1 : 0, roundId);

    let txHash = null;
    if (awarded > 0) {
      db.prepare(`INSERT INTO litlimbo_ledger (wallet, round_id, delta, reason, ts)
                  VALUES (?, ?, ?, 'cashout', ?)`).run(r.wallet, roundId, awarded, Date.now());
      txHash = await awardPoints(r.wallet, awarded, `litlimbo_${roundId.slice(0, 8)}`);
      if (txHash) db.prepare(`UPDATE litlimbo_ledger SET tx_hash = ? WHERE round_id = ? AND reason = 'cashout'`).run(txHash, roundId);
    }

    res.json({
      ok: true, won, target: tX100 / 100,
      rolled: rolledX100 / 100,
      awarded, stake: r.stake,
      profit: awarded - r.stake,
      serverSeed: r.server_seed, seedHash: r.seed_hash,
      txHash, explorerUrl: txHash ? `https://liteforge.explorer.caldera.xyz/tx/${txHash}` : null,
    });
  } catch (e) { console.error('[/litlimbo/play]', e.message); res.status(500).json({ error: 'play_failed' }); }
});

module.exports = router;
