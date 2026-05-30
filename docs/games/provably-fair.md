# Provably Fair

Every LitDEX casino game uses a **commit–reveal** scheme so you never have to
trust the house. The outcome of a round is locked in **before** you bet and
proven **after** you play. You can verify any round - yours or anyone else's
- directly in the app, with no server connection required.

## How commit–reveal works

1. **Commit (before your bet).** The server generates a random `serverSeed`,
   computes `seedHash = sha256(serverSeed)`, and shows you the `seedHash`. The
   outcome is now fixed - the server cannot change it without changing the
   seed, which would break the hash.
2. **You bet.** You place your stake knowing only the hash, not the seed.
3. **Reveal (after your bet).** The server reveals the full `serverSeed`. You
   verify `sha256(serverSeed) === seedHash`. If it matches, the server did not
   cheat. The same seed deterministically produces your exact result.

Because the hash is shown before the bet and the seed after, the server can
neither pick a losing outcome for you after seeing your bet, nor deny a win.

## Verifying in the app

There are two ways to verify, both in-page (no new tab, no external site):

**1. Right after a round** - the end panel has a **Verify Fairness** button.
It opens the verifier pre-filled with that round's `seedHash` and revealed
`serverSeed`. Click **Verify** and you'll see the reconstructed result with a
😄 (you won) or 😢 (you lost) and a ✓ hash-verified badge.

**2. Any past round** - open the **Provably Fair** tab in the games lobby.
Pick the game, paste the two values you saved (Seed Hash + Server Seed, plus
Round ID or Client Seed depending on the game), and click **Verify**. Works
for any round ever played, from any wallet.

## The exact algorithms

All games derive their result from `HMAC-SHA256(serverSeed, message)`. The
verifier (`/games/verify-inline.js`) is pure JavaScript - no library, no
network - so anyone can re-implement or audit it.

### Lit Dice
```
u = first 8 hex of HMAC(serverSeed, roundId) → uint32
roll = (u mod 10000) / 100        # 0.00 – 99.99
win  = (UNDER and roll < target) or (OVER and roll > target)
```

### Lit Limbo
```
u = first 32 bits of HMAC(serverSeed, roundId) / 2^32   # 0..1
rolled = clamp(0.99 / max(u, 1e-7), 1.0, 1000.0)
win = rolled >= target
```

### Lit Mines
```
Fisher-Yates shuffle of cells [0..24] using
  HMAC(serverSeed, roundId + ":" + i) mod (i+1)
first N shuffled cells = bomb positions (N = 3, 5 or 10)
```

### Lit Plinko
```
u    = first 8 hex of HMAC(serverSeed, clientSeed + ":" + risk) → uint32
bits = u & 0xFFF                       # 12 path bits
slot = count of 1-bits                 # 0..12
multiplier = PLINKO[risk][slot]
```

### Lit Wheel
```
u   = first 8 hex of HMAC(serverSeed, clientSeed + ":" + risk) → uint32
seg = u mod 24
multiplier = WHEEL[risk][seg]
```

### Lit Coin Flip
```
for each flip i in 0..streak-1:
  b = first byte of HMAC(serverSeed, clientSeed + ":" + side + ":" + streak + ":" + i) & 1
  flip = b == 0 ? heads : tails
win = every flip == your chosen side
```

## What to save

To verify a round later, keep:

- **Seed Hash** - shown in the pre-bet commit modal
- **Server Seed** - revealed in the end-of-round panel
- **Round ID** (Dice / Limbo / Mines) **or** **Client Seed** (Plinko / Wheel /
  Coin Flip) - both are shown in the commit modal
- For Mines: the **bomb count**; for Plinko/Wheel: the **risk**; for Coin
  Flip: your **side** and **streak**

Paste them into the **Provably Fair** tab any time to reconstruct the exact
outcome.

## Why this matters

- The server **cannot** see your bet before fixing the outcome.
- The server **cannot** alter a result after the fact - the hash would break.
- You **don't need to trust** LitDEX - the math is verifiable client-side.
- Anyone can audit any round, building public confidence in the games.
