// LitDex inline verifier — pure JS SHA-256 + HMAC + per-game replay.
// Used by all 6 casino HTMLs as well as /games/verify.html.
//
// Usage in a game HTML:
//   <script src="/games/verify-inline.js"></script>
//   const v = LitDexVerify;
//   v.diceRoll(serverSeed, roundId)
//   v.minesBombs(serverSeed, roundId, bombs)
//   ...
window.LitDexVerify = (function () {
  function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  function sha256bytes(bytes) {
    const lenBits = bytes.length * 8;
    const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
    padded.set(bytes); padded[bytes.length] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, Math.floor(lenBits / 0x100000000));
    dv.setUint32(padded.length - 4, lenBits >>> 0);
    let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,
        h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
    const w = new Uint32Array(64);
    for (let i = 0; i < padded.length; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(7, w[t-15]) ^ rotr(18, w[t-15]) ^ (w[t-15] >>> 3);
        const s1 = rotr(17, w[t-2]) ^ rotr(19, w[t-2]) ^ (w[t-2] >>> 10);
        w[t] = (w[t-16] + s0 + w[t-7] + s1) >>> 0;
      }
      let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,hh=h7;
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(6,e) ^ rotr(11,e) ^ rotr(25,e);
        const ch = (e & f) ^ (~e & g);
        const T1 = (hh + S1 + ch + K[t] + w[t]) >>> 0;
        const S0 = rotr(2,a) ^ rotr(13,a) ^ rotr(22,a);
        const mj = (a & b) ^ (a & c) ^ (b & c);
        const T2 = (S0 + mj) >>> 0;
        hh=g; g=f; f=e; e=(d+T1)>>>0; d=c; c=b; b=a; a=(T1+T2)>>>0;
      }
      h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
      h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+hh)>>>0;
    }
    const out = new Uint8Array(32);
    const oDv = new DataView(out.buffer);
    oDv.setUint32(0,h0); oDv.setUint32(4,h1); oDv.setUint32(8,h2); oDv.setUint32(12,h3);
    oDv.setUint32(16,h4); oDv.setUint32(20,h5); oDv.setUint32(24,h6); oDv.setUint32(28,h7);
    return out;
  }
  function hmac(keyStr, msgStr) {
    const enc = new TextEncoder();
    let key = enc.encode(keyStr);
    if (key.length > 64) key = sha256bytes(key);
    const padded = new Uint8Array(64); padded.set(key);
    const oKey = new Uint8Array(64), iKey = new Uint8Array(64);
    for (let i = 0; i < 64; i++) { oKey[i] = padded[i] ^ 0x5c; iKey[i] = padded[i] ^ 0x36; }
    const msg = enc.encode(msgStr);
    const inner = new Uint8Array(iKey.length + msg.length);
    inner.set(iKey, 0); inner.set(msg, iKey.length);
    const innerHash = sha256bytes(inner);
    const outer = new Uint8Array(oKey.length + innerHash.length);
    outer.set(oKey, 0); outer.set(innerHash, oKey.length);
    return sha256bytes(outer);
  }
  function toHex(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
    return s;
  }
  function sha256str(s) { return toHex(sha256bytes(new TextEncoder().encode(s))); }

  // Plinko / Wheel multiplier tables (mirror server).
  const PLINKO = {
    low:    [9.0, 3.0, 1.4, 1.1, 1.0, 0.9, 0.8, 0.9, 1.0, 1.1, 1.4, 3.0, 9.0],
    medium: [28,  8,   3,   1.6, 1.2, 0.7, 0.3, 0.7, 1.2, 1.6, 3,   8,   28],
    high:   [130, 30,  6,   2,   0.8, 0.3, 0.1, 0.3, 0.8, 2,   6,   30,  130],
  };
  const WHEEL = {
    low:    [1.5,1.2,1.0,1.5,1.2,1.0,2.0,1.2,1.0,1.5,1.2,1.0,2.0,1.2,1.0,1.5,1.2,1.0,1.5,1.2,1.0,2.0,1.2,1.0],
    medium: [2.0,1.5,0,2.0,1.5,0,3.0,1.5,0,5.0,1.5,0,3.0,1.5,0,2.0,1.5,0,2.0,1.5,0,5.0,1.5,0],
    high:   [0,0,2.0,0,0,5.0,0,0,0,10,0,0,2.0,0,0,5.0,0,0,0,20,0,0,2.0,0],
  };
  function comb(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    k = Math.min(k, n - k);
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
  }
  function minesMultiplier(safeRevealed, bombs) {
    if (safeRevealed <= 0) return 1;
    const safe = 25 - bombs;
    if (safeRevealed > safe) return 0;
    return (comb(25, safeRevealed) / comb(safe, safeRevealed)) * 0.97;
  }

  // ── Per-game replay ────────────────────────────────────────
  function diceRoll(seed, roundId) {
    const u = parseInt(toHex(hmac(seed, roundId)).slice(0, 8), 16) >>> 0;
    return (u % 10000) / 100;
  }
  function limboRoll(seed, roundId) {
    const u = (parseInt(toHex(hmac(seed, roundId)).slice(0, 8), 16) >>> 0) / 0x100000000;
    return Math.min(1000, Math.max(1.0, (99 / 100) / Math.max(u, 1e-7)));
  }
  function minesBombs(seed, roundId, bombs) {
    const cells = [];
    for (let i = 0; i < 25; i++) cells.push(i);
    for (let i = 24; i > 0; i--) {
      const r = (parseInt(toHex(hmac(seed, `${roundId}:${i}`)).slice(0, 8), 16) >>> 0) % (i + 1);
      const t = cells[i]; cells[i] = cells[r]; cells[r] = t;
    }
    return cells.slice(0, bombs).sort((a, b) => a - b);
  }
  function plinkoOutcome(seed, clientSeed, risk) {
    const u = parseInt(toHex(hmac(seed, `${clientSeed}:${risk}`)).slice(0, 8), 16) >>> 0;
    const bits = u & 0xfff;
    let rights = 0;
    const path = [];
    for (let i = 0; i < 12; i++) {
      const right = ((bits >> i) & 1) === 1;
      path.push(right ? 1 : -1);
      if (right) rights++;
    }
    return { slot: rights, path, pathBits: bits };
  }
  function wheelSegment(seed, clientSeed, risk) {
    const u = parseInt(toHex(hmac(seed, `${clientSeed}:${risk}`)).slice(0, 8), 16) >>> 0;
    return u % 24;
  }
  function coinflipFlips(seed, clientSeed, side, streak) {
    const flips = [];
    for (let i = 0; i < streak; i++) {
      const b = parseInt(toHex(hmac(seed, `${clientSeed}:${side}:${streak}:${i}`)).slice(0, 2), 16) & 1;
      flips.push(b ? 'tails' : 'heads');
    }
    return flips;
  }

  return {
    sha256str, toHex, hmac,
    PLINKO, WHEEL, minesMultiplier,
    diceRoll, limboRoll, minesBombs,
    plinkoOutcome, wheelSegment, coinflipFlips,
  };
})();
