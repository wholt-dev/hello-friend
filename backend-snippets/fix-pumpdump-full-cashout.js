// Patch: cashout credits the full pot now that entry is burnt on
// chain via spendPoints.
//
// Previous logic:
//   const netCredit = Math.max(0, s.pot - ENTRY_COST);
//
// That made sense when entry was virtual (just a ledger row). But
// since the real-entry patch the entry is already deducted on chain
// at /start time, so subtracting it again at cashout double-charges
// the user.
//
// New logic:
//   const netCredit = Math.max(0, s.pot);
//
// User cashes out exactly what they earned. If pot == 100, they get
// 100 pts credited via recordQuestFor.
//
// Server usage:
//   wget -O /tmp/fix-pd-cash.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/pumpdump-frontend-entry-10/backend-snippets/fix-pumpdump-full-cashout.js"
//   node /tmp/fix-pd-cash.js
//   pm2 restart litdex-game

const fs = require('fs');
const SRC = '/root/litvm-dex/game-server/pumpdump.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

if (s.includes('// PUMPDUMP_FULL_CASHOUT_V1')) {
  console.log('[fix-pd-cash] already installed');
  process.exit(0);
}

// Match either of the two existing forms (with or without ENTRY_COST).
const r1 = /const netCredit = Math\.max\(0,\s*s\.pot - ENTRY_COST\);/;
const r2 = /const netCredit = Math\.max\(0,\s*Number\(s\.pot\) - ENTRY_COST\);/;
const r3 = /const netCredit = s\.pot;/; // already-fixed earlier

const replacement = '// PUMPDUMP_FULL_CASHOUT_V1\n      const netCredit = Math.max(0, Number(s.pot) || 0);';

if (r1.test(s)) {
  s = s.replace(r1, replacement);
} else if (r2.test(s)) {
  s = s.replace(r2, replacement);
} else if (r3.test(s)) {
  s = s.replace(r3, replacement);
} else {
  console.error('[fix-pd-cash] could not locate netCredit assignment');
  console.error('  manual check: grep -n "netCredit" ' + SRC);
  process.exit(1);
}

if (s === before) {
  console.error('[fix-pd-cash] no changes applied');
  process.exit(1);
}

fs.writeFileSync(SRC + '.bak-full-cashout', before);
fs.writeFileSync(SRC, s);
console.log('[fix-pd-cash] cashout now credits full pot; backup at ' + SRC + '.bak-full-cashout');
