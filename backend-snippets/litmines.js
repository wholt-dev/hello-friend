// ════════════════════════════════════════════════════════════════
//  LIT MINES — backend route (5x5 grid risk game)
//  Drop into: /root/litvm-dex/game-server/litmines.js
//  Mount: app.use('/litmines', require('./litmines'));
//
//  5x5 grid. Player picks number of bombs (3, 5, or 10). Reveals
//  safe cells one at a time; each safe reveal increases the
//  multiplier. Player can cash out anytime to bank stake × current
//  multiplier. Hitting a bomb = stake lost.
//
//  Multiplier after k safe reveals with M bombs on a 25-cell board
//  is the inverse of the cumulative probability of getting all k
//  reveals safely, scaled by RTP:
//
//    P(all k safe) = C(25-M, k) / C(25, k)
//    multiplier(k) = (1 / P) * (RTP / 100)
//
//  Provably fair: server commits seedHash at /start, reveals seed
//  at /cashout (or auto on bomb). Bomb positions derived from
//  HMAC(serverSeed, roundId).
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
  CREATE TABLE IF NOT EXISTS litmines_daily (
    wallet TEXT NOT NULL, date TEXT NOT NULL,
    games_played INTEGER DEFAULT 0,
    PRIMARY KEY (wallet, date)
  );
  CREATE TABLE IF NOT EXISTS litmines_rounds (
    round_id TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    server_seed TEXT NOT NULL,
    seed_hash TEXT NOT NULL,
    stake INTEGER NOT NULL,
    bombs INTEGER NOT NULL,
    revealed_json TEXT NOT NULL DEFAULT '[]',
    bomb_cells_json TEXT,
    multiplier_x100 INTEGER DEFAULT 100,
    awarded INTEGER DEFAULT 0,
    outcome TEXT,
    settled INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS litmines_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL, round_id TEXT,
    delta INTEGER NOT NULL, reason TEXT NOT NULL,
    tx_hash TEXT, ts INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mledger_wallet ON litmines_ledger(wallet);
`);

const STAKE = 5;
const DAILY_LIMIT = 20;
const SIZE = 25;
const RTP_X100 = 97;
const VALID_BOMBS = [3, 5, 10];
const ROUND_TTL_MS = 5 * 60 * 1000;
const PEPPER = process.env.LITMINES_PEPPER || process.env.PUMPDUMP_PEPPER || 'CHANGE_ME_LONG_RANDOM';
const startLimiter = rateLimit({ windowMs: 60000, max: 30, keyGenerator: (req) => ipKeyGenerator(req), message: { error: 'rate_limited' } });

const _txQueue = [];
let _txRunning = false;
function enqTx(fn) { return new Promise((res) => { _txQueue.push({ fn, res }); pumpTx(); }); }
async function pumpTx() {
  if (_txRunning) return; _txRunning = true;
  while (_txQueue.length > 0) {
    const { fn, res } = _txQueue.shift();
    try { const tx = await fn(); await tx.wait(); res(tx.hash); }
    catch (e) { console.error('[LM-Tx]', e.shortMessage || e.message); res(null); }
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
  try { db.prepare('UPDATE litmines_rounds SET settled = 1 WHERE settled = 0 AND expires_at < ?').run(Date.now()); } catch {}
}, 60_000).unref();

// Deterministic shuffle: pick bomb cells from server seed.
function bombCellsFor(serverSeed, roundId, bombs) {
  const cells = Array.from({ length: SIZE }, (_, i) => i);
  // Fisher-Yates with HMAC-derived random ints.
  for (let i = SIZE - 1; i > 0; i--) {
    const h = hmac(serverSeed, `${roundId}:${i}`);
    const r = (parseInt(h.slice(0, 8), 16) >>> 0) % (i + 1);
    const t = cells[i]; cells[i] = cells[r]; cells[r] = t;
  }
  return new Set(cells.slice(0, bombs));
}

// Multiplier after k safe reveals: (C(25,k) / C(25-M,k)) × RTP/100
function comb(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
function multiplierAfter(k, bombs) {
  const safe = SIZE - bombs;
  if (k <= 0) return 1;
  if (k > safe) return 0;
  const cAll = comb(SIZE, k);
  const cSafe = comb(safe, k);
  if (cSafe <= 0) return 0;
  return (cAll / cSafe) * (RTP_X100 / 100);
}

router.get('/stats/:wallet', async (req, res) => {
  try {
    const w = String(req.params.wallet || '').toLowerCase();
    if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });
    const today = todayIST();
    const dr = db.prepare('SELECT games_played FROM litmines_daily WHERE wallet=? AND date=?').get(w, today);
    const played = dr?.games_played || 0;
    const lr = db.prepare(`SELECT COALESCE(SUM(delta), 0) AS total FROM litmines_ledger WHERE wallet = ? AND reason = ?`).get(w, 'cashout');
    const totalWon = lr?.total || 0;
    const br = db.prepare("SELECT MAX(multiplier_x100) AS best_mult FROM litmines_rounds WHERE wallet = ? AND outcome = 'cashout'").get(w);
    const onChain = await readOnChainPoints(w);
    res.json({
      pointsBalance: onChain ?? 0,
      gamesPlayed: played,
      gamesLeft: Math.max(0, DAILY_LIMIT - played),
      dailyLimit: DAILY_LIMIT,
      stake: STAKE,
      gridSize: SIZE,
      rtp: RTP_X100 / 100,
      validBombs: VALID_BOMBS,
      bestMultiplier: ((br?.best_mult || 0) / 100),
      lifetimeWon: totalWon,
    });
  } catch (e) { console.error('[/litmines/stats]', e.message); res.status(500).json({ error: 'stats_failed' }); }
});

router.post('/start', startLimiter, async (req, res) => {
  try {
    const { wallet, bombs } = req.body || {};
    if (!wallet) return res.status(400).json({ error: 'wallet_required' });
    const w = String(wallet).toLowerCase();
    if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });
    const M = Math.floor(Number(bombs));
    if (!VALID_BOMBS.includes(M)) return res.status(400).json({ error: 'bad_bombs' });

    const today = todayIST();
    const dr = db.prepare('SELECT games_played FROM litmines_daily WHERE wallet=? AND date=?').get(w, today);
    const played = dr?.games_played || 0;
    if (played >= DAILY_LIMIT) return res.status(429).json({ error: 'daily_limit_reached', gamesLeft: 0 });

    const bal = await readOnChainPoints(w);
    if (bal != null && bal < STAKE) return res.status(402).json({ error: 'need_min_points', need: STAKE, have: bal });

    db.prepare(`INSERT INTO litmines_daily (wallet, date, games_played) VALUES (?, ?, 1)
                ON CONFLICT(wallet, date) DO UPDATE SET games_played = games_played + 1`).run(w, today);

    const roundId    = crypto.randomBytes(16).toString('hex');
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const seedHash   = sha256(serverSeed);
    const now = Date.now();
    db.prepare(`INSERT INTO litmines_rounds (round_id, wallet, server_seed, seed_hash, stake, bombs, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(roundId, w, serverSeed, seedHash, STAKE, M, now, now + ROUND_TTL_MS);

    const burnHash = await spendStake(w, STAKE);
    if (!burnHash) {
      db.prepare('UPDATE litmines_rounds SET settled = 1 WHERE round_id = ?').run(roundId);
      return res.status(502).json({ error: 'stake_spend_failed' });
    }
    db.prepare(`INSERT INTO litmines_ledger (wallet, round_id, delta, reason, tx_hash, ts)
                VALUES (?, ?, ?, 'entry', ?, ?)`).run(w, roundId, -STAKE, burnHash, now);

    // Precompute multiplier table (1..safeCount).
    const safe = SIZE - M;
    const table = [];
    for (let k = 1; k <= safe; k++) table.push({ k, multiplier: multiplierAfter(k, M) });

    res.json({
      roundId, token: sign(roundId), seedHash,
      stake: STAKE, bombs: M, gridSize: SIZE,
      multipliers: table,
      gamesLeft: Math.max(0, DAILY_LIMIT - (played + 1)), dailyLimit: DAILY_LIMIT,
      entryTxHash: burnHash,
    });
  } catch (e) { console.error('[/litmines/start]', e.message); res.status(500).json({ error: 'start_failed' }); }
});

