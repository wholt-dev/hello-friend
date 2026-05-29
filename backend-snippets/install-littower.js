// Install Lit Tower backend on the games server.
//
// Steps:
//  1. wget the route file (littower.js) from raw GitHub.
//  2. mount it in server.js if not already mounted.
//
// Usage on /root/litvm-dex/game-server:
//   wget -O /tmp/install-lt.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/pumpdump-frontend-entry-10/backend-snippets/install-littower.js"
//   wget -O /root/litvm-dex/game-server/littower.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/pumpdump-frontend-entry-10/backend-snippets/littower.js"
//   node /tmp/install-lt.js
//   pm2 restart litdex-game

const fs = require('fs');
const path = require('path');

const SERVER = '/root/litvm-dex/game-server/server.js';
const ROUTE  = '/root/litvm-dex/game-server/littower.js';

if (!fs.existsSync(ROUTE)) {
  console.error('[install-lt] missing /root/litvm-dex/game-server/littower.js');
  console.error('  fetch it first via:');
  console.error('  wget -O /root/litvm-dex/game-server/littower.js \\');
  console.error('    "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/pumpdump-frontend-entry-10/backend-snippets/littower.js"');
  process.exit(1);
}

let s = fs.readFileSync(SERVER, 'utf8');
const before = s;

const requireLine = `const littower = require('./littower');`;
const mountLine   = `app.use('/littower', littower);`;

// Idempotency
if (s.includes(requireLine) && s.includes(mountLine)) {
  console.log('[install-lt] already mounted in server.js');
  process.exit(0);
}

// Insert the require near the other route requires.
if (!s.includes(requireLine)) {
  // Anchor on pumpdump's require line if we can find it.
  const pdRequire = `const pumpdump = require('./pumpdump');`;
  if (s.includes(pdRequire)) {
    s = s.replace(pdRequire, `${pdRequire}\n${requireLine}`);
  } else {
    // Fallback: insert at top of file after any existing requires block.
    s = `${requireLine}\n${s}`;
  }
}

// Insert the mount near the other mounts.
if (!s.includes(mountLine)) {
  const pdMount = `app.use('/pumpdump', pumpdump);`;
  if (s.includes(pdMount)) {
    s = s.replace(pdMount, `${pdMount}\n${mountLine}`);
  } else {
    // Fallback: append before module.exports / app.listen.
    s = s.replace(/(app\.listen\()/, `${mountLine}\n$1`);
  }
}

if (s === before) {
  console.error('[install-lt] no changes applied');
  process.exit(1);
}

fs.writeFileSync(SERVER + '.bak-littower', before);
fs.writeFileSync(SERVER, s);
console.log('[install-lt] mounted /littower in server.js; backup at ' + SERVER + '.bak-littower');
