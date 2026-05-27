# Swap

LitDEX routes swaps through two AMM routers and picks the best output automatically:

- **LitDEX router** — the native LiteSwap V2 fork on LitVM
- **OmniFun router** — a partner router with overlapping pairs

When you punch in an amount, the dApp queries both routers' `getAmountsOut`, picks whichever pays out more, and shows the chosen path in the bottom-right of the swap card.

## How to swap

1. Open the **Swap** page from the top nav.
2. Pick a **You Pay** token.
3. Pick a **You Receive** token. The output amount is computed live as you type.
4. Set slippage (default 0.5%). Higher slippage tolerance means the swap will still go through if the price moves slightly between quote and execution.
5. Click **Swap**, sign the approve (first time per token), then sign the swap.

The success card shows the explorer link, the router used, and the exact amounts.

## Token list

The default list lives in `litdex-core-logic.ts` and includes zkLTC, USDC, USDT, WBTC, WETH, LDEX, plus several Lit-themed memecoins (LiToad, Lester, Pepe, Yuri, etc.). Custom tokens deployed through [Deploy → Token](/deploy/token) can be pasted in by address.

## Slippage and gas

- **Slippage**: 0.5% is fine for most pairs. If a pair has thin liquidity bump it to 1-3%.
- **Gas**: paid in zkLTC. Average swap costs ~0.0001 zkLTC.
- **Deadline**: every swap has a 20-minute deadline encoded into the transaction.

## Routing logic

```
quote LitDEX → out_A
quote OmniFun → out_B
chosen = max(out_A, out_B)
```

The footer of the swap card always reads `Routed via LitDEX` or `Routed via OmniFun` so you can see which AMM was used. If a pair only exists on one router the other is skipped silently.

## Slippage / "Insufficient output amount" errors

This happens when the price moves more than your slippage tolerance between the quote and the swap landing. Either:

- raise the tolerance,
- swap a smaller amount,
- or wait a few seconds for the pool to settle.

> The **Trading on LitDEX** badge under the swap title indicates which router will execute. It updates live as you change tokens.
