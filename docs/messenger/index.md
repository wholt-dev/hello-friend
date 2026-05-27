# Messenger

The Messenger page is the **public broadcast** channel for `.lit` users — different from the Hub's private DMs.

## What's the difference vs Hub Private?

| Feature | Hub → Private | Messenger |
| --- | --- | --- |
| Audience | One friend | Anyone or one wallet |
| Friend lock | Required | Not required |
| Public option | No | Yes (msgType: "public") |
| Direct option | Yes | Yes (msgType: "direct") |
| Points | +2 / msg, cap 10/day | Same |

The Messenger is the simpler page — no friend list, no chat threads. You pick **public** or **direct**, optionally a recipient, type a message, sign.

## Two modes

### Public

- Recipient: hardcoded "public" address.
- Visible to: anyone reading the messenger feed.
- Use case: announcements, broadcasts, public replies.

### Direct

- Recipient: any wallet address (paste or `.lit` resolve).
- Visible to: just the recipient (and on chain — anyone with the explorer can read).
- Use case: messaging non-friends, replying to a quest poster.

## Stats

The messenger header card shows:

- **Sent**: total messages you've ever sent (lifetime).
- **Received**: total received.
- **Global On-Chain**: ecosystem-wide total messages — community counter.
- **Points**: your `total` balance.

## Daily cap

- 10 messages/day per wallet earn points (+2 each, max 20 pts/day).
- After 10, messages still go through but the success card says "DAILY CAP REACHED" + **+0 PTS**.
- Cap resets at 00:00 IST.

The "X/10 messages today" counter under the send button tracks this. The button stays clickable past 10 — only the popup wording changes.

## Inbox

Switch to the **Inbox** sub-tab to see messages received. Each row shows the sender's `.lit` name (or short address), timestamp, content, and the type (public/direct).

> Public messages are great for engagement — anyone can reply or tip. Direct messages keep the conversation more private without needing a friend request.
