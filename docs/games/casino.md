# Casino Games

LitDEX has six provably-fair casino games. Every round is committed by the
server **before** you bet and revealed **after**, so you can verify any
outcome yourself - nothing is hidden, nothing can be changed retroactively.

All six share the same model:

- **Stake**: 5 PTS per round (from your **Casino Balance**, see below)
- **Daily cap**: 20 rounds per game per day (resets 00:00 IST)
- **Provably fair**: server commits `sha256(serverSeed)` as a `seedHash`
  before the round, reveals the full `serverSeed` after - verifiable in-app
- **Per-game leaderboards**: top 20 by best result, with weekly rewards

## The six games

| Game | How it works | Max win | RTP |
| --- | --- | --- | --- |
| **Lit Dice** | Pick a target 2–98, choose OVER or UNDER, roll 0.00–99.99 | up to 99× | 97% |
| **Lit Limbo** | Set a target multiplier, win if the hidden roll ≥ target | up to 100× | 99% |
| **Lit Mines** | 5×5 grid with 3 / 5 / 10 bombs, reveal safe tiles, cash out anytime | grows per tile | 97% |
| **Lit Plinko** | Drop a ball through 12 peg rows into 13 slots, LOW / MED / HIGH risk | up to 130× | - |
| **Lit Wheel** | Spin a 24-segment wheel, LOW / MED / HIGH risk | up to 20× | - |
| **Lit Coin Flip** | Heads or tails, pre-commit a streak ×1–×5 | up to 28.89× | 98%/flip |

## Casino Balance (deposit & withdraw)

Casino games spend from an off-chain **Casino Balance**, not directly from
your on-chain points. This keeps gameplay instant (no transaction wait per
round) and avoids nonce contention when many players are active at once.

1. Open the **Casino** tab in the games lobby → click **Deposit / Withdraw**.
2. **Deposit** points (multiples of 5) - this burns that many on-chain points
   and credits your Casino Balance in a single transaction.
3. Play freely - each round debits your Casino Balance instantly, no on-chain
   transaction per round.
4. **Withdraw** any time - moves your Casino Balance back to on-chain points
   in a single transaction.

**Limits**

- Deposits/withdrawals must be a **multiple of 5**.
- **Two deposits per day** maximum - think twice about how much you move in.
- Recommended: ~600 PTS covers a full daily session across all six games
  (6 games × 20 rounds × 5 PTS).

## Pre-bet commit

When you start a round, a **Provably Fair** modal pops up showing:

- **Seed Hash** - `sha256(serverSeed)`, committed before you bet
- **Round ID** (Dice/Limbo/Mines) or **Client Seed** (Plinko/Wheel/Coin Flip)

Copy these before playing. After the round, the server reveals the
`serverSeed`, and you can confirm `sha256(serverSeed)` equals the hash you saw.

## After the round

The end-of-round panel has a **Verify Fairness** button. It opens the
in-game verifier pre-filled with that round's seed hash and revealed server
seed - one click confirms the result was pre-determined and fair.

You can also verify **any past round** (yours or anyone's) from the
**Provably Fair** tab in the games lobby. See [Provably Fair](./provably-fair).

## Weekly rewards

Each casino game runs a top-20 leaderboard. Every Sunday at 23:59 IST the
top 20 receive rewards from a dedicated rewards wallet:

| Rank | Reward |
| --- | --- |
| 1 | 1 zkLTC + 10,000 LDEX + 2,500 PTS |
| 2 | 10,000 LDEX + 1,000 PTS |
| 3 | 5,000 LDEX + 500 PTS |
| 4–10 | 3,000 LDEX + 300 PTS |
| 11–20 | 1,000 LDEX + 100 PTS |

See [Leaderboard & Rewards](../points/leaderboard) for the full schedule.
