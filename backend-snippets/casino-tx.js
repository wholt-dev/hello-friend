/* eslint-disable no-console */
//
// Shared casino tx queue for LitDeX.
//
// Why this exists:
//   - Every casino game (litdice/litlimbo/litmines/litplinko/litwheel/
//     litcoinflip) used its own private queue with `await tx.wait()`
//     and a 250ms delay between txs. Six independent queues with
//     blocking waits choked under concurrent load and produced random
//     nonce collisions.
//   - This module replaces those private queues with one cooperative
//     queue per signer wallet. We:
//       * Track nonce locally (init from RPC, increment per send).
//       * Send transactions fire-and-forget — we resolve as soon as
//         the broadcast is acknowledged (`provider.broadcastTransaction`
//         returns the tx hash). We do NOT block on `tx.wait()`.
//       * Retry on transient RPC errors with multi-endpoint fallback.
//       * Reset nonce from chain if we ever drift.
//
// Public API:
//   const txq = require('./casino-tx');
//   txq.init({ rpcs, privateKey, contractAddr, contractAbi });
//   const hash = await txq.send('spendPoints', [wallet, amount]);
//
// Each game module then exposes thin helpers:
//   const spendStake  = (from, amt) => txq.send('spendPoints', [from, BigInt(amt)]);
//   const awardPoints = (to, pts, q) => txq.send('recordQuestFor', [to, BigInt(pts), q]);

const { ethers } = require('ethers');

let _signer = null;
let _contract = null;
let _providers = [];
let _activeProviderIdx = 0;
let _nonce = null;
let _initialised = false;
let _chainId = 4441;

const _queue = [];
let _running = false;

const DEFAULT_RPCS = [
  'https://liteforge.rpc.caldera.xyz/http',
];

function _activeProvider() { return _providers[_activeProviderIdx]; }

async function _refreshNonce() {
  const p = _activeProvider();
  const addr = await _signer.getAddress();
  // 'pending' so we don't reuse a nonce currently in mempool.
  const next = await p.getTransactionCount(addr, 'pending');
  _nonce = next;
  console.log(`[casino-tx] nonce reset to ${_nonce}`);
}

async function _rotateProvider() {
  _activeProviderIdx = (_activeProviderIdx + 1) % _providers.length;
  console.log(`[casino-tx] rotated to provider #${_activeProviderIdx}`);
  // Re-bind signer to new provider. Contract is re-bound via _contract.connect.
  _signer = _signer.connect(_activeProvider());
  _contract = _contract.connect(_signer);
  await _refreshNonce();
}

function init({ rpcs, privateKey, contractAddr, contractAbi, chainId }) {
  if (_initialised) return;
  if (chainId) _chainId = chainId;
  const list = (rpcs && rpcs.length) ? rpcs : DEFAULT_RPCS;
  _providers = list.map((url) => new ethers.JsonRpcProvider(
    url,
    ethers.Network.from({ chainId: _chainId, name: 'litvm' }),
    { staticNetwork: true, polling: false, timeout: 15000 },
  ));
  _signer = new ethers.Wallet(privateKey, _activeProvider());
  _contract = new ethers.Contract(contractAddr, contractAbi, _signer);
  _initialised = true;
  // Lazy nonce init on first call.
}

function getContract() { return _contract; }
function getSigner() { return _signer; }
function getProvider() { return _activeProvider(); }

async function _broadcastOnce(method, args) {
  // Build the tx with our managed nonce.
  if (_nonce == null) await _refreshNonce();
  const txReq = await _contract[method].populateTransaction(...args);
  txReq.nonce = _nonce;
  txReq.chainId = _chainId;
  // Let the signer fill in gas; ethers will estimate if missing.
  console.log(`[casino-tx] sending ${method} nonce=${_nonce} args=${JSON.stringify(args.map((a) => typeof a === 'bigint' ? a.toString() : a))}`);
  const sent = await _signer.sendTransaction(txReq);
  console.log(`[casino-tx] broadcast ${method} hash=${sent.hash}`);
  _nonce += 1;
  return sent.hash;
}

async function _send(method, args) {
  // Try active provider, fall back to next on transient failures.
  let lastErr = null;
  for (let attempt = 0; attempt < _providers.length * 2 + 2; attempt++) {
    try {
      const hash = await _broadcastOnce(method, args);
      return hash;
    } catch (e) {
      const msg = (e && (e.shortMessage || e.message || '')).toLowerCase();
      lastErr = e;
      console.error(`[casino-tx] ${method} attempt ${attempt} failed: ${msg.slice(0, 200)}`);
      // Nonce-related → refresh and retry on same provider.
      if (msg.includes('nonce too low') || msg.includes('nonce has already been used') || msg.includes('replacement') || msg.includes('already known')) {
        try { await _refreshNonce(); } catch { /* ignore */ }
        continue;
      }
      // Network/RPC failure → rotate provider.
      if (msg.includes('timeout') || msg.includes('network') || msg.includes('502') || msg.includes('503') || msg.includes('econnreset') || msg.includes('connection') || msg.includes('econnrefused')) {
        try { await _rotateProvider(); } catch { /* ignore */ }
        continue;
      }
      // Insufficient funds / contract revert → bubble up immediately.
      throw e;
    }
  }
  throw lastErr || new Error('send_failed');
}

function send(method, args) {
  return new Promise((resolve, reject) => {
    _queue.push({ method, args, resolve, reject });
    _pump();
  });
}

async function _pump() {
  if (_running) return;
  _running = true;
  while (_queue.length > 0) {
    const item = _queue.shift();
    try {
      const hash = await _send(item.method, item.args);
      item.resolve(hash);
    } catch (e) {
      console.error('[casino-tx]', item.method, '->', e.shortMessage || e.message);
      item.resolve(null); // games treat null as failure but don't crash
    }
    // Tiny gap so we don't hammer the RPC. No tx.wait() here.
    await new Promise((r) => setTimeout(r, 25));
  }
  _running = false;
}

module.exports = { init, send, getContract, getSigner, getProvider };
