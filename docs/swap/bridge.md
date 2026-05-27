# Cross-Chain Bridge

The Bridge card lets you move assets between LiteForge and partner chains. Currently supported routes:

- **LiteForge ↔ BSC** (zkLTC native bridge for testing)

More routes will roll in as Caldera bridges them on.

## How to bridge

1. Click **Bridge** in the top nav (or the floating bridge button).
2. Pick the source chain on the left, destination on the right.
3. Enter the amount.
4. Click **Approve & Bridge**, sign the approve, then sign the bridge tx.
5. Wait — the bridge has a checkpoint period (currently ~5 minutes for LiteForge↔BSC).
6. The success card prints both the source tx and the destination tx hashes once the relayer mints on the other side.

## What you need on the source chain

| Source | Required |
| --- | --- |
| LiteForge | Some zkLTC for gas |
| BSC | Some BNB for gas |

If you are bridging from BSC and don't have any BNB, ping the team — there are micro-faucets for new wallets.

## Anti-bot gate (legacy)

There used to be a "play 5 Math Slash games to unlock bridge" gate. That has been removed — any wallet with a `.lit` domain can use the bridge. The gate moved to the [Faucet](/faucet/) (which now requires NFT + `.lit`).

## Failed bridge?

- Open the source-chain explorer with the source tx hash. If it confirmed, the relayer has the message and the destination mint will land within the checkpoint period.
- If the relayer is stuck, paste the source tx hash in [Telegram](https://t.me/litdex_discussion) and we'll requeue it.

> Cross-chain transfers are non-reversible. Always paste the destination wallet carefully or use your own wallet on both sides.
