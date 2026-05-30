#!/usr/bin/env node
/* eslint-disable no-console */
//
// weekly-rewards-payout.js
//
// Distributes weekly leaderboard rewards across all 12 games. Reads each
// game's top-20 directly from its SQLite DB, then pays per tier:
//
//   Rank 1      1 zkLTC + 10K LDEX + 2,500 PTS
//   Rank 2             10K LDEX + 1,000 PTS
//   Rank 3              5K LDEX +   500 PTS
//   Rank 4-10           3K LDEX +   300 PTS
//   Rank 11-20          1K LDEX +   100 PTS
//
// Real tokens (zkLTC + LDEX) come from REWARDS_PRIVATE_KEY (the dedicated,
// pre-funded distributor). PTS are minted by PRIVATE_KEY (the authorized
// PointsSystem signer / 0x3bc...).
//
// SAFETY:
//   - DRY RUN by default. Prints the full distribution plan and the wallet
//     balances. Pass --execute to actually send.
//   - Idempotent per week: records paid (week, game, wallet) in a
//     `weekly_payouts` table so re-running the same week never double-pays.
//   - Skips a tier/game if the rewards wallet can't cover it, logging a
//     clear WARNING (so you can top up and re-run safely).
//
// Schedule (every Sunday 23:59 IST = 18:29 UTC):
//   29 18 * * 0  cd /root/litvm-dex/game-server && node weekly-rewards-payout.js --execute >> /root/weekly-rewards.log 2>&1
//
// Usage:
//   node weekly-rewards-payout.js            # dry run, shows plan
//   node weekly-rewards-payout.js --execute  # actually distribute

require('dotenv').config({ path: '../.env' });
const path = require('path');
const Database = require('better-sqlite3');
const rw = require('./rewards-wallet');

const EXECUTE = process.argv.includes('--execute');
const SERVER_DIR = process.cwd();

const LDEX_ADDR   = process.env.LDEX_ADDR   || '0xBAaba603e6298fbb76325a6B0d47Cd57154ca641';
const POINTS_ADDR = process.env.POINTS_ADDR || '0x526B0629C81d3314929dB8166372F792F3da3419';

// Earliest date (IST) on which a real distribution may run. The first
// reward week is Mon 1 Jun 2026 → Sun 7 Jun 2026, so the first payout
// fires Sunday 7 Jun 2026 23:59 IST. Any --execute run before this date
// is blocked (so a cron firing on Sun 31 May 2026 does NOT pay out the
// current week). Override with REWARDS_FIRST_PAYOUT=YYYY-MM-DD.
const FIRST_PAYOUT = process.env.REWARDS_FIRST_PAYOUT || '2026-06-07';
function istDateStr() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Per-rank reward tiers.
function tierFor(rank) {
  if (rank === 1)  return { zkltc: 1, ldex: 10000, pts: 2500 };
  if (rank === 2)  return { zkltc: 0, ldex: 10000, pts: 1000 };
  if (rank === 3)  return { zkltc: 0, ldex: 5000,  pts: 500 };
  if (rank <= 10)  return { zkltc: 0, ldex: 3000,  pts: 300 };
  if (rank <= 20)  return { zkltc: 0, ldex: 1000,  pts: 100 };
  return null;
}

// All games share one SQLite file on the server (simple_game.db). Each
// game's tables live inside it. The Math Slash leaderboard reads from
// simple_scores.
const SHARED_DB = process.env.GAMES_DB || 'simple_game.db';

