# Deploy an NFT Collection

Launch an ERC-721 with a mint price and a per-wallet cap.

## Form fields

| Field | Default | Notes |
| --- | --- | --- |
| Name | — | Collection name, e.g. `Lit Cats` |
| Symbol | — | 3–8 chars |
| Total supply | — | Hard cap on mints |
| Mint price | 0.05 zkLTC | Per token, paid by minter |
| Max per wallet | 5 | Anti-snipe |
| Base URI | `https://api.example.xyz/meta/` | Folder containing `{tokenId}.json` |

## Metadata

The base URI must point to a folder with one JSON per token, named `1.json`, `2.json`, etc. Each JSON should follow the [OpenSea metadata standard](https://docs.opensea.io/docs/metadata-standards):

```json
{
  "name": "Lit Cat #1",
  "description": "A pixel cat hand-drawn for LitDEX testnet.",
  "image": "https://api.example.xyz/img/1.png",
  "attributes": [
    { "trait_type": "Background", "value": "Cyber" },
    { "trait_type": "Eyes",       "value": "Green" }
  ]
}
```

The dApp does not host metadata for you — use IPFS, Arweave, or any HTTPS host that supports CORS.

## After deploy

- **Mint page**: copy the contract address into a custom mint page or use any standard ERC-721 mint UI.
- **Marketplace**: the LiteForge ecosystem includes NFT marketplaces that pick up new collections automatically once they have a few mints.
- **Royalties**: not enforced at the contract level by default. If you need ERC-2981 royalties, you can deploy through a custom factory in a future release.

> Plan your tokenIds and metadata folder before deploying. The base URI is immutable on this factory — you cannot change it later.
