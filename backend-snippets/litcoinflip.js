// ════════════════════════════════════════════════════════════════
//  LIT COIN FLIP — backend route (heads/tails with optional streak)
//  Drop into: /root/litvm-dex/game-server/litcoinflip.js
//  Mount: app.use('/litcoinflip', require('./litcoinflip'));
//
//  Pick HEADS or TAILS, single flip = 1.96x payout (98% RTP).
//  Player can pre-commit a streak length (2..5 flips); a streak of
//  N pays (1.96)^N if all match, else stake lost. Each individual
//  flip pays nothing intermediate — the streak is "all or nothing".
//
//  Provably fair: server commits seedHash at /start, reveals
//  serverSeed at /flip. clientSeed mixed into HMAC key. Each flip
//  derived from a separate index so a 5-flip outcome is fully
//  pre-determined at /start — but unknowable until reveal.
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
  CREATE TABLE IF NOT EXISTS litcoin_daily (
    wallet TEXT NOT NULL, date TEXT NOT NULL,
    games_played INTEGER DEFAULT 0,
    PRIMARY KEY (wallet, date)
  );
  CREATE TABLE IF NOT EXISTS litcoin_rounds (
    round_id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    server_seed TEXT NOT NULL,
    seed_hash TEXT NOT NULL,
    client_seed TEXT,
    stake INTEGER NOT NULL,
    side TEXT,
    streak INTEGER,
    flips_json TEXT,
    won INTEGER DEFAULT 0,
    multiplier_x100 INTEGER,
    awarded INTEGER DEFAULT 0,
    settled INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS litcoin_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL, round_id TEXT,
    delta INTEGER NOT NULL, reason TEXT NOT NULL,
    tx_hash TEXT, ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lcledger_wallet ON litcoin_ledger(wallet);
`);

const STAKE        = 5;
const DAILY_LIMIT  = 20;
const RTP_X100     = 98;             // 0.98 per flip => 1.96x base mult
const PER_FLIP_X100 = 196;
const MAX_STREAK   = 5;
const ROUND_TTL_MS = 2 * 60 * 1000;
const PEPPER = process.env.LITCOIN_PEPPER || process.env.PUMPDUMP_PEPPER || 'CHANGE_ME_LONG_RANDOM';

const startLimiter = rateLimit({ windowMs: 60000, max: 30, keyGenerator: (req) => ipKeyGenerator(req), message: { error: 'rate_limited' } });

const _txQueue = [];
let _txRunning = false;
function enqTx(fn) { return new Promise((res) => { _txQueue.push({ fn, res }); pumpTx(); }); }
async function pumpTx() {
  if (_txRunning) return; _txRunning = true;
  while (_txQueue.length > 0) {
    const { fn, res } = _txQueue.shift();
    try { const tx = await fn(); await tx.wait(); res(tx.hash); }
    catch (e) { console.error('[LC-Tx]', e.shortMessage || e.message); res(null); }
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

setInterval(() => { try { db.prepare('UPDATE litcoin_rounds SET settled = 1 WHERE settled = 0 AND expires_at < ?').run(Date.now()); } catch {} }, 60_000).unref();

// HMAC -> first byte LSB -> 0 = heads, 1 = tails
function flipBit(serverSeed, key, idx) {
  const h = hmac(serverSeed, `${key}:${idx}`);
  return (parseInt(h.slice(0, 2), 16) & 1) ? 1 : 0;
}

// Multiplier for streak of length n: round((1.96)^n × 100). Returned as x100 int.
function streakMultX100(n) {
  let m = 100;
  for (let i = 0; i < n; i++) m = Math.floor((m * PER_FLIP_X100) / 100);
  return m;
}

router.get('/stats/:wallet', async (req, res) => {
  try {
    const w = String(req.params.wallet || '').toLowerCase();
    if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });
    const today = todayIST();
    const dr = db.prepare('SELECT games_played FROM litcoin_daily WHERE wallet=? AND date=?').get(w, today);
    const played = dr?.games_played || 0;
    const lr = db.prepare(`SELECT COALESCE(SUM(delta), 0) AS total FROM litcoin_ledger WHERE wallet = ? AND reason = ?`).get(w, 'cashout');
    const totalWon = lr?.total || 0;
    const br = db.prepare('SELECT MAX(streak) AS best_streak FROM litcoin_rounds WHERE wallet = ? AND won = 1').get(w);
    const onChain = await readOnChainPoints(w);
    const table = [];
    for (let n = 1; n <= MAX_STREAK; n++) table.push({ streak: n, multiplier: streakMultX100(n) / 100 });
    res.json({
      pointsBalance: onChain ?? 0,
      gamesPlayed: played,
      gamesLeft: Math.max(0, DAILY_LIMIT - played),
      dailyLimit: DAILY_LIMIT,
      stake: STAKE, maxStreak: MAX_STREAK,
      perFlipMultiplier: PER_FLIP_X100 / 100,
      streakTable: table,
      bestStreak: Number(br?.best_streak || 0),
      lifetimeWon: totalWon,
    });
  } catch (e) { console.error('[/litcoinflip/stats]', e.message); res.status(500).json({ error: 'stats_failed' }); }
});

router.post('/start', startLimiter, async (req, res) => {
  try {
    const { wallet, clientSeed } = req.body || {};
    if (!wallet) return res.status(400).json({ error: 'wallet_required' });
    const w = String(wallet).toLowerCase();
    if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });

    const today = todayIST();
    const dr = db.prepare('SELECT games_played FROM litcoin_daily WHERE wallet=? AND date=?').get(w, today);
    const played = dr?.games_played || 0;
    if (played >= DAILY_LIMIT) return res.status(429).json({ error: 'daily_limit_reached', gamesLeft: 0 });

    const bal = await readOnChainPoints(w);
    if (bal != null && bal < STAKE) return res.status(402).json({ error: 'need_min_points', need: STAKE, have: bal });

    db.prepare(`INSERT INTO litcoin_daily (wallet, date, games_played) VALUES (?, ?, 1)
                ON CONFLICT(wallet, date) DO UPDATE SET games_played = games_played + 1`).run(w, today);

    const roundId    = crypto.randomBytes(16).toString('hex');
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const seedHash   = sha256(serverSeed);
    const cs         = String(clientSeed || crypto.randomBytes(8).toString('hex')).slice(0, 64);
    const now = Date.now();
    db.prepare(`INSERT INTO litcoin_rounds (round_id, wallet, server_seed, seed_hash, client_seed, stake, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(roundId, w, serverSeed, seedHash, cs, STAKE, now, now + ROUND_TTL_MS);

    const burnHash = await spendStake(w, STAKE);
    if (!burnHash) {
      db.prepare('UPDATE litcoin_rounds SET settled = 1 WHERE round_id = ?').run(roundId);
      return res.status(502).json({ error: 'stake_spend_failed' });
    }
    db.prepare(`INSERT INTO litcoin_ledger (wallet, round_id, delta, reason, tx_hash, ts)
                VALUES (?, ?, ?, 'entry', ?, ?)`).run(w, roundId, -STAKE, burnHash, now);

    const table = [];
    for (let n = 1; n <= MAX_STREAK; n++) table.push({ streak: n, multiplier: streakMultX100(n) / 100 });

    res.json({
      roundId, token: sign(roundId),
      seedHash, clientSeed: cs,
      stake: STAKE, maxStreak: MAX_STREAK,
      streakTable: table,
      perFlipMultiplier: PER_FLIP_X100 / 100,
      gamesLeft: Math.max(0, DAILY_LIMIT - (played + 1)), dailyLimit: DAILY_LIMIT,
      entryTxHash: burnHash,
    });
  } catch (e) { console.error('[/litcoinflip/start]', e.message); res.status(500).json({ error: 'start_failed' }); }
});

