# Connect a Wallet

LitDEX uses [RainbowKit](https://rainbowkit.com) under the hood, so any EVM wallet that supports WalletConnect or browser injection works. Recommended: MetaMask, Rabby, OKX Wallet, Brave Wallet.

## Connect

1. Open the app at <https://litdex.test-hub.xyz>.
2. Click **Connect Wallet** in the top right.
3. Pick a wallet from the list and approve the connection in the wallet popup.

The first time you sign a transaction, the wallet asks to add the **LiteForge** network. Approve once — every future tx uses the same chain.

## Add LiteForge manually

If your wallet does not auto-prompt:

| Field | Value |
| --- | --- |
| Network name | LiteForge |
| New RPC URL | `https://liteforge.rpc.caldera.xyz/http` |
| Chain ID | `4441` |
| Currency symbol | zkLTC |
| Block explorer | `https://liteforge.explorer.caldera.xyz` |

## Switching wallets

The dApp scopes everything per wallet — outgoing friend requests, transfer history, message bubbles. Swapping wallets in MetaMask resets the UI to that wallet's state without leaking the previous account's data.

## Troubleshooting

- **Wrong chain banner**: click "Switch to LiteForge" — the dApp triggers a `wallet_switchEthereumChain` request.
- **Transactions stuck pending**: check the explorer with the transaction hash. If the nonce was reused (rare on testnet), reset the activity tab in MetaMask.
- **Wallet shows no balances**: pull-to-refresh or reload — token balances are read directly from chain via the RPC.

If something looks off, screenshot it and ping the [Telegram group](https://t.me/litdex_discussion).
