// ════════════════════════════════════════════════════════════════
//  BLOCK CHAIN — backend route (2048-style merge puzzle)
//  Drop into: /root/litvm-dex/game-server/blockchain.js
//  Mount in server.js:
//      const blockchain = require('./blockchain');
//      app.use('/blockchain', blockchain);
//
//  Free-to-play 4x4 merge puzzle. Swipe up/down/left/right to merge
//  matching tiles. Each new HIGHEST tile reached unlocks a milestone
//  reward, paid once per session:
//
//    64 -> +5    128 -> +10    256 -> +20
//    512 -> +40  1024 -> +80   2048 -> +160
//
//  Trust model: server holds the seed and is the source of truth.
//  Client sends moves [UDLR...] tape, server replays the entire run
//  from seed + tape and computes which milestones got hit. Client
//  never reports its own score.
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

db.exec(`
  CREATE TABLE IF NOT EXISTS blockchain_daily (
    wallet TEXT NOT NULL,
    date TEXT NOT NULL,
    games_played INTEGER DEFAULT 0,
    PRIMARY KEY (wallet, date)
  );
  CREATE TABLE IF NOT EXISTS blockchain_sessions (
    session_id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    server_seed TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    settled INTEGER DEFAULT 0,
    highest_tile INTEGER DEFAULT 0,
    awarded INTEGER DEFAULT 0,
    moves_count INTEGER DEFAULT 0,
    fingerprint TEXT,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS blockchain_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    session_id TEXT,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    tx_hash TEXT,
    ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bcledger_wallet ON blockchain_ledger(wallet);
  CREATE TABLE IF NOT EXISTS blockchain_bots (
    wallet TEXT PRIMARY KEY,
    flagged_at INTEGER NOT NULL,
    flags TEXT NOT NULL,
    severity INTEGER NOT NULL
  );
`);

// ── Config ────────────────────────────────────────────────────
const SIZE                  = 4;
const DAILY_LIMIT           = 5;
const MAX_MOVES_PER_GAME    = 2000;
const MIN_MOVE_GAP_MS       = 90;
const MIN_GAME_MS           = 2000;
const MAX_GAME_DURATION_MS  = 15 * 60 * 1000;
const SESSION_TTL_MS        = 20 * 60 * 1000;

// Milestone rewards: first time the player's highest tile reaches
// each tier, the matching reward is added. Each tile pays once per
// session.
const MILESTONES = [
  { tile:   64, reward:   5 },
  { tile:  128, reward:  10 },
  { tile:  256, reward:  20 },
  { tile:  512, reward:  40 },
  { tile: 1024, reward:  80 },
  { tile: 2048, reward: 160 },
];
const MAX_AWARD_PER_GAME = MILESTONES.reduce((s, m) => s + m.reward, 0);  // 315

const PEPPER = process.env.BLOCKCHAIN_PEPPER || process.env.PUMPDUMP_PEPPER || 'CHANGE_ME_LONG_RANDOM';

const startLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  message: { error: 'Too many requests. Please wait a minute.' },
  keyGenerator: (req) => ipKeyGenerator(req)
});

// ── Reward queue (sequential) ────────────────────────────────
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
      console.log(`[BC-Reward] +${pts} -> ${to.slice(0, 8)} tx=${tx.hash.slice(0, 10)}`);
      resolve(tx.hash);
    } catch (e) {
      console.error('[BC-Reward] failed:', e.shortMessage || e.message);
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
    db.prepare('UPDATE blockchain_sessions SET settled = 1 WHERE settled = 0 AND expires_at < ?')
      .run(Date.now());
  } catch {}
}, 60_000).unref();

// ════════════════════════════════════════════════════════════════
//  2048 ENGINE — pure functions, deterministic from a seed.
//  Both server and client run the SAME algorithm so the replay
//  matches byte-for-byte.
// ════════════════════════════════════════════════════════════════
function rngU32(seed, sessionId, idx) {
  const h = hmac(seed, `${sessionId}:${idx}`);
  return parseInt(h.slice(0, 8), 16) >>> 0;
}

function emptyBoard() {
  const b = [];
  for (let r = 0; r < SIZE; r++) {
    b.push([0, 0, 0, 0]);
  }
  return b;
}

function listEmptyCells(b) {
  const out = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (b[r][c] === 0) out.push([r, c]);
    }
  }
  return out;
}

