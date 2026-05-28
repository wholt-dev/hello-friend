// Installer: adds GET /bridge/eligibility/:wallet to litdex-quest-api
// (/root/litvm-dex/twitter-auth/server.js). The endpoint mirrors the
// 5 checks the relayer enforces, so the frontend can pre-flight a
// bridge attempt and warn the user before they sign on Sepolia.
//
// Returns:
//   {
//     success: true,
//     wallet: "0x...",
//     eligible: false,
//     checks: {
//       amountCap:     { maxEth: "0.2", info: "passed at submit time" },
//       dailyLimit:    { used: 1, max: 2, pass: true },
//       points:        { current: 150, required: 200, pass: false },
//       domain:        { owns: true, pass: true },
//       games:         { played: 3, required: 5, pass: false }
//     },
//     reasons: ["points < 200", "games < 5"]
//   }
//
// Note: amountCap is intentionally NOT enforced here because the
// endpoint is amount-agnostic. The frontend clamps the input to 0.2
// and the relayer rejects anything above. This keeps the endpoint a
// simple pre-flight read.
//
// Server usage:
//   wget -O /tmp/install-bridge-elig.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/bridge-strict-gating/backend-snippets/install-bridge-eligibility-endpoint.js"
//   node /tmp/install-bridge-elig.js
//   pm2 restart litdex-quest-api

const fs = require('fs');
const SRC = '/root/litvm-dex/twitter-auth/server.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

if (s.includes('// BRIDGE_ELIG_ENDPOINT_V1')) {
  console.log('[bridge-elig] already installed, nothing to do');
  process.exit(0);
}

const block = `
// BRIDGE_ELIG_ENDPOINT_V1 — pre-flight eligibility for the cross-chain bridge.
// Mirrors the 5 hard-gates the relayer (/root/litvm-dex/scripts/relayer.js)
// enforces, so the UI can warn the user before they sign on Sepolia.
const _BRIDGE_POINTS_ADDR_E = '0x526B0629C81d3314929dB8166372F792F3da3419';
const _BRIDGE_POINTS_ABI_E = ['function getPoints(address) view returns (uint256, uint256, uint256)'];
let _bridgePointsContractE = null;
function _bridgePointsE() {
  if (_bridgePointsContractE) return _bridgePointsContractE;
  try {
    _bridgePointsContractE = new ethers.Contract(_BRIDGE_POINTS_ADDR_E, _BRIDGE_POINTS_ABI_E, provider);
  } catch (e) {
    console.error('[bridge-elig] points contract init failed:', e.message);
  }
  return _bridgePointsContractE;
}
async function _bridgeEligPoints(wallet) {
  try {
    const c = _bridgePointsE();
    if (!c) return 0;
    const r = await c.getPoints(wallet);
    return Number(r[0]);
  } catch (e) {
    return 0;
  }
}
async function _bridgeEligDomain(wallet) {
  try {
    const w = String(wallet || '').toLowerCase();
    const r = await fetch('https://hub.test-hub.xyz/hub/names/owned/' + w);
    if (!r.ok) return false;
    const j = await r.json().catch(() => ({}));
    const names = Array.isArray(j) ? j : (j.names || j.domains || []);
    return Array.isArray(names) && names.length > 0;
  } catch (e) {
    return false;
  }
}
function _bridgeEligGames(wallet) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database('/root/litvm-dex/game-server/simple_game.db', { readonly: true });
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const row = db.prepare('SELECT games_played FROM daily_games WHERE wallet=? AND date=?').get(String(wallet).toLowerCase(), today);
    db.close();
    return Number(row?.games_played || 0);
  } catch (e) {
    return 0;
  }
}
function _bridgeEligDailyCount(wallet) {
  try {
    const path = '/root/litvm-dex/scripts/.bridge-daily.json';
    if (!fs.existsSync(path)) return 0;
    const all = JSON.parse(fs.readFileSync(path, 'utf8') || '{}');
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const entry = all[String(wallet).toLowerCase()];
    if (!entry || entry.date !== today) return 0;
    return Number(entry.count || 0);
  } catch (e) {
    return 0;
  }
}

app.get('/bridge/eligibility/:wallet', async (req, res) => {
  try {
    const w = String(req.params.wallet || '');
    if (!/^0x[0-9a-fA-F]{40}$/.test(w)) {
      return res.status(400).json({ success: false, reason: 'invalid_wallet' });
    }
    const [pts, domain] = await Promise.all([
      _bridgeEligPoints(w),
      _bridgeEligDomain(w),
    ]);
    const games = _bridgeEligGames(w);
    const used = _bridgeEligDailyCount(w);

    const checks = {
      amountCap: { maxEth: '0.2', info: 'enforced per single bridge tx' },
      dailyLimit: { used, max: 2, pass: used < 2 },
      points: { current: pts, required: 200, pass: pts >= 200 },
      domain: { owns: !!domain, pass: !!domain },
      games: { played: games, required: 5, pass: games >= 5 },
    };
    const reasons = [];
    if (!checks.dailyLimit.pass) reasons.push('daily limit (2/day)');
    if (!checks.points.pass) reasons.push('points < 200');
    if (!checks.domain.pass) reasons.push('no .lit domain');
    if (!checks.games.pass) reasons.push('games < 5');

    res.json({
      success: true,
      wallet: w.toLowerCase(),
      eligible: reasons.length === 0,
      checks,
      reasons,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
// END BRIDGE_ELIG_ENDPOINT_V1
`;

const anchor = /(\napp\.listen\s*\()/;
if (!anchor.test(s)) {
  console.error('[bridge-elig] could not find app.listen anchor');
  process.exit(1);
}
s = s.replace(anchor, block + '\n$1');

if (s === before) {
  console.error('[bridge-elig] match counted but text unchanged');
  process.exit(1);
}

fs.writeFileSync(SRC + '.bak-bridge-elig', before);
fs.writeFileSync(SRC, s);
console.log('[bridge-elig] /bridge/eligibility/:wallet installed; backup at ' + SRC + '.bak-bridge-elig');
