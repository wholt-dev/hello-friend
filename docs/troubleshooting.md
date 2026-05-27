# Troubleshooting

## "Switch to LiteForge" banner won't go away

Your wallet is on the wrong chain. Click the banner — the dApp triggers `wallet_switchEthereumChain` to chain ID 4441. If the wallet doesn't have LiteForge yet, it'll prompt to add it.

If switching fails, [add LiteForge manually](/getting-started/wallet#add-liteforge-manually).

## Transactions stuck pending

Open the [LiteForge explorer](https://liteforge.explorer.caldera.xyz) and paste your tx hash:

- **Failed** — increase gas slightly and resend.
- **Confirmed but UI didn't update** — hard refresh the dApp (Ctrl+Shift+R).
- **Not found** — the tx never reached the RPC. Try sending again.

If MetaMask shows ghost pending, go to Settings → Advanced → Reset Activity.

## Swap failed with "INSUFFICIENT_OUTPUT_AMOUNT"

The price moved more than your slippage tolerance between quote and execution. Either:

- raise slippage tolerance in the swap card,
- reduce swap amount,
- wait a few seconds for the pool to settle.

## Messages send but 0 points credit

You hit the **10 messages/day** cap. The on-chain tx still goes through, just no points after 10. Resets at 00:00 IST.

## Faucet says "NFT + .lit Domain Required"

You're missing one or both prerequisites. The modal's eligibility checklist shows which:

- ✗ NFT → mint a LitShard (1,000 pts) on the [NFTs page](/nfts/)
- ✗ Domain → register a 1-year `.lit` for 0.05 zkLTC on [Hub → Buy](/hub/lit-domain)

## Marketplace "Not authorized" on accept

You haven't granted operator approval on the registry. The marketplace contract can't transfer your `.lit` name without it.

The dApp prompts for this approval the first time you list. If you're hitting "Not authorized" on accept:

- click **Re-approve marketplace** on the listing page,
- sign,
- retry the accept.

## Game stuck on "loading"

Math Slash uses an iframe. If it doesn't load:

- disable browser ad blockers (some block the game iframe),
- allow autoplay + fullscreen for `litdex.test-hub.xyz`,
- on mobile, allow orientation lock.

## My `.lit` name didn't credit points

Points credit after the registration tx confirms. If 5 minutes have passed and your `total` hasn't updated:

- check the tx on the explorer — confirmed?
- if confirmed, the relayer might be rate-limited. Wait 10 more minutes.
- still nothing? Paste the tx hash in [Telegram](https://t.me/litdex_discussion) and we'll requeue.

## Wallet shows wrong balance

Token balances are read live from chain. If the dApp shows stale numbers:

- click any token to refresh its balance,
- reconnect the wallet,
- hard refresh (Ctrl+Shift+R).

## I want to disconnect / change wallets

Top-right wallet pill → **Disconnect**. Then connect a different account from MetaMask. The dApp clears all per-wallet state automatically — no leftover history from the previous wallet.

## Anything else

Open an issue on [GitHub](https://github.com/0xDarkSeidBull/litdex) with:

- screenshot,
- wallet address,
- tx hash if applicable,
- browser + OS.

We respond within 24 hours.