router.post('/flip', async (req, res) => {
  try {
    const { roundId, token, side, streak } = req.body || {};
    if (!roundId || !token) return res.status(400).json({ error: 'bad_request' });
    if (sign(roundId) !== token) return res.status(403).json({ error: 'bad_token' });
    const s = String(side || '').toLowerCase();
    if (s !== 'heads' && s !== 'tails') return res.status(400).json({ error: 'bad_side' });
    const n = Math.floor(Number(streak) || 1);
    if (n < 1 || n > MAX_STREAK) return res.status(400).json({ error: 'bad_streak' });

    const r = db.prepare('SELECT * FROM litcoin_rounds WHERE round_id = ?').get(roundId);
    if (!r) return res.status(404).json({ error: 'round_not_found' });
    if (r.settled) return res.status(409).json({ error: 'already_settled' });
    if (r.expires_at < Date.now()) {
      db.prepare('UPDATE litcoin_rounds SET settled = 1 WHERE round_id = ?').run(roundId);
      return res.status(410).json({ error: 'round_expired' });
    }

    const key = `${r.client_seed}:${s}:${n}`;
    const wantBit = s === 'heads' ? 0 : 1;
    const flips = [];
    let won = true;
    for (let i = 0; i < n; i++) {
      const b = flipBit(r.server_seed, key, i);
      flips.push(b);
      if (b !== wantBit) won = false;
    }
    const multX100 = won ? streakMultX100(n) : 0;
    const awarded = won ? Math.floor((r.stake * multX100) / 100) : 0;

    db.prepare(`UPDATE litcoin_rounds
                SET settled = 1, side = ?, streak = ?, flips_json = ?, won = ?, multiplier_x100 = ?, awarded = ?
                WHERE round_id = ?`).run(s, n, JSON.stringify(flips), won ? 1 : 0, multX100, awarded, roundId);

    let txHash = null;
    if (awarded > 0) {
      db.prepare(`INSERT INTO litcoin_ledger (wallet, round_id, delta, reason, ts)
                  VALUES (?, ?, ?, 'cashout', ?)`).run(r.wallet, roundId, awarded, Date.now());
      txHash = await awardPoints(r.wallet, awarded, `litcoinflip_${roundId.slice(0, 8)}`);
      if (txHash) db.prepare(`UPDATE litcoin_ledger SET tx_hash = ? WHERE round_id = ? AND reason = 'cashout'`).run(txHash, roundId);
    }

    res.json({
      ok: true, side: s, streak: n,
      flips: flips.map((b) => b === 0 ? 'heads' : 'tails'),
      won, multiplier: multX100 / 100,
      awarded, stake: r.stake,
      profit: awarded - r.stake,
      serverSeed: r.server_seed, seedHash: r.seed_hash, clientSeed: r.client_seed,
      txHash, explorerUrl: txHash ? `https://liteforge.explorer.caldera.xyz/tx/${txHash}` : null,
    });
  } catch (e) { console.error('[/litcoinflip/flip]', e.message); res.status(500).json({ error: 'flip_failed' }); }
});

module.exports = router;
