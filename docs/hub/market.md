# `.lit` Marketplace

Trade `.lit` names. Two interaction models: **flat-price listing** and **bidding**.

## Listing your name

1. Open Hub → **.lit Market**.
2. Click **List a name**.
3. Pick which of your owned names to list.
4. Set a **flat price** in zkLTC (or leave as 0 to accept bids only).
5. Sign two transactions:
   - **Operator approval** — gives the marketplace contract permission to transfer the name on accept. One-time per wallet.
   - **List name** — submits the listing.

Your listing shows up in the market grid for everyone.

## Buying flat-price

If a listing has a price, buy directly:

1. Click the listing.
2. Click **Buy at 0.5 zkLTC** (or whatever the price is).
3. Sign. The marketplace transfers the name to you and zkLTC to the seller in one tx.

## Bidding

Any listing accepts bids. Click a listing → enter a zkLTC amount → **Place bid**. The funds are escrowed in the marketplace contract.

The seller sees the bid in their listing's bid list. They can:

- **Accept** — name moves to bidder, zkLTC moves to seller.
- **Reject** — bid escrow is refunded to the bidder. (This is what `rejectBid()` is for — sellers needed a way to cancel offers without ignoring them forever.)

Bidders can **withdraw** their bid before it's accepted to cancel and reclaim the escrow.

## Recent sales

The market page has a horizontal "Recently Sold" ticker that scrolls through the latest 16 sales. Useful for price discovery on similar names.

## Operator approval explained

The marketplace contract does not own your name — you do. To accept a sale on your behalf, you grant `operatorApproval(marketplace, true)` on the name registry. This is one transaction per wallet, persistent across all your listings and accepts. The dApp prompts for it the first time you list or accept.

## Filters

The market grid filters by:

- **All** / **Buy now** (has a price) / **Bids only** / **My listings** / **My bids**
- Length (≤4 / 5–7 / 8+)
- Sort: price asc/desc, ending soon, recently listed

> Always double-check the name spelling before buying — `alice.lit` and `alicé.lit` are different names.
