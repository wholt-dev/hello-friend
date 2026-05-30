#!/usr/bin/env node
//
// install-game-leaderboards.js
//
// Adds GET /leaderboard endpoints to the 6 casino games and Pump-or-Dump.
// Idempotent — safe to re-run. Rewrites:
//   /root/litvm-dex/game-server/litdice.js
//   /root/litvm-dex/game-server/litlimbo.js
//   /root/litvm-dex/game-server/litmines.js
//   /root/litvm-dex/game-server/litplinko.js
//   /root/litvm-dex/game-server/litwheel.js
//   /root/litvm-dex/game-server/litcoinflip.js
//   /root/litvm-dex/game-server/pumpdump.js
//
// Each leaderboard query is shaped per game's existing schema. Frontend
// (App.tsx GameLeaderboard) reads { leaderboard: [{ wallet, <field> }] }.
//
// Usage on prod box:
//   cd /root/litvm-dex/game-server
//   wget -qO /tmp/install-game-leaderboards.js https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/casino-three/backend-snippets/install-game-leaderboards.js
//   node /tmp/install-game-leaderboards.js
//   pm2 restart litdex-game

const fs = require('fs');
const path = require('path');

const SERVER_DIR = process.cwd().endsWith('game-server')
  ? process.cwd()
  : '/root/litvm-dex/game-server';

const PATCHES = [
  {
    file: 'litdice.js',
    code: `
router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(\`
      SELECT wallet, MAX(multiplier_x100) AS best_mult_x100
      FROM litdice_rounds
      WHERE settled = 1 AND won = 1
      GROUP BY wallet
      ORDER BY best_mult_x100 DESC
      LIMIT 25
    \`).all();
    res.json({
      leaderboard: rows.map((r) => ({
        wallet: r.wallet,
        best_multiplier: (r.best_mult_x100 || 0) / 100,
      })),
    });
  } catch (e) {
    console.error('[/litdice/leaderboard]', e.message);
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});
`,
  },
  {
    file: 'litlimbo.js',
    code: `
router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(\`
      SELECT wallet, MAX(rolled_x100) AS best_roll_x100
      FROM litlimbo_rounds
      WHERE settled = 1 AND won = 1
      GROUP BY wallet
      ORDER BY best_roll_x100 DESC
      LIMIT 25
    \`).all();
    res.json({
      leaderboard: rows.map((r) => ({
        wallet: r.wallet,
        best_roll: (r.best_roll_x100 || 0) / 100,
      })),
    });
  } catch (e) {
    console.error('[/litlimbo/leaderboard]', e.message);
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});
`,
  },
  {
    file: 'litmines.js',
    code: `
router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(\`
      SELECT wallet, MAX(multiplier_x100) AS best_mult_x100
      FROM litmines_rounds
      WHERE settled = 1 AND outcome = 'cashout'
      GROUP BY wallet
      ORDER BY best_mult_x100 DESC
      LIMIT 25
    \`).all();
    res.json({
      leaderboard: rows.map((r) => ({
        wallet: r.wallet,
        best_multiplier: (r.best_mult_x100 || 0) / 100,
      })),
    });
  } catch (e) {
    console.error('[/litmines/leaderboard]', e.message);
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});
`,
  },
  {
    file: 'litplinko.js',
    code: `
router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(\`
      SELECT wallet, MAX(multiplier_x100) AS best_mult_x100
      FROM litplinko_rounds
      WHERE settled = 1
      GROUP BY wallet
      ORDER BY best_mult_x100 DESC
      LIMIT 25
    \`).all();
    res.json({
      leaderboard: rows.map((r) => ({
        wallet: r.wallet,
        best_multiplier: (r.best_mult_x100 || 0) / 100,
      })),
    });
  } catch (e) {
    console.error('[/litplinko/leaderboard]', e.message);
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});
`,
  },
  {
    file: 'litwheel.js',
    code: `
router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(\`
      SELECT wallet, MAX(multiplier_x100) AS best_mult_x100
      FROM litwheel_rounds
      WHERE settled = 1
      GROUP BY wallet
      ORDER BY best_mult_x100 DESC
      LIMIT 25
    \`).all();
    res.json({
      leaderboard: rows.map((r) => ({
        wallet: r.wallet,
        best_multiplier: (r.best_mult_x100 || 0) / 100,
      })),
    });
  } catch (e) {
    console.error('[/litwheel/leaderboard]', e.message);
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});
`,
  },
  {
    file: 'litcoinflip.js',
    code: `
router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(\`
      SELECT wallet, MAX(streak) AS best_streak
      FROM litcoin_rounds
      WHERE settled = 1 AND won = 1
      GROUP BY wallet
      ORDER BY best_streak DESC
      LIMIT 25
    \`).all();
    res.json({ leaderboard: rows });
  } catch (e) {
    console.error('[/litcoinflip/leaderboard]', e.message);
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});
`,
  },
  {
    file: 'pumpdump.js',
    code: `
router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(\`
      SELECT wallet, MAX(pot) AS best_pot, MAX(streak) AS best_streak
      FROM pumpdump_sessions
      WHERE settled = 1
      GROUP BY wallet
      ORDER BY best_pot DESC
      LIMIT 25
    \`).all();
    res.json({ leaderboard: rows });
  } catch (e) {
    console.error('[/pumpdump/leaderboard]', e.message);
    res.status(500).json({ error: 'leaderboard_failed' });
  }
});
`,
  },
];

