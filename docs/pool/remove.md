# Remove Liquidity

Withdraw your LP position whenever you want — no lockup.

## How to remove

1. Open the **Pool** page, switch to the **Remove** sub-tab.
2. Pick the position you want to exit from the dropdown.
3. Use the **25% / 50% / 75% / 100%** quick buttons or type a custom percentage.
4. Click **Approve LP**, sign. Then **Remove**, sign.

The success card prints how much of each token came back.

## What you receive

You get back **both** tokens of the pair, plus your share of accrued fees. Concrete example:

| At deposit | At removal |
| --- | --- |
| 100 zkLTC + 100 USDC | 95 zkLTC + 105 USDC + accrued fees |

The exact split depends on how the pool moved while you were in. The dApp shows the live preview before you sign.

## Removing 100%

If you want a clean exit, hit **100%** and remove. Your LP position is burned and the underlying tokens land in your wallet. The position disappears from "My Positions".

## Slippage on removal

Like swaps, the remove tx has a slippage check — protects against sandwich bots. Default 0.5% is fine. Bump it for thin pools.

> If the remove fails with "INSUFFICIENT_TOKEN_AMOUNT", raise slippage by 1% and retry. The pool ratio likely shifted between preview and tx.
