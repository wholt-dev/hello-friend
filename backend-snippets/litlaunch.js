// ════════════════════════════════════════════════════════════════
//  LIT LAUNCH — backend route (space dodge + coin catch)
//  Drop into: /root/litvm-dex/game-server/litlaunch.js
//  Mount in server.js:
//      const litlaunch = require('./litlaunch');
//      app.use('/litlaunch', litlaunch);
//
//  Free-to-play vertical dodge arcade. Rocket flies upward, player
//  swipes left-right to dodge asteroids and catch coins. Each coin
//  caught = +1 PT. 3 lives — asteroid hit = -1 life. 3 hits = game
//  over. Speed grows with time so the cap is a soft ceiling.
//
//  Trust model: server holds a seed and is the source of truth for
//  the spawn schedule. Client generates the same schedule from the
//  seed, plays the run locally, and reports {score, hits, durationMs,
//  taps}. Server validates score against time budget + tap rate so a
//  bot cannot fake a high score without spending real time playing.
// ════════════════════════════════════════════════════════════════
const { ethers } = require("ethers");
const express = require('express');
const router = express.Router();
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const Database = require('better-sqlite3');
const crypto = require('crypto');
require('dotenv').config({ path: '../.env' });

// ── Shared chain wiring ────────────────────────────────────────
const _provider = new ethers.JsonRpcProvider(
  'https://liteforge.rpc.caldera.xyz/http',
  ethers.Network.from({ chainId: 4441, name: 'litvm' }),
  { staticNetwork: true, polling: false, timeout: 20000 }
);
const _wallet = new ethers.Wallet(process.env.PRIVATE_KEY, _provider);

const POINTS_ADDR = "0x18158eeF59Fcc7EE3dB4C7eB80f0B8B95Ec9E61c";
const POINTS_ABI = [
  "function recordQuestFor(address user, uint256 pts, string calldata questId) external",
  "function getPoints(address user) view returns (uint256 total, uint256 deployDaily, uint256 msgDaily)",
];
const _points = new ethers.Contract(POINTS_ADDR, POINTS_ABI, _wallet);

async function readOnChainPoints(wallet) {
  try {
    const [total] = await _points.getPoints(wallet);
    return Number(total);
  } catch {
    return null;
  }
}

// ── DB ────────────────────────────────────────────────────────
const db = new Database('./simple_game.db');
db.pragma('journal_mode = WAL');

// Reuse existing tables; the previous physics-trader version of
// this game used the same names. The columns we care about
// (session_id, wallet, server_seed, started_at, settled, awarded,
// fingerprint, expires_at) are identical so nothing breaks.
db.exec(`
  CREATE TABLE IF NOT EXISTS litlaunch_daily (
    wallet TEXT NOT NULL,
    date TEXT NOT NULL,
    games_played INTEGER DEFAULT 0,
    PRIMARY KEY (wallet, date)
  );
  CREATE TABLE IF NOT EXISTS litlaunch_sessions (
    session_id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    server_seed TEXT NOT NULL,
    stake INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    settled INTEGER DEFAULT 0,
    outcome TEXT,
    altitude INTEGER DEFAULT 0,
    multiplier_x100 INTEGER DEFAULT 0,
    awarded INTEGER DEFAULT 0,
    perfect INTEGER DEFAULT 0,
    fingerprint TEXT,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS litlaunch_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    session_id TEXT,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    tx_hash TEXT,
    ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_llledger_wallet ON litlaunch_ledger(wallet);
  CREATE TABLE IF NOT EXISTS litlaunch_bots (
    wallet TEXT PRIMARY KEY,
    flagged_at INTEGER NOT NULL,
    flags TEXT NOT NULL,
    severity INTEGER NOT NULL
  );
`);

