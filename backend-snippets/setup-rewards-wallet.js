#!/usr/bin/env node
/* eslint-disable no-console */
//
// setup-rewards-wallet.js
//
// One-time setup for the dedicated weekly-rewards distributor wallet.
//
//   1. Generates a brand-new wallet ON THE SERVER (or reuses the one
//      already saved in .env — idempotent, never creates orphans).
//   2. Appends REWARDS_PRIVATE_KEY + LDEX_ADDR to ../.env (if not present).
//      The private key is written to the .env FILE ONLY — it is never
//      printed to the console or logs.
//   3. Funds the new wallet FROM 0x3bc (PRIVATE_KEY) with a configurable
//      amount of zkLTC (native gas) + LDEX (ERC20).
//
// SAFETY:
//   - DRY RUN by default. Shows what it would generate/fund. Pass
//     --execute to actually generate + transfer.
//   - Re-running with --execute and an existing REWARDS_PRIVATE_KEY in
//     .env will NOT generate a new wallet — it just tops up the existing
//     one with the requested amounts.
//
// Usage on /root/litvm-dex/game-server:
//   wget -qO setup-rewards-wallet.js https://raw.githubusercontent.com/0xDarkSeidBull/litdex/<sha>/backend-snippets/setup-rewards-wallet.js
//   node setup-rewards-wallet.js                          # dry run, defaults
//   node setup-rewards-wallet.js --execute                # generate + fund (defaults: 50 zkLTC, 2,700,000 LDEX)
//   node setup-rewards-wallet.js --execute --zkltc 50 --ldex 2700000

require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
function argVal(name, def) {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1] != null) return args[i + 1];
  return def;
}
const ZKLTC_AMT = Number(argVal('--zkltc', '50'));         // native gas token, 1 month quota
const LDEX_AMT  = Number(argVal('--ldex', '2700000'));     // ERC20, 1 month quota

const RPC = (process.env.CASINO_RPCS || 'https://liteforge.rpc.caldera.xyz/http').split(',')[0].trim();
const LDEX_ADDR = process.env.LDEX_ADDR || '0xBAaba603e6298fbb76325a6B0d47Cd57154ca641';
const ENV_PATH = path.join(process.cwd(), '..', '.env');

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

function readEnv() {
  try { return fs.readFileSync(ENV_PATH, 'utf8'); } catch { return ''; }
}
function envHas(key) {
  const re = new RegExp(`^\\s*${key}\\s*=`, 'm');
  return re.test(readEnv());
}
function appendEnv(lines) {
  let cur = readEnv();
  if (cur.length && !cur.endsWith('\n')) cur += '\n';
  cur += lines.join('\n') + '\n';
  fs.writeFileSync(ENV_PATH, cur);
}