const GAMES = [
  { id: 'litdice',     sql: "SELECT wallet FROM litdice_rounds WHERE settled=1 AND won=1 GROUP BY wallet ORDER BY MAX(multiplier_x100) DESC LIMIT 20" },
  { id: 'litlimbo',    sql: "SELECT wallet FROM litlimbo_rounds WHERE settled=1 AND won=1 GROUP BY wallet ORDER BY MAX(rolled_x100) DESC LIMIT 20" },
  { id: 'litmines',    sql: "SELECT wallet FROM litmines_rounds WHERE settled=1 AND outcome='cashout' GROUP BY wallet ORDER BY MAX(multiplier_x100) DESC LIMIT 20" },
  { id: 'litplinko',   sql: "SELECT wallet FROM litplinko_rounds WHERE settled=1 GROUP BY wallet ORDER BY MAX(multiplier_x100) DESC LIMIT 20" },
  { id: 'litwheel',    sql: "SELECT wallet FROM litwheel_rounds WHERE settled=1 GROUP BY wallet ORDER BY MAX(multiplier_x100) DESC LIMIT 20" },
  { id: 'litcoinflip', sql: "SELECT wallet FROM litcoin_rounds WHERE settled=1 AND won=1 GROUP BY wallet ORDER BY MAX(streak) DESC LIMIT 20" },
  { id: 'pumpdump',    sql: "SELECT wallet FROM pumpdump_sessions WHERE settled=1 GROUP BY wallet ORDER BY MAX(pot) DESC LIMIT 20" },
  { id: 'littower',    sql: "SELECT wallet FROM littower_sessions WHERE settled=1 GROUP BY wallet ORDER BY MAX(height) DESC LIMIT 20" },
  { id: 'zkminer',     sql: "SELECT wallet FROM zkminer_sessions WHERE settled=1 GROUP BY wallet ORDER BY MAX(charges) DESC LIMIT 20" },
  { id: 'litlaunch',   sql: "SELECT wallet FROM litlaunch_sessions WHERE settled=1 GROUP BY wallet ORDER BY MAX(awarded) DESC LIMIT 20" },
  { id: 'blockchain',  sql: "SELECT wallet FROM blockchain_sessions WHERE settled=1 GROUP BY wallet ORDER BY MAX(highest_tile) DESC LIMIT 20" },
  // Math Slash leaderboard (shares the same DB).
  { id: 'mathslash',   sql: "SELECT wallet FROM simple_scores GROUP BY wallet ORDER BY MAX(total_score) DESC LIMIT 20", optional: true },
];

