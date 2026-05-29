// ════════════════════════════════════════════════════════════════
//  LIT DICE — backend route (provably-fair over/under dice)
//  Drop into: /root/litvm-dex/game-server/litdice.js
//  Mount: app.use('/litdice', require('./litdice'));
//
//  Player picks a target T (2..98) and direction ("over" or "under")
//  and stakes 5 PTS. A roll 0.00..99.99 is derived from the server
//  seed. Win if direction matches; payout = stake * multiplier.
//
//  Multiplier = (99 / winChancePct) * 0.97       (97% RTP)
//
//  Provably fair: server commits seedHash at /start, reveals
//  serverSeed at /play so anyone can verify the roll.
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

async function readOnChainPoints(w) {
  try { const [t] = await _points.getPoints(w); return Number(t); } catch { return null; }
}

const db = new Database('./simple_game.db');
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS litdice_daily (
    wallet TEXT NOT NULL, date TEXT NOT NULL,
    games_played INTEGER DEFAULT 0,
    PRIMARY KEY (wallet, date)
  );
  CREATE TABLE IF NOT EXISTS litdice_rounds (
    round_id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    server_seed TEXT NOT NULL,
    seed_hash TEXT NOT NULL,
    stake INTEGER NOT NULL,
    target INTEGER,
    direction TEXT,
    roll_x100 INTEGER,
    multiplier_x100 INTEGER,
    awarded INTEGER DEFAULT 0,
    won INTEGER DEFAULT 0,
    settled INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS litdice_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL, round_id TEXT,
    delta INTEGER NOT NULL, reason TEXT NOT NULL,
    tx_hash TEXT, ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dledger_wallet ON litdice_ledger(wallet);
`);

const STAKE        = 5;
const DAILY_LIMIT  = 20;
const RTP_X100     = 97;
const ROUND_TTL_MS = 60 * 1000;
const PEPPER = process.env.LITDICE_PEPPER || process.env.PUMPDUMP_PEPPER || 'CHANGE_ME_LONG_RANDOM';
const startLimiter = rateLimit({ windowMs: 60000, max: 30, keyGenerator: (req) => ipKeyGenerator(req), message: { error: 'rate_limited' } });

// Sequential tx queue (shared spend + award through same chain).
const _txQueue = [];
let _txRunning = false;
function enqTx(fn) {
  return new Promise((res) => { _txQueue.push({ fn, res }); pumpTx(); });
}
async function pumpTx() {
  if (_txRunning) return; _txRunning = true;
  while (_txQueue.length > 0) {
    const { fn, res } = _txQueue.shift();
    try { const tx = await fn(); await tx.wait(); res(tx.hash); }
    catch (e) { console.error('[LD-Tx]', e.shortMessage || e.message); res(null); }
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
  try { db.prepare('UPDATE litdice_rounds SET settled = 1 WHERE settled = 0 AND expires_at < ?').run(Date.now()); } catch {}
}, 60_000).unref();

// Roll: HMAC(serverSeed, roundId) -> first 8 hex -> uint32 -> 0..9999 -> /100 = 0.00..99.99
function rollFromSeed(serverSeed, roundId) {
  const h = hmac(serverSeed, roundId);
  const u = parseInt(h.slice(0, 8), 16) >>> 0;
  return (u % 10000) / 100;     // 0.00..99.99
}

function multiplierForChance(winChancePct) {
  if (winChancePct <= 0 || winChancePct >= 100) return 100;
  return Math.floor((99 / winChancePct) * RTP_X100);    // x100 form
}

function winChanceFor(target, direction) {
  if (direction === 'under') return Math.max(0.01, Math.min(99.99, target));
  return Math.max(0.01, Math.min(99.99, 100 - target));
}

router.get('/stats/:wallet', async (req, res) => {
  try {
    const w = String(req.params.wallet || '').toLowerCase();
    if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });
    const today = todayIST();
    const dr = db.prepare('SELECT games_played FROM litdice_daily WHERE wallet=? AND date=?').get(w, today);
    const played = dr?.games_played || 0;
    const lr = db.prepare(`SELECT COALESCE(SUM(delta), 0) AS total FROM litdice_ledger WHERE wallet = ? AND reason = ?`).get(w, 'cashout');
    const totalWon = lr?.total || 0;
    const br = db.prepare('SELECT MAX(multiplier_x100) AS best_mult FROM litdice_rounds WHERE wallet = ? AND won = 1').get(w);
    const onChain = await readOnChainPoints(w);
    res.json({
      pointsBalance: onChain ?? 0,
      gamesPlayed: played,
      gamesLeft: Math.max(0, DAILY_LIMIT - played),
      dailyLimit: DAILY_LIMIT,
      stake: STAKE,
      rtp: RTP_X100 / 100,
      bestMultiplier: ((br?.best_mult || 0) / 100),
      lifetimeWon: totalWon,
    });
  } catch (e) { console.error('[/litdice/stats]', e.message); res.status(500).json({ error: 'stats_failed' }); }
});

router.post('/start', startLimiter, async (req, res) => {
  try {
    const { wallet } = req.body || {};
    if (!wallet) return res.status(400).json({ error: 'wallet_required' });
    const w = String(wallet).toLowerCase();
    if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });

    const today = todayIST();
    const dr = db.prepare('SELECT games_played FROM litdice_daily WHERE wallet=? AND date=?').get(w, today);
    const played = dr?.games_played || 0;
    if (played >= DAILY_LIMIT) return res.status(429).json({ error: 'daily_limit_reached', gamesLeft: 0 });

    const bal = await readOnChainPoints(w);
    if (bal != null && bal < STAKE) return res.status(402).json({ error: 'need_min_points', need: STAKE, have: bal });

    db.prepare(`INSERT INTO litdice_daily (wallet, date, games_played) VALUES (?, ?, 1)
                ON CONFLICT(wallet, date) DO UPDATE SET games_played = games_played + 1`).run(w, today);

    const roundId    = crypto.randomBytes(16).toString('hex');
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const seedHash   = sha256(serverSeed);
    const now = Date.now();
    db.prepare(`INSERT INTO litdice_rounds (round_id, wallet, server_seed, seed_hash, stake, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`).run(roundId, w, serverSeed, seedHash, STAKE, now, now + ROUND_TTL_MS);

    // Burn stake on chain.
    const burnHash = await spendStake(w, STAKE);
    if (!burnHash) {
      db.prepare('UPDATE litdice_rounds SET settled = 1 WHERE round_id = ?').run(roundId);
      return res.status(502).json({ error: 'stake_spend_failed' });
    }
    db.prepare(`INSERT INTO litdice_ledger (wallet, round_id, delta, reason, tx_hash, ts)
                VALUES (?, ?, ?, 'entry', ?, ?)`).run(w, roundId, -STAKE, burnHash, now);

    res.json({
      roundId, token: sign(roundId), seedHash,
      stake: STAKE, rtp: RTP_X100 / 100,
      gamesLeft: Math.max(0, DAILY_LIMIT - (played + 1)),
      dailyLimit: DAILY_LIMIT, entryTxHash: burnHash,
    });
  } catch (e) { console.error('[/litdice/start]', e.message); res.status(500).json({ error: 'start_failed' }); }
});

router.post('/play', async (req, res) => {
  try {
    const { roundId, token, target, direction } = req.body || {};
    if (!roundId || !token) return res.status(400).json({ error: 'bad_request' });
    if (sign(roundId) !== token) return res.status(403).json({ error: 'bad_token' });

    const t = Math.floor(Number(target));
    const dir = String(direction || '').toLowerCase();
    if (!Number.isFinite(t) || t < 2 || t > 98) return res.status(400).json({ error: 'bad_target' });
    if (dir !== 'over' && dir !== 'under') return res.status(400).json({ error: 'bad_direction' });

    const r = db.prepare('SELECT * FROM litdice_rounds WHERE round_id = ?').get(roundId);
    if (!r) return res.status(404).json({ error: 'round_not_found' });
    if (r.settled) return res.status(409).json({ error: 'already_settled' });
    if (r.expires_at < Date.now()) {
      db.prepare('UPDATE litdice_rounds SET settled = 1 WHERE round_id = ?').run(roundId);
      return res.status(410).json({ error: 'round_expired' });
    }

    const roll = rollFromSeed(r.server_seed, roundId);
    const won = (dir === 'under' && roll < t) || (dir === 'over' && roll > t);
    const wcp = winChanceFor(t, dir);
    const multX100 = won ? multiplierForChance(wcp) : 0;
    const awarded = won ? Math.floor((r.stake * multX100) / 100) : 0;

    db.prepare(`UPDATE litdice_rounds
                SET settled = 1, target = ?, direction = ?, roll_x100 = ?, multiplier_x100 = ?, awarded = ?, won = ?
                WHERE round_id = ?`).run(t, dir, Math.round(roll * 100), multX100, awarded, won ? 1 : 0, roundId);

    let txHash = null;
    if (awarded > 0) {
      db.prepare(`INSERT INTO litdice_ledger (wallet, round_id, delta, reason, ts)
                  VALUES (?, ?, ?, 'cashout', ?)`).run(r.wallet, roundId, awarded, Date.now());
      txHash = await awardPoints(r.wallet, awarded, `litdice_${roundId.slice(0, 8)}`);
      if (txHash) db.prepare(`UPDATE litdice_ledger SET tx_hash = ? WHERE round_id = ? AND reason = 'cashout'`).run(txHash, roundId);
    }

    res.json({
      ok: true, won, roll, target: t, direction: dir,
      multiplier: multX100 / 100,
      awarded, stake: r.stake,
      profit: awarded - r.stake,
      serverSeed: r.server_seed,        // reveal for fairness
      seedHash: r.seed_hash,
      txHash, explorerUrl: txHash ? `https://liteforge.explorer.caldera.xyz/tx/${txHash}` : null,
    });
  } catch (e) { console.error('[/litdice/play]', e.message); res.status(500).json({ error: 'play_failed' }); }
});

module.exports = router;
