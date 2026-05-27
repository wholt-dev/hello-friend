# Private Chat

DM another `.lit` user. Friend-locked — you can only DM wallets that are in your friends list.

## Add a friend

1. Open Hub → **Private**.
2. Search for a name in the sidebar.
3. Click **+ Add friend** (or paste a wallet address).
4. The other side gets a pending friend request notification.
5. They tap **Accept** → friendship is on chain, both can now DM.

Either side can call `rejectFriendRequest(reqId)` or `removeFriend(address)` to undo.

## Send a message

1. Pick a friend in the sidebar.
2. Type your message (max 1,000 chars).
3. Press the send button.
4. The message lands as an on-chain event from `LitDeXMessenger.sendMessage(to, contentHash, "text")`. Points credit happens automatically per [Messenger rules](/messenger/).

The bubble appears optimistically as **"sending…"** then promotes to confirmed once the receipt comes in. If the tx fails (rejected, gas underpriced, etc.) the bubble disappears and an error toast shows.

## Sending zkLTC inside a chat

You can send zkLTC with an attached note using the green "$" button next to the input.

- The funds + note are stored together in `sendZkLTC(to, note)` (payable).
- The bubble shows the amount and the note inline.
- Points: same as a regular message (+2 pts, daily cap of 10/day).

## Privacy

- Messages are public on chain — anyone with the contract address can read them by tx history.
- Names and addresses are public.
- The dApp does not encrypt content; it stores the raw text via the indexer + the contentHash on chain.
- For sensitive info, use external E2E channels (Signal, etc).

## Caps and limits

- 10 messages/day per wallet earn points (+2 pts each, max 20 pts/day for messages)
- After the cap, messages still go through but with a "DAILY CAP REACHED" popup and 0 pts credited.

> Friend-gating prevents inbox spam. Public broadcasts use the [Global Feed](./global) instead.
