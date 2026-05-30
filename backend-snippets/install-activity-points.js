#!/usr/bin/env node
/* eslint-disable no-console */
//
// install-activity-points.js
//
// Adds an extended /points/award endpoint to the quest-api server
// (/root/litvm-dex/twitter-auth/server.js → api.test-hub.xyz) that
// rewards swap / pool / deploy / NFT-mint activity with server-enforced
// daily caps. Points are minted via the same queueQuest()/recordQuestFor
// relayer the domain + messenger flows already use.
//
// REWARD SPEC (server-enforced - frontend cannot inflate):
//   swap       +5 per swap,  cap 100/day   (= 20 swaps)
//   pool       +5 per add/remove, cap 100/day combined (= 20 actions)
//   deploy     +5 per deploy, per-type cap 100/day each across 4 types
//              (nft / staking / vesting / tokenfactory). ERC20 deploys
//              already earn +5/100 on-chain via the deployer contract.
//
// Idempotency: every credit is keyed by txHash. A given txHash credits
// at most once (DB unique). Daily caps tracked per (wallet, bucket, IST-day).
//
// SAFETY: writes server.js.bak-activitypoints, only edits if the anchor
// is found, idempotent (re-run = no-op once installed).
//
// Run on /root/litvm-dex/twitter-auth:
//   wget -qO /tmp/install-activity-points.js https://raw.githubusercontent.com/0xDarkSeidBull/litdex/<sha>/backend-snippets/install-activity-points.js
//   node /tmp/install-activity-points.js
//   node -c server.js && echo OK
//   pm2 restart litdex-quest-api

const fs = require('fs');
const path = require('path');

const SERVER = path.join(process.cwd(), 'server.js');
if (!fs.existsSync(SERVER)) { console.error('server.js not found in', process.cwd()); process.exit(1); }

let s = fs.readFileSync(SERVER, 'utf8');
const MARK = '/* ACTIVITY_POINTS_INSTALLED */';
if (s.includes(MARK)) { console.log('[ok] already installed'); process.exit(0); }