// Reveal one cell. If safe, return updated multiplier. If bomb, settle the round (lose).
router.post('/reveal', async (req, res) => {
  try {
    const { roundId, token, cell } = req.body || {};
    if (!roundId || !token) return res.status(400).json({ error: 'bad_request' });
    if (sign(roundId) !== token) return res.status(403).json({ error: 'bad_token' });
    const c = Math.floor(Number(cell));
    if (!Number.isFinite(c) || c < 0 || c >= SIZE) return res.status(400).json({ error: 'bad_cell' });

    const r = db.prepare('SELECT * FROM litmines_rounds WHERE round_id = ?').get(roundId);
    if (!r) return res.status(404).json({ error: 'round_not_found' });
    if (r.settled) return res.status(409).json({ error: 'already_settled' });
    if (r.expires_at < Date.now()) {
      db.prepare('UPDATE litmines_rounds SET settled = 1 WHERE round_id = ?').run(roundId);
      return res.status(410).json({ error: 'round_expired' });
    }

    const revealed = JSON.parse(r.revealed_json || '[]');
    if (revealed.includes(c)) return res.status(400).json({ error: 'already_revealed' });

    const bombs = bombCellsFor(r.server_seed, roundId, r.bombs);
    if (bombs.has(c)) {
      // Boom. Reveal full board, settle as loss.
      db.prepare(`UPDATE litmines_rounds
                  SET settled = 1, outcome = 'bomb', revealed_json = ?, bomb_cells_json = ?
                  WHERE round_id = ?`).run(
        JSON.stringify([...revealed, c]),
        JSON.stringify([...bombs]),
        roundId
      );
      return res.json({
        ok: true, hit: 'bomb', cell: c,
        revealed: [...revealed, c], bombCells: [...bombs],
        multiplier: 0, awarded: 0, stake: r.stake,
        serverSeed: r.server_seed, seedHash: r.seed_hash,
      });
    }

    revealed.push(c);
    const k = revealed.length;
    const mult = multiplierAfter(k, r.bombs);
    const multX100 = Math.round(mult * 100);
    const safe = SIZE - r.bombs;

    if (k >= safe) {
      // All safe cells revealed — auto-cashout at max multiplier.
      const awarded = Math.floor((r.stake * multX100) / 100);
      db.prepare(`UPDATE litmines_rounds
                  SET settled = 1, outcome = 'cashout', revealed_json = ?, bomb_cells_json = ?,
                      multiplier_x100 = ?, awarded = ?
                  WHERE round_id = ?`).run(
        JSON.stringify(revealed),
        JSON.stringify([...bombs]),
        multX100, awarded, roundId
      );
      let txHash = null;
      if (awarded > 0) {
        db.prepare(`INSERT INTO litmines_ledger (wallet, round_id, delta, reason, ts)
                    VALUES (?, ?, ?, 'cashout', ?)`).run(r.wallet, roundId, awarded, Date.now());
        txHash = await awardPoints(r.wallet, awarded, `litmines_${roundId.slice(0, 8)}`);
        if (txHash) db.prepare(`UPDATE litmines_ledger SET tx_hash = ? WHERE round_id = ? AND reason = 'cashout'`).run(txHash, roundId);
      }
      return res.json({
        ok: true, hit: 'safe', cell: c,
        revealed, bombCells: [...bombs],
        multiplier: multX100 / 100, awarded, stake: r.stake,
        autoCashout: true, profit: awarded - r.stake,
        serverSeed: r.server_seed, seedHash: r.seed_hash,
        txHash, explorerUrl: txHash ? `https://liteforge.explorer.caldera.xyz/tx/${txHash}` : null,
      });
    }

    db.prepare(`UPDATE litmines_rounds SET revealed_json = ?, multiplier_x100 = ? WHERE round_id = ?`).run(
      JSON.stringify(revealed), multX100, roundId
    );
    res.json({
      ok: true, hit: 'safe', cell: c,
      revealed, multiplier: multX100 / 100, stake: r.stake,
      multiplierIfCashout: multX100 / 100,
      potentialPayout: Math.floor((r.stake * multX100) / 100),
    });
  } catch (e) { console.error('[/litmines/reveal]', e.message); res.status(500).json({ error: 'reveal_failed' }); }
});

