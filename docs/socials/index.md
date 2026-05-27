# Socials & Quests

The Socials page is a quest board for off-chain actions — follow X accounts, like-and-RT posts, join Telegram channels. Each completion pays out points one-shot (no daily cap).

## Available quests

### Follows

| Quest | Points |
| --- | --- |
| Follow [@LitDeXApp](https://x.com/LitDeXApp) | +100 |
| Follow [@LitecoinVM](https://x.com/LitecoinVM) | +100 |
| Follow [@cryptobhartiyax](https://x.com/cryptobhartiyax) | +50 |

### Like & RT

8 posts on @LitDeXApp pay **+10 pts each**. Click each link, like + retweet, then mark complete in the quest UI.

### Telegram

| Quest | Points |
| --- | --- |
| Join [LitDEX Group](https://t.me/litdex_discussion) | +50 |
| Join [LitDEX Channel](https://t.me/litdex_app) | +50 |

### Bigger one-shot quests

The page also lists higher-value quests that need verification:

- **Explain LitDEX on X**: write a thread explaining LitDEX, post it. Pays **+500 pts and 0.1 zkLTC**. Requires manual review.
- **Record & Explain LitDEX**: post a video or detailed thread on X/YouTube with min 1,000 views. Pays bigger rewards.

For these, paste the post URL in the quest's **Submit** field and the team verifies before crediting.

## How quests credit

Most quests use a one-time `recordQuestFor(user, pts, questId)` call. The contract's `isQuestDone` mapping prevents double-claims — once you've claimed a quest, hitting it again credits 0 points.

## Verification

- **X follows / TG joins**: backend checks via the platform API. May take a few minutes.
- **Like & RT**: requires the quest backend to verify your X account is connected.
- **Big quests**: manual team review.

If your quest doesn't credit within an hour, ping us in [Telegram](https://t.me/litdex_discussion) with your wallet address and the quest ID.

## Why do socials exist?

- **Reach**: every social action expands LitDEX's user base.
- **Reward**: points compensate users for off-platform engagement.
- **Onboarding**: new users find LitDEX through your shares.

> Hit every one-shot quest in your first week — that's roughly **+800 pts** all-time, enough for a LitShard with change to spare.
