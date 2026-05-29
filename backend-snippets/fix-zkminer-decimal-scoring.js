// Patch: switch ZK Miner from "rig charges" (1 PT each) to a
// decimal scoring system where every cleared gem = 0.1 PT.
//
// 3-match = 0.3 PT, 4-match = 0.4 PT, 5-match = 0.5 PT,
// cascade chains stack on top. Player banks the floor() of the
// total over 30 moves. Per-game cap is 50 PTS.
//
// Implementation note: the simplest reliable path is to overwrite
// the live zkminer.js with the latest GitHub copy. The DB schema
// reuses the same `charges` column to store deci-score (just an
// integer with a different scale), so no migration is needed —
// the previous "best charges" rows from yesterday still load,
// they just look bigger because 1 charge used to be ~10 deci.
//
// Server usage:
//   wget -O /root/litvm-dex/game-server/zkminer.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/zk-miner-game/backend-snippets/zkminer.js"
//   pm2 restart litdex-game

const fs = require('fs');
const SRC = '/root/litvm-dex/game-server/zkminer.js';

const content = fs.readFileSync(SRC, 'utf8');
if (content.includes('const DECI_PER_PT')) {
  console.log('[fix-zm-deci] already on decimal scoring');
  process.exit(0);
}

console.log('[fix-zm-deci] this script is informational only.');
console.log('  to deploy:');
console.log('    wget -O /root/litvm-dex/game-server/zkminer.js \\');
console.log('      "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/zk-miner-game/backend-snippets/zkminer.js"');
console.log('    pm2 restart litdex-game');
