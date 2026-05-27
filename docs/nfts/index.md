# NFTs

LitDEX has a 3-tier Genesis NFT collection. Each tier costs points to mint and pays a daily yield in zkLTC, USDC, and LDEX as long as you hold it.

## Why hold?

- **Daily passive yield** in three tokens.
- **Faucet eligibility** — holding any LitDEX NFT is half of the faucet's eligibility check.
- **Status** — the NFT shows on your profile and global feed posts.
- **Future utility** — leaderboard multipliers, governance weight, and exclusive drops are planned.

## The tiers

| Tier | Cost | Max supply | Daily reward |
| --- | --- | --- | --- |
| LitShard (Common) | 1,000 pts | 9,999 | 0.0001 zkLTC + 10 USDC + 2 LDEX |
| LitCore (Rare) | 5,000 pts | 4,999 | 0.0005 zkLTC + 50 USDC + 10 LDEX |
| LitGod (Legendary) | 25,000 pts | 999 | 0.005 zkLTC + 500 USDC + 100 LDEX |

LitGod is intentionally scarce — only ~1,000 will ever exist.

## How to mint

1. Save up the points cost on the [Points page](/points/).
2. Open the **NFTs** page.
3. Click **Mint** under the tier you can afford.
4. Sign the transaction. The NFT lands in your wallet, points are deducted.

## How to claim daily yield

Once you own an NFT:

1. Open the **NFTs** page.
2. Click **Claim Daily Rewards** (or per-tier claim if you hold multiple tiers).
3. Sign. The yield since your last claim transfers to your wallet.

The contract tracks `lastClaimDay` per (user, nftType). You can claim once per day per tier. Skipping days is fine — the yield does not compound, it just lands as a single payout for whatever days have passed since your last claim.

## Multiple of the same tier

If you mint 3 LitShards, your daily yield is 3× the LitShard rate. The dApp reads `getUserNFTs(address)` and sums.

## See your NFTs

The NFTs page → **Your NFTs** section shows every NFT you own grouped by tier with the next claim time and the pending reward.

> The fastest path to faucet eligibility is mint **one LitShard (1,000 pts)**. That gates the faucet plus starts daily yield.
