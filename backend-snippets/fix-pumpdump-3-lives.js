// Patch: backend supports 3 wrongs before settling the session.
//
// Schema reminder (pumpdump_sessions): nonce, pot, streak, correct_count,
// wrong_count, settled, state_json.
//
// Current behaviour:
//   * Wrong → wrong_count++, settled = 1, pot reset, gameOver: true
//
// Desired:
//   * Wrong → wrong_count++, pot = 0, streak = 0
//   * settled only when wrong_count >= 3
//   * gameOver only when wrong_count >= 3
//   * Cashout still works after 1 or 2 wrongs (with rebuilt pot)
//
// Server usage:
//   wget -O /tmp/fix-pd-lives.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/pumpdump-frontend-entry-10/backend-snippets/fix-pumpdump-3-lives.js"
//   node /tmp/fix-pd-lives.js
//   pm2 restart litdex-game

const fs = require('fs');
const SRC = '/root/litvm-dex/game-server/pumpdump.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

if (s.includes('// PUMPDUMP_3_LIVES_V1')) {
  console.log('[fix-pd-lives] already installed');
  process.exit(0);
}

// Strict match for the wrong branch UPDATE block + res.json.
// Has to also match wrong_count = wrong_count + 1, settled = 1.
const oldElse =
  /\} else \{\s*\n(\s*)db\.prepare\(`\s*\n\s*UPDATE pumpdump_sessions\s*\n\s*SET nonce = \?, wrong_count = wrong_count \+ 1, settled = 1, state_json = \?\s*\n\s*WHERE session_id = \?\s*\n\s*`\)\.run\(newNonce, JSON\.stringify\(r\.state\), sessionId\);\s*\n\s*\n\s*res\.json\(\{\s*\n\s*correct:\s*false,\s*\n\s*actualDir:\s*r\.candle\.dir,\s*\n\s*nextCandle: r\.candle,\s*\n\s*nonce:\s*newNonce,\s*\n\s*pot:\s*0,\s*\n\s*streak:\s*0,\s*\n\s*gameOver:\s*true,\s*\n\s*\}\);\s*\n\s*\}/;

if (!oldElse.test(s)) {
  console.error('[fix-pd-lives] could not locate the wrong-branch in /play handler');
  console.error('  manual check: grep -nA 12 "} else {" ' + SRC + ' | head -30');
  process.exit(1);
}

const replacement = `} else {
$1// PUMPDUMP_3_LIVES_V1 — wrong deducts a life, only settles after 3 wrongs total
$1const MAX_LIVES = 3;
$1const newWrong = (s.wrong_count || 0) + 1;
$1const exhausted = newWrong >= MAX_LIVES;
$1if (exhausted) {
$1  db.prepare(\`
$1    UPDATE pumpdump_sessions
$1    SET nonce = ?, wrong_count = ?, settled = 1, pot = 0, streak = 0, state_json = ?
$1    WHERE session_id = ?
$1  \`).run(newNonce, newWrong, JSON.stringify(r.state), sessionId);
$1} else {
$1  db.prepare(\`
$1    UPDATE pumpdump_sessions
$1    SET nonce = ?, wrong_count = ?, pot = 0, streak = 0, state_json = ?
$1    WHERE session_id = ?
$1  \`).run(newNonce, newWrong, JSON.stringify(r.state), sessionId);
$1}

$1res.json({
$1  correct:    false,
$1  actualDir:  r.candle.dir,
$1  nextCandle: r.candle,
$1  nonce:      newNonce,
$1  pot:        0,
$1  streak:     0,
$1  livesLeft:  Math.max(0, MAX_LIVES - newWrong),
$1  gameOver:   exhausted,
$1});
$1}`;

s = s.replace(oldElse, replacement);

if (s === before) {
  console.error('[fix-pd-lives] no changes applied');
  process.exit(1);
}

fs.writeFileSync(SRC + '.bak-3lives', before);
fs.writeFileSync(SRC, s);
console.log('[fix-pd-lives] 3-lives system installed; backup at ' + SRC + '.bak-3lives');
