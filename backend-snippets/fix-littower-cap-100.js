// Patch: bump Lit Tower per-game cap from 20 -> 100.
// Also widens session window to 10 minutes since 100 stacks at the
// minimum 220 ms gap is ~22 s of pure tapping plus the time the
// slider takes to cross the screen.
//
// Server usage:
//   wget -O /tmp/fix-lt-cap.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/lit-tower-game/backend-snippets/fix-littower-cap-100.js"
//   node /tmp/fix-lt-cap.js
//   pm2 restart litdex-game

const fs = require('fs');
const SRC = '/root/litvm-dex/game-server/littower.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

if (s.includes('// LITTOWER_CAP_100_V1')) {
  console.log('[fix-lt-cap] already installed');
  process.exit(0);
}

const re1 = /const MAX_STACKS_PER_GAME\s*=\s*\d+;/;
const re2 = /const MAX_GAME_DURATION_MS\s*=\s*\d+\s*\*\s*60\s*\*\s*1000;/;

if (!re1.test(s)) {
  console.error('[fix-lt-cap] cap line not found');
  process.exit(1);
}

s = s.replace(re1, '// LITTOWER_CAP_100_V1\nconst MAX_STACKS_PER_GAME  = 100;');
if (re2.test(s)) {
  s = s.replace(re2, 'const MAX_GAME_DURATION_MS = 10 * 60 * 1000;');
}

if (s === before) {
  console.error('[fix-lt-cap] no changes applied');
  process.exit(1);
}

fs.writeFileSync(SRC + '.bak-cap100', before);
fs.writeFileSync(SRC, s);
console.log('[fix-lt-cap] cap raised to 100; backup at ' + SRC + '.bak-cap100');
