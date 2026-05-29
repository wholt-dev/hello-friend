// ════════════════════════════════════════════════════════════════
//  LIT TOWER — backend route (mirrors pumpdump.js shape)
//  Drop into: /root/litvm-dex/game-server/littower.js
//  Mount in server.js:
//      const littower = require('./littower');
//      app.use('/littower', littower);
//
//  Free-to-play 1-tap stacker. No entry cost. +1 PT per correct
//  stack, capped at MAX_STACKS_PER_GAME per game and DAILY_LIMIT
//  games per day. Reward credited on /end via recordQuestFor.
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

const POINTS_ADDR = "0x526B0629C81d3314929dB8166372F792F3da3419";
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

db.exec(`
  CREATE TABLE IF NOT EXISTS littower_daily (
    wallet TEXT NOT NULL,
    date TEXT NOT NULL,
    games_played INTEGER DEFAULT 0,
    PRIMARY KEY (wallet, date)
  );
  CREATE TABLE IF NOT EXISTS littower_sessions (
    session_id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    server_seed TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    settled INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    awarded INTEGER DEFAULT 0,
    fingerprint TEXT,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS littower_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    session_id TEXT,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    tx_hash TEXT,
    ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ltledger_wallet ON littower_ledger(wallet);
  CREATE TABLE IF NOT EXISTS littower_bots (
    wallet TEXT PRIMARY KEY,
    flagged_at INTEGER NOT NULL,
    flags TEXT NOT NULL,
    severity INTEGER NOT NULL
  );
`);

// ── Config ────────────────────────────────────────────────────
const DAILY_LIMIT          = 5;
const MAX_STACKS_PER_GAME  = 100;    // hard cap on per-game reward
const MIN_TAP_GAP_MS       = 220;    // human floor between taps
const MAX_GAME_DURATION_MS = 10 * 60 * 1000;
const SESSION_TTL_MS       = 10 * 60 * 1000;
const PEPPER = process.env.LITTOWER_PEPPER || process.env.PUMPDUMP_PEPPER || 'CHANGE_ME_LONG_RANDOM';

const startLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  message: { error: 'Too many requests. Please wait a minute.' },
  keyGenerator: (req) => ipKeyGenerator(req)
});

