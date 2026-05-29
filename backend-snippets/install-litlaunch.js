// Install Lit Launch backend on the games server.
//
// Usage on /root/litvm-dex/game-server:
//   wget -O /root/litvm-dex/game-server/litlaunch.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/lit-launch-game/backend-snippets/litlaunch.js"
//   wget -O /tmp/install-ll.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/lit-launch-game/backend-snippets/install-litlaunch.js"
//   node /tmp/install-ll.js
//   pm2 restart litdex-game

const fs = require('fs');

const SERVER = '/root/litvm-dex/game-server/server.js';
const ROUTE  = '/root/litvm-dex/game-server/litlaunch.js';

if (!fs.existsSync(ROUTE)) {
  console.error('[install-ll] missing /root/litvm-dex/game-server/litlaunch.js');
  process.exit(1);
}

let s = fs.readFileSync(SERVER, 'utf8');
const before = s;

const requireLine = `const litlaunch = require('./litlaunch');`;
const mountLine   = `app.use('/litlaunch', litlaunch);`;

if (s.includes(requireLine) && s.includes(mountLine)) {
  console.log('[install-ll] already mounted in server.js');
  process.exit(0);
}

if (!s.includes(requireLine)) {
  // Anchor on whichever earlier route file exists.
  const anchors = [
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
  console.error('[install-ll] no changes applied');
  process.exit(1);
}

fs.writeFileSync(SERVER + '.bak-litlaunch', before);
fs.writeFileSync(SERVER, s);
console.log('[install-ll] mounted /litlaunch in server.js; backup at ' + SERVER + '.bak-litlaunch');