(async () => {
  console.log(`\n=== LitDeX Rewards Wallet Setup · ${EXECUTE ? 'EXECUTE' : 'DRY RUN'} ===\n`);

  if (!process.env.PRIVATE_KEY) {
    console.error('PRIVATE_KEY (0x3bc funder) not found in .env — aborting.');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(
    RPC, ethers.Network.from({ chainId: 4441, name: 'litvm' }),
    { staticNetwork: true, polling: false, timeout: 20000 },
  );
  const funder = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const funderAddr = await funder.getAddress();

  // Decide: reuse existing rewards wallet or generate a new one.
  let rewardsAddr, rewardsKey, generated = false;
  if (process.env.REWARDS_PRIVATE_KEY) {
    const w = new ethers.Wallet(process.env.REWARDS_PRIVATE_KEY);
    rewardsAddr = await w.getAddress();
    rewardsKey = process.env.REWARDS_PRIVATE_KEY;
    console.log(`Reusing existing rewards wallet from .env: ${rewardsAddr}`);
  } else {
    const w = ethers.Wallet.createRandom();
    rewardsAddr = w.address;
    rewardsKey = w.privateKey;
    generated = true;
    console.log(`Will generate NEW rewards wallet: ${rewardsAddr}`);
    console.log('(private key will be written to .env only — never printed)');
  }

  // Funder balances.
  const ldex = new ethers.Contract(LDEX_ADDR, ERC20_ABI, funder);
  let ldexDec = 18, ldexSym = 'LDEX';
  try { ldexDec = Number(await ldex.decimals()); } catch {}
  try { ldexSym = await ldex.symbol(); } catch {}
  const funderZk = Number(ethers.formatEther(await provider.getBalance(funderAddr)));
  const funderLdex = Number(ethers.formatUnits(await ldex.balanceOf(funderAddr), ldexDec));

  console.log(`\nFunder (0x3bc): ${funderAddr}`);
  console.log(`  zkLTC: ${funderZk}`);
  console.log(`  ${ldexSym}:  ${funderLdex.toLocaleString()} (decimals ${ldexDec})`);
  console.log(`\nTransfer plan → ${rewardsAddr}`);
  console.log(`  zkLTC: ${ZKLTC_AMT}`);
  console.log(`  ${ldexSym}:  ${LDEX_AMT.toLocaleString()}\n`);

  if (funderZk < ZKLTC_AMT + 0.05) console.log(`⚠ Funder zkLTC may be short (need ${ZKLTC_AMT} + gas).`);
  if (funderLdex < LDEX_AMT)        console.log(`⚠ Funder ${ldexSym} short by ${(LDEX_AMT - funderLdex).toLocaleString()}.`);

  if (!EXECUTE) {
    console.log('\nDRY RUN — nothing generated, nothing sent. Re-run with --execute.');
    process.exit(0);
  }

  // 1. Persist the rewards wallet key + LDEX addr to .env.
  const toAppend = [];
  if (generated && !envHas('REWARDS_PRIVATE_KEY')) toAppend.push(`REWARDS_PRIVATE_KEY=${rewardsKey}`);
  if (!envHas('LDEX_ADDR')) toAppend.push(`LDEX_ADDR=${LDEX_ADDR}`);
  if (toAppend.length) {
    appendEnv(toAppend);
    console.log(`Wrote ${toAppend.map((l) => l.split('=')[0]).join(', ')} to ${ENV_PATH}`);
  }

  let nonce = await provider.getTransactionCount(funderAddr, 'pending');

  // 2. Send zkLTC (native).
  if (ZKLTC_AMT > 0) {
    try {
      const tx = await funder.sendTransaction({
        to: rewardsAddr, value: ethers.parseEther(String(ZKLTC_AMT)), nonce: nonce++, chainId: 4441,
      });
      console.log(`zkLTC transfer broadcast: ${tx.hash}`);
      await tx.wait();
      console.log(`  confirmed`);
    } catch (e) { console.error(`zkLTC transfer failed: ${e.shortMessage || e.message}`); }
  }

  // 3. Send LDEX (ERC20).
  if (LDEX_AMT > 0) {
    try {
      const req = await ldex.transfer.populateTransaction(rewardsAddr, ethers.parseUnits(String(LDEX_AMT), ldexDec));
      req.nonce = nonce++; req.chainId = 4441;
      const tx = await funder.sendTransaction(req);
      console.log(`${ldexSym} transfer broadcast: ${tx.hash}`);
      await tx.wait();
      console.log(`  confirmed`);
    } catch (e) { console.error(`${ldexSym} transfer failed: ${e.shortMessage || e.message}`); }
  }

  // 4. Show final rewards-wallet balances.
  const rZk = Number(ethers.formatEther(await provider.getBalance(rewardsAddr)));
  const rLdex = Number(ethers.formatUnits(await ldex.balanceOf(rewardsAddr), ldexDec));
  console.log(`\nRewards wallet now holds:`);
  console.log(`  zkLTC: ${rZk}`);
  console.log(`  ${ldexSym}:  ${rLdex.toLocaleString()}`);
  console.log(`\nDone. Restart not required for this script.`);
  console.log(`Next: run the weekly payout in dry-run:  node weekly-rewards-payout.js`);
})();
