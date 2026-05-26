// Patch: remove the "Play N more Math Slash games to unlock faucet"
// gate from /faucet/claim. The NFT + .lit domain gate already covers
// anti-bot needs, so the games requirement is now redundant.
//
// Server usage:
//   wget -O /tmp/drop-games.js "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/faucet-remove-games-gate/backend-snippets/faucet-drop-games-check.js"
//   node /tmp/drop-games.js
//   pm2 restart litdex-quest-api
//
// Strategy: snip out the entire "// Game check" try/catch region.
// Anchors:
//   * opening comment "// Game check"
//   * closing log "[FaucetGameCheck] error:" inside the catch
// The whole region is replaced with a single neutral marker line so
// downstream code remains structurally valid.

const fs = require('fs');
const SRC = '/root/litvm-dex/twitter-auth/server.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

// The production file uses an em-dash in the comment, but we accept
// either form. The catch block is single-line in the inspected source;
// we still allow arbitrary whitespace.
const blockRe = /[ \t]*\/\/\s*Game check[\s\S]*?\}\s*catch\s*\(\s*ge\s*\)\s*\{[\s\S]*?\[FaucetGameCheck\][\s\S]*?\}\s*\n/;

if (!blockRe.test(s)) {
  console.error('[drop-games] block not found; inspect:');
  console.error('  grep -n "Game check\\|FaucetGameCheck\\|UNLOCK FAUCET" ' + SRC);
  process.exit(1);
}

s = s.replace(
  blockRe,
  '      // FAUCET_GAMES_GATE_REMOVED - games-played check dropped (NFT + .lit domain gates the faucet)\n'
);

if (s === before) {
  console.error('[drop-games] match counted but text unchanged');
  process.exit(1);
}

fs.writeFileSync(SRC + '.bak-games-gate', before);
fs.writeFileSync(SRC, s);
console.log('[drop-games] games gate removed; backup at ' + SRC + '.bak-games-gate');
