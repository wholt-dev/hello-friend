# Daily Check-in

Free 10 points every day, plus streak bonuses.

## How to check in

1. Open the **Points** page.
2. Click the **Daily Check-in** card (top right of the dashboard).
3. Sign the transaction — `DailyCheckin.checkin()`.

You earn:

- **+10 points** every day.
- **+LDEX** based on streak: longer streaks pay more.
- **+0.001–0.05 zkLTC** as a streak bonus on day 1 of a new month, every 7th day, and other milestones.

## Streak rules

A streak is broken if you skip a day. The contract tracks `lastCheckinDay` and `streakCount` per wallet:

- check in today → streak +1
- skip a day → streak resets to 1 on next check-in

The Check-in card shows your current streak prominently. The longer you go, the bigger the LDEX payout.

## Bonus tiers

| Day of week (IST) | zkLTC bonus |
| --- | --- |
| Day 1 of any week (Monday IST) | 0.001 zkLTC |
| Day 8, 15, 22, 29 (every 7th day) | 0.05 / 0.01 / 0.01 zkLTC |

The exact payout is computed inside the contract and shown in the success card.

## Why check in daily?

- It is the highest points-per-second action in the dApp (10 pts for 1 click).
- LDEX accumulates passively.
- Streak bonuses compound — long-term users dominate the leaderboard.
- Day 1 of a new streak gets the zkLTC kicker.

> Set a phone reminder for 23:55 IST so you never break a streak. The reset window is precise — checking in at 00:01 IST gets you the new day's bonus.
