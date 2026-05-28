// Patch: real on-chain entry deduction for Pump or Dump.
//
// Current behaviour (web agent's pumpdump.js):
//   * ENTRY_COST = 100 (advertised) / 10 desired
//   * Start: virtual ledger row says -ENTRY_COST, but no on-chain spend
//   * Cashout: credits Math.max(0, pot - ENTRY_COST) via recordQuestFor
//   * Loser: loses NOTHING on chain (only the virtual ledger says -100)
//   * Winner: gets net winnings, fine
//
// Desired behaviour (per user spec):
//   * ENTRY_COST = 10
//   * Start: real on-chain spendPoints(wallet, 10) — burnt forever
//   * Pot starts at 0 (not 10)
//   * Each correct: pot += increment (10/12/14/16 per NFT tier)
//   * Wrong: game over, pot lost, nothing extra (entry already burnt)
//   * Cashout: recordQuestFor(wallet, pot, questId) credits the FULL pot
//
// Net result:
//   * Loser: -10 pts net
//   * Winner with pot=30: -10 + 30 = +20 net
//
// Server usage:
//   wget -O /tmp/fix-pd-entry.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/pumpdump-real-entry-cost/backend-snippets/fix-pumpdump-real-entry.js"
//   node /tmp/fix-pd-entry.js
//   pm2 restart litdex-game

const fs = require('fs');
const SRC = '/root/litvm-dex/game-server/pumpdump.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

// 1) Drop ENTRY_COST from 100 -> 10.
s = s.replace(
  /^(\s*const\s+ENTRY_COST\s*=\s*)100\s*;/m,
  '$110;'
);

// 2) Extend the _points contract ABI to include spendPoints. The
//    pumpdump.js contract handle was instantiated with only
//    recordQuestFor in its ABI, so a direct call fails until we
//    declare the function.
const abiBlock = /const _POINTS_ABI = \[\s*"function recordQuestFor\(address user, uint256 pts, string calldata questId\) external",?\s*\];/;
if (abiBlock.test(s)) {
  s = s.replace(
    abiBlock,
    `const _POINTS_ABI = [
  "function recordQuestFor(address user, uint256 pts, string calldata questId) external",
  "function spendPoints(address user, uint256 amount) external",
];`
  );
} else {
  // Inline ABI variant — try a more flexible match.
  const inlineAbi = /\[\s*"function recordQuestFor\([^"]*\) external"\s*,?\s*\]/;
  if (inlineAbi.test(s)) {
    s = s.replace(
      inlineAbi,
      `[
  "function recordQuestFor(address user, uint256 pts, string calldata questId) external",
  "function spendPoints(address user, uint256 amount) external",
]`
    );
  } else {
    console.warn('[fix-pd-entry] could not auto-extend _POINTS_ABI; manual check:');
    console.warn('  grep -n "_POINTS_ABI\\|recordQuestFor" ' + SRC);
  }
}

// 3) In the /start handler the session is currently inserted with
//    pot = ENTRY_COST so the user "carries" their entry into the pot.
//    Switch the initial pot to 0 — entry is already burnt on chain, the
//    pot now represents pure winnings.
s = s.replace(
  /(\bINSERT INTO pumpdump_sessions[\s\S]*?VALUES \(\?, \?, \?, 0,\s*)\?(\s*,\s*0,)/,
  '$10$2'
);
// And the corresponding `.run(...)` call passes ENTRY_COST as the pot
// arg. Replace that too. The `.run` signature is:
//   .run(sessionId, w, serverSeed, ENTRY_COST, increment, roundTimeMs, ...)
// We want the 4th arg to become 0.
s = s.replace(
  /(\.run\(\s*sessionId,\s*w,\s*serverSeed,\s*)ENTRY_COST(\s*,\s*increment,)/,
  '$10$2'
);

// 4) Change the JSON response to send pot: 0 instead of ENTRY_COST.
s = s.replace(
  /(\bpot:\s*)ENTRY_COST(,)/,
  '$10$2'
);

// 5) Inject the on-chain spendPoints call into /start. Anchor: right
//    before the INSERT INTO pumpdump_daily statement (which is the
//    last step before we mint a session). If the relayer can't spend
//    we abort with 402 so the user isn't charged silently.
const spendInjection = `    // Real on-chain entry burn — relayer calls spendPoints(wallet, ENTRY_COST).
    // Game start aborts if the spend fails so the user is never half-charged.
    try {
      const tx = await _points.spendPoints(w, BigInt(ENTRY_COST));
      await tx.wait();
    } catch (e) {
      console.error('[/pumpdump/start] spendPoints failed:', e.shortMessage || e.message);
      return res.status(402).json({ error: 'entry_burn_failed', detail: e.shortMessage || e.message });
    }

`;
const insertAnchor = /(\s*)db\.prepare\(\s*`\s*\n?\s*INSERT INTO pumpdump_daily/;
if (insertAnchor.test(s) && !s.includes('spendPoints(w, BigInt(ENTRY_COST))')) {
  s = s.replace(insertAnchor, '\n' + spendInjection + '$1db.prepare(`\n      INSERT INTO pumpdump_daily');
}

// 6) Cashout: today the cashout credits Math.max(0, pot - ENTRY_COST).
//    Now pot already starts at 0 and entry is gone, so we credit the
//    full pot. Replace the netCredit math.
s = s.replace(
  /const netCredit = Math\.max\(0,\s*s\.pot - ENTRY_COST\);/,
  'const netCredit = s.pot;'
);
s = s.replace(
  /const netCredit = Math\.max\(0,\s*Number\(s\.pot\) - ENTRY_COST\);/,
  'const netCredit = Number(s.pot);'
);

if (s === before) {
  console.error('[fix-pd-entry] no changes applied');
  process.exit(1);
}

fs.writeFileSync(SRC + '.bak-real-entry', before);
fs.writeFileSync(SRC, s);
console.log('[fix-pd-entry] ENTRY_COST=10, on-chain spendPoints at start, pot starts at 0, cashout credits full pot');
console.log('[fix-pd-entry] backup at ' + SRC + '.bak-real-entry');