// ── Reward queue (sequential, mirrors pumpdump) ──────────────
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
      console.log(`[LT-Reward] +${pts} -> ${to.slice(0, 8)} tx=${tx.hash.slice(0, 10)}`);
      resolve(tx.hash);
    } catch (e) {
      console.error('[LT-Reward] failed:', e.shortMessage || e.message);
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

// Cleanup expired sessions
setInterval(() => {
  try {
    db.prepare('UPDATE littower_sessions SET settled = 1 WHERE settled = 0 AND expires_at < ?')
      .run(Date.now());
  } catch {}
}, 60_000).unref();

// ── Anti-cheat: validate the tap tape ─────────────────────────
function validateTaps(taps, startedAt) {
  if (!Array.isArray(taps)) return { ok: false, reason: 'taps_not_array' };
  if (taps.length === 0) return { ok: true, height: 0, flags: [] };
  if (taps.length > MAX_STACKS_PER_GAME * 2) return { ok: false, reason: 'too_many_taps' };

  const flags = [];
  let prev = -Infinity;
  let minGap = Infinity;
  let totalGap = 0;

  for (let i = 0; i < taps.length; i++) {
    const t = Number(taps[i]?.t);
    if (!Number.isFinite(t) || t < 0) return { ok: false, reason: 'bad_tap_time' };
    if (t < prev) return { ok: false, reason: 'tap_out_of_order' };
    const gap = t - prev;
    if (i > 0) {
      if (gap < MIN_TAP_GAP_MS) return { ok: false, reason: 'tap_too_fast' };
      minGap = Math.min(minGap, gap);
      totalGap += gap;
    }
    prev = t;
  }

  // Total play time bound check.
  const elapsed = Date.now() - startedAt;
  if (elapsed > MAX_GAME_DURATION_MS) return { ok: false, reason: 'session_too_long' };
  if (taps.length > 1 && elapsed < (taps.length - 1) * MIN_TAP_GAP_MS) {
    return { ok: false, reason: 'session_too_short' };
  }

  // Soft bot signals.
  if (taps.length >= 6) {
    const meanGap = totalGap / (taps.length - 1);
    const variance = taps.reduce((s, t, i) => {
      if (i === 0) return s;
      const g = t.t - taps[i - 1].t;
      return s + (g - meanGap) ** 2;
    }, 0) / (taps.length - 1);
    const std = Math.sqrt(variance);
    if (std < 18) flags.push('gap_too_consistent');
  }

  return { ok: true, height: taps.length, flags };
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
      'SELECT games_played FROM littower_daily WHERE wallet=? AND date=?'
    ).get(w, today);
    const played = dailyRow?.games_played || 0;

    const ledgerRow = db.prepare(
      'SELECT COALESCE(SUM(delta), 0) AS total FROM littower_ledger WHERE wallet = ? AND reason = ?'
    ).get(w, 'reward');
    const lifetimeWon = ledgerRow?.total || 0;

    const bestRow = db.prepare(
      'SELECT MAX(height) AS best_height FROM littower_sessions WHERE wallet = ?'
    ).get(w);

    const onChain = await readOnChainPoints(w);

    res.json({
      pointsBalance:    onChain ?? 0,
      gamesPlayed:      played,
      gamesLeft:        Math.max(0, DAILY_LIMIT - played),
      dailyLimit:       DAILY_LIMIT,
      maxPerGame:       MAX_STACKS_PER_GAME,
      perCorrectPts:    1,
      bestHeight:       bestRow?.best_height || 0,
      lifetimeWon,
      entryCost:        0,
    });
  } catch (e) {
    console.error('[/littower/stats]', e.message);
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
      'SELECT 1 FROM littower_bots WHERE wallet = ? AND flagged_at > ?'
    ).get(w, Date.now() - 24 * 3600 * 1000);
    if (banned) return res.status(403).json({ error: 'wallet_banned_24h' });

    const today = todayIST();
    const dailyRow = db.prepare(
      'SELECT games_played FROM littower_daily WHERE wallet=? AND date=?'
    ).get(w, today);
    const played = dailyRow?.games_played || 0;
    if (played >= DAILY_LIMIT) {
      return res.status(429).json({ error: 'daily_limit_reached', gamesLeft: 0 });
    }

    db.prepare(`
      INSERT INTO littower_daily (wallet, date, games_played) VALUES (?, ?, 1)
      ON CONFLICT(wallet, date) DO UPDATE SET games_played = games_played + 1
    `).run(w, today);

    const sessionId  = crypto.randomBytes(16).toString('hex');
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    db.prepare(`
      INSERT INTO littower_sessions
        (session_id, wallet, server_seed, started_at, fingerprint, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, w, serverSeed, now, fingerprint || null, now + SESSION_TTL_MS);

    res.json({
      sessionId,
      token:           sign(sessionId),
      serverSeed,
      maxStacks:       MAX_STACKS_PER_GAME,
      perCorrectPts:   1,
      gamesLeft:       Math.max(0, DAILY_LIMIT - (played + 1)),
      dailyLimit:      DAILY_LIMIT,
    });
  } catch (e) {
    console.error('[/littower/start]', e.message);
    res.status(500).json({ error: 'start_failed' });
  }
});

router.post('/end', async (req, res) => {
  try {
    const { sessionId, token, taps } = req.body || {};
    if (!sessionId || !token) return res.status(400).json({ error: 'bad_request' });
    if (sign(sessionId) !== token) return res.status(403).json({ error: 'bad_token' });

    const s = db.prepare('SELECT * FROM littower_sessions WHERE session_id = ?').get(sessionId);
    if (!s)              return res.status(404).json({ error: 'session_not_found' });
    if (s.settled)       return res.status(409).json({ error: 'already_settled' });
    if (s.expires_at < Date.now()) {
      db.prepare('UPDATE littower_sessions SET settled = 1 WHERE session_id = ?').run(sessionId);
      return res.status(410).json({ error: 'session_expired' });
    }

    const v = validateTaps(taps, s.started_at);
    if (!v.ok) {
      db.prepare('UPDATE littower_sessions SET settled = 1 WHERE session_id = ?').run(sessionId);
      db.prepare(`
        INSERT OR REPLACE INTO littower_bots (wallet, flagged_at, flags, severity)
        VALUES (?, ?, ?, ?)
      `).run(s.wallet, Date.now(), JSON.stringify([v.reason]), 70);
      return res.status(403).json({ error: 'invalid_run', reason: v.reason });
    }

    const awarded = Math.max(0, Math.min(MAX_STACKS_PER_GAME, v.height));

    db.prepare(
      'UPDATE littower_sessions SET settled = 1, height = ?, awarded = ? WHERE session_id = ?'
    ).run(v.height, awarded, sessionId);

    if (awarded > 0) {
      db.prepare(`
        INSERT INTO littower_ledger (wallet, session_id, delta, reason, ts)
        VALUES (?, ?, ?, 'reward', ?)
      `).run(s.wallet, sessionId, awarded, Date.now());

      awardPoints(s.wallet, awarded, `littower_${sessionId.slice(0, 8)}`)
        .then((hash) => {
          if (hash) {
            db.prepare(
              'UPDATE littower_ledger SET tx_hash = ? WHERE session_id = ? AND reason = ?'
            ).run(hash, sessionId, 'reward');
          }
        });
    }

    const bestRow = db.prepare(
      'SELECT MAX(height) AS best_height FROM littower_sessions WHERE wallet = ?'
    ).get(s.wallet);

    res.json({
      ok:           true,
      height:       v.height,
      awarded,
      capped:       v.height > MAX_STACKS_PER_GAME,
      bestHeight:   bestRow?.best_height || 0,
      flags:        v.flags,
    });
  } catch (e) {
    console.error('[/littower/end]', e.message);
    res.status(500).json({ error: 'end_failed' });
  }
});

router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT wallet, MAX(height) AS best_height
      FROM littower_sessions
      WHERE settled = 1
      GROUP BY wallet
      ORDER BY best_height DESC
      LIMIT 25
    `).all();
    res.json({ leaderboard: rows });
  } catch (e) {
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});

module.exports = router;
