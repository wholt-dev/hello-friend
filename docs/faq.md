# FAQ

## Is LitDEX mainnet?

No, currently testnet on the LiteForge chain (4441). zkLTC has no monetary value. Mainnet timing will be announced on [@LitDeXApp](https://x.com/LitDeXApp) and the Telegram channel.

## Where do I get zkLTC?

The [Faucet](/faucet/) drops 0.01 zkLTC every 24 hours if you hold a LitDEX NFT and a `.lit` domain. New wallets without those can request a manual top-up in [Telegram](https://t.me/litdex_discussion).

## Why do I need both an NFT and a `.lit` domain for the faucet?

Anti-bot. Earlier the faucet only required a 24-hour cooldown and bots farmed it heavily. The combined gate makes farming uneconomical without affecting real users.

## Can I lose my `.lit` name?

Time-bound names expire after their term unless renewed. **Forever** names never expire. If a name expires, it goes back to the public pool after a small grace period.

## How do points convert to zkLTC?

Currently game points (Math Slash) credit on-chain via `recordQuestFor`. zkLTC conversion is **paused** while the team retunes the system. Points are not lost — they sit in your `total` and will convert when the rate is finalized.

## Why did my message land but I got 0 points?

You hit the daily 10-message cap. After 10 messages today, points stop crediting. The on-chain tx still confirms. Wait for the 00:00 IST reset.

## Can I run multiple wallets?

Yes — but each wallet needs its own NFT and `.lit` for faucet eligibility. The dApp scopes everything per wallet so swapping accounts is clean.

## Why does my dashboard show stale points?

Hard refresh (Ctrl+Shift+R / Cmd+Shift+R) and reconnect the wallet. The dashboard reads `getPoints()` directly from chain — if the chain is up to date, the cache should refresh on reload.

## How do I list my `.lit` name for sale?

Go to Hub → .lit Market → **List a name**. First time, you sign an operator approval (one-time per wallet). Then list with a flat price or accept bids only.

## Is a developer API available?

Partially:

- `https://api.test-hub.xyz/points/:wallet` — read points
- `https://hub.test-hub.xyz/hub/names/owned/:wallet` — owned `.lit` names
- `https://api.test-hub.xyz/faucet/eligibility/:wallet` — faucet eligibility

Full API docs are pending.

## How do I report bugs?

Open an issue on [GitHub](https://github.com/0xDarkSeidBull/litdex) or post in [Telegram](https://t.me/litdex_discussion).

## What contracts does LitDEX use?

See the [Contracts reference](/reference/contracts).
