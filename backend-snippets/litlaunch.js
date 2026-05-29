// ════════════════════════════════════════════════════════════════
//  LIT LAUNCH — backend route (rocket physics trader)
//  Drop into: /root/litvm-dex/game-server/litlaunch.js
//  Mount in server.js:
//      const litlaunch = require('./litlaunch');
//      app.use('/litlaunch', litlaunch);
//
//  Crash-game-meets-physics. Player stakes 10 PTS, tap-and-holds
//  to fuel the rocket (0–3s), releases to launch under classical
//  ballistics, and taps CASHOUT mid-flight to lock the current
//  altitude multiplier. The session has a hidden crash altitude
//  derived from a server seed; reaching it before cashout =
//  rocket explodes, stake lost.
//
//  Trust model: server-seed defines the hidden crash altitude and
//  sweet-spot offset. Client receives the seed at /end so anyone
//  can re-verify. Physics is fully deterministic given (seed,
//  thrustHoldMs, cashoutAtMs).
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
  "function spendPoints(address user, uint256 amount) external",
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
    stake INTEGER NOT NULL,
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
const ENTRY_COST          = 10;       // PTS per launch
const DAILY_LIMIT         = 10;
const SESSION_TTL_MS      = 5 * 60 * 1000;
const MAX_GAME_DURATION_MS = 90 * 1000;

// Physics (deterministic, integer-safe at server)
const G                   = 9.8;       // gravity (km / s² at surface, simplified flat)
const MAX_THRUST_MS       = 3000;      // hard hold cap
const MIN_THRUST_MS       = 200;       // below this = fizzle
const THRUST_TO_VEL       = 0.13;      // velocity per ms held (km/s scale)
const MAX_ALT_KM          = 4500;      // beyond this = forced crash
const MIN_ALT_KM          = 30;        // safe ground band

// Multiplier curve: m(alt) = 1 + alt/200, capped at 25
function multiplierAt(altKm) {
  const m = 1 + Math.max(0, altKm) / 200;
  return Math.min(25, Math.max(1, m));
}

// Sweet spot window for "Perfect Launch" bonus
const SWEET_BASE_MS       = 1700;      // typical sweet spot
const SWEET_RANGE_MS      = 800;       // ± seed-jittered up to 400ms
const SWEET_HALFWIDTH_MS  = 180;
const PERFECT_BONUS_X100  = 50;        // +0.50x

const PEPPER = process.env.LITLAUNCH_PEPPER || process.env.PUMPDUMP_PEPPER || 'CHANGE_ME_LONG_RANDOM';

const startLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  message: { error: 'Too many requests. Please wait a minute.' },
  keyGenerator: (req) => ipKeyGenerator(req)
});

