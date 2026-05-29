# Games

LitDEX hosts skill-based mini-games that mint points and zkLTC. Today there's one game live; more roll in over time.

## Live games

| Game | Status | How to earn |
| --- | --- | --- |
| [Math Slash](./math-slash) | Currently paused (will restart with X post) | Score-based points + manual claim |
| Lit Tower | Live | +1 PT per correct stack (free, 5 games/day, cap 100) |
| ZK Miner | Live | Match-3 — 3-match=+0.3 PT, 4-match=+0.4 PT, 5+stacks (free, 5 games/day, 30 moves) |
| Lit Launch | Live | Dodge asteroids · catch coins · +1 PT per coin (free, 5 games/day, 3 lives, cap 50) |
| Block Chain | Live | 2048 — milestone tiles 64=+5, 128=+10, 256=+20, 512=+40, 1024=+80, 2048=+160 (free, 5 games/day) |
| Lit Dice | Live (Casino) | Pick target 2-98 over/under · 5 PTS stake · up to 99x · 97% RTP |
| Lit Limbo | Live (Casino) | Set target multiplier · win if RNG ≥ target · 5 PTS stake · up to 100x · 99% RTP |
| Lit Mines | Live (Casino) | 5×5 grid · 3/5/10 bombs · 5 PTS stake · cash out anytime · 97% RTP |
| Lit Plinko | Live (Casino) | 12-row peg drop · 13 slots · LOW/MED/HIGH risk · up to 130x |
| Lit Wheel | Live (Casino) | 24-segment wheel · LOW/MED/HIGH risk · up to 20x |
| Lit Coin Flip | Live (Casino) | Heads/tails · streak ×1-×5 · up to 28.89x · 98% per-flip RTP |
| Pump or Dump | Live | Pot streak game · 10 PTS entry · cash out anytime |

## Coming soon

- **Coin Catch** — catch falling coins, dodge bombs. Already wired in `litdex-core-logic.ts` (`startCoinCatch`, `endCoinCatch`) but not yet enabled.
- More arcade-style games as community demand grows.

## How games credit points

Each game logs your score to a per-wallet table. When you click **Claim N pts**:

- The backend sums all unclaimed scores
- Computes `floor(totalScore × 0.3)` as the points reward
- Calls `PointsSystem.recordQuestFor(wallet, pts, questId)` once
- Marks the rows as claimed by stamping their `tx_hash`

Idempotency is guaranteed by the questId encoding the date + wallet suffix.

## Daily caps

| Game | Cap |
| --- | --- |
| Math Slash | 5 games / day |
| Lit Tower | 5 games / day (cap 100 stacks/game) |
| ZK Miner | 5 games / day (30 moves, cap 50 PTS/game) |
| Lit Launch | 5 games / day (3 lives, cap 50 coins/game) |
| Block Chain | 5 games / day (cap 315 PTS = all 6 milestones) |
| Lit Dice / Limbo / Mines / Plinko / Wheel / Coin Flip | 20 rounds / day each (Casino tab, 5 PTS stake, provably fair) |
| Pump or Dump | 15 games / day |
| Coin Catch | TBD |

The cap is a soft block — past it, the start button shows "DAILY LIMIT REACHED" and the game won't start. Resets at 00:00 IST.

## Anti-bot

Games run client-side but score submission is server-validated:

- Score velocity checks (e.g. > 600 in 60s = ban).
- Minimum duration (< 20s = reject).
- Blacklist for repeat offenders.

If you're a legit fast player flagged by accident, [ping us](https://t.me/litdex_discussion) for unban.

> Math Slash's points convert to zkLTC at a fixed rate. Currently the conversion is **paused** while we re-tune the system; points still accrue and will convert later.
