# Leaderboards & Weekly Rewards

Every game on LitDEX has its **own** top-20 leaderboard, and each one pays out
weekly. Rewards are distributed every **Sunday 23:59 IST** from a dedicated,
pre-funded rewards wallet - separate from the operational wallet, so payouts
never interfere with day-to-day gas.

## Reward tiers (per game, top 20)

| Rank | Reward |
| --- | --- |
| 1 | **1 zkLTC + 10,000 LDEX + 2,500 PTS** |
| 2 | 10,000 LDEX + 1,000 PTS |
| 3 | 5,000 LDEX + 500 PTS |
| 4–10 | 3,000 LDEX + 300 PTS |
| 11–20 | 1,000 LDEX + 100 PTS |

Each of the 12 games (6 skill arcades + 6 provably-fair casino) runs this same
tier table independently. zkLTC and LDEX are real on-chain tokens; PTS land in
your on-chain points balance.

## How each game ranks

| Game | Ranked by |
| --- | --- |
| Math Slash | Total score |
| Pump or Dump | Best pot |
| Lit Tower | Best height |
| ZK Miner | Best score |
| Lit Launch | Best coins |
| Block Chain | Best milestone tile |
| Lit Dice / Limbo / Mines / Plinko / Wheel | Best multiplier |
| Lit Coin Flip | Best streak |

The wallets you see on a game's in-app leaderboard are exactly the wallets that
get paid - the payout reads the same data the UI shows.

## Schedule

- **Snapshot + distribution**: every **Sunday 23:59 IST**.
- **Math Slash**: ongoing game - rewards run weekly already.
- **The 11 newer games**: first payout the first full week after launch.

Distribution is **idempotent** per week - a wallet is never paid twice for the
same week even if the job re-runs. If the rewards wallet ever runs low it skips
and logs a warning rather than failing, so a top-up + re-run is always safe.

## Where to see it

- Each game page shows its leaderboard on the right (top 20) with the reward
  tier table beneath it.
- The bottom stats bar on every game shows **Total Games · Unique Players ·
  Total Points Distributed**.

## Tips to climb

- **Casino games** rank on your best single result, so one big multiplier can
  jump you up the board.
- **Skill games** (Tower, Miner, Launch, Block Chain) rank on your best run -
  keep pushing your personal best.
- **Math Slash** ranks on cumulative score - consistency over the week wins.

## Anti-cheat

Points are validated against an idempotent `questId`, bot patterns are filtered
server-side for the skill games (score velocity, minimum duration, blacklist),
and casino outcomes are provably fair (see [Provably Fair](../games/provably-fair)).
