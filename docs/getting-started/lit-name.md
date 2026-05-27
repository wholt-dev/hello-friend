# Register a `.lit` Name

A `.lit` name is your identity on LitDEX. It shows up on:

- the messenger (so DMs read `alice.lit` instead of `0xabc…def`)
- the Hub global feed
- the marketplace listings
- friend search and reverse-resolve everywhere

You can register multiple names — names are reverse-resolved through the registry and the first one you register becomes your default.

## How to register

1. Open the [Hub](/hub/), click **Buy .lit** in the sidebar (or use the floating buy button).
2. Type the name. Emoji, fancy fonts, and Unicode all work — the registry stores raw bytes.
3. Pick a duration:

   | Duration | Price | Points reward |
   | --- | --- | --- |
   | 1 year | 0.05 zkLTC | +10 pts |
   | 2 years | 0.09 zkLTC | +20 pts |
   | 5 years (popular) | 0.20 zkLTC | +35 pts |
   | 10 years | 0.35 zkLTC | +60 pts |
   | Forever (lifetime) | 0.50 zkLTC | +100 pts |

4. Confirm the transaction.

The points are credited automatically once the on-chain registration tx confirms. Idempotency is guaranteed by the txHash, so a refresh cannot double-credit.

## Tips

- **Forever names** are non-transferable to renewal — no expiry to track.
- **Popular short names** sell fast. The marketplace sub-page has a live "Recently Sold" ticker.
- The registry lets you have any number of names, but only one is set as your **primary** for reverse-resolution. Set the primary from your profile page.

## Marketplace

`.lit` names are tradable. Once you own a name you can list it for a flat zkLTC price or accept bids — see [Hub → .lit Market](/hub/market).
