// Patch: gate /faucet/claim behind BOTH a held LitDeX NFT AND an owned
// .lit domain, drop the points reward from 100 -> 10, and expose a new
// /faucet/eligibility/:wallet endpoint so the UI can pre-check.
//
// Server usage:
//   wget -O /tmp/faucet-gate.js https://raw.githubusercontent.com/0xDarkSeidBull/litdex/main/backend-snippets/faucet-nft-domain-gate.js
//   node /tmp/faucet-gate.js
//   pm2 restart litdex-quest-api
//
// Notes:
//  • Domain check hits the hub server (https://hub.test-hub.xyz/hub/names/owned/:wallet)
//    and treats names.length > 0 as ownership.
//  • NFT check is on-chain via LitDeXNFT.getUserNFTs(wallet), array length > 0.
//  • Both must be true. If either fails the response is a structured
//    {success:false, reason:'needs_nft_and_domain', has:{nft, domain}} so
//    the UI can show a precise hint.
//  • Points are credited via the same queueQuest helper the rest of the
//    server uses, so this rides the existing relayer nonce.

const fs = require('fs');
const SRC = '/root/litvm-dex/twitter-auth/server.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

// ── 1) Inject helpers + LitDeX NFT contract handle near the top of the file.
//    We anchor right after the first `const ethers` import so the helpers can
//    use the existing `provider` instance defined later in the file.
const helperBlock = `
// ── Faucet eligibility helpers (NFT + .lit domain gate) ──────────────
const FAUCET_NFT_ADDRESS = '0x59df2d661eb6F5fb97a694E1D2e4D17e2A7b7D15';
const FAUCET_NFT_ABI = [
  'function getUserNFTs(address user) view returns (tuple(uint8 nftType, uint256 lastClaimDay)[])',
];
let _faucetNftContract = null;
function getFaucetNftContract() {
  if (_faucetNftContract) return _faucetNftContract;
  try {
    _faucetNftContract = new ethers.Contract(FAUCET_NFT_ADDRESS, FAUCET_NFT_ABI, provider);
  } catch (e) {
    console.error('[faucet-gate] nft contract init failed:', e.message);
  }
  return _faucetNftContract;
}
async function faucetHasNFT(wallet) {
  try {
    const c = getFaucetNftContract();
    if (!c) return false;
    const arr = await c.getUserNFTs(wallet);
    return Array.isArray(arr) && arr.length > 0;
  } catch (e) {
    console.error('[faucet-gate] hasNFT error:', e.message);
    return false;
  }
}
async function faucetHasLitDomain(wallet) {
  try {
    const w = String(wallet || '').toLowerCase();
    const r = await fetch('https://hub.test-hub.xyz/hub/names/owned/' + w);
    if (!r.ok) return false;
    const j = await r.json().catch(() => ({}));
    const names = Array.isArray(j) ? j : (j.names || j.domains || []);
    return Array.isArray(names) && names.length > 0;
  } catch (e) {
    console.error('[faucet-gate] hasLitDomain error:', e.message);
    return false;
  }
}
async function faucetCheckEligibility(wallet) {
  const [nft, domain] = await Promise.all([
    faucetHasNFT(wallet),
    faucetHasLitDomain(wallet),
  ]);
  return { eligible: nft && domain, nft, domain };
}
// ── end faucet eligibility helpers ───────────────────────────────────
`;