router.post('/cashout', async (req, res) => {
  try {
    const { roundId, token } = req.body || {};
    if (!roundId || !token) return res.status(400).json({ error: 'bad_request' });
    if (sign(roundId) !== token) return res.status(403).json({ error: 'bad_token' });

    const r = db.prepare('SELECT * FROM litmines_rounds WHERE round_id = ?').get(roundId);
    if (!r) return res.status(404).json({ error: 'round_not_found' });
    if (r.settled) return res.status(409).json({ error: 'already_settled' });
    if (r.expires_at < Date.now()) {
      db.prepare('UPDATE litmines_rounds SET settled = 1 WHERE round_id = ?').run(roundId);
      return res.status(410).json({ error: 'round_expired' });
    }

    const revealed = JSON.parse(r.revealed_json || '[]');
    if (revealed.length === 0) return res.status(400).json({ error: 'no_reveals_yet' });

    const multX100 = r.multiplier_x100;
    const awarded  = Math.floor((r.stake * multX100) / 100);
    const bombs = bombCellsFor(r.server_seed, roundId, r.bombs);

    db.prepare(`UPDATE litmines_rounds
                SET settled = 1, outcome = 'cashout', awarded = ?, bomb_cells_json = ?
                WHERE round_id = ?`).run(awarded, JSON.stringify([...bombs]), roundId);

    let txHash = null;
    if (awarded > 0) {
      db.prepare(`INSERT INTO litmines_ledger (wallet, round_id, delta, reason, ts)
                  VALUES (?, ?, ?, 'cashout', ?)`).run(r.wallet, roundId, awarded, Date.now());
      txHash = await awardPoints(r.wallet, awarded, `litmines_${roundId.slice(0, 8)}`);
      if (txHash) db.prepare(`UPDATE litmines_ledger SET tx_hash = ? WHERE round_id = ? AND reason = 'cashout'`).run(txHash, roundId);
    }

    res.json({
      ok: true, multiplier: multX100 / 100, awarded, stake: r.stake,
      profit: awarded - r.stake, revealed, bombCells: [...bombs],
      serverSeed: r.server_seed, seedHash: r.seed_hash,
      txHash, explorerUrl: txHash ? `https://liteforge.explorer.caldera.xyz/tx/${txHash}` : null,
    });
  } catch (e) { console.error('[/litmines/cashout]', e.message); res.status(500).json({ error: 'cashout_failed' }); }
});

module.exports = router;
