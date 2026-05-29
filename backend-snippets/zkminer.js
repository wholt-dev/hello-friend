// ════════════════════════════════════════════════════════════════
//  ZK MINER — backend route (mirrors littower.js shape)
//  Drop into: /root/litvm-dex/game-server/zkminer.js
//  Mount in server.js:
//      const zkminer = require('./zkminer');
//      app.use('/zkminer', zkminer);
//
//  Free-to-play match-3 puzzle. Player swaps adjacent gems to make
//  3+ in a row. Each cleared gem charges a "mining rig"; every 100%
//  charge mints +1 PT on chain via recordQuestFor. Capped at 10 per
//  game. 30 moves per game, 5 games per wallet per day.
//
//  Trust model: server holds the seed and is the source of truth.
//  Client sends a moves tape; server replays the full game using
//  the same deterministic RNG and computes charges. Client never
//  reports its own count.
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
  CREATE TABLE IF NOT EXISTS zkminer_daily (
    wallet TEXT NOT NULL,
    date TEXT NOT NULL,
    games_played INTEGER DEFAULT 0,
    PRIMARY KEY (wallet, date)
  );
  CREATE TABLE IF NOT EXISTS zkminer_sessions (
    session_id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    server_seed TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    settled INTEGER DEFAULT 0,
    charges INTEGER DEFAULT 0,
    awarded INTEGER DEFAULT 0,
    fingerprint TEXT,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS zkminer_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    session_id TEXT,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    tx_hash TEXT,
    ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_zmledger_wallet ON zkminer_ledger(wallet);
  CREATE TABLE IF NOT EXISTS zkminer_bots (
    wallet TEXT PRIMARY KEY,
    flagged_at INTEGER NOT NULL,
    flags TEXT NOT NULL,
    severity INTEGER NOT NULL
  );
`);

// ── Config ────────────────────────────────────────────────────
const DAILY_LIMIT          = 5;
const MOVES_PER_GAME       = 30;
const MAX_CHARGES_PER_GAME = 10;
const COLS                 = 7;
const ROWS                 = 8;
const COLORS               = 5;
const MIN_MOVE_GAP_MS      = 200;
const MAX_GAME_DURATION_MS = 10 * 60 * 1000;
const SESSION_TTL_MS       = 15 * 60 * 1000;

// Charge math: each cleared gem = 1%. 4-match adds +5% flat bonus.
// 5+match adds +10% flat. Cascade depth multiplier: depth d adds
// ×(1 + 0.5 × d) to that cascade's gain. Capped at ×3.
const PER_GEM_PCT   = 1;
const FOUR_BONUS    = 5;
const FIVE_BONUS    = 10;
const CHARGE_PER_PT = 100;   // 100% charge = +1 PT

const PEPPER = process.env.ZKMINER_PEPPER || process.env.PUMPDUMP_PEPPER || 'CHANGE_ME_LONG_RANDOM';

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
      console.log(`[ZM-Reward] +${pts} -> ${to.slice(0, 8)} tx=${tx.hash.slice(0, 10)}`);
      resolve(tx.hash);
    } catch (e) {
      console.error('[ZM-Reward] failed:', e.shortMessage || e.message);
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
    db.prepare('UPDATE zkminer_sessions SET settled = 1 WHERE settled = 0 AND expires_at < ?')
      .run(Date.now());
  } catch {}
}, 60_000).unref();

// ════════════════════════════════════════════════════════════════
//  MATCH-3 ENGINE — pure functions, deterministic from a seed.
//  Both server and client run this exact algorithm so the replay
//  matches byte-for-byte.
// ════════════════════════════════════════════════════════════════
function colorAt(serverSeed, sessionId, dropIdx) {
  const h = hmac(serverSeed, `${sessionId}:${dropIdx}`);
  return parseInt(h.slice(0, 8), 16) % COLORS;
}

// Returns { board, dropIdx } with no pre-existing matches.
function buildInitialBoard(serverSeed, sessionId) {
  const board = Array.from({ length: ROWS }, () => new Array(COLS).fill(-1));
  let dropIdx = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let color = -1;
      let tries = 0;
      // Reject any color that would form a 3-match with neighbors.
      while (tries < 32) {
        color = colorAt(serverSeed, sessionId, dropIdx++);
        // Horizontal: two same to the left.
        if (c >= 2 && board[r][c-1] === color && board[r][c-2] === color) { tries++; continue; }
        // Vertical: two same above.
        if (r >= 2 && board[r-1][c] === color && board[r-2][c] === color) { tries++; continue; }
        break;
      }
      board[r][c] = color;
    }
  }
  return { board, dropIdx };
}

function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

function isAdjacent(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  const [ar, ac] = a, [br, bc] = b;
  if (!inBounds(ar, ac) || !inBounds(br, bc)) return false;
  return (Math.abs(ar - br) + Math.abs(ac - bc)) === 1;
}

function swap(board, a, b) {
  const t = board[a[0]][a[1]];
  board[a[0]][a[1]] = board[b[0]][b[1]];
  board[b[0]][b[1]] = t;
}

// Returns array of cells to clear. Each cell is "r,c" string.
// Match-3 rule: 3+ consecutive same color in row or column.
function findMatches(board) {
  const cleared = new Set();
  // Rows
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= COLS; c++) {
      const same = c < COLS && board[r][c] !== -1 && board[r][c] === board[r][c-1];
      if (same) {
        run++;
      } else {
        if (run >= 3) {
          for (let k = 0; k < run; k++) cleared.add(`${r},${c-1-k}`);
        }
        run = 1;
      }
    }
  }
  // Columns
  for (let c = 0; c < COLS; c++) {
    let run = 1;
    for (let r = 1; r <= ROWS; r++) {
      const same = r < ROWS && board[r][c] !== -1 && board[r][c] === board[r-1][c];
      if (same) {
        run++;
      } else {
        if (run >= 3) {
          for (let k = 0; k < run; k++) cleared.add(`${r-1-k},${c}`);
        }
        run = 1;
      }
    }
  }
  return cleared;
}

// Returns the size of the largest connected "run" the given cleared
// set contains in either direction. Used for 4/5-match bonuses.
// Simpler approach: count the largest horizontal and vertical run
// that consists only of cleared cells.
function maxRunInCleared(cleared) {
  let max = 0;
  // Horizontal runs
  for (let r = 0; r < ROWS; r++) {
    let run = 0;
    for (let c = 0; c < COLS; c++) {
      if (cleared.has(`${r},${c}`)) {
        run++; if (run > max) max = run;
      } else {
        run = 0;
      }
    }
  }
  // Vertical runs
  for (let c = 0; c < COLS; c++) {
    let run = 0;
    for (let r = 0; r < ROWS; r++) {
      if (cleared.has(`${r},${c}`)) {
        run++; if (run > max) max = run;
      } else {
        run = 0;
      }
    }
  }
  return max;
}

// Apply gravity + refill. Mutates board, advances dropIdx.
function gravityAndRefill(board, cleared, ctx) {
  // Mark cleared cells as empty.
  for (const k of cleared) {
    const [r, c] = k.split(',').map(Number);
    board[r][c] = -1;
  }
  // Gravity per column (settled cells fall down).
  for (let c = 0; c < COLS; c++) {
    const stack = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] !== -1) stack.push(board[r][c]);
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      board[r][c] = stack.length ? stack.shift() : -1;
    }
  }
  // Refill from top — left-to-right, top-to-bottom; same order
  // both client and server iterate so dropIdx stays in sync.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === -1) {
        board[r][c] = colorAt(ctx.seed, ctx.sessionId, ctx.dropIdx++);
      }
    }
  }
}

// Replays the full game from moves[]. Returns { ok, charges, reason }.
function replayGame(serverSeed, sessionId, moves, startedAt) {
  if (!Array.isArray(moves)) return { ok: false, reason: 'moves_not_array', charges: 0 };
  if (moves.length > MOVES_PER_GAME) return { ok: false, reason: 'too_many_moves', charges: 0 };

  const init = buildInitialBoard(serverSeed, sessionId);
  const board = init.board;
  const ctx = { seed: serverSeed, sessionId, dropIdx: init.dropIdx };

  let pct = 0;
  let charges = 0;
  let prevT = -Infinity;

  for (let i = 0; i < moves.length; i++) {
    const mv = moves[i];
    if (!mv || !Array.isArray(mv.a) || !Array.isArray(mv.b)) {
      return { ok: false, reason: 'bad_move_shape', charges };
    }
    if (!isAdjacent(mv.a, mv.b)) {
      return { ok: false, reason: 'not_adjacent', charges };
    }
    const t = Number(mv.t);
    if (!Number.isFinite(t) || t < 0) {
      return { ok: false, reason: 'bad_time', charges };
    }
    if (i > 0 && t - prevT < MIN_MOVE_GAP_MS) {
      return { ok: false, reason: 'move_too_fast', charges };
    }
    prevT = t;

    // Apply swap.
    swap(board, mv.a, mv.b);
    let cleared = findMatches(board);
    if (cleared.size === 0) {
      // Invalid swap — revert. We do NOT count this against the
      // player's move budget on the client either, but the client
      // shouldn't have included it in the tape. Treat as cheating.
      swap(board, mv.a, mv.b);
      return { ok: false, reason: 'no_match', charges };
    }

    // Cascade loop.
    let depth = 0;
    while (cleared.size > 0) {
      const cellCount = cleared.size;
      const longestRun = maxRunInCleared(cleared);
      let gain = cellCount * PER_GEM_PCT;
      if (longestRun >= 5)      gain += FIVE_BONUS;
      else if (longestRun >= 4) gain += FOUR_BONUS;
      const mult = Math.min(3, 1 + 0.5 * depth);
      pct += gain * mult;

      while (pct >= CHARGE_PER_PT) {
        pct -= CHARGE_PER_PT;
        charges++;
        if (charges >= MAX_CHARGES_PER_GAME) { pct = 0; break; }
      }
      if (charges >= MAX_CHARGES_PER_GAME) break;

      gravityAndRefill(board, cleared, ctx);
      cleared = findMatches(board);
      depth++;
      if (depth > 60) {
        // Sanity guard against pathological boards.
        return { ok: false, reason: 'cascade_runaway', charges };
      }
    }

    if (charges >= MAX_CHARGES_PER_GAME) break;
  }

  // Bound game duration via final move timestamp.
  if (moves.length > 0) {
    const last = Number(moves[moves.length - 1].t || 0);
    if (last > MAX_GAME_DURATION_MS) {
      return { ok: false, reason: 'session_too_long', charges };
    }
  }

  return { ok: true, charges: Math.min(charges, MAX_CHARGES_PER_GAME), reason: 'ok' };
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
      'SELECT games_played FROM zkminer_daily WHERE wallet=? AND date=?'
    ).get(w, today);
    const played = dailyRow?.games_played || 0;

    const ledgerRow = db.prepare(
      'SELECT COALESCE(SUM(delta), 0) AS total FROM zkminer_ledger WHERE wallet = ? AND reason = ?'
    ).get(w, 'reward');
    const lifetimeWon = ledgerRow?.total || 0;

    const bestRow = db.prepare(
      'SELECT MAX(charges) AS best_charges FROM zkminer_sessions WHERE wallet = ?'
    ).get(w);

    const onChain = await readOnChainPoints(w);

    res.json({
      pointsBalance:    onChain ?? 0,
      gamesPlayed:      played,
      gamesLeft:        Math.max(0, DAILY_LIMIT - played),
      dailyLimit:       DAILY_LIMIT,
      movesPerGame:     MOVES_PER_GAME,
      maxCharges:       MAX_CHARGES_PER_GAME,
      perChargePts:     1,
      bestCharges:      bestRow?.best_charges || 0,
      lifetimeWon,
      entryCost:        0,
      cols:             COLS,
      rows:             ROWS,
      colors:           COLORS,
    });
  } catch (e) {
    console.error('[/zkminer/stats]', e.message);
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
      'SELECT 1 FROM zkminer_bots WHERE wallet = ? AND flagged_at > ?'
    ).get(w, Date.now() - 24 * 3600 * 1000);
    if (banned) return res.status(403).json({ error: 'wallet_banned_24h' });

    const today = todayIST();
    const dailyRow = db.prepare(
      'SELECT games_played FROM zkminer_daily WHERE wallet=? AND date=?'
    ).get(w, today);
    const played = dailyRow?.games_played || 0;
    if (played >= DAILY_LIMIT) {
      return res.status(429).json({ error: 'daily_limit_reached', gamesLeft: 0 });
    }

    db.prepare(`
      INSERT INTO zkminer_daily (wallet, date, games_played) VALUES (?, ?, 1)
      ON CONFLICT(wallet, date) DO UPDATE SET games_played = games_played + 1
    `).run(w, today);

    const sessionId  = crypto.randomBytes(16).toString('hex');
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    db.prepare(`
      INSERT INTO zkminer_sessions
        (session_id, wallet, server_seed, started_at, fingerprint, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, w, serverSeed, now, fingerprint || null, now + SESSION_TTL_MS);

    res.json({
      sessionId,
      token:           sign(sessionId),
      serverSeed,                 // shared with client so it builds the same board
      cols:            COLS,
      rows:            ROWS,
      colors:          COLORS,
      movesPerGame:    MOVES_PER_GAME,
      maxCharges:      MAX_CHARGES_PER_GAME,
      perChargePts:    1,
      gamesLeft:       Math.max(0, DAILY_LIMIT - (played + 1)),
      dailyLimit:      DAILY_LIMIT,
    });
  } catch (e) {
    console.error('[/zkminer/start]', e.message);
    res.status(500).json({ error: 'start_failed' });
  }
});

