// Patch: fix /pumpdump/stats returning pointsBalance: 0 + lift the
// daily limit from 5 to 15.
//
// Root cause: pumpdump.js uses `_points.balanceOf(wallet)` to read
// the user's on-chain points balance. PointsSystem doesn't expose a
// balanceOf — it exposes getPoints(address) which returns
// (total, deployDaily, msgDaily). The call was throwing silently
// inside a try/catch that returned null, so the UI showed 0 PTS and
// the "Need 100 PTS" gate never let anyone play.
//
// Server usage:
//   wget -O /tmp/fix-pumpdump-stats.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/pumpdump-stats-balance/backend-snippets/fix-pumpdump-stats.js"
//   node /tmp/fix-pumpdump-stats.js
//   pm2 restart litdex-game

const fs = require('fs');
const SRC = '/root/litvm-dex/game-server/pumpdump.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

// 1) Replace readOnChainPoints body to call getPoints(wallet) and
//    return r[0] (total). The replacement preserves async/try/catch
//    semantics so the rest of the file is untouched.
const oldFn = /async function readOnChainPoints\(wallet\)\s*\{\s*try\s*\{\s*const b = await _points\.balanceOf\(wallet\);\s*return Number\(b\);\s*\}\s*catch\s*\{\s*return null;\s*\}\s*\}/;
const newFn = `async function readOnChainPoints(wallet) {
  try {
    // PointsSystem.getPoints returns (total, deployDaily, msgDaily).
    // We want the total balance for the entry-cost check.
    const r = await _points.getPoints(wallet);
    return Number(r[0]);
  } catch (e) {
    console.error('[pumpdump] readOnChainPoints error:', e.message);
    return null;
  }
}`;

if (!oldFn.test(s)) {
  console.error('[fix-pumpdump-stats] readOnChainPoints body did not match expected shape');
  console.error('  manual check: grep -nA 8 "async function readOnChainPoints" ' + SRC);
  process.exit(1);
}
s = s.replace(oldFn, newFn);

// 2) Make sure the _points contract has getPoints in its ABI. If the
//    constructor passed a balanceOf-only ABI, getPoints will fail at
//    call time. Find the contract instantiation and inject the
//    function fragment if missing.
const abiRegex = /const _points\s*=\s*new ethers\.Contract\(\s*([^,]+),\s*(\[[\s\S]*?\]|[A-Z_]+),\s*([^)]+)\)/;
const abiMatch = s.match(abiRegex);
if (abiMatch) {
  const [, addr, abiArg, signer] = abiMatch;
  const abiStr = abiArg.trim();
  if (!abiStr.includes('getPoints')) {
    if (abiStr.startsWith('[')) {
      // Inline array — extend it.
      const replacement = abiStr.replace(
        /\]\s*$/,
        ', "function getPoints(address) view returns (uint256, uint256, uint256)"]'
      );
      s = s.replace(abiRegex, `const _points = new ethers.Contract(${addr}, ${replacement}, ${signer})`);
    } else {
      // ABI is a const — inject a wrapper that adds the fragment.
      const wrapper = `[...${abiStr}, "function getPoints(address) view returns (uint256, uint256, uint256)"]`;
      s = s.replace(abiRegex, `const _points = new ethers.Contract(${addr}, ${wrapper}, ${signer})`);
    }
  }
}

// 3) Bump daily limit 5 -> 15 to match the UI ("15 games/day").
s = s.replace(
  /^(\s*const\s+DAILY_LIMIT\s*=\s*)5\s*;/m,
  '$115;'
);

if (s === before) {
  console.error('[fix-pumpdump-stats] no changes made');
  process.exit(1);
}

fs.writeFileSync(SRC + '.bak-stats-fix', before);
fs.writeFileSync(SRC, s);
console.log('[fix-pumpdump-stats] readOnChainPoints now uses getPoints(wallet)[0]; DAILY_LIMIT bumped to 15; backup at ' + SRC + '.bak-stats-fix');
