// Install Lit Dice + Lit Limbo + Lit Mines on the games server.
//
// Usage on /root/litvm-dex/game-server:
//   for f in litdice.js litlimbo.js litmines.js; do
//     wget -O /root/litvm-dex/game-server/$f \
//       "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/casino-trio/backend-snippets/$f"
//   done
//   wget -O /tmp/install-trio.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/casino-trio/backend-snippets/install-casino-trio.js"
//   node /tmp/install-trio.js
//   pm2 restart litdex-game

const fs = require('fs');

const SERVER = '/root/litvm-dex/game-server/server.js';
const ROUTES = [
  { name: 'litdice',  path: '/root/litvm-dex/game-server/litdice.js',  mountPath: '/litdice'  },
  { name: 'litlimbo', path: '/root/litvm-dex/game-server/litlimbo.js', mountPath: '/litlimbo' },
  { name: 'litmines', path: '/root/litvm-dex/game-server/litmines.js', mountPath: '/litmines' },
];

for (const r of ROUTES) {
  if (!fs.existsSync(r.path)) {
    console.error(`[install-trio] missing ${r.path}`);
    process.exit(1);
  }
}

let s = fs.readFileSync(SERVER, 'utf8');
const before = s;

const ANCHOR_REQUIRES = [
  `const blockchain = require('./blockchain');`,
  `const litlaunch = require('./litlaunch');`,
  `const zkminer = require('./zkminer');`,
  `const littower = require('./littower');`,
  `const pumpdump = require('./pumpdump');`,
];
const ANCHOR_MOUNTS = [
  `app.use('/blockchain', blockchain);`,
  `app.use('/litlaunch', litlaunch);`,
  `app.use('/zkminer', zkminer);`,
  `app.use('/littower', littower);`,
  `app.use('/pumpdump', pumpdump);`,
];

let changed = 0;
for (const r of ROUTES) {
  const requireLine = `const ${r.name} = require('./${r.name}');`;
  const mountLine   = `app.use('${r.mountPath}', ${r.name});`;
  if (s.includes(requireLine) && s.includes(mountLine)) {
    console.log(`[install-trio] ${r.name} already mounted`);
    continue;
  }
  if (!s.includes(requireLine)) {
    let inserted = false;
    for (const a of ANCHOR_REQUIRES) {
      if (s.includes(a)) { s = s.replace(a, `${a}\n${requireLine}`); inserted = true; break; }
    }
    if (!inserted) s = `${requireLine}\n${s}`;
  }
  if (!s.includes(mountLine)) {
    let inserted = false;
    for (const a of ANCHOR_MOUNTS) {
      if (s.includes(a)) { s = s.replace(a, `${a}\n${mountLine}`); inserted = true; break; }
    }
    if (!inserted) s = s.replace(/(app\.listen\()/, `${mountLine}\n$1`);
  }
  changed++;
}

if (s === before) {
  console.log('[install-trio] no changes (all routes already mounted)');
  process.exit(0);
}

fs.writeFileSync(SERVER + '.bak-casino-trio', before);
fs.writeFileSync(SERVER, s);
console.log(`[install-trio] mounted ${changed} casino route(s); backup at ${SERVER}.bak-casino-trio`);
