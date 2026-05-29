// Install Lit Plinko + Lit Wheel + Lit Coin Flip on the games server.
//
// Usage on /root/litvm-dex/game-server:
//   for f in litplinko.js litwheel.js litcoinflip.js; do
//     wget -O /root/litvm-dex/game-server/$f \
//       "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/casino-three/backend-snippets/$f"
//   done
//   wget -O /tmp/install-three.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/casino-three/backend-snippets/install-casino-three.js"
//   node /tmp/install-three.js
//   pm2 restart litdex-game

const fs = require('fs');

const SERVER = '/root/litvm-dex/game-server/server.js';
const ROUTES = [
  { name: 'litplinko',  path: '/root/litvm-dex/game-server/litplinko.js',  mountPath: '/litplinko'  },
  { name: 'litwheel',   path: '/root/litvm-dex/game-server/litwheel.js',   mountPath: '/litwheel'   },
  { name: 'litcoinflip',path: '/root/litvm-dex/game-server/litcoinflip.js',mountPath: '/litcoinflip'},
];

for (const r of ROUTES) {
  if (!fs.existsSync(r.path)) {
    console.error(`[install-three] missing ${r.path}`);
    process.exit(1);
  }
}

let s = fs.readFileSync(SERVER, 'utf8');
const before = s;

const ANCHOR_REQUIRES = [
  `const litmines = require('./litmines');`,
  `const litlimbo = require('./litlimbo');`,
  `const litdice = require('./litdice');`,
  `const blockchain = require('./blockchain');`,
];
const ANCHOR_MOUNTS = [
  `app.use('/litmines', litmines);`,
  `app.use('/litlimbo', litlimbo);`,
  `app.use('/litdice', litdice);`,
  `app.use('/blockchain', blockchain);`,
];

let changed = 0;
for (const r of ROUTES) {
  const requireLine = `const ${r.name} = require('./${r.name}');`;
  const mountLine   = `app.use('${r.mountPath}', ${r.name});`;
  if (s.includes(requireLine) && s.includes(mountLine)) {
    console.log(`[install-three] ${r.name} already mounted`);
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
  console.log('[install-three] no changes (all routes already mounted)');
  process.exit(0);
}

fs.writeFileSync(SERVER + '.bak-casino-three', before);
fs.writeFileSync(SERVER, s);
console.log(`[install-three] mounted ${changed} casino route(s); backup at ${SERVER}.bak-casino-three`);
