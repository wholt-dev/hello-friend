#!/usr/bin/env node
/* eslint-disable no-console */
//
// Replaces each casino game's private tx queue with a single shared
// queue (casino-tx.js). Fixes:
//   - Concurrent stake-spend nonce collisions when many users play at
//     the same time.
//   - Page-hang on /start because every game blocks on `tx.wait()`.
//
// Run on /root/litvm-dex/game-server:
//   wget -qO /tmp/install-casino-tx-shared.js \
//     https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/casino-three/backend-snippets/install-casino-tx-shared.js
//   wget -qO /tmp/casino-tx.js \
//     https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/casino-three/backend-snippets/casino-tx.js
//   cp /tmp/casino-tx.js /root/litvm-dex/game-server/casino-tx.js
//   node /tmp/install-casino-tx-shared.js
//   pm2 restart litdex-game

const fs = require('fs');
const path = require('path');

const SERVER_DIR = process.cwd().endsWith('game-server')
  ? process.cwd()
  : '/root/litvm-dex/game-server';

const GAMES = [
  'litdice.js', 'litlimbo.js', 'litmines.js',
  'litplinko.js', 'litwheel.js', 'litcoinflip.js',
];

if (!fs.existsSync(path.join(SERVER_DIR, 'casino-tx.js'))) {
  console.error(`[err] casino-tx.js missing in ${SERVER_DIR}. Copy it first.`);
  process.exit(1);
}

let touched = 0, skipped = 0;
for (const g of GAMES) {
  const fp = path.join(SERVER_DIR, g);
  if (!fs.existsSync(fp)) {
    console.log(`[skip] ${g} — file missing`);
    continue;
  }
  let s = fs.readFileSync(fp, 'utf8');
  if (s.includes("require('./casino-tx')")) {
    console.log(`[ok]   ${g} — already on shared queue`);
    skipped++;
    continue;
  }

  // 1. Remove the private _txQueue / _txRunning / enqTx / pumpTx block
  //    and the old awardPoints/spendStake helpers. Replace with shared
  //    require + lazy init + thin helpers.
  const queueBlock = /const _txQueue = \[\];[\s\S]*?_txRunning = false;\s*\n\}/;
  if (!queueBlock.test(s)) {
    console.log(`[skip] ${g} — queue block not found`);
    continue;
  }

  const replacement = `const txq = require('./casino-tx');
txq.init({
  rpcs: (process.env.CASINO_RPCS || 'https://liteforge.rpc.caldera.xyz/http').split(',').map((u) => u.trim()).filter(Boolean),
  privateKey: process.env.PRIVATE_KEY,
  contractAddr: POINTS_ADDR,
  contractAbi: POINTS_ABI,
  chainId: 4441,
});`;

  s = s.replace(queueBlock, replacement);

  // 2. Replace the old helper definitions (whichever are present).
  s = s.replace(
    /const awardPoints = \(to, pts, qid\) => enqTx\(\(\) => _points\.recordQuestFor\(to, BigInt\(pts\), qid\)\);/,
    'const awardPoints = (to, pts, qid) => txq.send(\'recordQuestFor\', [to, BigInt(pts), qid]);'
  );
  s = s.replace(
    /const spendStake\s+= \(from, amt\)\s+=> enqTx\(\(\) => _points\.spendPoints\(from, BigInt\(amt\)\)\);/,
    'const spendStake  = (from, amt)    => txq.send(\'spendPoints\', [from, BigInt(amt)]);'
  );

  fs.writeFileSync(fp, s, 'utf8');
  console.log(`[done] ${g}`);
  touched++;
}

console.log(`\n${touched} patched, ${skipped} already on shared queue.`);
console.log('Restart the games server:  pm2 restart litdex-game');
