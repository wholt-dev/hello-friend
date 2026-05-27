# Leaderboard

A weekly leaderboard ranks the top 20 wallets by points earned in the past 7 days. Top placements pay out zkLTC every Sunday midnight IST.

## Rewards

| Rank | Bonus |
| --- | --- |
| 1 | +5,000 pts |
| 2 | +2,500 pts |
| 3 | +1,500 pts |
| 4–10 | +500 pts |
| 11–20 | +200 pts |

The bonuses land directly in your `total` points balance after the weekly snapshot.

## How ranking is calculated

Each wallet's weekly score = sum of all points earned between **Sunday 00:00 IST** and the next **Saturday 23:59 IST**.

The leaderboard ignores `total` (lifetime) — only the rolling weekly score matters. Long-time users do not get a head start over fresh wallets.

## Where to see it

- **Hub → Leaderboard** tab (or the **Socials** page).
- The dashboard shows your current rank if you're in the top 100.
- Each row has the `.lit` name (or short address) and weekly score.

## Tips to climb

- **Stack daily caps**: 150+ pts/day floor (check-in + deploys + messages + games + faucet).
- **Hit one-shot quests**: 100 pts each for X follows, 50 pts each for TG joins.
- **Run Math Slash to its 5-game daily limit** — fast +10 to +50 over the week.
- **Register more `.lit` names** — Forever names give +100 each (no daily cap).

## Anti-cheat

The contract validates points against the questId (idempotent), bot patterns are filtered server-side for games, and the relayer wallet refuses bursts above plausible human limits.

> Top 3 weekly is competitive — even a 200 pts/day average can land you in 4–10 territory which is +500 / week. Compounds fast.