// Spawn a new tile at a deterministic empty cell. Tile is 2 with
// 90% probability, 4 with 10%. ctx.dropIdx advances each spawn.
function spawnTile(b, ctx) {
  const empties = listEmptyCells(b);
  if (empties.length === 0) return false;
  const u1 = rngU32(ctx.seed, ctx.sessionId, ctx.dropIdx++);
  const u2 = rngU32(ctx.seed, ctx.sessionId, ctx.dropIdx++);
  const idx = u1 % empties.length;
  const [r, c] = empties[idx];
  const isFour = (u2 / 0x100000000) < 0.1;
  b[r][c] = isFour ? 4 : 2;
  return true;
}

function buildInitialBoard(seed, sessionId) {
  const b = emptyBoard();
  const ctx = { seed, sessionId, dropIdx: 0 };
  spawnTile(b, ctx);
  spawnTile(b, ctx);
  return { board: b, ctx };
}

function cloneBoard(b) {
  return b.map((row) => row.slice());
}

function boardEquals(a, b) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

function highestTile(b) {
  let m = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (b[r][c] > m) m = b[r][c];
    }
  }
  return m;
}

// Slide and merge a single line (4 cells). Returns the new line.
// Algorithm: drop zeros, merge consecutive equal pairs once, drop
// zeros again, pad with zeros to length 4.
function slideLine(line) {
  const compact = line.filter((v) => v !== 0);
  for (let i = 0; i < compact.length - 1; i++) {
    if (compact[i] === compact[i + 1]) {
      compact[i] = compact[i] * 2;
      compact[i + 1] = 0;
      i++; // skip next; only one merge per pair
    }
  }
  const merged = compact.filter((v) => v !== 0);
  while (merged.length < SIZE) merged.push(0);
  return merged;
}

// dir: 'L' | 'R' | 'U' | 'D'. Returns new board (mutates a copy).
function applyMove(board, dir) {
  const b = cloneBoard(board);
  if (dir === 'L') {
    for (let r = 0; r < SIZE; r++) {
      b[r] = slideLine(b[r]);
    }
  } else if (dir === 'R') {
    for (let r = 0; r < SIZE; r++) {
      b[r] = slideLine(b[r].slice().reverse()).reverse();
    }
  } else if (dir === 'U') {
    for (let c = 0; c < SIZE; c++) {
      const col = [b[0][c], b[1][c], b[2][c], b[3][c]];
      const nc = slideLine(col);
      for (let r = 0; r < SIZE; r++) b[r][c] = nc[r];
    }
  } else if (dir === 'D') {
    for (let c = 0; c < SIZE; c++) {
      const col = [b[3][c], b[2][c], b[1][c], b[0][c]];
      const nc = slideLine(col);
      for (let r = 0; r < SIZE; r++) b[3 - r][c] = nc[r];
    }
  } else {
    return null;
  }
  return b;
}

function isValidMove(board, dir) {
  const next = applyMove(board, dir);
  if (!next) return false;
  return !boardEquals(board, next);
}

function isGameOver(board) {
  for (const d of ['L', 'R', 'U', 'D']) {
    if (isValidMove(board, d)) return false;
  }
  return true;
}