// ISO week key like 2026-W22 (UTC) so we never double-pay the same week.
function weekKey() {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7;          // Mon=0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  const jan1 = new Date(Date.UTC(monday.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((monday - jan1) / 86400000) + 1) / 7);
  return `${monday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function openDb(file) {
  const fp = path.join(SERVER_DIR, file);
  try { return new Database(fp, { readonly: true, fileMustExist: true }); }
  catch { return null; }
}

// Idempotency ledger lives in its own db so it survives game-db resets.
const payoutDb = new Database(path.join(SERVER_DIR, 'weekly-payouts.db'));
payoutDb.pragma('journal_mode = WAL');
payoutDb.exec(`
  CREATE TABLE IF NOT EXISTS weekly_payouts (
    week TEXT NOT NULL, game TEXT NOT NULL, wallet TEXT NOT NULL, rank INTEGER NOT NULL,
    zkltc REAL, ldex REAL, pts INTEGER,
    zkltc_tx TEXT, ldex_tx TEXT, pts_tx TEXT, ts INTEGER NOT NULL,
    PRIMARY KEY (week, game, wallet)
  );
`);
const alreadyPaid = (week, game, wallet) =>
  !!payoutDb.prepare('SELECT 1 FROM weekly_payouts WHERE week=? AND game=? AND wallet=?').get(week, game, wallet);
const recordPaid = (rec) =>
  payoutDb.prepare(`INSERT OR REPLACE INTO weekly_payouts
    (week, game, wallet, rank, zkltc, ldex, pts, zkltc_tx, ldex_tx, pts_tx, ts)
    VALUES (@week,@game,@wallet,@rank,@zkltc,@ldex,@pts,@zkltc_tx,@ldex_tx,@pts_tx,@ts)`).run(rec);

(async () => {
  const week = weekKey();
  console.log(`\n=== LitDeX Weekly Rewards · ${week} · ${EXECUTE ? 'EXECUTE' : 'DRY RUN'} ===\n`);

  rw.init({
    rpcs: (process.env.CASINO_RPCS || 'https://liteforge.rpc.caldera.xyz/http').split(',').map((u) => u.trim()).filter(Boolean),
    rewardsPrivateKey: process.env.REWARDS_PRIVATE_KEY,
    pointsPrivateKey:  process.env.PRIVATE_KEY,
    ldexAddr: LDEX_ADDR,
    pointsAddr: POINTS_ADDR,
    chainId: 4441,
  });

  if (!process.env.REWARDS_PRIVATE_KEY) {
    console.error('REWARDS_PRIVATE_KEY not set in .env — aborting.');
    process.exit(1);
  }

  const bal = await rw.balances();
  console.log(`Rewards wallet: ${bal.address}`);
  console.log(`  zkLTC: ${bal.zkltc}`);
  console.log(`  LDEX:  ${bal.ldex} (decimals ${bal.ldexDecimals})\n`);

  // Build the plan from the single shared games DB.
  const plan = [];
  let needZkltc = 0, needLdex = 0, needPts = 0;
  const gdb = openDb(SHARED_DB);
  if (!gdb) {
    console.error(`Could not open shared games DB: ${path.join(SERVER_DIR, SHARED_DB)}`);
    process.exit(1);
  }
  for (const g of GAMES) {
    let rows = [];
    try { rows = gdb.prepare(g.sql).all(); }
    catch (e) { if (!g.optional) console.log(`[skip] ${g.id} — ${e.message}`); continue; }
    rows.forEach((row, i) => {
      const rank = i + 1;
      const t = tierFor(rank);
      if (!t) return;
      const wallet = String(row.wallet).toLowerCase();
      if (alreadyPaid(week, g.id, wallet)) return;
      plan.push({ game: g.id, wallet, rank, ...t });
      needZkltc += t.zkltc; needLdex += t.ldex; needPts += t.pts;
    });
  }
  gdb.close();

  console.log(`Plan: ${plan.length} payouts across ${new Set(plan.map((p) => p.game)).size} games`);
  console.log(`  Total zkLTC needed: ${needZkltc}`);
  console.log(`  Total LDEX needed:  ${needLdex}`);
  console.log(`  Total PTS needed:   ${needPts}\n`);

  if (bal.zkltc < needZkltc) console.log(`⚠ WARNING: zkLTC short by ${(needZkltc - bal.zkltc).toFixed(4)} — some zkLTC payouts will be skipped.`);
  if (bal.ldex  < needLdex)  console.log(`⚠ WARNING: LDEX short by ${(needLdex - bal.ldex).toLocaleString()} — some LDEX payouts will be skipped.`);

  if (!EXECUTE) {
    console.log('\nDRY RUN — no transactions sent. Re-run with --execute to distribute.');
    plan.slice(0, 60).forEach((p) => console.log(`  ${p.game} #${p.rank} ${p.wallet} → ${p.zkltc} zkLTC, ${p.ldex} LDEX, ${p.pts} PTS`));
    if (plan.length > 60) console.log(`  …and ${plan.length - 60} more`);
    process.exit(0);
  }

  // Hard guard: do not distribute before the first scheduled payout date.
  // This protects against a cron that fires on an earlier Sunday.
  const today = istDateStr();
  if (today < FIRST_PAYOUT) {
    console.log(`\n⏳ Today (${today} IST) is before the first payout date (${FIRST_PAYOUT}).`);
    console.log('   No rewards distributed. The first payout runs on/after that date.');
    process.exit(0);
  }

  // Execute. Track running balance so we don't overspend real tokens.
  let zkLeft = bal.zkltc, ldexLeft = bal.ldex;
  let done = 0, skipped = 0;
  for (const p of plan) {
    let zkltcTx = null, ldexTx = null, ptsTx = null;
    if (p.zkltc > 0) {
      if (zkLeft >= p.zkltc) { zkltcTx = await rw.sendZkltc(p.wallet, p.zkltc); if (zkltcTx) zkLeft -= p.zkltc; }
      else console.log(`  ⚠ skip zkLTC for ${p.game} #${p.rank} ${p.wallet} (insufficient)`);
    }
    if (p.ldex > 0) {
      if (ldexLeft >= p.ldex) { ldexTx = await rw.sendLdex(p.wallet, p.ldex); if (ldexTx) ldexLeft -= p.ldex; }
      else console.log(`  ⚠ skip LDEX for ${p.game} #${p.rank} ${p.wallet} (insufficient)`);
    }
    if (p.pts > 0) ptsTx = await rw.sendPts(p.wallet, p.pts, `weekly_${week}_${p.game}_r${p.rank}`);

    recordPaid({
      week, game: p.game, wallet: p.wallet, rank: p.rank,
      zkltc: p.zkltc, ldex: p.ldex, pts: p.pts,
      zkltc_tx: zkltcTx, ldex_tx: ldexTx, pts_tx: ptsTx, ts: Date.now(),
    });
    done++;
    console.log(`  ✓ ${p.game} #${p.rank} ${p.wallet} | zkLTC:${zkltcTx ? zkltcTx.slice(0,10) : '-'} LDEX:${ldexTx ? ldexTx.slice(0,10) : '-'} PTS:${ptsTx ? ptsTx.slice(0,10) : '-'}`);
  }

  console.log(`\nDone. ${done} payouts recorded, ${skipped} skipped.`);
  console.log(`Remaining: ${zkLeft.toFixed(4)} zkLTC, ${ldexLeft.toLocaleString()} LDEX`);
})();