// Brace-aware scanner: find a complete `router.get('/leaderboard', …);` block
// (or `router.get("/leaderboard", …);`) and return its [start, end] indices.
// Handles nested object literals, template literals, single/double quoted
// strings, and line/block comments.
function findLeaderboardBlock(src) {
  const startRe = /\brouter\.get\(\s*['"]\/leaderboard['"]\s*,/g;
  const m = startRe.exec(src);
  if (!m) return null;
  const start = m.index;
  // Walk from the opening `(` of router.get(...).
  let i = src.indexOf('(', start);
  if (i < 0) return null;
  let depthParen = 0;
  let depthBrace = 0;
  let inStrSingle = false;
  let inStrDouble = false;
  let inStrTpl = false;
  let inLineCmt = false;
  let inBlockCmt = false;
  for (; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (inLineCmt) { if (c === '\n') inLineCmt = false; continue; }
    if (inBlockCmt) { if (c === '*' && next === '/') { inBlockCmt = false; i++; } continue; }
    if (inStrSingle) { if (c === '\\') { i++; continue; } if (c === "'") inStrSingle = false; continue; }
    if (inStrDouble) { if (c === '\\') { i++; continue; } if (c === '"') inStrDouble = false; continue; }
    if (inStrTpl)    { if (c === '\\') { i++; continue; } if (c === '`') inStrTpl = false; continue; }
    if (c === '/' && next === '/') { inLineCmt = true; i++; continue; }
    if (c === '/' && next === '*') { inBlockCmt = true; i++; continue; }
    if (c === "'") { inStrSingle = true; continue; }
    if (c === '"') { inStrDouble = true; continue; }
    if (c === '`') { inStrTpl = true; continue; }
    if (c === '(') depthParen++;
    else if (c === ')') {
      depthParen--;
      if (depthParen === 0 && depthBrace === 0) {
        // After the closing `)`, expect optional `;`
        let j = i + 1;
        if (src[j] === ';') j++;
        // Consume trailing whitespace + a single newline so we leave clean spacing.
        while (j < src.length && (src[j] === ' ' || src[j] === '\t')) j++;
        if (src[j] === '\r') j++;
        if (src[j] === '\n') j++;
        return { start, end: j };
      }
    }
    else if (c === '{') depthBrace++;
    else if (c === '}') depthBrace--;
  }
  return null;
}

// Fallback for malformed `router.get('/leaderboard', ...)` blocks where
// braces never balance (because an earlier broken installer chopped the
// body). Scan forward to the next top-level anchor — `router.get(`,
// `router.post(`, `router.put(`, `router.delete(`, or `module.exports`.
function findMalformedLeaderboardBlock(src) {
  const startRe = /\brouter\.get\(\s*['"]\/leaderboard['"]\s*,/g;
  const m = startRe.exec(src);
  if (!m) return null;
  const start = m.index;
  // From after the start, find the next top-level statement anchor.
  // We accept matches that begin at column 0 (start of line) only — that
  // way we don't get fooled by a `router.get(` inside a string.
  const tail = src.slice(start + 1);
  const anchorRe = /(\r?\n)(router\.(get|post|put|delete)\(|module\.exports\s*=)/g;
  const a = anchorRe.exec(tail);
  if (!a) return null;
  // Strip from `start` up to (but not including) the newline before the anchor.
  return { start, end: start + 1 + a.index + a[1].length };
}

// Repair an "orphan catch" left behind by an earlier broken installer:
//   "  } catch (e) {\n    console.error('[/<game>/leaderboard]', …);\n    res.status(500).json({ error: 'leaderboard_failed' });\n  }\n});\n"
// at the top level. Strip these so we have a clean file to re-install into.
function repairOrphanCatch(src, gameName) {
  // The catch block always references the leaderboard error string we used.
  const tag = `[/${gameName}/leaderboard]`;
  const re = new RegExp(
    "\\n\\s*\\}\\s*catch\\s*\\(\\s*e\\s*\\)\\s*\\{\\s*\\n[^\\n]*" +
    tag.replace(/[/\\]/g, '\\$&') +
    "[^\\n]*\\n[^\\n]*leaderboard_failed[^\\n]*\\n\\s*\\}\\s*\\n\\s*\\}\\s*\\)\\s*;\\s*\\n",
    'g'
  );
  let n = 0;
  const out = src.replace(re, () => { n++; return '\n'; });
  return { src: out, fixed: n };
}

let touched = 0, repaired = 0, missing = 0;
for (const p of PATCHES) {
  const fp = path.join(SERVER_DIR, p.file);
  if (!fs.existsSync(fp)) {
    console.log(`[skip] ${p.file} — file missing in ${SERVER_DIR}`);
    missing++;
    continue;
  }
  const original = fs.readFileSync(fp, 'utf8');
  let working = original;

  // Strategy: the /leaderboard route is ALWAYS the last route, immediately
  // before `module.exports = router;`. So:
  //   1. Find the FIRST `router.get('/leaderboard'` occurrence.
  //   2. Discard everything from there to end-of-file (this nukes any number
  //      of broken/duplicate/incomplete leaderboard blocks AND the trailing
  //      module.exports).
  //   3. Re-append one clean leaderboard block + module.exports.
  // If no leaderboard exists yet, just insert before module.exports.
  const lbMatch = working.match(/\n[ \t]*router\.get\(\s*['"]\/leaderboard['"]/);
  if (lbMatch && lbMatch.index != null) {
    const head = working.slice(0, lbMatch.index).replace(/\s*$/, '');
    working = `${head}\n\n${p.code.trim()}\n\nmodule.exports = router;\n`;
    repaired++;
  } else {
    const meRe = /module\.exports\s*=\s*router\s*;?\s*$/;
    if (!meRe.test(working)) {
      console.log(`[fail] ${p.file} — no /leaderboard and no module.exports anchor`);
      missing++;
      continue;
    }
    working = working.replace(meRe, `${p.code.trim()}\n\nmodule.exports = router;\n`);
  }

  if (working === original) {
    console.log(`[ok]   ${p.file} — already up to date`);
    continue;
  }
  fs.writeFileSync(fp, working, 'utf8');
  console.log(`[done] ${p.file} — leaderboard endpoint installed (clean)`);
  touched++;
}

console.log(`\n${touched} patched, ${repaired} had existing block(s) replaced, ${missing} skipped/missing.`);
console.log('Restart the server to pick up changes:  pm2 restart litdex-game');
