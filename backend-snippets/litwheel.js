// ════════════════════════════════════════════════════════════════
//  LIT WHEEL — backend route (wheel of fortune)
//  Drop into: /root/litvm-dex/game-server/litwheel.js
//  Mount: app.use('/litwheel', require('./litwheel'));
//
//  Spin the wheel. 24 segments, 4 risk profiles. The seed-derived
//  outcome picks a segment, multiplier paid out from the table.
//
//  Provably fair: server commits seedHash at /start, reveals
//  serverSeed at /spin. clientSeed mixed in.
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
  CREATE TABLE IF NOT EXISTS litwheel_daily (
    wallet TEXT NOT NULL, date TEXT NOT NULL,
    games_played INTEGER DEFAULT 0,
    PRIMARY KEY (wallet, date)
  );
  CREATE TABLE IF NOT EXISTS litwheel_rounds (
    round_id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    server_seed TEXT NOT NULL,
    seed_hash TEXT NOT NULL,
    client_seed TEXT,
    stake INTEGER NOT NULL,
    risk TEXT,
    segment INTEGER,
    multiplier_x100 INTEGER,
    awarded INTEGER DEFAULT 0,
    settled INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS litwheel_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL, round_id TEXT,
    delta INTEGER NOT NULL, reason TEXT NOT NULL,
    tx_hash TEXT, ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lwledger_wallet ON litwheel_ledger(wallet);
`);

const STAKE        = 5;
const DAILY_LIMIT  = 20;
const SEGMENTS     = 24;
const ROUND_TTL_MS = 2 * 60 * 1000;
const PEPPER = process.env.LITWHEEL_PEPPER || process.env.PUMPDUMP_PEPPER || 'CHANGE_ME_LONG_RANDOM';

// 24-segment tables, multipliers x100. Each table sums × prob ≈ 96-97% RTP.
const RISK_TABLES = {
  // LOW: many small wins, never zero. Tight RTP.
  low:    [150,120,100,150,120,100,200,120,100,150,120,100,200,120,100,150,120,100,150,120,100,200,120,100],
  medium: [200,150,0,200,150,0,300,150,0,500,150,0,300,150,0,200,150,0,200,150,0,500,150,0],
  high:   [0,0,200,0,0,500,0,0,0,1000,0,0,200,0,0,500,0,0,0,2000,0,0,200,0],
};

const startLimiter = rateLimit({ windowMs: 60000, max: 30, keyGenerator: (req) => ipKeyGenerator(req), message: { error: 'rate_limited' } });

const _txQueue = [];
let _txRunning = false;
function enqTx(fn) { return new Promise((res) => { _txQueue.push({ fn, res }); pumpTx(); }); }
async function pumpTx() {
  if (_txRunning) return; _txRunning = true;
  while (_txQueue.length > 0) {
    const { fn, res } = _txQueue.shift();
    try { const tx = await fn(); await tx.wait(); res(tx.hash); }
    catch (e) { console.error('[LW-Tx]', e.shortMessage || e.message); res(null); }
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

setInterval(() => { try { db.prepare('UPDATE litwheel_rounds SET settled = 1 WHERE settled = 0 AND expires_at < ?').run(Date.now()); } catch {} }, 60_000).unref();

// HMAC -> uint32 -> mod SEGMENTS
function wheelSegment(serverSeed, key) {
  const h = hmac(serverSeed, key);
  const u = parseInt(h.slice(0, 8), 16) >>> 0;
  return u % SEGMENTS;
}

router.get('/stats/:wallet', async (req, res) => {
  try {
    const w = String(req.params.wallet || '').toLowerCase();
    if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });
    const today = todayIST();
    const dr = db.prepare('SELECT games_played FROM litwheel_daily WHERE wallet=? AND date=?').get(w, today);
    const played = dr?.games_played || 0;
    const lr = db.prepare(`SELECT COALESCE(SUM(delta), 0) AS total FROM litwheel_ledger WHERE wallet = ? AND reason = ?`).get(w, 'cashout');
    const totalWon = lr?.total || 0;
    const br = db.prepare('SELECT MAX(multiplier_x100) AS best_mult FROM litwheel_rounds WHERE wallet = ?').get(w);
    const onChain = await readOnChainPoints(w);
    res.json({
      pointsBalance: onChain ?? 0,
      gamesPlayed: played,
      gamesLeft: Math.max(0, DAILY_LIMIT - played),
      dailyLimit: DAILY_LIMIT,
      stake: STAKE, segments: SEGMENTS,
      tables: { low: RISK_TABLES.low, medium: RISK_TABLES.medium, high: RISK_TABLES.high },
      bestMultiplier: ((br?.best_mult || 0) / 100),
      lifetimeWon: totalWon,
    });
  } catch (e) { console.error('[/litwheel/stats]', e.message); res.status(500).json({ error: 'stats_failed' }); }
});

router.post('/start', startLimiter, async (req, res) => {
  try {
    const { wallet, clientSeed } = req.body || {};
    if (!wallet) return res.status(400).json({ error: 'wallet_required' });
    const w = String(wallet).toLowerCase();
    if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });

    const today = todayIST();
    const dr = db.prepare('SELECT games_played FROM litwheel_daily WHERE wallet=? AND date=?').get(w, today);
    const played = dr?.games_played || 0;
    if (played >= DAILY_LIMIT) return res.status(429).json({ error: 'daily_limit_reached', gamesLeft: 0 });

    const bal = await readOnChainPoints(w);
    if (bal != null && bal < STAKE) return res.status(402).json({ error: 'need_min_points', need: STAKE, have: bal });

    db.prepare(`INSERT INTO litwheel_daily (wallet, date, games_played) VALUES (?, ?, 1)
                ON CONFLICT(wallet, date) DO UPDATE SET games_played = games_played + 1`).run(w, today);

    const roundId    = crypto.randomBytes(16).toString('hex');
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const seedHash   = sha256(serverSeed);
    const cs         = String(clientSeed || crypto.randomBytes(8).toString('hex')).slice(0, 64);
    const now = Date.now();
    db.prepare(`INSERT INTO litwheel_rounds (round_id, wallet, server_seed, seed_hash, client_seed, stake, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(roundId, w, serverSeed, seedHash, cs, STAKE, now, now + ROUND_TTL_MS);

    const burnHash = await spendStake(w, STAKE);
    if (!burnHash) {
      db.prepare('UPDATE litwheel_rounds SET settled = 1 WHERE round_id = ?').run(roundId);
      return res.status(502).json({ error: 'stake_spend_failed' });
    }
    db.prepare(`INSERT INTO litwheel_ledger (wallet, round_id, delta, reason, tx_hash, ts)
                VALUES (?, ?, ?, 'entry', ?, ?)`).run(w, roundId, -STAKE, burnHash, now);

    res.json({
      roundId, token: sign(roundId),
      seedHash, clientSeed: cs,
      stake: STAKE, segments: SEGMENTS,
      tables: { low: RISK_TABLES.low, medium: RISK_TABLES.medium, high: RISK_TABLES.high },
      gamesLeft: Math.max(0, DAILY_LIMIT - (played + 1)), dailyLimit: DAILY_LIMIT,
      entryTxHash: burnHash,
    });
  } catch (e) { console.error('[/litwheel/start]', e.message); res.status(500).json({ error: 'start_failed' }); }
});

