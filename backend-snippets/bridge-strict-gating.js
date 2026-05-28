// Patch: lock down /root/litvm-dex/scripts/relayer.js with strict
// anti-abuse gating. After this, the bridge only unlocks zkLTC for
// wallets that meet ALL of:
//
//   1. amount <= 0.2 ETH per single Sepolia lock
//   2. <= 2 successful bridges per wallet per day (IST midnight reset)
//   3. on-chain PointsSystem total >= 200
//   4. owns at least one .lit domain (hub.test-hub.xyz/hub/names/owned)
//   5. played >= 5 Math Slash games today (existing helper)
//
// All checks happen BEFORE mintWZKLTC/unlockZKLTC. Failed locks are
// logged with the explicit reason and the Sepolia ETH stays trapped
// in the Sepolia bridge contract — abusers don't get free zkLTC.
//
// The gating is best-effort: any RPC/HTTP failure reads as "fail",
// erring on the side of safety. A clean abusing wallet can never
// drain the bridge.
//
// Server usage:
//   wget -O /tmp/bridge-gate.js \
//     "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/fix/bridge-strict-gating/backend-snippets/bridge-strict-gating.js"
//   node /tmp/bridge-gate.js
//   pm2 restart litdex-bridge
//
// Backup written to /root/litvm-dex/scripts/relayer.js.bak-strict.

const fs = require('fs');
const SRC = '/root/litvm-dex/scripts/relayer.js';

let s = fs.readFileSync(SRC, 'utf8');
const before = s;

if (s.includes('// BRIDGE_GATE_V1')) {
  console.log('[bridge-gate] already installed, nothing to do');
  process.exit(0);
}

// ── Block 1: helpers + counter persistence ────────────────────────
// We anchor RIGHT BEFORE `function hasPlayedEnough(` so the new
// helpers can be referenced from the ETHLocked handler above (which
// has already been parsed by Node — these are top-level function
// decls, hoisted).
const helpersBlock = `
// BRIDGE_GATE_V1 — strict anti-abuse helpers
const _bridgeCounterPath = '/root/litvm-dex/scripts/.bridge-daily.json';
function _bridgeLoadCounter() {
  try {
    if (!fs.existsSync(_bridgeCounterPath)) return {};
    const raw = fs.readFileSync(_bridgeCounterPath, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    console.error('[BridgeGate] counter load failed:', e.message);
    return {};
  }
}
function _bridgeSaveCounter(obj) {
  try {
    fs.writeFileSync(_bridgeCounterPath, JSON.stringify(obj));
  } catch (e) {
    console.error('[BridgeGate] counter save failed:', e.message);
  }
}
function _bridgeTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function bridgeCountToday(wallet) {
  const w = wallet.toLowerCase();
  const today = _bridgeTodayIST();
  const all = _bridgeLoadCounter();
  const entry = all[w];
  if (!entry || entry.date !== today) return 0;
  return Number(entry.count || 0);
}
function bridgeBumpCount(wallet) {
  const w = wallet.toLowerCase();
  const today = _bridgeTodayIST();
  const all = _bridgeLoadCounter();
  const entry = all[w];
  if (!entry || entry.date !== today) {
    all[w] = { date: today, count: 1 };
  } else {
    all[w].count = Number(entry.count || 0) + 1;
  }
  _bridgeSaveCounter(all);
}

// On-chain points read. Re-uses the existing litRead provider; the
// PointsSystem ABI is small enough to inline here so we don't touch
// the big import block at the top of the file.
const _BRIDGE_POINTS_ADDR = '0x526B0629C81d3314929dB8166372F792F3da3419';
const _BRIDGE_POINTS_ABI = ['function getPoints(address) view returns (uint256, uint256, uint256)'];
let _bridgePointsContract = null;
function _bridgePoints() {
  if (_bridgePointsContract) return _bridgePointsContract;
  try {
    _bridgePointsContract = new ethers.Contract(_BRIDGE_POINTS_ADDR, _BRIDGE_POINTS_ABI, litRead.runner || litRead.provider || litRead);
  } catch (e) {
    console.error('[BridgeGate] points contract init failed:', e.message);
  }
  return _bridgePointsContract;
}
async function bridgeHasPoints(wallet) {
  try {
    const c = _bridgePoints();
    if (!c) return false;
    const r = await c.getPoints(wallet);
    return Number(r[0]) >= 200;
  } catch (e) {
    console.error('[BridgeGate] points read failed:', e.message);
    return false;
  }
}
async function bridgeHasLitDomain(wallet) {
  try {
    const w = wallet.toLowerCase();
    const r = await fetch('https://hub.test-hub.xyz/hub/names/owned/' + w);
    if (!r.ok) return false;
    const j = await r.json().catch(() => ({}));
    const names = Array.isArray(j) ? j : (j.names || j.domains || []);
    return Array.isArray(names) && names.length > 0;
  } catch (e) {
    console.error('[BridgeGate] domain check failed:', e.message);
    return false;
  }
}

// Aggregate gate. Returns { eligible: bool, reasons: string[] } so we
// can log a clear reason for every blocked lock.
async function bridgeCheckEligibility(wallet, amountWei) {
  const reasons = [];
  // 1. Amount cap
  const cap = ethers.parseEther('0.2');
  if (amountWei > cap) reasons.push('amount > 0.2 ETH');
  // 2. Daily count
  const used = bridgeCountToday(wallet);
  if (used >= 2) reasons.push('daily limit (2/day)');
  // 3. Points
  const pts = await bridgeHasPoints(wallet);
  if (!pts) reasons.push('points < 200');
  // 4. .lit domain
  const dom = await bridgeHasLitDomain(wallet);
  if (!dom) reasons.push('no .lit domain');
  // 5. Games (re-uses existing helper)
  const games = hasPlayedEnough(wallet);
  if (!games) reasons.push('games < 5');
  return { eligible: reasons.length === 0, reasons };
}
// END BRIDGE_GATE_V1

`;

