// Install Block Chain (2048) backend on the games server.
//
// Usage on /root/litvm-dex/game-server:
//   wget -O /root/litvm-dex/game-server/blockchain.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/block-chain-game/backend-snippets/blockchain.js"
//   wget -O /tmp/install-bc.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/block-chain-game/backend-snippets/install-blockchain.js"
//   node /tmp/install-bc.js
//   pm2 restart litdex-game

const fs = require('fs');

const SERVER = '/root/litvm-dex/game-server/server.js';
const ROUTE  = '/root/litvm-dex/game-server/blockchain.js';

if (!fs.existsSync(ROUTE)) {
  console.error('[install-bc] missing /root/litvm-dex/game-server/blockchain.js');
  process.exit(1);
}

let s = fs.readFileSync(SERVER, 'utf8');
const before = s;

const requireLine = `const blockchain = require('./blockchain');`;
const mountLine   = `app.use('/blockchain', blockchain);`;

if (s.includes(requireLine) && s.includes(mountLine)) {
  console.log('[install-bc] already mounted in server.js');
  process.exit(0);
}

if (!s.includes(requireLine)) {
  const anchors = [
    `const litlaunch = require('./litlaunch');`,
    `const zkminer = require('./zkminer');`,
    `const littower = require('./littower');`,
    `const pumpdump = require('./pumpdump');`,
  ];
  let inserted = false;
  for (const a of anchors) {
    if (s.includes(a)) { s = s.replace(a, `${a}\n${requireLine}`); inserted = true; break; }
  }
  if (!inserted) s = `${requireLine}\n${s}`;
}

if (!s.includes(mountLine)) {
  const anchors = [
    `app.use('/litlaunch', litlaunch);`,
    `app.use('/zkminer', zkminer);`,
    `app.use('/littower', littower);`,
    `app.use('/pumpdump', pumpdump);`,
  ];
  let inserted = false;
  for (const a of anchors) {
    if (s.includes(a)) { s = s.replace(a, `${a}\n${mountLine}`); inserted = true; break; }
  }
  if (!inserted) s = s.replace(/(app\.listen\()/, `${mountLine}\n$1`);
}

if (s === before) {
  console.error('[install-bc] no changes applied');
  process.exit(1);
}

fs.writeFileSync(SERVER + '.bak-blockchain', before);
fs.writeFileSync(SERVER, s);
console.log('[install-bc] mounted /blockchain in server.js; backup at ' + SERVER + '.bak-blockchain');
