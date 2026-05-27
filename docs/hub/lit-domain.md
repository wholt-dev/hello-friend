# `.lit` Domain Registration

Register one or many `.lit` names directly from the Hub.

## How to register

1. Open Hub → **Buy .lit**.
2. Type the name. Emoji, fancy fonts, and Unicode all work — the registry stores raw bytes, no character class restrictions.
3. The dApp checks availability live as you type (debounced 300ms).
4. Pick a duration:

   | Duration | Price | Points reward |
   | --- | --- | --- |
   | 1 year | 0.05 zkLTC | +10 pts |
   | 2 years | 0.09 zkLTC | +20 pts |
   | 5 years (popular) | 0.20 zkLTC | +35 pts |
   | 10 years | 0.35 zkLTC | +60 pts |
   | Forever | 0.50 zkLTC | +100 pts |

5. Click **Register**. Sign the transaction.

Once the tx confirms, the name is yours. Reverse-resolution becomes active immediately — your wallet now reads as `yourname.lit` everywhere in the dApp.

## Renew

Time-bound registrations can be extended any time before they expire. The Buy page detects names you already own and offers a "Renew" button instead of "Register" when applicable.

A name that expires drops back to the public pool after a small grace period.

## Forever names

The "Forever" tier is a one-shot lifetime registration. There is no renewal because the name never expires. Slightly more expensive but fire-and-forget.

## Multiple names

You can own as many names as you want. Set one as your **primary** for reverse-resolution from the [profile page](./profile). Other names still resolve forward (e.g. `alt.lit` → your wallet) but the wallet's reverse-display uses the primary.

## Points are credited automatically

The points reward fires after the registration tx confirms. The backend verifies the tx exists and was sent by you, then credits via the relayer. The questId encodes the txHash so a refresh cannot double-credit.

## Suggested names

The Buy page shows a "Try any of these styles" strip with examples like emoji names, mixed-language names, and short ASCII names. Just inspiration — register whatever fits you.

> Short names sell out fast. The marketplace ticker is a good signal for hot lengths and styles.
