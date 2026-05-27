# LitDEX Docs

Official documentation site for [LitDEX](https://litdex.test-hub.xyz/), built with [VitePress](https://vitepress.dev/).

Live at **https://docs.litdex.test-hub.xyz**.

## Local development

```bash
npm install
npm run dev
```

Site runs at `http://localhost:5173`.

## Build

```bash
npm run build
npm run preview
```

The static output is written to `.vitepress/dist`.

## Deploy

Configured for Vercel. Connect this repository on Vercel, add the
`docs.litdex.test-hub.xyz` custom domain, point the DNS CNAME to
`cname.vercel-dns.com`, and Vercel handles SSL + builds on push.

## Structure

```
.
├── .vitepress/
│   ├── config.ts          # nav, sidebar, theme
│   └── theme/             # LitDEX dark/white styling
├── public/                # static assets (logo, favicon)
├── index.md               # landing page
├── getting-started/       # intro, wallet, faucet
├── swap/                  # swap + cross-chain bridge
├── pool/                  # add / remove liquidity
├── deploy/                # token, NFT, staking, vesting
├── hub/                   # private / global chat, .lit market
├── points/                # earning, daily check-in, leaderboard
├── nfts/                  # tiers, claim rewards
├── messenger/             # on-chain messaging
├── socials/               # X / Telegram quests
├── games/                 # math slash, future games
├── faucet/                # eligibility + cooldown
├── faq.md
└── troubleshooting.md
```
