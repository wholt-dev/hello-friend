#!/usr/bin/env node
/* eslint-disable no-console */
//
// fix-questqueue-nonce.js
//
// The quest-api processQuestQueue() calls points.recordQuestFor() without
// managing the nonce. The same signer wallet (0x3bc) is used by THREE
// servers (quest-api, game-server, hub), so concurrent sends collide and
// every credit fails with "nonce too low" / NONCE_EXPIRED. This affects
// faucet, domain, quests, AND the new swap/pool/deploy activity points.
//
// This patch rewrites processQuestQueue() to:
//   - fetch the latest 'pending' nonce from chain before each send,
//   - on NONCE_EXPIRED / "nonce too low" / "already known", refresh the
//     nonce and retry the SAME item (up to 5 times) instead of dropping it,
//   - explicitly pass the nonce so two queued items never reuse one.
//
// Because we re-read 'pending' from chain each time, this cooperates with
// the other two servers sharing the wallet (they bump the on-chain nonce,
// we pick up the new value).
//
// SAFETY: backs up server.js.bak-qnonce, only edits if the exact function
// is found, idempotent (re-run = no-op once installed).
//
// Run on /root/litvm-dex/twitter-auth:
//   wget -qO /tmp/fix-questqueue-nonce.js https://raw.githubusercontent.com/0xDarkSeidBull/litdex/<sha>/backend-snippets/fix-questqueue-nonce.js
//   node /tmp/fix-questqueue-nonce.js
//   node -c server.js && echo OK
//   pm2 restart litdex-quest-api

const fs = require('fs');
const path = require('path');

const SERVER = path.join(process.cwd(), 'server.js');
if (!fs.existsSync(SERVER)) { console.error('server.js not found in', process.cwd()); process.exit(1); }

let s = fs.readFileSync(SERVER, 'utf8');
const MARK = '/* QUEUE_NONCE_FIXED */';
if (s.includes(MARK)) { console.log('[ok] already patched'); process.exit(0); }

// Match the whole processQuestQueue function body (from declaration to the
// matching closing brace that ends "queueProcessing = false;\n}").
const fnRe = /async function processQuestQueue\(\)\s*\{[\s\S]*?queueProcessing = false;\s*\n\}/;
if (!fnRe.test(s)) {
  console.error('[err] processQuestQueue() not found in expected shape — aborting (no changes).');
  process.exit(1);
}

const NEW_FN = `async function processQuestQueue() {
  ${MARK}
  if (queueProcessing || questQueue.length === 0) return;
  queueProcessing = true;
  console.log(\`[Queue] Processing \${questQueue.length} pending quests\`);
  // Managed nonce: refresh from chain at the start and after any collision,
  // since the signer wallet is shared across multiple services.
  let _nonce = null;
  async function _freshNonce() {
    _nonce = await wallet.getNonce('pending');
  }
  while (questQueue.length > 0) {
    const { userWallet, pts, questId, resolve, reject } = questQueue.shift();
    let sent = null, lastErr = null;
    for (let attempt = 0; attempt < 5 && !sent; attempt++) {
      try {
        if (_nonce == null) await _freshNonce();
        const tx = await points.recordQuestFor(userWallet, pts, questId, { nonce: _nonce });
        _nonce += 1;
        await tx.wait();
        sent = tx;
      } catch (e) {
        lastErr = e;
        const msg = (e && (e.shortMessage || e.message || '')).toLowerCase();
        if (msg.includes('nonce') || msg.includes('already known') || msg.includes('replacement')) {
          try { await _freshNonce(); } catch { /* ignore */ }
          await new Promise(r => setTimeout(r, 400));
          continue;
        }
        // Non-nonce error (e.g. already-claimed quest / revert): stop retrying.
        break;
      }
    }
    if (sent) {
      console.log(\`✅ Quest \${questId} → \${userWallet.slice(0,10)} +\${pts}pts\`);
      resolve(sent);
    } else {
      console.error(\`❌ Quest \${questId} failed:\`, lastErr && (lastErr.shortMessage || lastErr.message));
      reject(lastErr || new Error('quest_failed'));
    }
    await new Promise(r => setTimeout(r, 300));
  }
  queueProcessing = false;
}`;

const before = s;
s = s.replace(fnRe, NEW_FN);
if (s === before) { console.error('[err] replacement produced no change'); process.exit(1); }

fs.writeFileSync(SERVER + '.bak-qnonce', before);
fs.writeFileSync(SERVER, s);
console.log('[done] processQuestQueue() now manages nonce + retries. Backup: server.js.bak-qnonce');
console.log('Verify: node -c server.js && echo OK');
console.log('Then:   pm2 restart litdex-quest-api');
