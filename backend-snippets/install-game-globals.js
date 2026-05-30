#!/usr/bin/env node
/* eslint-disable no-console */
//
// install-game-globals.js
//
// Adds GET /global to each game so the frontend can render the same
// "Total Games · Unique Players · Total Points Distributed" stats bar
// that Math Slash shows. zkLTC distributed is intentionally omitted —
// only Math Slash distributes zkLTC.
//
// Response shape (frontend reads these keys):
//   { totalGames, uniquePlayers, totalPoints }
//
// Idempotent: replaces any existing /global block (truncate-from-anchor
// strategy, same as the leaderboard installer).
//
// Run on /root/litvm-dex/game-server:
//   wget -qO /tmp/install-game-globals.js https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/casino-three/backend-snippets/install-game-globals.js
//   node /tmp/install-game-globals.js
//   node -c pumpdump.js && node -c litdice.js && echo OK
//   pm2 restart litdex-game

const fs = require('fs');
const path = require('path');

const SERVER_DIR = process.cwd().endsWith('game-server')
  ? process.cwd()
  : '/root/litvm-dex/game-server';

// Each game: which table holds settled rounds/sessions, the awarded
// (points distributed) column, and the settled flag column.
const PATCHES = [
  { file: 'litdice.js',     table: 'litdice_rounds',     awarded: 'awarded' },
  { file: 'litlimbo.js',    table: 'litlimbo_rounds',    awarded: 'awarded' },
  { file: 'litmines.js',    table: 'litmines_rounds',    awarded: 'awarded' },
  { file: 'litplinko.js',   table: 'litplinko_rounds',   awarded: 'awarded' },
  { file: 'litwheel.js',    table: 'litwheel_rounds',    awarded: 'awarded' },
  { file: 'litcoinflip.js', table: 'litcoin_rounds',     awarded: 'awarded' },
  { file: 'pumpdump.js',    table: 'pumpdump_sessions',  awarded: 'pot' },
  { file: 'littower.js',    table: 'littower_sessions',  awarded: 'awarded' },
  { file: 'zkminer.js',     table: 'zkminer_sessions',   awarded: 'awarded' },
  { file: 'litlaunch.js',   table: 'litlaunch_sessions', awarded: 'awarded' },
  { file: 'blockchain.js',  table: 'blockchain_sessions', awarded: 'awarded' },
];

function buildGlobal(p) {
  return `
router.get('/global', (req, res) => {
  try {
    const row = db.prepare(\`
      SELECT
        COUNT(*) AS total_games,
        COUNT(DISTINCT wallet) AS unique_players,
        COALESCE(SUM(${p.awarded}), 0) AS total_points
      FROM ${p.table}
      WHERE settled = 1
    \`).get();
    res.json({
      totalGames:    Number(row.total_games || 0),
      uniquePlayers: Number(row.unique_players || 0),
      totalPoints:   Number(row.total_points || 0),
    });
  } catch (e) {
    console.error('[/${p.file.replace('.js', '')}/global]', e.message);
    res.status(500).json({ error: 'global_failed' });
  }
});
`;
}

let touched = 0, missing = 0;
for (const p of PATCHES) {
  const fp = path.join(SERVER_DIR, p.file);
  if (!fs.existsSync(fp)) {
    console.log(`[skip] ${p.file} — file missing in ${SERVER_DIR}`);
    missing++;
    continue;
  }
  const original = fs.readFileSync(fp, 'utf8');
  let working = original;

  // Remove any existing /global block: truncate from the FIRST
  // `router.get('/global'` occurrence up to module.exports, then we
  // re-append below. (We re-insert it right before module.exports.)
  const globalMatch = working.match(/\n[ \t]*router\.get\(\s*['"]\/global['"]/);
  if (globalMatch && globalMatch.index != null) {
    // Find module.exports after it, keep everything before the /global
    // route and re-attach module.exports.
    const meIdx = working.indexOf('module.exports', globalMatch.index);
    if (meIdx >= 0) {
      const head = working.slice(0, globalMatch.index).replace(/\s*$/, '');
      const tail = working.slice(meIdx);
      working = `${head}\n\n${tail}`;
    }
  }

  const meRe = /module\.exports\s*=\s*router\s*;?\s*$/;
  if (!meRe.test(working)) {
    console.log(`[fail] ${p.file} — module.exports anchor not found`);
    missing++;
    continue;
  }
  working = working.replace(meRe, `${buildGlobal(p).trim()}\n\nmodule.exports = router;\n`);

  if (working === original) {
    console.log(`[ok]   ${p.file} — already up to date`);
    continue;
  }
  fs.writeFileSync(fp, working, 'utf8');
  console.log(`[done] ${p.file} — /global endpoint installed`);
  touched++;
}

console.log(`\n${touched} patched, ${missing} skipped/missing.`);
console.log('Restart the server to pick up changes:  pm2 restart litdex-game');
