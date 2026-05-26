// ── Behavioural bot filter (frontend sends `proof` payload) ──────────
// Drop this BEFORE the line "// POST /simple/start" inside
// /root/litvm-dex/game-server/mathslash_simple.js. Provides the
// `validateProof()` helper plus per-wallet/IP strike tracking.

const _walletStrikes = new Map();
const _ipStrikes = new Map();
const STRIKE_BLOCK_MS = 24 * 60 * 60 * 1000;

function _bumpStrike(map, key) {
  const cur = map.get(key) || { strikes: 0, blockedUntil: 0 };
  cur.strikes += 1;
  if (cur.strikes >= 3) cur.blockedUntil = Date.now() + STRIKE_BLOCK_MS;
  map.set(key, cur);
}

function _isBlocked(map, key) {
  const cur = map.get(key);
  return cur ? cur.blockedUntil > Date.now() : false;
}

function validateProof(proof, score) {
  if (!proof || typeof proof !== "object") {
    return { ok: false, reason: "missing_proof", suspicion: 100 };
  }
  let s = 0;
  const f = proof.flags || {};
  if (f.noMouseMove) s += 35;
  if (f.zeroJitter) s += 20;
  if (f.impossiblyFast) s += 40;
  if (f.idleSession) s += 25;
  if (Number(proof.questionsAnswered) < Number(score) - 5) s += 25;
  const sec = Math.max(1, Math.floor((proof.sessionMs || 0) / 1000));
  const qps = (Number(proof.questionsAnswered) || 0) / sec;
  if (qps > 3.0) s += 30;
  if (qps > 5.0) s += 30;
  if ((proof.pointerJitter || 0) < 200 && sec > 10) s += 10;
  s = Math.min(100, s);
  if (s >= 80) return { ok: false, reason: "bot_signals", suspicion: s };
  return { ok: true, suspicion: s };
}
