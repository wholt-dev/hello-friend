# Deploy Staking

Launch a staking contract that distributes a reward token to anyone who locks your token.

## Form fields

| Field | Notes |
| --- | --- |
| Stake token | Address of the token users lock (usually your project token) |
| Reward token | Address of the token you pay out (often the same, or zkLTC, or USDC) |
| Reward rate (per year) | Total tokens distributed across all stakers per year |
| Lock period | Optional — minimum seconds before unstake is allowed |

The factory computes a per-second rate from the per-year input so the math stays clean on-chain.

## How users interact

After deploy, users can:

1. **Approve** the stake token to your staking contract.
2. **Stake** any amount.
3. **Claim** rewards anytime — they accrue continuously per second.
4. **Unstake** after the lock period.

The contract emits events on every stake/claim/unstake, so analytics and frontends can index activity easily.

## Funding the contract

You need to fund the staking contract with reward tokens **before** users start claiming. Otherwise claims revert with "insufficient reward balance".

```bash
# Example: send 1M reward tokens to the staking contract
ERC20(rewardToken).transfer(stakingContract, 1_000_000e18);
```

## After deploy

- **Verify on the explorer**: paste the contract address into the LiteForge explorer to see source.
- **Top up rewards**: send more reward tokens to the contract any time.
- **Pause/unpause**: not built into this minimal factory — for advanced needs deploy through a custom factory.

> Always test the full flow on a small scale (10 stake tokens, 100 reward tokens, 1 hour) before opening to your community.
