// Patch: soften the anti-bot reaction-time floor in pumpdump.js
//
// Problem: the very first click after the 3-2-1-GO countdown often
// lands < 150 ms because the player is already anticipating, mouse
// hovered over PUMP/DUMP. The current rule trips on a SINGLE rt
// below 150 ms with severity 60, which == hard fail (allow severity < 60).
// Net effect: instant "automation_detected" + game_over right after
// countdown, even for legit humans.
//
// New rule:
//   - Floor lowered from 150 ms to 80 ms (true bots react in ~10-30 ms;
//     humans with hover-then-click can hit ~120 ms).
//   - Need at least 2 sub-floor decisions in a session to flag, OR
//     the average rt of fast clicks must be < 60 ms (clearly inhuman).
//   - Severity per fast click drops 60 -> 40 so a single fast click
//     can never alone exceed the 60 cutoff.
//
// Server usage:
//   wget -O /tmp/fix-pd-bot.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/pumpdump-frontend-entry-10/backend-snippets/fix-pumpdump-bot-rt-grace.js"
//   node /tmp/fix-pd-bot.js
//   pm2 restart litdex-game

const fs = require('fs');
const SRC = '/root/litvm-dex/game-server/pumpdump.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

if (s.includes('// PUMPDUMP_BOT_RT_GRACE_V1')) {
  console.log('[fix-pd-bot] already installed');
  process.exit(0);
}

// The original line we want to replace.
const originalRule = /if \(min < 150\)\s*\{\s*flags\.push\('rt_too_fast'\);\s*severity \+= 60;\s*\}/;

if (!originalRule.test(s)) {
  // Maybe an older patch already changed the threshold — try a looser match.
  const loose = /if \(min < \d+\)\s*\{\s*flags\.push\('rt_too_fast'\);[^}]*severity \+= \d+;\s*\}/;
  if (!loose.test(s)) {
    console.error('[fix-pd-bot] could not find rt_too_fast rule');
    process.exit(1);
  }
  s = s.replace(loose, buildReplacement());
} else {
  s = s.replace(originalRule, buildReplacement());
}

function buildReplacement() {
  return [
    '// PUMPDUMP_BOT_RT_GRACE_V1 — lower floor + require multi-evidence',
    '  const fastClicks = rts.filter(r => r < 80).length;',
    '  const fastMean   = fastClicks ? rts.filter(r => r < 80).reduce((a,b)=>a+b,0) / fastClicks : 0;',
    '  if (fastClicks >= 2 || (fastClicks === 1 && fastMean < 60)) {',
    "    flags.push('rt_too_fast'); severity += 40;",
    '  }',
  ].join('\n  ');
}

if (s === before) {
  console.error('[fix-pd-bot] no changes applied');
  process.exit(1);
}

fs.writeFileSync(SRC + '.bak-bot-rt-grace', before);
fs.writeFileSync(SRC, s);
console.log('[fix-pd-bot] anti-bot rt floor relaxed; backup at ' + SRC + '.bak-bot-rt-grace');
