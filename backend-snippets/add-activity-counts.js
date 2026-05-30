#!/usr/bin/env node
/* eslint-disable no-console */
//
// add-activity-counts.js
//
// The earlier install-activity-points run added /activity/award but an
// older version of the script (no /activity/counts). The MARK guard then
// blocked the newer installer. This standalone patch adds ONLY the
// /activity/counts/:wallet endpoint, inserted right before app.listen.
//
// Idempotent + brace-safe. Requires the _apDB / _apToday helpers that the
// award block already defined.
//
// Run on /root/litvm-dex/twitter-auth:
//   wget -qO /tmp/add-activity-counts.js https://raw.githubusercontent.com/0xDarkSeidBull/litdex/<sha>/backend-snippets/add-activity-counts.js
//   node /tmp/add-activity-counts.js
//   node -c server.js && echo OK
//   pm2 restart litdex-quest-api

const fs = require('fs');
const path = require('path');

const SERVER = path.join(process.cwd(), 'server.js');
let s = fs.readFileSync(SERVER, 'utf8');

if (s.includes("'/activity/counts/:wallet'") || s.includes('"/activity/counts/:wallet"')) {
  console.log('[ok] /activity/counts already present');
  process.exit(0);
}
if (!s.includes('_apToday') || !s.includes('_apDB')) {
  console.error('[err] award block helpers (_apDB/_apToday) not found — run install-activity-points first.');
  process.exit(1);
}

const BLOCK = `
// GET /activity/counts/:wallet -> today's per-bucket usage for the UI.
app.get('/activity/counts/:wallet', (req, res) => {
  try {
    const w = String(req.params.wallet || '').toLowerCase();
    if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });
    const day = _apToday();
    const get = (bucket) => {
      const r = _apDB.prepare('SELECT points FROM ap_daily WHERE wallet=? AND bucket=? AND day=?').get(w, bucket, day);
      return r ? Number(r.points) : 0;
    };
    const deployBuckets = ['deploy_nft', 'deploy_staking', 'deploy_vesting', 'deploy_tokenfactory'];
    const deployUsed = deployBuckets.reduce((acc, b) => acc + get(b), 0);
    res.json({
      day,
      swap:   { used: get('swap'), cap: 100 },
      pool:   { used: get('pool'), cap: 100 },
      deploy: { used: deployUsed, cap: 400, perType: {
        nft: get('deploy_nft'), staking: get('deploy_staking'),
        vesting: get('deploy_vesting'), tokenfactory: get('deploy_tokenfactory'),
      } },
    });
  } catch (e) {
    console.error('[activity/counts]', e.message);
    res.status(500).json({ error: 'counts_failed' });
  }
});
`;

const listenRe = /\n\s*app\.listen\s*\(/;
if (!listenRe.test(s)) { console.error('[err] app.listen anchor not found'); process.exit(1); }
const before = s;
s = s.replace(listenRe, `\n${BLOCK}\napp.listen(`);
if (s === before) { console.error('[err] no change'); process.exit(1); }

fs.writeFileSync(SERVER + '.bak-counts', before);
fs.writeFileSync(SERVER, s);
console.log('[done] /activity/counts/:wallet added. Backup: server.js.bak-counts');
console.log('Verify: node -c server.js && echo OK ; then pm2 restart litdex-quest-api');
