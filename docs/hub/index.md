# Hub

The Hub is LitDEX's social layer. Everything is on-chain — friend lists, messages, listings, names, transfers. There is no off-chain database; the dApp reads directly from the LiteForge registry, posts, marketplace, and messenger contracts.

## What's inside

- [Private Chat](./private) — DMs between two `.lit` names, end-to-end stored as content hashes on chain
- [Global Feed](./global) — public posts visible to everyone, with likes, comments, and tip rewards
- [.lit Market](./market) — list and buy `.lit` names with bids, accepts, rejects
- [.lit Domain Registration](./lit-domain) — register a new name with duration-based pricing
- [Profile](./profile) — your bio, your owned names, transfer history

## Getting in

You need a `.lit` name to enter the Hub. Without one, the Hub gates with a "Claim your .lit name" prompt and routes you to the Buy page.

If you've never registered, follow [Getting Started → Register a .lit Name](/getting-started/lit-name) first.

## How the Hub stays in sync

- **Friends list**: read from `LitDeXMessenger.getFriends(address)`.
- **DMs**: each message is an on-chain event with `(from, to, contentHash, msgType)`. The dApp resolves contentHash via the Hub indexer to retrieve the message body. Friend-only by default.
- **Global feed**: `Posts.postCount()` + `getPost(id)` for every post. Likes and comments are events.
- **Market listings**: `Marketplace.getActiveListings()` returns all open listings + bids.

Every action — sending a message, posting, listing — is a transaction. There are no draft saves or off-chain queues. If you sign, it lands on chain.

## Daily caps

The Hub's messaging rewards run on a daily counter. See [Messenger → Daily Caps](/messenger/) for the breakdown.

## Why on-chain everything?

- Censorship resistance — a `.lit` name is yours forever, the registry can't take it back.
- Verifiable history — every message and listing is reproducible from chain state.
- Composability — third parties can build on top of the same data without API keys.
