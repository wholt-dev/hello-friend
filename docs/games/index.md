# Games

LitDEX hosts skill-based mini-games that mint points and zkLTC. Today there's one game live; more roll in over time.

## Live games

| Game | Status | How to earn |
| --- | --- | --- |
| [Math Slash](./math-slash) | Currently paused (will restart with X post) | Score-based points + manual claim |
| Lit Tower | Live | +1 PT per correct stack (free, 5 games/day, cap 100) |
| ZK Miner | Live | +1 PT per rig charge (free, 5 games/day, 30 moves, cap 10) |
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
| ZK Miner | 5 games / day (30 moves, cap 10 charges/game) |
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
