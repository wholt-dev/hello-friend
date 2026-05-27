# On-chain Public + Direct

Detailed look at how on-chain messages work, the cap logic, and the points flow.

## Contract paths

The Messenger uses three on-chain functions on `LitDeXMessenger`:

```solidity
function sendDirect(address to, string content) external;
function sendPublic(string content) external;
function sendMessage(address to, string contentHash, string msgType) external;
```

The Messenger page calls `sendMessage` (which the contract internally routes to public or direct based on the `to` address).

## Points credit path

When a message lands on chain, the contract internally bumps:

- `total += 2`
- `msgDaily += 2` (counter, not the message count — bumps by 2 per message in pts)

The backend `/msg/sent` endpoint is **telemetry only** — it tracks the message count for the UI but does not credit points. (Earlier it called `recordQuestFor` which double-credited. That bug has been fixed.)

## Daily cap

The Messenger UI gates at **10 messages/day per wallet**:

- Messages 1–10: success card with "+2 PTS".
- Messages 11+: success card with "DAILY CAP REACHED · +0 PTS (CAP REACHED)".

The on-chain tx still goes through. Only the UI changes its messaging. (The contract may or may not enforce its own internal cap.)

## How the UI tracks the count

- On modal open, the UI fetches `/msg/count/:wallet` from the backend (which now reads `msgDaily / 2` directly from chain) and pre-fills the counter.
- Each successful send bumps the counter by 1 and writes to localStorage as a fallback.
- The counter resets at 00:00 IST when `msgDaily` resets on chain.

## Ergonomics

- Send button stays clickable past the cap — users can still send messages, they just don't earn points.
- Helper text reads:
  - `0/10 messages today` (under cap)
  - `Cap reached · 10/10 (no more points today)` (at/over cap)

## Why on-chain messaging?

- **Permanent receipts** — every message has an explorer URL.
- **Verifiable identity** — `.lit` reverse-resolution proves who sent.
- **Composable** — third parties can build mute/block lists, indexers, mirrors on top of the same events.

## Privacy

Messages are public on chain. The dApp does not encrypt content. For sensitive info, use external E2E channels (Signal, Matrix). LitDEX messaging is for public-facing or semi-public conversations.

> Tip: Run a curl loop against `/msg/sent` to test the counter flow end-to-end. The backend is now telemetry-only so it never double-credits.
