# Mint & Claim

The two operations on the NFTs page.

## Mint

1. Open **NFTs**.
2. Pick a tier you can afford.
3. Click **Mint LitShard** (or LitCore / LitGod).
4. Sign. The contract:
   - deducts the points cost from your `PointsSystem` total,
   - mints one NFT to your wallet,
   - emits a `Mint` event.

The new NFT appears in **Your NFTs** instantly.

### Mint failures

| Cause | What it means |
| --- | --- |
| `Insufficient points` | Your `total` points are below the tier cost. Earn more before retrying. |
| `Max supply reached` | The tier is sold out. Try a different tier. |
| `User rejected` | You declined the wallet popup. |

## Claim

1. Open **NFTs**.
2. Scroll to **Your NFTs**.
3. Click **Claim All** or per-tier **Claim**.
4. Sign. The contract pays the accumulated zkLTC + USDC + LDEX since your last claim per held NFT.

The success card lists each token + amount.

### Claim cooldown

Claim is once per day per tier. The contract tracks `lastClaimDay`:

```solidity
uint256 today = block.timestamp / 86400;
require(today > lastClaimDay[user][tier], "Already claimed today");
```

If you try to claim again on the same day the tx reverts. Skipping days is fine — the next claim pays for all skipped days at once.

### Multi-tier claim

If you hold multiple tiers, you can call **Claim All** which loops through and claims each in one tx. Saves gas vs three separate claims.

## Pending rewards display

The card shows "Pending: X zkLTC + Y USDC + Z LDEX" computed live from `getPendingRewards(user)`. This number grows every block until you claim.

> Claim every 1–2 days to keep gas overhead low. Claiming every block is wasteful.
