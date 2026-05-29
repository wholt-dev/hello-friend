// Install ZK Miner backend on the games server.
//
// Usage on /root/litvm-dex/game-server:
//   wget -O /root/litvm-dex/game-server/zkminer.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/zk-miner-game/backend-snippets/zkminer.js"
//   wget -O /tmp/install-zm.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/zk-miner-game/backend-snippets/install-zkminer.js"
//   node /tmp/install-zm.js
//   pm2 restart litdex-game

const fs = require('fs');

const SERVER = '/root/litvm-dex/game-server/server.js';
const ROUTE  = '/root/litvm-dex/game-server/zkminer.js';

if (!fs.existsSync(ROUTE)) {
  console.error('[install-zm] missing /root/litvm-dex/game-server/zkminer.js');
  process.exit(1);
}

let s = fs.readFileSync(SERVER, 'utf8');
const before = s;

const requireLine = `const zkminer = require('./zkminer');`;
const mountLine   = `app.use('/zkminer', zkminer);`;

if (s.includes(requireLine) && s.includes(mountLine)) {
  console.log('[install-zm] already mounted in server.js');
  process.exit(0);
}

if (!s.includes(requireLine)) {
  const ltRequire = `const littower = require('./littower');`;
  if (s.includes(ltRequire)) {
    s = s.replace(ltRequire, `${ltRequire}\n${requireLine}`);
  } else {
    const pdRequire = `const pumpdump = require('./pumpdump');`;
    if (s.includes(pdRequire)) {
      s = s.replace(pdRequire, `${pdRequire}\n${requireLine}`);
    } else {
      s = `${requireLine}\n${s}`;
    }
  }
}

if (!s.includes(mountLine)) {
  const ltMount = `app.use('/littower', littower);`;
  if (s.includes(ltMount)) {
    s = s.replace(ltMount, `${ltMount}\n${mountLine}`);
  } else {
    const pdMount = `app.use('/pumpdump', pumpdump);`;
    if (s.includes(pdMount)) {
      s = s.replace(pdMount, `${pdMount}\n${mountLine}`);
    } else {
      s = s.replace(/(app\.listen\()/, `${mountLine}\n$1`);
    }
  }
}

if (s === before) {
  console.error('[install-zm] no changes applied');
  process.exit(1);
}

fs.writeFileSync(SERVER + '.bak-zkminer', before);
fs.writeFileSync(SERVER, s);
console.log('[install-zm] mounted /zkminer in server.js; backup at ' + SERVER + '.bak-zkminer');