if (!s.includes('faucetCheckEligibility')) {
  // Anchor: right before the first faucet route definition. Falls back to
  // before module.exports / app.listen if the route style differs.
  const routeAnchor = /(\n\s*app\.(?:get|post)\(\s*["'`]\/faucet\/)/;
  if (routeAnchor.test(s)) {
    s = s.replace(routeAnchor, helperBlock + '$1');
  } else {
    const listenAnchor = /(\n\s*app\.listen\s*\()/;
    if (!listenAnchor.test(s)) {
      console.error('[faucet-gate] could not find anchor for helpers');
      process.exit(1);
    }
    s = s.replace(listenAnchor, helperBlock + '$1');
  }
}

// ── 2) Inject the gate at the top of the /faucet/claim handler. We look
//    for the route declaration and insert eligibility check after the
//    first wallet validation. The gate exits early with a structured
//    response.
const gateMarker = '// FAUCET_GATE_NFT_DOMAIN';
if (!s.includes(gateMarker)) {
  // Match the handler's opening line and capture the bracket so we can
  // place the gate immediately inside.
  const handlerRe = /(app\.post\(\s*["'`]\/faucet\/claim["'`][^\)]*\)\s*=>\s*\{\s*\n)/;
  if (!handlerRe.test(s)) {
    console.error('[faucet-gate] /faucet/claim handler not found');
    process.exit(1);
  }
  const gateBlock = `  // FAUCET_GATE_NFT_DOMAIN — require both an NFT and a .lit domain
  try {
    const _gateWallet = (req.body && req.body.wallet) || '';
    if (_gateWallet) {
      const _gate = await faucetCheckEligibility(_gateWallet);
      if (!_gate.eligible) {
        return res.json({
          success: false,
          reason: 'needs_nft_and_domain',
          message: 'Hold a LitDeX NFT and own a .lit domain to claim',
          has: { nft: _gate.nft, domain: _gate.domain },
        });
      }
    }
  } catch (_e) {
    console.error('[faucet-gate] gate check failed:', _e.message);
  }
`;
  s = s.replace(handlerRe, '$1' + gateBlock);
}

// ── 3) Drop the credited points from 100 → 10. We try a few patterns so
//    we can survive minor refactors.
const pointPatterns = [
  /queueQuest\(\s*([^,]+)\s*,\s*100\s*,/g,
  /recordQuestFor\(\s*([^,]+)\s*,\s*100\s*,/g,
  /awardPoints\(\s*([^,]+)\s*,\s*100\s*\)/g,
  /const\s+FAUCET_POINTS\s*=\s*100\s*;/g,
  /FAUCET_POINTS\s*:\s*100\s*,/g,
];
let pointsPatched = false;
for (const re of pointPatterns) {
  if (re.test(s)) {
    s = s.replace(re, (m) => m.replace(/100/, '10'));
    pointsPatched = true;
  }
}
if (!pointsPatched) {
  console.warn('[faucet-gate] WARNING: no 100-point pattern matched, ' +
    'check the /faucet/claim handler manually for the points credit line.');
}

// ── 4) Add an /faucet/eligibility/:wallet GET so the UI can pre-check.
if (!s.includes('/faucet/eligibility/')) {
  const eligibilityRoute = `
// GET /faucet/eligibility/:wallet — does this wallet hold an NFT and a .lit?
app.get('/faucet/eligibility/:wallet', async (req, res) => {
  try {
    const w = String(req.params.wallet || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(w)) {
      return res.status(400).json({ success: false, reason: 'invalid_wallet' });
    }
    const out = await faucetCheckEligibility(w);
    res.json({ success: true, wallet: w, ...out });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
`;
  // Place the new route near the existing faucet routes if possible.
  const faucetEnabledRe = /(app\.get\(\s*["'`]\/faucet\/enabled["'`][^\)]*\)\s*=>\s*\{[\s\S]*?\n\}\)\s*;\s*\n)/;
  if (faucetEnabledRe.test(s)) {
    s = s.replace(faucetEnabledRe, '$1' + eligibilityRoute);
  } else {
    const listenAnchor = /(\n\s*app\.listen\s*\()/;
    s = s.replace(listenAnchor, eligibilityRoute + '$1');
  }
}

if (s === before) {
  console.error('[faucet-gate] nothing changed — patterns may have drifted');
  process.exit(1);
}

fs.writeFileSync(SRC, s);
console.log('[faucet-gate] patched: NFT + .lit domain gate, 10 points reward, /faucet/eligibility added');
