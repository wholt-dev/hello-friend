# Deploy

The Deploy page is a single-pane launchpad for four contract types:

| Type | Use case | Points reward |
| --- | --- | --- |
| [Token](./token) | Launch an ERC-20 (memecoin, governance token, utility token) | +5 pts (capped 100/day) |
| [NFT collection](./nft) | Launch an ERC-721 with mint price + supply cap | — |
| [Staking](./staking) | Reward holders for locking your token | — |
| [Vesting](./vesting) | Distribute team/treasury tokens on a schedule | — |

Each deploy lands the user a verifiable contract on LiteForge with a transaction hash you can paste anywhere.

## Why deploy through LitDEX?

- **No fee on tokens** — `LITDEX_DEPLOYER` runs gasless of fee.
- **Auto points** — the relayer credits +5 pts after the contract verifies.
- **Source-shown** — every deploy page shows the Solidity it will compile + deploy. No black box.
- **Audited factory** — the underlying factory is audited and used by every deploy.

## Daily cap (tokens)

You earn +5 pts per token deploy, capped at **100 pts/day** (so 20 deploys/day max for points). Past the cap you can still deploy — points just stop crediting until midnight IST.

The dashboard "Deploy Daily" card shows your live count.

## What you need

- Some zkLTC for gas (~0.0002 zkLTC per deploy).
- A name + symbol for tokens / NFTs.
- A reward token + rate for staking.
- A schedule + beneficiary for vesting.

Each sub-page walks through the form fields.
