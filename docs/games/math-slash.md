# Math Slash

A 3D arcade game where you slash equations. Score correctly to earn points; correctness streaks pay bonus zkLTC.

## How to play

1. Open **Games → Math Slash**.
2. Click **Start Game** (allow fullscreen / orientation lock for the best experience).
3. Equations fly toward you. Slash the **correct** one with your cursor / finger to score.
4. Wrong slashes break your combo and dock points.
5. Game ends after a set duration. Score auto-submits to the backend.

## Rewards

- **Points**: up to **+10 pts** per game based on score percentile.
- **zkLTC**: previously auto-credited per game; currently **manual claim** via `/simple/claim-points`. The button shows "Claim N pts" once you've finished any games.
- **Daily limit**: 5 games / day. The 6th game shows "DAILY LIMIT REACHED".

## How scoring works

```
points = floor(totalScore × 0.3)
```

So a 1,000-point round = 300 pts credited (capped at 10 pts per session, but the leaderboard tracks total score).

Score rules:

- Correct slash: + (current combo × multiplier)
- Wrong slash: -50 + combo reset
- Combo decays after 1.5 seconds of no slash

## Bot prevention

The backend filters obvious bots:

- score > 600 in < 60s → ban
- < 20s game duration → reject
- known bad-actor wallets blacklisted

If you legitimately play very fast and get flagged, ping us in [Telegram](https://t.me/litdex_discussion) — bans can be appealed.

## Manual claim flow

Currently the game is in "points-only" mode — zkLTC conversion is paused but points still credit. Flow:

1. Play games (each game's score logs to `game_rewards`).
2. Click **Claim N pts** button on the games page.
3. Sign once — `claim-points` endpoint reads all unclaimed scores, sums them, calls `recordQuestFor` for the total, and marks them claimed.

So you can play 5 games then claim all at once. The on-chain points balance updates immediately.

## Game status

The game is currently **stopped** for maintenance (announced via X). When restarted with the relaunch X post, this section will update.

> Pro tip: high combos compound fast. Focus on accuracy over speed in the first 30 seconds to build a 50+ combo, then keep it alive.
