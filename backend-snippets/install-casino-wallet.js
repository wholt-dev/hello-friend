#!/usr/bin/env node
/* eslint-disable no-console */
//
// Installs the casino-wallet system on the games server:
//   1. Mounts /casino router on server.js (deposit/withdraw/balance/ledger).
//   2. Rewrites each casino game (litdice/limbo/mines/plinko/wheel/coinflip)
//      to read balance from cw.balance(), spend stake via cw.spend(), and
//      payout via cw.credit() — all DB-only, no per-game tx broadcast.
//
// Idempotent — safe to re-run.
//
// Run on /root/litvm-dex/game-server:
//   wget -qO casino-wallet.js        https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/casino-three/backend-snippets/casino-wallet.js
//   wget -qO casino-wallet-router.js https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/casino-three/backend-snippets/casino-wallet-router.js
//   wget -qO casino-tx.js            https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/casino-three/backend-snippets/casino-tx.js
//   wget -qO /tmp/install-casino-wallet.js https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/casino-three/backend-snippets/install-casino-wallet.js
//   node /tmp/install-casino-wallet.js
//   pm2 restart litdex-game

const fs = require('fs');
const path = require('path');

const SERVER_DIR = process.cwd().endsWith('game-server')
  ? process.cwd()
  : '/root/litvm-dex/game-server';

const SERVER_FILE = path.join(SERVER_DIR, 'server.js');

// Required dependency files must already be present in SERVER_DIR.
for (const f of ['casino-wallet.js', 'casino-wallet-router.js', 'casino-tx.js']) {
  if (!fs.existsSync(path.join(SERVER_DIR, f))) {
    console.error(`[err] ${f} missing in ${SERVER_DIR}. Copy it first.`);
    process.exit(1);
  }
}

// 1. Patch server.js to mount /casino router.
let s = fs.readFileSync(SERVER_FILE, 'utf8');
const before = s;
const mountSnippet = [
  "// LitDeX casino wallet (off-chain balance ledger)",
  "const txq = require('./casino-tx');",
  "txq.init({",
  "  rpcs: (process.env.CASINO_RPCS || 'https://liteforge.rpc.caldera.xyz/http').split(',').map((u) => u.trim()).filter(Boolean),",
  "  privateKey: process.env.PRIVATE_KEY,",
  "  contractAddr: '0x18158eeF59Fcc7EE3dB4C7eB80f0B8B95Ec9E61c',",
  "  contractAbi: [",
  "    'function recordQuestFor(address user, uint256 amount, string questId)',",
  "    'function spendPoints(address user, uint256 amount)',",
  "    'function getPoints(address user) view returns (uint256 total, uint256 deployDaily, uint256 msgDaily)',",
  "  ],",
  "  chainId: 4441,",
  "});",
  "const casinoWalletDb = require('better-sqlite3')(__dirname + '/casino-wallet.db');",
  "casinoWalletDb.pragma('journal_mode = WAL');",
  "app.use('/casino', require('./casino-wallet-router')({ db: casinoWalletDb, txq }));",
].join('\n');

if (!s.includes("require('./casino-wallet-router')")) {
  // Insert after `const app = express();`
  s = s.replace(
    /(const\s+app\s*=\s*express\(\)\s*;[\r\n]+)/,
    `$1\n${mountSnippet}\n`,
  );
  if (s === before) {
    console.error('[err] Could not find `const app = express();` anchor in server.js');
    process.exit(1);
  }
  console.log('[done] Mounted /casino router on server.js');
} else {
  console.log('[ok]   /casino router already mounted');
}

if (s !== before) {
  fs.writeFileSync(SERVER_FILE + '.bak-casino-wallet', before);
  fs.writeFileSync(SERVER_FILE, s);
}

// 2. Patch each casino game's start/end to use casino-wallet DB instead
//    of on-chain spendStake / awardPoints.
const GAMES = [
  { file: 'litdice.js',    stakeConst: 'STAKE' },
  { file: 'litlimbo.js',   stakeConst: 'STAKE' },
  { file: 'litmines.js',   stakeConst: 'STAKE' },
  { file: 'litplinko.js',  stakeConst: 'STAKE' },
  { file: 'litwheel.js',   stakeConst: 'STAKE' },
  { file: 'litcoinflip.js', stakeConst: 'STAKE' },
];

let touched = 0;
for (const g of GAMES) {
  const fp = path.join(SERVER_DIR, g.file);
  if (!fs.existsSync(fp)) {
    console.log(`[skip] ${g.file} — file missing`);
    continue;
  }
  let src = fs.readFileSync(fp, 'utf8');
  if (src.includes("require('./casino-wallet')")) {
    console.log(`[ok]   ${g.file} — already wired`);
    continue;
  }

  // a. Inject `const cw = require('./casino-wallet');` near top of file.
  src = src.replace(
    /(const\s+_points\s*=\s*new\s+ethers\.Contract\([^)]+\);)/,
    `$1\nconst cw = require('./casino-wallet');\nconst casinoWalletDb = require('better-sqlite3')(require('path').join(__dirname, 'casino-wallet.db'));\ncasinoWalletDb.pragma('journal_mode = WAL');\ncw.init({ db: casinoWalletDb, txq: require('./casino-tx') });`
  );

  // b. Replace readOnChainPoints calls with cw.balance().
  src = src.replace(
    /const\s+bal\s*=\s*await\s+readOnChainPoints\(w\);/g,
    'const bal = cw.balance(w);'
  );
  src = src.replace(
    /const\s+onChain\s*=\s*await\s+readOnChainPoints\(w\);/g,
    'const onChain = cw.balance(w);'
  );

  // c. Replace `spendStake(w, STAKE)` with cw.spend (no await needed since DB-only).
  src = src.replace(
    /const\s+burnHash\s*=\s*await\s+spendStake\(w,\s*STAKE\);[\r\n]+\s*if\s*\(!burnHash\)\s*\{[\s\S]*?return\s+res\.status\(502\)\.json\(\{\s*error:\s*'stake_spend_failed'\s*\}\);[\r\n]+\s*\}/,
    "if (!cw.spend(w, STAKE, '" + g.file.replace('.js', '') + "_entry', roundId)) {\n      return res.status(402).json({ error: 'insufficient_casino_balance', need: STAKE, have: cw.balance(w) });\n    }\n    const burnHash = null"
  );

  // d. Replace `awardPoints(...)` calls (game payout) with cw.credit().
  src = src.replace(
    /txHash\s*=\s*await\s+awardPoints\(([^,]+),\s*([^,]+),\s*`([^`]+)`\);/g,
    (_m, who, amount, qid) => {
      return `cw.credit(${who}, ${amount}, 'cashout', \`${qid}\`); txHash = null`;
    }
  );

  // e. Replace `awardPoints(...)` (no template literal variant).
  src = src.replace(
    /txHash\s*=\s*await\s+awardPoints\(([^,]+),\s*([^,]+),\s*([^)]+)\);/g,
    (_m, who, amount, qid) => `cw.credit(${who}, ${amount}, 'cashout', ${qid}); txHash = null`
  );

  fs.writeFileSync(fp, src, 'utf8');
  console.log(`[done] ${g.file} — switched to casino-wallet DB`);
  touched++;
}

console.log(`\n${touched} game module(s) patched.`);
console.log('Restart with:  pm2 restart litdex-game');
