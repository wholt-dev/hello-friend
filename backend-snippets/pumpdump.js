// ════════════════════════════════════════════════════════════════
//  PUMP OR DUMP — backend route (mirrors mathslash_simple.js)
//  Drop into: /root/litvm-dex/game-server/pumpdump.js
//  Mount in server.js:
//      const pumpdump = require('./pumpdump');
//      app.use('/pumpdump', pumpdump);
//  Self-contained: own queue, own SQLite tables, own rate limiter.
// ════════════════════════════════════════════════════════════════
const { ethers } = require("ethers");
const express = require('express');
const router = express.Router();
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const Database = require('better-sqlite3');
const crypto = require('crypto');
require('dotenv').config({ path: '../.env' });

// ── Shared chain wiring (same as mathslash_simple.js) ───────
const _provider = new ethers.JsonRpcProvider(
  'https://liteforge.rpc.caldera.xyz/http',
  ethers.Network.from({ chainId: 4441, name: 'litvm' }),
  { staticNetwork: true, polling: false, timeout: 20000 }
);
const _wallet = new ethers.Wallet(process.env.PRIVATE_KEY, _provider);

const POINTS_ADDR = "0x526B0629C81d3314929dB8166372F792F3da3419";
const POINTS_ABI = [
  "function recordQuestFor(address user, uint256 pts, string calldata questId) external",
  "function balanceOf(address user) view returns (uint256)",
];
const _points = new ethers.Contract(POINTS_ADDR, POINTS_ABI, _wallet);

async function readOnChainPoints(wallet) {
  try {
    const b = await _points.balanceOf(wallet);
    return Number(b);
  } catch {
    return null;
  }
}