// ── Config ────────────────────────────────────────────────────
const DAILY_LIMIT          = 5;
const MAX_LIVES            = 3;
const MAX_COINS_PER_GAME   = 50;     // hard cap — also the per-game payout ceiling
const MIN_MS_PER_COIN      = 800;    // each coin needs at least this much wall time
const MIN_MS_PER_TAP       = 80;     // movement events finer than this are bots
const MAX_TAPS             = 600;
const MIN_GAME_MS          = 3000;   // 3-2-1 countdown alone is ~3s
const MAX_GAME_DURATION_MS = 5 * 60 * 1000;
const SESSION_TTL_MS       = 10 * 60 * 1000;

const PEPPER = process.env.LITLAUNCH_PEPPER || process.env.PUMPDUMP_PEPPER || 'CHANGE_ME_LONG_RANDOM';

const startLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  message: { error: 'Too many requests. Please wait a minute.' },
  keyGenerator: (req) => ipKeyGenerator(req)
});

// ── Reward queue (sequential, mirrors littower / pumpdump) ───
const _pointsQueue = [];
let _pointsRunning = false;
function awardPoints(to, pts, questId) {
  return new Promise((resolve) => {
    _pointsQueue.push({ to, pts, questId, resolve });
    processPointsQueue();
  });
}
async function processPointsQueue() {
  if (_pointsRunning) return;
  _pointsRunning = true;
  while (_pointsQueue.length > 0) {
    const { to, pts, questId, resolve } = _pointsQueue.shift();
    try {
      const tx = await _points.recordQuestFor(to, BigInt(pts), questId);
      await tx.wait();
      console.log(`[LL-Reward] +${pts} -> ${to.slice(0, 8)} tx=${tx.hash.slice(0, 10)}`);
      resolve(tx.hash);
    } catch (e) {
      console.error('[LL-Reward] failed:', e.shortMessage || e.message);
      resolve(null);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  _pointsRunning = false;
}

// ── Helpers ───────────────────────────────────────────────────
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const hmac   = (key, msg) => crypto.createHmac('sha256', String(key)).update(String(msg)).digest('hex');
const sign   = (sessionId) => hmac(PEPPER, sessionId);

function todayIST() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

setInterval(() => {
  try {
    db.prepare('UPDATE litlaunch_sessions SET settled = 1 WHERE settled = 0 AND expires_at < ?')
      .run(Date.now());
  } catch {}
}, 60_000).unref();

// ── Validate the run report ──────────────────────────────────
function validateRun(report, startedAt) {
  if (!report || typeof report !== 'object') return { ok: false, reason: 'bad_report' };

  const score    = Math.max(0, Number(report.score || 0));
  const hits     = Math.max(0, Number(report.hits || 0));
  const duration = Math.max(0, Number(report.durationMs || 0));
  const taps     = Array.isArray(report.taps) ? report.taps : [];

  if (hits > MAX_LIVES) return { ok: false, reason: 'too_many_hits' };
  if (score > MAX_COINS_PER_GAME) return { ok: false, reason: 'over_cap' };
  if (duration < MIN_GAME_MS) return { ok: false, reason: 'session_too_short' };
  if (duration > MAX_GAME_DURATION_MS) return { ok: false, reason: 'session_too_long' };

  // Score must fit in the time budget (humanly impossible to catch
  // 50 coins in 1 second).
  const minTimeForScore = Math.max(0, score) * MIN_MS_PER_COIN;
  if (duration < minTimeForScore) return { ok: false, reason: 'score_too_fast' };

  // Movement-tape sanity.
  if (taps.length > MAX_TAPS) return { ok: false, reason: 'too_many_taps' };
  let prevT = -Infinity;
  for (let i = 0; i < taps.length; i++) {
    const t = Number(taps[i]?.t);
    if (!Number.isFinite(t) || t < 0 || t > duration) {
      return { ok: false, reason: 'bad_tap_time' };
    }
    if (t < prevT) return { ok: false, reason: 'tap_out_of_order' };
    if (i > 0 && t - prevT < MIN_MS_PER_TAP) {
      return { ok: false, reason: 'tap_too_fast' };
    }
    prevT = t;
  }

  // Soft signal: extremely uniform tap gaps over 12+ samples = bot.
  if (taps.length >= 12) {
    const gaps = [];
    for (let i = 1; i < taps.length; i++) gaps.push(taps[i].t - taps[i-1].t);
    const mean = gaps.reduce((a,b) => a+b, 0) / gaps.length;
    const std  = Math.sqrt(gaps.reduce((s,g) => s + (g-mean)**2, 0) / gaps.length);
    if (std < 14) return { ok: false, reason: 'tap_too_uniform' };
  }

  return { ok: true, score: Math.min(score, MAX_COINS_PER_GAME), hits, duration };
}

// ════════════════════════════════════════════════════════════════
//  ROUTES
// ════════════════════════════════════════════════════════════════
router.get('/stats/:wallet', async (req, res) => {
  try {
    const w = String(req.params.wallet || '').toLowerCase();
    if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });

    const today = todayIST();
    const dailyRow = db.prepare(
      'SELECT games_played FROM litlaunch_daily WHERE wallet=? AND date=?'
    ).get(w, today);
    const played = dailyRow?.games_played || 0;

    const ledgerRow = db.prepare(
      'SELECT COALESCE(SUM(delta), 0) AS total FROM litlaunch_ledger WHERE wallet = ? AND reason = ?'
    ).get(w, 'reward');
    const lifetimeWon = ledgerRow?.total || 0;

    // Best score reuses the existing `awarded` column.
    const bestRow = db.prepare(
      'SELECT MAX(awarded) AS best_score FROM litlaunch_sessions WHERE wallet = ?'
    ).get(w);
    const bestScore = Number(bestRow?.best_score || 0);

    const onChain = await readOnChainPoints(w);

    res.json({
      pointsBalance:   onChain ?? 0,
      gamesPlayed:     played,
      gamesLeft:       Math.max(0, DAILY_LIMIT - played),
      dailyLimit:      DAILY_LIMIT,
      maxLives:        MAX_LIVES,
      maxCoinsPerGame: MAX_COINS_PER_GAME,
      perCoinPts:      1,
      bestScore,
      lifetimeWon,
      entryCost:       0,
    });
  } catch (e) {
    console.error('[/litlaunch/stats]', e.message);
    res.status(500).json({ error: 'stats_failed' });
  }
});

