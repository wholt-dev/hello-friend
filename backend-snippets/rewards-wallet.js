/* eslint-disable no-console */
//
// LitDeX Rewards Wallet — dedicated, pre-funded distributor for weekly
// leaderboard rewards.
//
// Design:
//   - REAL tokens (zkLTC native + LDEX ERC20) are sent from a dedicated
//     wallet (REWARDS_PRIVATE_KEY). Fund it once with a month of quota and
//     forget. If it runs dry the script warns instead of failing silently.
//   - POINTS (PTS) are minted via the existing authorized PointsSystem
//     signer (PRIVATE_KEY / 0x3bc...). Points are not a scarce token, so a
//     fresh wallet (which would not be an authorized minter) is not used
//     for them.
//
// Self-contained nonce management per signer + sequential queue so a weekly
// batch of dozens of transfers never collides.
//
// Public API:
//   const rw = require('./rewards-wallet');
//   rw.init({ rpcs, rewardsPrivateKey, pointsPrivateKey, ldexAddr, pointsAddr });
//   await rw.balances()                          -> { zkltc, ldex, ldexDecimals }
//   await rw.sendZkltc(to, amountFloat)          -> txHash | null
//   await rw.sendLdex(to, amountFloat)           -> txHash | null
//   await rw.sendPts(to, amountInt, questId)     -> txHash | null

const { ethers } = require('ethers');

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];
const POINTS_ABI = [
  'function recordQuestFor(address user, uint256 pts, string questId) external',
  'function getPoints(address user) view returns (uint256 total, uint256 deployDaily, uint256 msgDaily)',
];

let _providers = [];
let _idx = 0;
let _rewardsSigner = null;
let _pointsSigner = null;
let _ldex = null;
let _points = null;
let _ldexDecimals = 18;
let _chainId = 4441;
let _rewardsNonce = null;
let _pointsNonce = null;
let _initialised = false;

const _queue = [];
let _running = false;

function _provider() { return _providers[_idx]; }

function init({ rpcs, rewardsPrivateKey, pointsPrivateKey, ldexAddr, pointsAddr, chainId }) {
  if (_initialised) return;
  if (chainId) _chainId = chainId;
  const list = (rpcs && rpcs.length) ? rpcs : ['https://liteforge.rpc.caldera.xyz/http'];
  _providers = list.map((url) => new ethers.JsonRpcProvider(
    url,
    ethers.Network.from({ chainId: _chainId, name: 'litvm' }),
    { staticNetwork: true, polling: false, timeout: 20000 },
  ));
  _rewardsSigner = new ethers.Wallet(rewardsPrivateKey, _provider());
  _pointsSigner  = new ethers.Wallet(pointsPrivateKey || rewardsPrivateKey, _provider());
  _ldex   = new ethers.Contract(ldexAddr, ERC20_ABI, _rewardsSigner);
  _points = new ethers.Contract(pointsAddr, POINTS_ABI, _pointsSigner);
  _initialised = true;
}

async function _ensureDecimals() {
  try { _ldexDecimals = Number(await _ldex.decimals()); } catch { _ldexDecimals = 18; }
  return _ldexDecimals;
}

async function balances() {
  await _ensureDecimals();
  const addr = await _rewardsSigner.getAddress();
  const zkltcWei = await _provider().getBalance(addr);
  const ldexWei = await _ldex.balanceOf(addr);
  return {
    address: addr,
    zkltc: Number(ethers.formatEther(zkltcWei)),
    ldex: Number(ethers.formatUnits(ldexWei, _ldexDecimals)),
    ldexDecimals: _ldexDecimals,
  };
}

async function _refreshNonce(which) {
  if (which === 'rewards') {
    _rewardsNonce = await _provider().getTransactionCount(await _rewardsSigner.getAddress(), 'pending');
  } else {
    _pointsNonce = await _provider().getTransactionCount(await _pointsSigner.getAddress(), 'pending');
  }
}

function _enqueue(fn) {
  return new Promise((resolve) => { _queue.push({ fn, resolve }); _pump(); });
}

async function _pump() {
  if (_running) return;
  _running = true;
  while (_queue.length) {
    const { fn, resolve } = _queue.shift();
    let hash = null;
    for (let attempt = 0; attempt < 4 && hash === null; attempt++) {
      try { hash = await fn(); }
      catch (e) {
        const msg = (e && (e.shortMessage || e.message || '')).toLowerCase();
        console.error('[rewards-wallet]', msg.slice(0, 180));
        if (msg.includes('nonce') || msg.includes('already known') || msg.includes('replacement')) {
          await _refreshNonce('rewards').catch(() => {});
          await _refreshNonce('points').catch(() => {});
          continue;
        }
        if (msg.includes('timeout') || msg.includes('network') || msg.includes('econnreset') || msg.includes('503') || msg.includes('502')) {
          _idx = (_idx + 1) % _providers.length;
          _rewardsSigner = _rewardsSigner.connect(_provider());
          _pointsSigner = _pointsSigner.connect(_provider());
          _ldex = _ldex.connect(_rewardsSigner);
          _points = _points.connect(_pointsSigner);
          await _refreshNonce('rewards').catch(() => {});
          await _refreshNonce('points').catch(() => {});
          continue;
        }
        // insufficient funds / revert → give up on this item
        break;
      }
    }
    resolve(hash);
    await new Promise((r) => setTimeout(r, 40));
  }
  _running = false;
}

function sendZkltc(to, amountFloat) {
  return _enqueue(async () => {
    if (_rewardsNonce == null) await _refreshNonce('rewards');
    const tx = await _rewardsSigner.sendTransaction({
      to,
      value: ethers.parseEther(String(amountFloat)),
      nonce: _rewardsNonce,
      chainId: _chainId,
    });
    _rewardsNonce += 1;
    return tx.hash;
  });
}

function sendLdex(to, amountFloat) {
  return _enqueue(async () => {
    if (_rewardsNonce == null) await _refreshNonce('rewards');
    await _ensureDecimals();
    const amt = ethers.parseUnits(String(amountFloat), _ldexDecimals);
    const req = await _ldex.transfer.populateTransaction(to, amt);
    req.nonce = _rewardsNonce;
    req.chainId = _chainId;
    const tx = await _rewardsSigner.sendTransaction(req);
    _rewardsNonce += 1;
    return tx.hash;
  });
}

function sendPts(to, amountInt, questId) {
  return _enqueue(async () => {
    if (_pointsNonce == null) await _refreshNonce('points');
    const req = await _points.recordQuestFor.populateTransaction(to, BigInt(Math.floor(amountInt)), String(questId));
    req.nonce = _pointsNonce;
    req.chainId = _chainId;
    const tx = await _pointsSigner.sendTransaction(req);
    _pointsNonce += 1;
    return tx.hash;
  });
}

module.exports = { init, balances, sendZkltc, sendLdex, sendPts };