// ── Same DB as math-slash (simple_game.db) ───────────────────
const db = new Database('./simple_game.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS pumpdump_daily (
    wallet TEXT NOT NULL,
    date TEXT NOT NULL,
    games_played INTEGER DEFAULT 0,
    PRIMARY KEY (wallet, date)
  );
  CREATE TABLE IF NOT EXISTS pumpdump_sessions (
    session_id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    server_seed TEXT NOT NULL,
    nonce INTEGER DEFAULT 0,
    pot INTEGER DEFAULT 100,
    streak INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    wrong_count INTEGER DEFAULT 0,
    increment INTEGER NOT NULL,
    round_time_ms INTEGER NOT NULL,
    state_json TEXT NOT NULL,
    fingerprint TEXT,
    settled INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pumpdump_decisions (
    session_id TEXT NOT NULL,
    nonce INTEGER NOT NULL,
    guess TEXT NOT NULL,
    actual TEXT NOT NULL,
    rt INTEGER NOT NULL,
    pe INTEGER DEFAULT 0,
    ent REAL DEFAULT 0,
    correct INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    PRIMARY KEY (session_id, nonce)
  );
  CREATE TABLE IF NOT EXISTS pumpdump_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    session_id TEXT,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    tx_hash TEXT,
    ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pdledger_wallet ON pumpdump_ledger(wallet);
  CREATE TABLE IF NOT EXISTS pumpdump_bots (
    wallet TEXT PRIMARY KEY,
    flagged_at INTEGER NOT NULL,
    flags TEXT NOT NULL,
    severity INTEGER NOT NULL
  );
`);

// ── Config ───────────────────────────────────────────────────
const ENTRY_COST       = 100;
const DAILY_LIMIT      = 5;
const SESSION_TTL_MS   = 5 * 60 * 1000;
const BASE_ROUND_MS    = 8000;
const POW_DIFFICULTY   = 4;
const TIER_INC         = [10, 12, 14, 16];
const TIER_TIME_BONUS  = [0, 1000, 2000, 3000];
const PEPPER = process.env.PUMPDUMP_PEPPER || 'CHANGE_ME_LONG_RANDOM';

const startLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests. Please wait a minute.' },
  keyGenerator: (req) => ipKeyGenerator(req)
});

// ── Reward queue (mirrors math-slash _pointsQueue) ───────────
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
      console.log(`[PD-Reward] +${pts} -> ${to.slice(0, 8)} tx=${tx.hash.slice(0, 10)}`);
      resolve(tx.hash);
    } catch (e) {
      console.error('[PD-Reward] failed:', e.shortMessage || e.message);
      resolve(null);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  _pointsRunning = false;
}

// ── Helpers ──────────────────────────────────────────────────
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const hmac   = (key, msg) => crypto.createHmac('sha256', String(key)).update(String(msg)).digest('hex');
const sign   = (sessionId) => hmac(PEPPER, sessionId);

function todayIST() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

// ── Provably-fair candle generator (same as frontend demo) ──
function nextCandle(serverSeed, sessionId, nonce, prevState) {
  const h = hmac(serverSeed, `${sessionId}:${nonce}`);
  const u = (s) => parseInt(h.slice(s, s + 8), 16) / 0xffffffff;
  const r1 = u(0), r2 = u(8), r3 = u(16), r4 = u(24), r5 = u(32);

  let trend = prevState.trend;
  if (r5 < 0.08) trend = (u(40) - 0.5) * 2;
  else trend = Math.max(-1, Math.min(1, trend + (r5 - 0.5) * 0.2));

  const greenProb = 0.5 + trend * 0.3;
  const goingUp = r1 < greenProb;
  const dir = goingUp ? 'up' : 'down';
  const last = prevState.lastClose;
  const range = last * (0.005 + r2 * 0.025);
  const move = range * (0.4 + r2 * 0.6);
  const c = goingUp ? last + move : last - move;
  const high = Math.max(last, c) + r3 * range * 0.3;
  const low  = Math.min(last, c) - r4 * range * 0.3;

  return {
    candle: { dir, o: last, c, h: high, l: low },
    state: { trend, lastClose: c },
  };
}

function buildInitialChart(serverSeed, sessionId, count = 8) {
  let state = { trend: (Math.random() - 0.5) * 1.4, lastClose: 100 };
  const out = [];
  for (let n = 1; n <= count; n++) {
    const r = nextCandle(serverSeed, sessionId, -n, state);
    out.push(r.candle);
    state = r.state;
  }
  return { candles: out, state };
}

// ── Anti-bot ─────────────────────────────────────────────────
const _challenges = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [c, x] of _challenges) if (now - x.ts > 60_000) _challenges.delete(c);
}, 30_000).unref();

function verifyPow(challenge, nonce) {
  if (!challenge || nonce == null) return false;
  if (!_challenges.has(challenge)) return false;
  const h = sha256(`${challenge}:${nonce}`);
  return h.startsWith('0'.repeat(POW_DIFFICULTY));
}

function analyzeTelemetry(sessionId) {
  const rows = db.prepare(
    'SELECT rt, pe, ent FROM pumpdump_decisions WHERE session_id = ? ORDER BY nonce'
  ).all(sessionId);
  if (!rows.length) return { allow: true, flags: [], severity: 0 };

  const rts = rows.map(r => r.rt);
  const min = Math.min(...rts);
  const max = Math.max(...rts);
  const mean = rts.reduce((a, b) => a + b, 0) / rts.length;
  const variance = rts.reduce((s, r) => s + (r - mean) ** 2, 0) / rts.length;
  const std = Math.sqrt(variance);

  const flags = [];
  let severity = 0;
  if (min < 150)                                { flags.push('rt_too_fast');         severity += 60; }
  if (rows.length >= 5 && std < 25)             { flags.push('rt_too_consistent');   severity += 35; }
  if (rows.length >= 8 && (max - min) < 80)     { flags.push('rt_too_uniform');      severity += 25; }
  const lowEnt = rows.filter(r => r.ent < 0.04 && r.pe > 8).length;
  if (lowEnt / rows.length > 0.6)               { flags.push('low_pointer_entropy'); severity += 30; }

  return { allow: severity < 60, flags, severity: Math.min(100, severity) };
}

// Cleanup expired sessions every minute
setInterval(() => {
  try {
    db.prepare('UPDATE pumpdump_sessions SET settled = 1 WHERE settled = 0 AND expires_at < ?')
      .run(Date.now());
  } catch {}
}, 60_000).unref();

// ════════════════════════════════════════════════════════════════
//  ROUTES — mounted under /pumpdump
// ════════════════════════════════════════════════════════════════
router.get('/stats/:wallet', async (req, res) => {
  try {
    const w = String(req.params.wallet || '').toLowerCase();
    if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });

    const today = todayIST();
    const dailyRow = db.prepare(
      'SELECT games_played FROM pumpdump_daily WHERE wallet=? AND date=?'
    ).get(w, today);
    const played = dailyRow?.games_played || 0;

    const ledgerRow = db.prepare(
      'SELECT COALESCE(SUM(delta), 0) AS total FROM pumpdump_ledger WHERE wallet = ? AND reason = ?'
    ).get(w, 'cashout');
    const lifetimeWon = ledgerRow?.total || 0;

    const bestRow = db.prepare(`
      SELECT MAX(pot) AS best_pot, MAX(streak) AS best_streak
      FROM pumpdump_sessions WHERE wallet = ?
    `).get(w);

    const onChain = await readOnChainPoints(w);

    let nftTier = 0;
    try {
      const tierRow = db.prepare(
        'SELECT nft_tier FROM user_meta WHERE wallet = ?'
      ).get(w);
      nftTier = Number(tierRow?.nft_tier || 0);
    } catch {}

    res.json({
      nftTier,
      pointsBalance: onChain ?? 0,
      gamesPlayed:   played,
      gamesLeft:     Math.max(0, DAILY_LIMIT - played),
      dailyLimit:    DAILY_LIMIT,
      increment:     TIER_INC[nftTier] || 10,
      roundTimeMs:   BASE_ROUND_MS + (TIER_TIME_BONUS[nftTier] || 0),
      bestPot:       bestRow?.best_pot || 0,
      bestStreak:    bestRow?.best_streak || 0,
      pumpdumpBestPot:    bestRow?.best_pot || 0,
      pumpdumpBestStreak: bestRow?.best_streak || 0,
      lifetimeWon,
      entryCost: ENTRY_COST,
    });
  } catch (e) {
    console.error('[/pumpdump/stats]', e.message);
    res.status(500).json({ error: 'stats_failed' });
  }
});

router.post('/challenge', startLimiter, (req, res) => {
  const { wallet, fingerprint } = req.body || {};
  if (!wallet) return res.status(400).json({ error: 'wallet_required' });
  const challenge = crypto.randomBytes(16).toString('hex');
  _challenges.set(challenge, { wallet: String(wallet).toLowerCase(), fp: fingerprint, ts: Date.now() });
  res.json({ challenge, difficulty: POW_DIFFICULTY });
});

router.post('/start', startLimiter, async (req, res) => {
  try {
    const { wallet, fingerprint, powChallenge, powNonce } = req.body || {};
    if (!wallet) return res.status(400).json({ error: 'wallet_required' });
    const w = String(wallet).toLowerCase();

    if (powChallenge) {
      if (!verifyPow(powChallenge, powNonce)) {
        return res.status(403).json({ error: 'pow_failed' });
      }
      _challenges.delete(powChallenge);
    }

    const banned = db.prepare(
      'SELECT 1 FROM pumpdump_bots WHERE wallet = ? AND flagged_at > ?'
    ).get(w, Date.now() - 24 * 3600 * 1000);
    if (banned) return res.status(403).json({ error: 'wallet_banned_24h' });

    const today = todayIST();
    const dailyRow = db.prepare(
      'SELECT games_played FROM pumpdump_daily WHERE wallet=? AND date=?'
    ).get(w, today);
    const played = dailyRow?.games_played || 0;
    if (played >= DAILY_LIMIT) {
      return res.status(429).json({ error: 'daily_limit_reached', gamesLeft: 0 });
    }

    const onChain = await readOnChainPoints(w);
    if (onChain != null && onChain < ENTRY_COST) {
      return res.status(402).json({ error: 'need_min_points', need: ENTRY_COST, have: onChain });
    }

    let nftTier = 0;
    try {
      const r = db.prepare('SELECT nft_tier FROM user_meta WHERE wallet = ?').get(w);
      nftTier = Number(r?.nft_tier || 0);
    } catch {}
    const increment = TIER_INC[nftTier] || 10;
    const roundTimeMs = BASE_ROUND_MS + (TIER_TIME_BONUS[nftTier] || 0);

    db.prepare(`
      INSERT INTO pumpdump_daily (wallet, date, games_played) VALUES (?, ?, 1)
      ON CONFLICT(wallet, date) DO UPDATE SET games_played = games_played + 1
    `).run(w, today);

    const sessionId  = crypto.randomBytes(16).toString('hex');
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const { candles, state } = buildInitialChart(serverSeed, sessionId, 8);
    const now = Date.now();

    db.prepare(`
      INSERT INTO pumpdump_sessions
        (session_id, wallet, server_seed, nonce, pot, streak, increment, round_time_ms,
         state_json, fingerprint, created_at, expires_at)
      VALUES (?, ?, ?, 0, ?, 0, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, w, serverSeed, ENTRY_COST, increment, roundTimeMs,
           JSON.stringify(state), fingerprint || '', now, now + SESSION_TTL_MS);

    db.prepare(`
      INSERT INTO pumpdump_ledger (wallet, session_id, delta, reason, ts)
      VALUES (?, ?, ?, 'entry_virtual', ?)
    `).run(w, sessionId, -ENTRY_COST, now);

    res.json({
      sessionId,
      token:          sign(sessionId),
      nonce:          0,
      candles,
      pot:            ENTRY_COST,
      increment,
      roundTimeMs,
      serverSeedHash: sha256(serverSeed),
      gamesLeft:      DAILY_LIMIT - (played + 1),
    });
  } catch (e) {
    console.error('[/pumpdump/start]', e.message);
    res.status(500).json({ error: 'start_failed' });
  }
});

