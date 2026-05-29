// Patch: pot + streak survive non-fatal wrongs.
//
// Previous lives patch reset pot+streak on every wrong, even the
// non-fatal ones. The user spec is:
//   * Right          → pot += increment
//   * Wrong (1st/2nd) → pot stays, streak stays, only life ticks down
//   * Wrong (3rd)    → pot = 0, streak = 0, settled = 1, gameOver
//
// This patch updates the wrong-branch UPDATE statements + response
// JSON so non-fatal wrongs leave pot/streak alone and the response
// echoes the existing values.
//
// Server usage:
//   wget -O /tmp/fix-pd-pot.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/pumpdump-frontend-entry-10/backend-snippets/fix-pumpdump-pot-survives-wrong.js"
//   node /tmp/fix-pd-pot.js
//   pm2 restart litdex-game

const fs = require('fs');
const SRC = '/root/litvm-dex/game-server/pumpdump.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

if (s.includes('// PUMPDUMP_POT_SURVIVES_V1')) {
  console.log('[fix-pd-pot] already installed');
  process.exit(0);
}

// We rewrite the entire wrong-branch (PUMPDUMP_3_LIVES_V1 marker is
// the prior patch). Match from the marker line down through the
// closing brace of the else.
const oldBlock = /\/\/ PUMPDUMP_3_LIVES_V1[\s\S]*?gameOver:\s*exhausted,\s*\n\s*\}\);\s*\n(\s*)\}/;

if (!oldBlock.test(s)) {
  console.error('[fix-pd-pot] could not find prior 3-lives block; was it installed?');
  process.exit(1);
}

const replacement = `// PUMPDUMP_POT_SURVIVES_V1 — pot + streak survive non-fatal wrongs
      const MAX_LIVES = 3;
      const newWrong = (s.wrong_count || 0) + 1;
      const exhausted = newWrong >= MAX_LIVES;
      if (exhausted) {
        // Final wrong — wipe pot + streak, settle the session.
        db.prepare(\`
          UPDATE pumpdump_sessions
          SET nonce = ?, wrong_count = ?, settled = 1, pot = 0, streak = 0, state_json = ?
          WHERE session_id = ?
        \`).run(newNonce, newWrong, JSON.stringify(r.state), sessionId);
      } else {
        // Non-fatal wrong — only ticker updates. Pot + streak stay
        // exactly as they were.
        db.prepare(\`
          UPDATE pumpdump_sessions
          SET nonce = ?, wrong_count = ?, state_json = ?
          WHERE session_id = ?
        \`).run(newNonce, newWrong, JSON.stringify(r.state), sessionId);
      }

      res.json({
        correct:    false,
        actualDir:  r.candle.dir,
        nextCandle: r.candle,
        nonce:      newNonce,
        // On a fatal wrong both pot and streak go to 0; otherwise echo
        // the existing values so the UI keeps showing them.
        pot:        exhausted ? 0 : s.pot,
        streak:     exhausted ? 0 : s.streak,
        livesLeft:  Math.max(0, MAX_LIVES - newWrong),
        gameOver:   exhausted,
      });
$1}`;

s = s.replace(oldBlock, replacement);

if (s === before) {
  console.error('[fix-pd-pot] no changes applied');
  process.exit(1);
}

fs.writeFileSync(SRC + '.bak-pot-survives', before);
fs.writeFileSync(SRC, s);
console.log('[fix-pd-pot] non-fatal wrongs now preserve pot + streak; backup at ' + SRC + '.bak-pot-survives');
