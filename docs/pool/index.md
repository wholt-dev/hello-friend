# Pools Overview

LitDEX uses a Uniswap V2-style AMM. Liquidity providers (LPs) deposit two tokens at a fixed ratio and receive LP tokens that represent their share. Every swap on a pool pays a 0.3% fee back to LP holders proportional to their share.

## Earn fees on idle tokens

Anyone with two tokens can become an LP — there is no whitelist, no cooldown, no minimum size.

- 0.3% fee per swap → distributed to LPs as additional liquidity
- Withdraw any time
- LP positions show up in the **Pool** page after you reload

## Quick checklist

| Action | Doc |
| --- | --- |
| Add liquidity | [/pool/add](./add) |
| Remove liquidity | [/pool/remove](./remove) |
| See current positions | Pool page → "My Positions" tab |

## Common pairs on LiteForge

- zkLTC / USDC
- zkLTC / WBTC
- zkLTC / LDEX
- LDEX / USDC

These are the deepest pools so quotes have minimal slippage. Less liquid memecoins benefit most from new LP capital.

## Risks

LPing is not free yield — there is **impermanent loss**. If one of the paired tokens moves much more than the other you would have been better off just holding. Standard AMM trade-off; the 0.3% fee accrues over time and offsets it on heavily traded pools.

> Always test small first. The dApp lets you preview the LP token amount and the share of the pool before signing.
