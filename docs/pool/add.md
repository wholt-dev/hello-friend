# Add Liquidity

Add two tokens to a pool to start earning fees.

## How to add

1. Open the **Pool** page, switch to the **Add** sub-tab.
2. Pick **Token A** and **Token B**.
3. Type any amount in either field — the other side auto-fills based on the current pool ratio. New pools (no existing reserves) let you set the initial ratio yourself.
4. Click **Approve A**, sign. Then **Approve B**, sign. Then **Add Liquidity**, sign.
5. The success card shows your new LP token balance and the current pool share.

## Initial vs subsequent

- **Initial deposit (new pool)**: you set the price by choosing the ratio. The first depositor gets the entire LP supply minted minus a tiny minimum-liquidity lockup (1e-15) per Uniswap V2 design.
- **Subsequent deposit**: the ratio is enforced by the existing pool. If you type 100 of A, the dApp computes the exact B you need.

## After depositing

Your LP tokens appear in the **My Positions** tab. They:

- accrue fees automatically (LP token value grows over time),
- can be removed any time (no lockup),
- can be transferred like any ERC-20.

## Impermanent loss reminder

If one side of the pair pumps or dumps significantly, the AMM rebalances by selling the rising token and buying the falling one. Your LP tokens come back unbalanced relative to a "just hold" strategy. The 0.3% fee accrual offsets this on active pools.

> A safe starter pair: zkLTC / USDC. Both move closely on testnet so impermanent loss is minimal and trading is constant.
