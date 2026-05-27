# Daily Caps

Daily caps prevent farming and force diverse activity. Every action that earns points has its own cap.

## Cap table

| Source | Per-action | Daily cap (pts) | Equivalent volume |
| --- | --- | --- | --- |
| Daily check-in | +10 | 10 | 1 check-in/day |
| Token deploy | +5 | 100 | 20 deploys/day |
| On-chain message | +2 | 20 | 10 messages/day |
| Math Slash | up to +10 | ~50 | 5 games/day |
| Faucet claim | +10 | 10 | 1 claim/24h |
| `.lit` register | varies | — | one-shot per name |
| Quest (X follow / TG / etc.) | varies | — | one-shot per quest |

## How resets work

All daily caps reset at **00:00 IST** every night. The reset is on-chain — the contract divides `block.timestamp` by 86400 (one day in seconds, IST-shifted) and compares to `lastResetDay`. If they differ, the daily counter zeroes before the new credit lands.

The dashboard shows a live countdown:

```
RESET PROTOCOL ACTIVE IN 22:35:36
```

Once it hits 00:00, all `*Daily` fields go back to 0 and you can earn again.

## What happens past the cap

- **Action still goes through** (the on-chain tx confirms).
- **Points credit fails silently** — no error, just 0 pts added.
- The dApp shows **"DAILY CAP REACHED"** popups for messages and deploys when you hit the cap mid-action.

## Why caps?

Without caps:

- bots could spam-deploy tokens for 5 pts each ad infinitum,
- an automation could send 10,000 messages overnight,
- the leaderboard would be dominated by farms.

The caps force activity diversity — to climb the leaderboard you must engage with multiple parts of the dApp, which is the desired user behavior.

> If you hit caps quickly, focus on **one-shot rewards** (quests, `.lit` registrations) and **NFT yield claims** — those are not capped.