router.post('/play', async (req, res) => {
  try {
    const { sessionId, token, nonce, guess, telemetry } = req.body || {};
    if (!sessionId || !token) return res.status(400).json({ error: 'bad_request' });
    if (token !== sign(sessionId)) return res.status(403).json({ error: 'bad_token' });
    if (guess !== 'up' && guess !== 'down') return res.status(400).json({ error: 'bad_guess' });

    const s = db.prepare(
      'SELECT * FROM pumpdump_sessions WHERE session_id = ?'
    ).get(sessionId);
    if (!s)                   return res.status(404).json({ error: 'no_session' });
    if (s.settled)            return res.status(400).json({ error: 'already_settled' });
    if (s.expires_at < Date.now()) return res.status(410).json({ error: 'session_expired' });
    if (Number(nonce) !== s.nonce) return res.status(400).json({ error: 'bad_nonce' });

    const newNonce = s.nonce + 1;
    const state = JSON.parse(s.state_json);
    const r = nextCandle(s.server_seed, sessionId, newNonce, state);
    const correct = r.candle.dir === guess;

    const t = telemetry || {};
    db.prepare(`
      INSERT INTO pumpdump_decisions
        (session_id, nonce, guess, actual, rt, pe, ent, correct, ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, newNonce, guess, r.candle.dir,
           Number(t.rt || 0), Number(t.pe || 0), Number(t.ent || 0),
           correct ? 1 : 0, Date.now());

    const verdict = analyzeTelemetry(sessionId);
    if (!verdict.allow) {
      db.prepare(`
        INSERT OR REPLACE INTO pumpdump_bots (wallet, flagged_at, flags, severity)
        VALUES (?, ?, ?, ?)
      `).run(s.wallet, Date.now(), JSON.stringify(verdict.flags), verdict.severity);
      db.prepare('UPDATE pumpdump_sessions SET settled = 1 WHERE session_id = ?')
        .run(sessionId);
      return res.status(403).json({
        error: 'automation_detected',
        botDetected: true,
        flags: verdict.flags,
      });
    }

    if (correct) {
      const newPot = s.pot + s.increment;
      db.prepare(`
        UPDATE pumpdump_sessions
        SET nonce = ?, pot = ?, streak = streak + 1,
            correct_count = correct_count + 1, state_json = ?
        WHERE session_id = ?
      `).run(newNonce, newPot, JSON.stringify(r.state), sessionId);

      res.json({
        correct:    true,
        actualDir:  r.candle.dir,
        nextCandle: r.candle,
        nonce:      newNonce,
        pot:        newPot,
        streak:     s.streak + 1,
        gameOver:   false,
      });
    } else {
      db.prepare(`
        UPDATE pumpdump_sessions
        SET nonce = ?, wrong_count = wrong_count + 1, settled = 1, state_json = ?
        WHERE session_id = ?
      `).run(newNonce, JSON.stringify(r.state), sessionId);

      res.json({
        correct:    false,
        actualDir:  r.candle.dir,
        nextCandle: r.candle,
        nonce:      newNonce,
        pot:        0,
        streak:     0,
        gameOver:   true,
      });
    }
  } catch (e) {
    console.error('[/pumpdump/play]', e.message);
    res.status(500).json({ error: 'play_failed' });
  }
});

router.post('/cashout', async (req, res) => {
  try {
    const { sessionId, token } = req.body || {};
    if (!sessionId || !token) return res.status(400).json({ error: 'bad_request' });
    if (token !== sign(sessionId)) return res.status(403).json({ error: 'bad_token' });

    const s = db.prepare(
      'SELECT * FROM pumpdump_sessions WHERE session_id = ?'
    ).get(sessionId);
    if (!s)                return res.status(404).json({ error: 'no_session' });
    if (s.settled)         return res.status(400).json({ error: 'already_settled' });
    if (s.streak < 1)      return res.status(400).json({ error: 'no_pot_to_cash' });

    db.prepare('UPDATE pumpdump_sessions SET settled = 1 WHERE session_id = ?')
      .run(sessionId);

    const netCredit = Math.max(0, s.pot - ENTRY_COST);

    db.prepare(`
      INSERT INTO pumpdump_ledger (wallet, session_id, delta, reason, ts)
      VALUES (?, ?, ?, 'cashout', ?)
    `).run(s.wallet, sessionId, netCredit, Date.now());

    if (netCredit > 0) {
      awardPoints(s.wallet, netCredit, `pumpdump_${sessionId.slice(0, 8)}`)
        .then((hash) => {
          if (hash) {
            db.prepare(
              'UPDATE pumpdump_ledger SET tx_hash = ? WHERE session_id = ? AND reason = ?'
            ).run(hash, sessionId, 'cashout');
          }
        });
    }

    res.json({
      credited:     s.pot,
      netCredit:    netCredit,
      streak:       s.streak,
      correct:      s.correct_count,
      wrong:        s.wrong_count,
      txHash:       null,
      explorerUrl:  null,
      reveal: {
        serverSeed:     s.server_seed,
        serverSeedHash: sha256(s.server_seed),
        nonce:          s.nonce,
      },
    });
  } catch (e) {
    console.error('[/pumpdump/cashout]', e.message);
    res.status(500).json({ error: 'cashout_failed' });
  }
});

router.get('/verify/:sessionId', (req, res) => {
  const s = db.prepare(
    'SELECT session_id, wallet, server_seed, nonce, pot, streak, settled, created_at FROM pumpdump_sessions WHERE session_id = ? AND settled = 1'
  ).get(req.params.sessionId);
  if (!s) return res.status(404).json({ error: 'session_not_settled_or_missing' });
  const decisions = db.prepare(
    'SELECT nonce, guess, actual, correct, ts FROM pumpdump_decisions WHERE session_id = ? ORDER BY nonce'
  ).all(req.params.sessionId);
  res.json({ session: s, decisions, hash: sha256(s.server_seed) });
});

module.exports = router;