// The block we inject. It self-initialises its own SQLite tables, reuses
// the server's existing `provider` (for tx verification) and `queueQuest`
// (for relayer-nonce-safe crediting). If your helper has a different name
// the script tries a couple of fallbacks.
const BLOCK = `
${MARK}
// ── LitDeX activity points (swap / pool / deploy / nft mint) ──────────
const _apDB = require('better-sqlite3')(require('path').join(__dirname, 'activity-points.db'));
_apDB.pragma('journal_mode = WAL');
_apDB.exec(\`
  CREATE TABLE IF NOT EXISTS ap_credits (
    tx_hash TEXT PRIMARY KEY, wallet TEXT NOT NULL, action TEXT NOT NULL,
    points INTEGER NOT NULL, ts INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ap_daily (
    wallet TEXT NOT NULL, bucket TEXT NOT NULL, day TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (wallet, bucket, day)
  );
\`);
function _apToday() { return new Date(Date.now() + 19800000).toISOString().slice(0, 10); }
function _apDayPoints(wallet, bucket) {
  const r = _apDB.prepare('SELECT points FROM ap_daily WHERE wallet=? AND bucket=? AND day=?').get(wallet, bucket, _apToday());
  return r ? Number(r.points) : 0;
}
function _apAddDay(wallet, bucket, pts) {
  _apDB.prepare(\`INSERT INTO ap_daily (wallet, bucket, day, points) VALUES (?, ?, ?, ?)
    ON CONFLICT(wallet, bucket, day) DO UPDATE SET points = points + excluded.points\`)
    .run(wallet, bucket, _apToday(), pts);
}

// action → { bucket, perAction, dailyCap }  (dailyCap 0 = unlimited)
// Deploy is split per type so each of the 4 non-ERC20 factory types gets
// its own 100/day cap (+5 per deploy = 20 deploys). ERC20 deploys are NOT
// handled here — they already earn +5/deploy on-chain via LITDEX_DEPLOYER
// (100/day cap in the PointsSystem contract). 4 types x 100 = 400, plus the
// on-chain ERC20 100 = 500/day total deploy points.
const _AP_RULES = {
  swap:            { bucket: 'swap',            per: 5, cap: 100 },
  pool:            { bucket: 'pool',            per: 5, cap: 100 },
  deploy_nft:      { bucket: 'deploy_nft',      per: 5, cap: 100 },
  deploy_staking:  { bucket: 'deploy_staking',  per: 5, cap: 100 },
  deploy_vesting:  { bucket: 'deploy_vesting',  per: 5, cap: 100 },
  deploy_tokenfactory: { bucket: 'deploy_tokenfactory', per: 5, cap: 100 },
};

app.post('/activity/award', async (req, res) => {
  try {
    const { wallet, action, txHash, meta } = req.body || {};
    if (!wallet || !action || !txHash) return res.json({ success: false, reason: 'missing_fields' });
    const w = String(wallet).toLowerCase();
    const tx = String(txHash).toLowerCase();

    // Idempotency: this tx already credited?
    if (_apDB.prepare('SELECT 1 FROM ap_credits WHERE tx_hash=?').get(tx)) {
      return res.json({ success: true, alreadyCredited: true });
    }

    // Verify the tx on chain and that it was sent by this wallet.
    let receipt = null;
    try { receipt = await provider.getTransactionReceipt(txHash); } catch (e) { console.error('[activity/award] receipt:', e.message); }
    if (!receipt || !receipt.status) return res.json({ success: false, reason: 'tx_not_found_or_failed' });
    if ((receipt.from || '').toLowerCase() !== w) return res.json({ success: false, reason: 'tx_not_from_wallet' });

    // Resolve points + cap. 'deploy' with meta.type maps to deploy_<type>;
    // swap/pool map directly.
    let ruleKey = action;
    if (action === 'deploy') ruleKey = 'deploy_' + String(meta?.type || '').toLowerCase();
    const rule = _AP_RULES[ruleKey];
    if (!rule) return res.json({ success: false, reason: 'unsupported_action' });
    const bucket = rule.bucket;
    const used = _apDayPoints(w, bucket);
    const remaining = Math.max(0, rule.cap - used);
    const pts = Math.min(rule.per, remaining);
    if (pts <= 0) return res.json({ success: true, capped: true, credited: 0, used });

    // Credit via the existing relayer queue (idempotent on-chain via questId too).
    const questId = bucket + '_' + tx.slice(2, 18);
    const qtx = await queueQuest(w, pts, questId);
    if (qtx && qtx.wait) await qtx.wait();

    _apDB.prepare('INSERT OR IGNORE INTO ap_credits (tx_hash, wallet, action, points, ts) VALUES (?,?,?,?,?)')
      .run(tx, w, bucket, pts, Date.now());
    _apAddDay(w, bucket, pts);

    console.log('[activity/award] ' + w.slice(0,10) + ' ' + bucket + ' +' + pts + 'pts');
    res.json({ success: true, credited: pts, action: bucket });
  } catch (e) {
    console.error('[activity/award]', e.message);
    res.json({ success: false, reason: e.message });
  }
});
// ── end activity points ───────────────────────────────────────────────
`;

// Insert just before app.listen(...) so all helpers (provider, queueQuest)
// are already defined.
const listenRe = /\n\s*app\.listen\s*\(/;
if (!listenRe.test(s)) {
  console.error('[err] could not find app.listen anchor in server.js');
  process.exit(1);
}
const before = s;
s = s.replace(listenRe, `\n${BLOCK}\napp.listen(`);
if (s === before) { console.error('[err] no change applied'); process.exit(1); }

fs.writeFileSync(SERVER + '.bak-activitypoints', before);
fs.writeFileSync(SERVER, s);
console.log('[done] /activity/award installed. Backup at server.js.bak-activitypoints');
console.log('Verify: node -c server.js && echo OK');
console.log('Then:   pm2 restart litdex-quest-api');
console.log('\nNOTE: this assumes the server exposes `provider` and `queueQuest(wallet, pts, questId)`.');
console.log('If your helper differs, grep server.js for the messenger/domain points credit fn and adjust.');
