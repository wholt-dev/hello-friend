# Faucet

The LitDEX faucet drops **0.01 zkLTC + 10 points** every 24 hours per eligible wallet.

## Eligibility

To prevent bot abuse, both conditions must be true:

- ✅ Wallet holds at least **one LitDEX NFT** (LitShard / LitCore / LitGod)
- ✅ Wallet owns at least **one `.lit` domain** on the LiteForge registry

If either is missing, the modal shows the eligibility checklist with red X marks and the claim button reads **"NFT + .lit Domain Required"** (disabled).

## How to claim

1. Click **Faucet** in the top nav.
2. The modal opens and immediately calls `/faucet/eligibility/:wallet`.
3. If eligible, click **Claim 0.01 zkLTC + 10 Points**.
4. The success card shows the explorer link.

The 24-hour cooldown then locks the button until the next claim window.

## Cooldown

Cooldown is per-wallet in the backend's `faucet_claims` table. The endpoint stores `last_claim` timestamps and refuses claims within the 86400-second window.

The UI shows a live countdown when locked:

```
NEXT CLAIM IN
22:35:36
```

## How to become eligible

| Need | Cheapest path |
| --- | --- |
| LitDEX NFT | Mint a LitShard for 1,000 pts on the [NFTs page](/nfts/) |
| `.lit` domain | Register a 1-year name for 0.05 zkLTC on [Hub → Buy](/hub/lit-domain) |

Both together unlock the faucet's daily 0.01 zkLTC + 10 pts. Over a week that's 0.07 zkLTC + 70 pts of pure passive income (after your one-time setup).

## Manual top-up for new wallets

If you're brand new and have zero zkLTC, the team has manual top-up tooling. Ping the [Telegram group](https://t.me/litdex_discussion) with your address — usually within a few hours.

## Why the gating?

Earlier the faucet only required a 24-hour cooldown. Bots farmed it heavily — fresh wallets created daily, claimed once, abandoned. The NFT + `.lit` requirement raises the bar enough that bots can't profit (the setup costs more than they could ever extract).

Real users have these by their second day on the platform anyway.

## API

For developers:

- `GET https://api.test-hub.xyz/faucet/enabled` → `{ enabled: bool }`
- `GET https://api.test-hub.xyz/faucet/status/:address` → cooldown info
- `GET https://api.test-hub.xyz/faucet/eligibility/:wallet` → `{ eligible, nft, domain }`
- `POST https://api.test-hub.xyz/faucet/claim` → executes claim if eligible

> The faucet is currently **live**. If pause notices appear, check the [Telegram channel](https://t.me/litdex_app) for status.