// ── Reward / spend queues ────────────────────────────────────
const _txQueue = [];
let _txRunning = false;
function enqueueTx(fn) {
  return new Promise((resolve) => {
    _txQueue.push({ fn, resolve });
    processTxQueue();
  });
}
async function processTxQueue() {
  if (_txRunning) return;
  _txRunning = true;
  while (_txQueue.length > 0) {
    const { fn, resolve } = _txQueue.shift();
    try {
      const tx = await fn();
      await tx.wait();
      resolve(tx.hash);
    } catch (e) {
      console.error('[LL-Tx]', e.shortMessage || e.message);
      resolve(null);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  _txRunning = false;
}
function awardPoints(to, pts, questId) {
  return enqueueTx(() => _points.recordQuestFor(to, BigInt(pts), questId));
}
function spendStake(from, amount) {
  return enqueueTx(() => _points.spendPoints(from, BigInt(amount)));
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

// Derive 4 deterministic [0,1) floats from (seed, sessionId).
function seedFloats(seed, sessionId) {
  const h = hmac(seed, sessionId);
  const f = (off) => parseInt(h.slice(off, off + 8), 16) / 0xffffffff;
  return [f(0), f(8), f(16), f(24)];
}

// Physics replay. Returns {peakKm, peakAtMs, altAt(t)}.
//
// thrustVel = (thrustMs - MIN_THRUST_MS) * THRUST_TO_VEL
//   capped at MAX_THRUST_MS - MIN_THRUST_MS contribution
// position(t) = v0*t - 0.5 * g * t²    (km, t in seconds)
// velocity(t) = v0 - g*t
// peak at t* = v0 / g, peakKm = v0² / (2g)
function physics(thrustMs) {
  const thrust = Math.max(0, Math.min(MAX_THRUST_MS, thrustMs) - MIN_THRUST_MS);
  const v0 = Math.max(0, thrust) * THRUST_TO_VEL;        // km/s
  const peakAtSec = v0 / G;
  const peakKm = (v0 * v0) / (2 * G);
  return {
    v0,
    peakAtMs: peakAtSec * 1000,
    peakKm,
    altAt(tMs) {
      const t = tMs / 1000;
      if (t < 0) return 0;
      // After peak (t > 2 * peakAt) the rocket is below ground.
      const a = v0 * t - 0.5 * G * t * t;
      return a > 0 ? a : 0;
    },
  };
}

// Crash altitude generator: seed-jittered between 250 and 4400 km.
// Distribution is biased a bit lower so juicy multipliers stay rare
// (median ≈ 800 km ≈ 5x).
function crashAltKm(seed, sessionId) {
  const [u1] = seedFloats(seed, sessionId);
  // Inverse-power skew toward smaller values.
  const skew = Math.pow(u1, 2.2);
  return 250 + skew * (MAX_ALT_KM - 350);
}

function sweetMs(seed, sessionId) {
  const [, u2] = seedFloats(seed, sessionId);
  return SWEET_BASE_MS + (u2 - 0.5) * SWEET_RANGE_MS;
}

// Replay a run and return the verdict.
//
// Inputs (validated):
//   thrustMs    – how long the player held the button (clamped 0..3000)
//   cashoutAtMs – ms after release at which player cashed out, or null
//
// Outcomes:
//   {outcome: 'fizzle',      altitude: 0, multX100: 100, awarded: stake×1 (refund) }
//   {outcome: 'crash',       altitude: crashAlt, multX100: 0, awarded: 0 }
//   {outcome: 'fellback',    altitude: 0, multX100: 0, awarded: 0 }
//   {outcome: 'cashout',     altitude: altAtCashout, multX100, awarded }
function replayRun(seed, sessionId, stake, thrustMs, cashoutAtMs) {
  // Defensive parse.
  thrustMs = Math.max(0, Math.min(MAX_THRUST_MS, Number(thrustMs) || 0));
  cashoutAtMs = (cashoutAtMs == null || !Number.isFinite(Number(cashoutAtMs)))
    ? null : Math.max(0, Math.min(MAX_GAME_DURATION_MS, Number(cashoutAtMs)));

  // Fizzle: held too briefly to clear the launchpad.
  if (thrustMs < MIN_THRUST_MS) {
    return {
      outcome: 'fizzle',
      altitude: 0, multX100: 100, awarded: stake, perfect: false,
      crashAlt: 0, sweet: 0, peakKm: 0,
    };
  }

  const phy = physics(thrustMs);
  const crashAlt = crashAltKm(seed, sessionId);
  const sweet = sweetMs(seed, sessionId);

  // Time at which rocket reaches crashAlt on ascent (if it does).
  // Solve v0*t - 0.5*g*t² = crashAlt
  // t = (v0 - sqrt(v0² - 2*g*crashAlt)) / g  (ascending root)
  let crashAtMs = Infinity;
  const disc = phy.v0 * phy.v0 - 2 * G * crashAlt;
  if (disc >= 0) {
    crashAtMs = ((phy.v0 - Math.sqrt(disc)) / G) * 1000;
  }
  // The rocket also falls back to ground at t = 2 * peakAt.
  const fellbackAtMs = phy.peakAtMs * 2;

  if (cashoutAtMs == null) {
    // No cashout. Rocket either crashed at hidden altitude during
    // ascent (if crashAtMs < fellbackAtMs) OR fell back to ground.
    if (crashAtMs < fellbackAtMs) {
      return {
        outcome: 'crash',
        altitude: Math.round(crashAlt),
        multX100: 0, awarded: 0, perfect: false,
        crashAlt: Math.round(crashAlt), sweet: Math.round(sweet),
        peakKm: Math.round(phy.peakKm),
      };
    }
    return {
      outcome: 'fellback',
      altitude: Math.round(phy.peakKm),
      multX100: 0, awarded: 0, perfect: false,
      crashAlt: Math.round(crashAlt), sweet: Math.round(sweet),
      peakKm: Math.round(phy.peakKm),
    };
  }

  // Cashout requested. Did it happen BEFORE the rocket either crashed
  // (hit hidden ceiling) or started falling back?
  const limit = Math.min(crashAtMs, fellbackAtMs);
  if (cashoutAtMs > limit) {
    // Player tried to cash out too late.
    if (crashAtMs < fellbackAtMs) {
      return {
        outcome: 'crash',
        altitude: Math.round(crashAlt),
        multX100: 0, awarded: 0, perfect: false,
        crashAlt: Math.round(crashAlt), sweet: Math.round(sweet),
        peakKm: Math.round(phy.peakKm),
      };
    }
    return {
      outcome: 'fellback',
      altitude: Math.round(phy.peakKm),
      multX100: 0, awarded: 0, perfect: false,
      crashAlt: Math.round(crashAlt), sweet: Math.round(sweet),
      peakKm: Math.round(phy.peakKm),
    };
  }

  // Successful cashout — compute altitude at that moment.
  const altKm = phy.altAt(cashoutAtMs);
  const m = multiplierAt(altKm);
  let multX100 = Math.round(m * 100);

  // Perfect-launch bonus if release was inside sweet window.
  const perfect = Math.abs(thrustMs - sweet) <= SWEET_HALFWIDTH_MS;
  if (perfect) multX100 = Math.min(2500, multX100 + PERFECT_BONUS_X100);

  const awarded = Math.floor((stake * multX100) / 100);
  return {
    outcome: 'cashout',
    altitude: Math.round(altKm),
    multX100, awarded, perfect,
    crashAlt: Math.round(crashAlt), sweet: Math.round(sweet),
    peakKm: Math.round(phy.peakKm),
  };
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
    ).get(w, 'cashout');
    const lifetimeWon = ledgerRow?.total || 0;

    const bestRow = db.prepare(
      'SELECT MAX(altitude) AS best_alt, MAX(multiplier_x100) AS best_mult FROM litlaunch_sessions WHERE wallet = ?'
    ).get(w);

    const onChain = await readOnChainPoints(w);

    res.json({
      pointsBalance:    onChain ?? 0,
      gamesPlayed:      played,
      gamesLeft:        Math.max(0, DAILY_LIMIT - played),
      dailyLimit:       DAILY_LIMIT,
      entryCost:        ENTRY_COST,
      maxMultiplier:    25,
      maxThrustMs:      MAX_THRUST_MS,
      bestAltitudeKm:   bestRow?.best_alt || 0,
      bestMultiplier:   ((bestRow?.best_mult || 0) / 100),
      lifetimeWon,
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

    const balance = await readOnChainPoints(w);
    if (balance != null && balance < ENTRY_COST) {
      return res.status(402).json({ error: 'need_min_points', need: ENTRY_COST, have: balance });
    }

    db.prepare(`
      INSERT INTO litlaunch_daily (wallet, date, games_played) VALUES (?, ?, 1)
      ON CONFLICT(wallet, date) DO UPDATE SET games_played = games_played + 1
    `).run(w, today);

    const sessionId  = crypto.randomBytes(16).toString('hex');
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const seedHash   = sha256(serverSeed);  // committed publicly; revealed at /end
    const now = Date.now();

    db.prepare(`
      INSERT INTO litlaunch_sessions
        (session_id, wallet, server_seed, stake, started_at, fingerprint, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, w, serverSeed, ENTRY_COST, now, fingerprint || null, now + SESSION_TTL_MS);

    // Burn the stake on chain. Block the response on this tx so the
    // client never starts the round with phantom stake.
    const burnHash = await spendStake(w, ENTRY_COST);
    if (!burnHash) {
      db.prepare('UPDATE litlaunch_sessions SET settled = 1 WHERE session_id = ?').run(sessionId);
      return res.status(502).json({ error: 'stake_spend_failed' });
    }
    db.prepare(`
      INSERT INTO litlaunch_ledger (wallet, session_id, delta, reason, tx_hash, ts)
      VALUES (?, ?, ?, 'entry', ?, ?)
    `).run(w, sessionId, -ENTRY_COST, burnHash, now);

    res.json({
      sessionId,
      token:           sign(sessionId),
      seedHash,                       // commit; full seed revealed at /end
      stake:           ENTRY_COST,
      maxThrustMs:     MAX_THRUST_MS,
      maxAltKm:        MAX_ALT_KM,
      maxMultiplier:   25,
      gamesLeft:       Math.max(0, DAILY_LIMIT - (played + 1)),
      dailyLimit:      DAILY_LIMIT,
      entryTxHash:     burnHash,
    });
  } catch (e) {
    console.error('[/litlaunch/start]', e.message);
    res.status(500).json({ error: 'start_failed' });
  }
});

router.post('/end', async (req, res) => {
  try {
    const { sessionId, token, thrustMs, cashoutAtMs } = req.body || {};
    if (!sessionId || !token) return res.status(400).json({ error: 'bad_request' });
    if (sign(sessionId) !== token) return res.status(403).json({ error: 'bad_token' });

    const s = db.prepare('SELECT * FROM litlaunch_sessions WHERE session_id = ?').get(sessionId);
    if (!s)              return res.status(404).json({ error: 'session_not_found' });
    if (s.settled)       return res.status(409).json({ error: 'already_settled' });
    if (s.expires_at < Date.now()) {
      db.prepare('UPDATE litlaunch_sessions SET settled = 1 WHERE session_id = ?').run(sessionId);
      return res.status(410).json({ error: 'session_expired' });
    }

    const verdict = replayRun(s.server_seed, sessionId, s.stake, thrustMs, cashoutAtMs);

    db.prepare(
      'UPDATE litlaunch_sessions SET settled = 1, outcome = ?, altitude = ?, multiplier_x100 = ?, awarded = ?, perfect = ? WHERE session_id = ?'
    ).run(verdict.outcome, verdict.altitude, verdict.multX100, verdict.awarded, verdict.perfect ? 1 : 0, sessionId);

    let txHash = null;
    if (verdict.awarded > 0) {
      // Refund / payout via recordQuestFor (mints points back).
      db.prepare(`
        INSERT INTO litlaunch_ledger (wallet, session_id, delta, reason, ts)
        VALUES (?, ?, ?, ?, ?)
      `).run(s.wallet, sessionId, verdict.awarded, verdict.outcome === 'fizzle' ? 'refund' : 'cashout', Date.now());

      txHash = await awardPoints(s.wallet, verdict.awarded, `litlaunch_${sessionId.slice(0, 8)}`);
      if (txHash) {
        db.prepare(`
          UPDATE litlaunch_ledger SET tx_hash = ?
          WHERE session_id = ? AND reason IN ('cashout','refund')
        `).run(txHash, sessionId);
      }
    }

    const bestRow = db.prepare(
      'SELECT MAX(altitude) AS best_alt, MAX(multiplier_x100) AS best_mult FROM litlaunch_sessions WHERE wallet = ?'
    ).get(s.wallet);

    res.json({
      ok:             true,
      outcome:        verdict.outcome,
      altitudeKm:     verdict.altitude,
      multiplier:     verdict.multX100 / 100,
      awarded:        verdict.awarded,
      perfect:        verdict.perfect,
      stake:          s.stake,
      // Reveal pieces so the client can verify.
      serverSeed:     s.server_seed,
      crashAltKm:     verdict.crashAlt,
      sweetMs:        verdict.sweet,
      peakKm:         verdict.peakKm,
      txHash,
      explorerUrl:    txHash ? `https://liteforge.explorer.caldera.xyz/tx/${txHash}` : null,
      bestAltitudeKm: bestRow?.best_alt || 0,
      bestMultiplier: ((bestRow?.best_mult || 0) / 100),
    });
  } catch (e) {
    console.error('[/litlaunch/end]', e.message);
    res.status(500).json({ error: 'end_failed' });
  }
});

router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT wallet, MAX(multiplier_x100) AS best_mult, MAX(altitude) AS best_alt
      FROM litlaunch_sessions
      WHERE settled = 1 AND outcome = 'cashout'
      GROUP BY wallet
      ORDER BY best_mult DESC
      LIMIT 25
    `).all();
    res.json({
      leaderboard: rows.map((r) => ({
        wallet: r.wallet,
        best_multiplier: (r.best_mult || 0) / 100,
        best_altitude_km: r.best_alt || 0,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});

module.exports = router;