const helpersAnchor = /\nfunction hasPlayedEnough\(wallet\)\s*\{/;
if (!helpersAnchor.test(s)) {
  console.error('[bridge-gate] hasPlayedEnough anchor not found');
  process.exit(1);
}
s = s.replace(helpersAnchor, helpersBlock + '\nfunction hasPlayedEnough(wallet) {');

// ── Block 2: rewrite the ETHLocked handler's gating ───────────────
// Replace the existing 5-games-only check with the full eligibility
// gate. We match the entire existing block so the rewrite is exact.
const oldEthHandler = `console.log(\`[Sepolia→LitVM] ETHLocked \${e.args.user} \${ethers.formatEther(e.args.amount)} ETH\`);
      if (!hasPlayedEnough(e.args.user)) {
        console.log(\`⚠️ BLOCKED: \${e.args.user.slice(0,10)} hasn't played 5 games today\`);
        continue;
      }
      try {
        const tx = await litBridge.unlockZKLTC(e.args.user, e.args.amount, e.args.nonce);
        await tx.wait();
        console.log(\`✅ zkLTC unlocked | \${tx.hash}\`);
      } catch(err) { console.error('❌ unlockZKLTC:', err.message); }`;

const newEthHandler = `console.log(\`[Sepolia→LitVM] ETHLocked \${e.args.user} \${ethers.formatEther(e.args.amount)} ETH\`);
      const _gate = await bridgeCheckEligibility(e.args.user, e.args.amount);
      if (!_gate.eligible) {
        console.log(\`🚫 [BridgeGate] BLOCKED \${e.args.user.slice(0,10)} | \${_gate.reasons.join(', ')}\`);
        continue;
      }
      try {
        const tx = await litBridge.unlockZKLTC(e.args.user, e.args.amount, e.args.nonce);
        await tx.wait();
        bridgeBumpCount(e.args.user);
        console.log(\`✅ zkLTC unlocked | \${tx.hash}\`);
      } catch(err) { console.error('❌ unlockZKLTC:', err.message); }`;

// We use indexOf + slice for replacement here because the embedded
// template literals inside the source confuse a single regex.
const idx = s.indexOf(oldEthHandler);
if (idx === -1) {
  // Try whitespace-tolerant match — the file might use different
  // indentation than the snippet above.
  const flexible = oldEthHandler
    .replace(/\s+/g, '\\s+')
    .replace(/[.*+?^${}()|[\]\\]/g, (c) => (/\s/.test(c) ? c : '\\' + c));
  console.error('[bridge-gate] strict ETHLocked handler not found, trying flexible match');
  const re = new RegExp(flexible, 'g');
  if (!re.test(s)) {
    console.error('[bridge-gate] could not locate ETHLocked handler block; aborting');
    process.exit(1);
  }
  s = s.replace(re, newEthHandler);
} else {
  s = s.slice(0, idx) + newEthHandler + s.slice(idx + oldEthHandler.length);
}

if (s === before) {
  console.error('[bridge-gate] match counted but text unchanged');
  process.exit(1);
}

fs.writeFileSync(SRC + '.bak-strict', before);
fs.writeFileSync(SRC, s);
console.log('[bridge-gate] strict gating installed (5 checks); backup at ' + SRC + '.bak-strict');