// Replay full game, return verdict.
function replayGame(seed, sessionId, moves) {
  if (!Array.isArray(moves)) return { ok: false, reason: 'moves_not_array', awarded: 0, highest: 0, hits: [] };
  if (moves.length > MAX_MOVES_PER_GAME) return { ok: false, reason: 'too_many_moves', awarded: 0, highest: 0, hits: [] };

  const init = buildInitialBoard(seed, sessionId);
  let board = init.board;
  const ctx = init.ctx;

  const milestoneHit = new Set();   // tiles already paid
  let awarded = 0;
  let highest = highestTile(board);
  let prevT = -Infinity;

  // Initial board may already include a 4 — check milestones (none
  // at 4 but keep code generic).
  for (const m of MILESTONES) {
    if (highest >= m.tile && !milestoneHit.has(m.tile)) {
      milestoneHit.add(m.tile);
      awarded += m.reward;
    }
  }

  for (let i = 0; i < moves.length; i++) {
    const mv = moves[i];
    if (!mv || typeof mv.d !== 'string') return { ok: false, reason: 'bad_move_shape', awarded, highest, hits: [] };
    const d = mv.d.toUpperCase();
    if (!'LRUD'.includes(d)) return { ok: false, reason: 'bad_dir', awarded, highest, hits: [] };

    const t = Number(mv.t);
    if (!Number.isFinite(t) || t < 0) return { ok: false, reason: 'bad_time', awarded, highest, hits: [] };
    if (i > 0 && t - prevT < MIN_MOVE_GAP_MS) return { ok: false, reason: 'move_too_fast', awarded, highest, hits: [] };
    prevT = t;

    const next = applyMove(board, d);
    if (boardEquals(board, next)) {
      // No-op move means client recorded a swipe that didn't change
      // the board. Reject — legit clients should not record those.
      return { ok: false, reason: 'no_op_move', awarded, highest, hits: [] };
    }

    board = next;

    // Spawn next tile.
    spawnTile(board, ctx);

    // Update highest + check milestones.
    const h = highestTile(board);
    if (h > highest) highest = h;
    for (const m of MILESTONES) {
      if (highest >= m.tile && !milestoneHit.has(m.tile)) {
        milestoneHit.add(m.tile);
        awarded += m.reward;
      }
    }

    // If game-over on the resulting board, stop replay (further
    // client moves were illegal).
    if (isGameOver(board)) {
      // If client kept sending moves past gameover, that's bot/cheat.
      if (i + 1 < moves.length) {
        return { ok: false, reason: 'moves_after_gameover', awarded, highest, hits: [...milestoneHit] };
      }
      break;
    }
  }

  // Last-move timestamp duration check.
  if (moves.length > 0) {
    const lastT = Number(moves[moves.length - 1].t || 0);
    if (lastT > MAX_GAME_DURATION_MS) {
      return { ok: false, reason: 'session_too_long', awarded, highest, hits: [...milestoneHit] };
    }
    if (lastT < 0) {
      return { ok: false, reason: 'bad_time', awarded, highest, hits: [...milestoneHit] };
    }
  }

  // Soft signal: extremely uniform tap gaps over 16+ samples = bot.
  if (moves.length >= 16) {
    const gaps = [];
    for (let i = 1; i < moves.length; i++) gaps.push(moves[i].t - moves[i-1].t);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const std  = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
    if (std < 14) return { ok: false, reason: 'tap_too_uniform', awarded, highest, hits: [...milestoneHit] };
  }

  awarded = Math.max(0, Math.min(MAX_AWARD_PER_GAME, awarded));
  return { ok: true, awarded, highest, hits: [...milestoneHit], movesCount: moves.length };
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
      'SELECT games_played FROM blockchain_daily WHERE wallet=? AND date=?'
    ).get(w, today);
    const played = dailyRow?.games_played || 0;

    const ledgerRow = db.prepare(
      'SELECT COALESCE(SUM(delta), 0) AS total FROM blockchain_ledger WHERE wallet = ? AND reason = ?'
    ).get(w, 'reward');
    const lifetimeWon = ledgerRow?.total || 0;

    const bestRow = db.prepare(
      'SELECT MAX(highest_tile) AS best_tile, MAX(awarded) AS best_pts FROM blockchain_sessions WHERE wallet = ?'
    ).get(w);

    const onChain = await readOnChainPoints(w);

    res.json({
      pointsBalance:     onChain ?? 0,
      gamesPlayed:       played,
      gamesLeft:         Math.max(0, DAILY_LIMIT - played),
      dailyLimit:        DAILY_LIMIT,
      milestones:        MILESTONES,
      maxAwardPerGame:   MAX_AWARD_PER_GAME,
      bestTile:          Number(bestRow?.best_tile || 0),
      bestAwarded:       Number(bestRow?.best_pts  || 0),
      lifetimeWon,
      entryCost:         0,
      size:              SIZE,
    });
  } catch (e) {
    console.error('[/blockchain/stats]', e.message);
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
      'SELECT 1 FROM blockchain_bots WHERE wallet = ? AND flagged_at > ?'
    ).get(w, Date.now() - 24 * 3600 * 1000);
    if (banned) return res.status(403).json({ error: 'wallet_banned_24h' });

    const today = todayIST();
    const dailyRow = db.prepare(
      'SELECT games_played FROM blockchain_daily WHERE wallet=? AND date=?'
    ).get(w, today);
    const played = dailyRow?.games_played || 0;
    if (played >= DAILY_LIMIT) {
      return res.status(429).json({ error: 'daily_limit_reached', gamesLeft: 0 });
    }

    db.prepare(`
      INSERT INTO blockchain_daily (wallet, date, games_played) VALUES (?, ?, 1)
      ON CONFLICT(wallet, date) DO UPDATE SET games_played = games_played + 1
    `).run(w, today);

    const sessionId  = crypto.randomBytes(16).toString('hex');
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    db.prepare(`
      INSERT INTO blockchain_sessions
        (session_id, wallet, server_seed, started_at, fingerprint, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, w, serverSeed, now, fingerprint || null, now + SESSION_TTL_MS);

    res.json({
      sessionId,
      token:           sign(sessionId),
      serverSeed,
      size:            SIZE,
      milestones:      MILESTONES,
      maxAwardPerGame: MAX_AWARD_PER_GAME,
      gamesLeft:       Math.max(0, DAILY_LIMIT - (played + 1)),
      dailyLimit:      DAILY_LIMIT,
    });
  } catch (e) {
    console.error('[/blockchain/start]', e.message);
    res.status(500).json({ error: 'start_failed' });
  }
});

router.post('/end', async (req, res) => {
  try {
    const { sessionId, token, moves, durationMs } = req.body || {};
    if (!sessionId || !token) return res.status(400).json({ error: 'bad_request' });
    if (sign(sessionId) !== token) return res.status(403).json({ error: 'bad_token' });

    const s = db.prepare('SELECT * FROM blockchain_sessions WHERE session_id = ?').get(sessionId);
    if (!s)              return res.status(404).json({ error: 'session_not_found' });
    if (s.settled)       return res.status(409).json({ error: 'already_settled' });
    if (s.expires_at < Date.now()) {
      db.prepare('UPDATE blockchain_sessions SET settled = 1 WHERE session_id = ?').run(sessionId);
      return res.status(410).json({ error: 'session_expired' });
    }

    const v = replayGame(s.server_seed, sessionId, moves);
    if (!v.ok) {
      db.prepare('UPDATE blockchain_sessions SET settled = 1 WHERE session_id = ?').run(sessionId);
      db.prepare(`
        INSERT OR REPLACE INTO blockchain_bots (wallet, flagged_at, flags, severity)
        VALUES (?, ?, ?, ?)
      `).run(s.wallet, Date.now(), JSON.stringify([v.reason]), 70);
      return res.status(403).json({ error: 'invalid_run', reason: v.reason });
    }

    // Server-side duration sanity (independent of client claim).
    const wallElapsed = Date.now() - s.started_at;
    if (wallElapsed < MIN_GAME_MS) {
      db.prepare('UPDATE blockchain_sessions SET settled = 1 WHERE session_id = ?').run(sessionId);
      return res.status(403).json({ error: 'invalid_run', reason: 'session_too_fast' });
    }

    const awarded = v.awarded;

    db.prepare(
      'UPDATE blockchain_sessions SET settled = 1, highest_tile = ?, awarded = ?, moves_count = ? WHERE session_id = ?'
    ).run(v.highest, awarded, v.movesCount || 0, sessionId);

    let txHash = null;
    if (awarded > 0) {
      db.prepare(`
        INSERT INTO blockchain_ledger (wallet, session_id, delta, reason, ts)
        VALUES (?, ?, ?, 'reward', ?)
      `).run(s.wallet, sessionId, awarded, Date.now());

      txHash = await awardPoints(s.wallet, awarded, `blockchain_${sessionId.slice(0, 8)}`);
      if (txHash) {
        db.prepare(
          'UPDATE blockchain_ledger SET tx_hash = ? WHERE session_id = ? AND reason = ?'
        ).run(txHash, sessionId, 'reward');
      }
    }

    const bestRow = db.prepare(
      'SELECT MAX(highest_tile) AS best_tile, MAX(awarded) AS best_pts FROM blockchain_sessions WHERE wallet = ?'
    ).get(s.wallet);

    res.json({
      ok:           true,
      awarded,
      highestTile:  v.highest,
      hits:         v.hits,           // [tiles paid this run]
      movesCount:   v.movesCount,
      bestTile:     Number(bestRow?.best_tile || 0),
      bestAwarded:  Number(bestRow?.best_pts  || 0),
      txHash,
      explorerUrl:  txHash ? `https://liteforge.explorer.caldera.xyz/tx/${txHash}` : null,
    });
  } catch (e) {
    console.error('[/blockchain/end]', e.message);
    res.status(500).json({ error: 'end_failed' });
  }
});

router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT wallet, MAX(highest_tile) AS best_tile, MAX(awarded) AS best_pts
      FROM blockchain_sessions
      WHERE settled = 1
      GROUP BY wallet
      ORDER BY best_tile DESC, best_pts DESC
      LIMIT 25
    `).all();
    res.json({ leaderboard: rows });
  } catch (e) {
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});

module.exports = router;