router.post('/end', async (req, res) => {
  try {
    const { sessionId, token, moves } = req.body || {};
    if (!sessionId || !token) return res.status(400).json({ error: 'bad_request' });
    if (sign(sessionId) !== token) return res.status(403).json({ error: 'bad_token' });

    const s = db.prepare('SELECT * FROM zkminer_sessions WHERE session_id = ?').get(sessionId);
    if (!s)              return res.status(404).json({ error: 'session_not_found' });
    if (s.settled)       return res.status(409).json({ error: 'already_settled' });
    if (s.expires_at < Date.now()) {
      db.prepare('UPDATE zkminer_sessions SET settled = 1 WHERE session_id = ?').run(sessionId);
      return res.status(410).json({ error: 'session_expired' });
    }

    const v = replayGame(s.server_seed, sessionId, moves, s.started_at);
    if (!v.ok) {
      db.prepare('UPDATE zkminer_sessions SET settled = 1 WHERE session_id = ?').run(sessionId);
      db.prepare(`
        INSERT OR REPLACE INTO zkminer_bots (wallet, flagged_at, flags, severity)
        VALUES (?, ?, ?, ?)
      `).run(s.wallet, Date.now(), JSON.stringify([v.reason]), 70);
      return res.status(403).json({ error: 'invalid_run', reason: v.reason });
    }

    const awarded = Math.max(0, Math.min(MAX_CHARGES_PER_GAME, v.charges));

    db.prepare(
      'UPDATE zkminer_sessions SET settled = 1, charges = ?, awarded = ? WHERE session_id = ?'
    ).run(v.charges, awarded, sessionId);

    if (awarded > 0) {
      db.prepare(`
        INSERT INTO zkminer_ledger (wallet, session_id, delta, reason, ts)
        VALUES (?, ?, ?, 'reward', ?)
      `).run(s.wallet, sessionId, awarded, Date.now());

      awardPoints(s.wallet, awarded, `zkminer_${sessionId.slice(0, 8)}`)
        .then((hash) => {
          if (hash) {
            db.prepare(
              'UPDATE zkminer_ledger SET tx_hash = ? WHERE session_id = ? AND reason = ?'
            ).run(hash, sessionId, 'reward');
          }
        });
    }

    const bestRow = db.prepare(
      'SELECT MAX(charges) AS best_charges FROM zkminer_sessions WHERE wallet = ?'
    ).get(s.wallet);

    res.json({
      ok:           true,
      charges:      v.charges,
      awarded,
      bestCharges:  bestRow?.best_charges || 0,
    });
  } catch (e) {
    console.error('[/zkminer/end]', e.message);
    res.status(500).json({ error: 'end_failed' });
  }
});

router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT wallet, MAX(charges) AS best_charges
      FROM zkminer_sessions
      WHERE settled = 1
      GROUP BY wallet
      ORDER BY best_charges DESC
      LIMIT 25
    `).all();
    res.json({ leaderboard: rows });
  } catch (e) {
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});

module.exports = router;