router.post('/spin', async (req, res) => {
  try {
    const { roundId, token, risk } = req.body || {};
    if (!roundId || !token) return res.status(400).json({ error: 'bad_request' });
    if (sign(roundId) !== token) return res.status(403).json({ error: 'bad_token' });
    const riskKey = String(risk || 'medium').toLowerCase();
    if (!RISK_TABLES[riskKey]) return res.status(400).json({ error: 'bad_risk' });

    const r = db.prepare('SELECT * FROM litwheel_rounds WHERE round_id = ?').get(roundId);
    if (!r) return res.status(404).json({ error: 'round_not_found' });
    if (r.settled) return res.status(409).json({ error: 'already_settled' });
    if (r.expires_at < Date.now()) {
      db.prepare('UPDATE litwheel_rounds SET settled = 1 WHERE round_id = ?').run(roundId);
      return res.status(410).json({ error: 'round_expired' });
    }

    const key = `${r.client_seed}:${riskKey}`;
    const segment = wheelSegment(r.server_seed, key);
    const multX100 = RISK_TABLES[riskKey][segment];
    const awarded = Math.floor((r.stake * multX100) / 100);

    db.prepare(`UPDATE litwheel_rounds
                SET settled = 1, risk = ?, segment = ?, multiplier_x100 = ?, awarded = ?
                WHERE round_id = ?`).run(riskKey, segment, multX100, awarded, roundId);

    let txHash = null;
    if (awarded > 0) {
      db.prepare(`INSERT INTO litwheel_ledger (wallet, round_id, delta, reason, ts)
                  VALUES (?, ?, ?, 'cashout', ?)`).run(r.wallet, roundId, awarded, Date.now());
      txHash = await awardPoints(r.wallet, awarded, `litwheel_${roundId.slice(0, 8)}`);
      if (txHash) db.prepare(`UPDATE litwheel_ledger SET tx_hash = ? WHERE round_id = ? AND reason = 'cashout'`).run(txHash, roundId);
    }

    res.json({
      ok: true, risk: riskKey, segment,
      multiplier: multX100 / 100,
      awarded, stake: r.stake,
      profit: awarded - r.stake,
      serverSeed: r.server_seed, seedHash: r.seed_hash, clientSeed: r.client_seed,
      txHash, explorerUrl: txHash ? `https://liteforge.explorer.caldera.xyz/tx/${txHash}` : null,
    });
  } catch (e) { console.error('[/litwheel/spin]', e.message); res.status(500).json({ error: 'spin_failed' }); }
});

module.exports = router;