router.post('/start', startLimiter, async (req, res) => {
  try {
    const { wallet, fingerprint } = req.body || {};
    if (!wallet) return res.status(400).json({ error: 'wallet_required' });
    const w = String(wallet).toLowerCase();
    if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });

    const banned = db.prepare(
      'SELECT 1 FROM litlaunch_bots WHERE wallet = ? AND flagged_at > ?'
    ).get(w, Date.now() - 24 * 3600 * 1000);
    if (banned) return res.status(403).json({ error: 'wallet_banned_24h' });

    const today = todayIST();
    const dailyRow = db.prepare(
      'SELECT games_played FROM litlaunch_daily WHERE wallet=? AND date=?'
    ).get(w, today);
    const played = dailyRow?.games_played || 0;
    if (played >= DAILY_LIMIT) {
      return res.status(429).json({ error: 'daily_limit_reached', gamesLeft: 0 });
    }

    db.prepare(`
      INSERT INTO litlaunch_daily (wallet, date, games_played) VALUES (?, ?, 1)
      ON CONFLICT(wallet, date) DO UPDATE SET games_played = games_played + 1
    `).run(w, today);

    const sessionId  = crypto.randomBytes(16).toString('hex');
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    db.prepare(`
      INSERT INTO litlaunch_sessions
        (session_id, wallet, server_seed, stake, started_at, fingerprint, expires_at)
      VALUES (?, ?, 0, ?, ?, ?, ?)
    `).run(sessionId, w, serverSeed, now, fingerprint || null, now + SESSION_TTL_MS);

    res.json({
      sessionId,
      token:           sign(sessionId),
      serverSeed,                       // shared so client can mirror spawn schedule
      maxLives:        MAX_LIVES,
      maxCoins:        MAX_COINS_PER_GAME,
      perCoinPts:      1,
      gamesLeft:       Math.max(0, DAILY_LIMIT - (played + 1)),
      dailyLimit:      DAILY_LIMIT,
    });
  } catch (e) {
    console.error('[/litlaunch/start]', e.message);
    res.status(500).json({ error: 'start_failed' });
  }
});

