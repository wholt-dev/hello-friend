# Global Feed

The Global Feed is the Hub's Twitter — public posts visible to every wallet, with likes, comments, and optional tip bounties.

## Post

1. Open Hub → **Global**.
2. Click **Create Post**.
3. Type your content (max 280 chars by convention, but the contract allows more).
4. Optionally attach a **bounty**: a zkLTC reward split between like-ers and commenters.
5. Sign. Your post lands as a `Posts.createPost(content, likeReward, commentReward)` event.

Posts are immutable — no edits or deletes.

## Bounties

A post can include two reward pools:

- **Like reward**: split equally among the first N likers (where N is set by the contract default).
- **Comment reward**: split equally among the first N commenters.

You fund the bounty up front (it deducts zkLTC from your wallet on post). If no one engages, the funds stay locked in the contract — there is no automatic refund. Use bounties for posts where you want to drive a specific action.

## Like and comment

- **Like**: one tx, costs ~0.0001 zkLTC gas.
- **Comment**: one tx, includes the comment text.

If the post had a bounty and you are within the first N to like/comment, the reward is paid out instantly in the same tx. The success card shows how much you received.

## Share to X

The "Share" button on each post opens an X intent with the post content + a link to LitDEX. Quick way to syndicate good posts off-platform.

## Reading the feed

The feed loads the most recent 20 posts on mount. Scroll triggers a "Load more" button that pages back 20 at a time. If the indexer is behind the feed falls back to direct chain reads via `Posts.postCount()`.

## Why use Global vs Twitter?

- Posts are permanent and verifiable.
- Tipping is one-click and routes to the original poster's wallet.
- Your `.lit` name is your handle — no impersonation possible.

> Posts that include illegal content are visible on chain but the dApp may filter them in the UI. The community moderates by ignoring spam.