router.post('/end', async (req, res) => {
  try {
    const { sessionId, token, score, hits, durationMs, taps } = req.body || {};
    if (!sessionId || !token) return res.status(400).json({ error: 'bad_request' });
    if (sign(sessionId) !== token) return res.status(403).json({ error: 'bad_token' });

    const s = db.prepare('SELECT * FROM litlaunch_sessions WHERE session_id = ?').get(sessionId);
    if (!s)              return res.status(404).json({ error: 'session_not_found' });
    if (s.settled)       return res.status(409).json({ error: 'already_settled' });
    if (s.expires_at < Date.now()) {
      db.prepare('UPDATE litlaunch_sessions SET settled = 1 WHERE session_id = ?').run(sessionId);
      return res.status(410).json({ error: 'session_expired' });
    }

    const v = validateRun({ score, hits, durationMs, taps }, s.started_at);
    if (!v.ok) {
      db.prepare('UPDATE litlaunch_sessions SET settled = 1 WHERE session_id = ?').run(sessionId);
      db.prepare(`
        INSERT OR REPLACE INTO litlaunch_bots (wallet, flagged_at, flags, severity)
        VALUES (?, ?, ?, ?)
      `).run(s.wallet, Date.now(), JSON.stringify([v.reason]), 70);
      return res.status(403).json({ error: 'invalid_run', reason: v.reason });
    }

    const awarded = v.score;
    const outcome = v.hits >= MAX_LIVES ? 'gameover' : 'survived';

    db.prepare(
      'UPDATE litlaunch_sessions SET settled = 1, outcome = ?, altitude = ?, multiplier_x100 = ?, awarded = ? WHERE session_id = ?'
    ).run(outcome, v.score, v.hits, awarded, sessionId);

    let txHash = null;
    if (awarded > 0) {
      db.prepare(`
        INSERT INTO litlaunch_ledger (wallet, session_id, delta, reason, ts)
        VALUES (?, ?, ?, 'reward', ?)
      `).run(s.wallet, sessionId, awarded, Date.now());

      txHash = await awardPoints(s.wallet, awarded, `litlaunch_${sessionId.slice(0, 8)}`);
      if (txHash) {
        db.prepare(
          'UPDATE litlaunch_ledger SET tx_hash = ? WHERE session_id = ? AND reason = ?'
        ).run(txHash, sessionId, 'reward');
      }
    }

    const bestRow = db.prepare(
      'SELECT MAX(awarded) AS best_score FROM litlaunch_sessions WHERE wallet = ?'
    ).get(s.wallet);

    res.json({
      ok:           true,
      outcome,
      score:        v.score,
      hits:         v.hits,
      awarded,
      bestScore:    Number(bestRow?.best_score || 0),
      txHash,
      explorerUrl:  txHash ? `https://liteforge.explorer.caldera.xyz/tx/${txHash}` : null,
    });
  } catch (e) {
    console.error('[/litlaunch/end]', e.message);
    res.status(500).json({ error: 'end_failed' });
  }
});

router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT wallet, MAX(awarded) AS best_score
      FROM litlaunch_sessions
      WHERE settled = 1
      GROUP BY wallet
      ORDER BY best_score DESC
      LIMIT 25
    `).all();
    res.json({ leaderboard: rows });
  } catch (e) {
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});

module.exports = router;
