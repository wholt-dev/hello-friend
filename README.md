<div align="center">

<img src="https://raw.githubusercontent.com/notfoundsuser/kindred-spirit/main/public/coins/web_logo.png" alt="LitDEX" width="120" />

# LitDEX

**The all-in-one Web3 Hub on the LiteForge chain.**

Swap, deploy, chat, mint, play, and earn — all on-chain, all in one place.

[![Live App](https://img.shields.io/badge/App-litdex.test--hub.xyz-000000?style=for-the-badge&logoColor=white)](https://litdex.test-hub.xyz)
[![Docs](https://img.shields.io/badge/Docs-docs.litdex.test--hub.xyz-blue?style=for-the-badge)](https://docs.litdex.test-hub.xyz)
[![X](https://img.shields.io/badge/Twitter-@LitDeXApp-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white)](https://x.com/LitDeXApp)
[![Telegram](https://img.shields.io/badge/Telegram-litdex__app-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/litdex_app)

</div>

---

## 🏆 LiteForge Hackathon Submission

| Field | Value |
| --- | --- |
| **App Name** | LitDEX |
| **Description** | All-in-one Web3 Hub on LiteForge — DEX, social, NFTs, points, games, and a `.lit` name market in a single dApp. |
| **Live App** | https://litdex.test-hub.xyz |
| **Docs** | https://docs.litdex.test-hub.xyz |
| **Demo Video (X)** | _to be added at submission time_ |
| **Chain** | LiteForge (chain ID `4441`) |

---

## ✨ What is LitDEX?

LitDEX is a fully on-chain ecosystem built on the LiteForge testnet. Most chains have one dApp per category — a separate DEX, a separate NFT marketplace, a separate messenger. LitDEX bundles them into a single experience, with a unified points economy that ties every action together:

- 🔁 **Swap** tokens through the LitDEX router or partner OmniFun router (auto-routes the best price).
- 💧 **Pools** with V2-style AMM, 0.3% fees, no lockups.
- 🌉 **Cross-chain bridge** between LiteForge and Sepolia ETH.
- 🚀 **Deploy** ERC-20 tokens, ERC-721 NFT collections, staking pools, and vesting contracts in one click each.
- 💬 **Hub** — a complete on-chain social layer with Private DMs, a Global feed (with bounty tipping), a `.lit` Marketplace, and `.lit` domain registration.
- 🏆 **Points System** — every meaningful action earns points (swap, deploy, message, check-in, register a name, complete socials).
- 🎁 **Genesis NFTs** — three rarity tiers (LitShard, LitCore, LitGod) that pay daily yield in zkLTC, USDC, and LDEX.
- 📨 **Messenger** — public broadcasts and direct messages, on-chain, with `.lit` reverse-resolution.
- 🎮 **Games** — Math Slash 3D arcade game with a weekly leaderboard.
- 💧 **Faucet** — 0.01 zkLTC + 10 points every 24h, NFT + `.lit` domain gated to keep bots out.

Everything lives on LiteForge. There is no centralized database for friends, listings, or messages — the dApp reads directly from on-chain contracts.

---

## 🎯 Why this matters

Most testnets feel disjointed — apps don't share state, and users hop between five tabs to do anything interesting. LitDEX proves that a chain can host a fully integrated consumer experience:

- A single `.lit` name is your identity across the DEX, the marketplace, the messenger, and your profile.
- A single point balance unlocks NFTs, leaderboard prizes, and (soon) the bridge.
- A single wallet connects you to every primitive.

The result is something that looks and feels like a Web2 platform, but every byte is verifiable on chain.

---

## 🛠️ Tech Stack

**Frontend**
- React 19 + TypeScript + Vite
- Tailwind CSS + custom dark/white theme
- Framer Motion (page transitions, nav animations)
- RainbowKit + wagmi + viem (wallet connection, on-chain reads)
- Lucide icons

**Backend (3 Node services)**
- `litdex-hub` — Hub indexer + chain reads (posts, listings, friends, messages)
- `litdex-quest-api` — Points credit, faucet, quest verification
- `litdex-game` — Game sessions, score validation, anti-bot
- `litdex-bridge` — Cross-chain relayer (LiteForge ↔ Sepolia)

**Smart Contracts** (on LiteForge `4441`)
- `PointsSystem` — `0x526B0629C81d3314929dB8166372F792F3da3419`
- `LitDeXNFT` — `0x59df2d661eb6F5fb97a694E1D2e4D17e2A7b7D15`
- `DailyCheckin` — `0xDdE6F0ee964A9fdF71CDB2cBDF1e5E44263d3825`
- `Messenger` — `0x9624FBBD6931b9D75961994E13604c1DC2c56225`
- `Marketplace` (v2 with rejectBid) — `0x191678312D1d95eF2A05DfCEEa5401b6c654385E`
- `LitDeXDeployer` (token + NFT factories), `Posts`, `Registry`, `LiteSwap V2 Router`

**Documentation**
- VitePress 1.6 with custom theme matching the dApp

**Infrastructure**
- Vercel (frontend + docs)
- Hetzner VPS for backend services
- pm2 for process management
- nginx as TLS-terminating reverse proxy

---

## 🗺️ Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                  litdex.test-hub.xyz (Vercel)                     │
│                  React 19 + Vite + RainbowKit                     │
└─────┬───────────────────┬──────────────────┬──────────────────────┘
      │                   │                  │
      │ wagmi/viem         │ /hub/*           │ /points,/faucet,/games
      │ on-chain           │ (REST)           │ (REST)
      ▼                   ▼                  ▼
┌──────────────┐   ┌─────────────────┐   ┌───────────────────────┐
│  LiteForge   │   │  litdex-hub     │   │  litdex-quest-api     │
│  RPC (4441)  │   │  vmi3299842     │   │  37.27.10.231:3002    │
│              │   │  /root/litdex-  │   │                       │
│  contracts:  │   │  hub            │   │  litdex-game          │
│  - Points    │   │                 │   │  37.27.10.231:3004    │
│  - NFT       │   │  hub.test-      │   │                       │
│  - Messenger │   │  hub.xyz        │   │  litdex-bridge        │
│  - Market    │   │                 │   │  (LiteForge ↔ Sepolia)│
│  - Posts     │   └─────────────────┘   └───────────────────────┘
│  - Registry  │
└──────────────┘
```

Cross-cutting concerns:

- **Caching**: Hub server has a per-route TTL response cache (5–30s for dynamic data, 24h for name resolution) to keep the public RPC happy.
- **Idempotency**: Every points credit uses a deterministic `questId` so reloads can't double-credit.
- **Per-wallet scoping**: Every localStorage key is keyed by wallet address — switching accounts in MetaMask never leaks the previous wallet's data.

---

## 🚀 Major features (deep dive)

### 1. Swap — best-of-two routing

The swap card auto-quotes both the LitDEX router and OmniFun and picks whichever pays out more. The chosen path is shown live in the footer.

```
quote LitDEX → out_A
quote OmniFun → out_B
chosen = max(out_A, out_B)
```

### 2. Hub — on-chain social

The Hub bundles five sub-experiences under one navigation:

- `/hub/private` → friend-locked DMs, on-chain via `Messenger.sendMessage(to, contentHash, msgType)`.
- `/hub/global` → public posts with optional **bounties**: fund a like-and-RT pool, the first N engagers split it.
- `/hub/market` → `.lit` name marketplace with flat-price listings, bids, accept, reject.
- `/hub/buy` → register a `.lit` name with duration-based pricing (1Y, 2Y, 5Y, 10Y, Forever).
- `/hub/profile` → bio, owned names, transfer history.

### 3. Points System

Every action earns points; daily caps prevent farming. The dashboard shows real-time on-chain balances and a countdown to the 00:00 IST reset.

| Action | Points | Cap |
| --- | --- | --- |
| Daily check-in | +10 | 1/day |
| Token deploy | +5 | 100 pts/day |
| On-chain message | +2 | 20 pts/day |
| Faucet claim | +10 | 1/day |
| `.lit` register | 10–100 | one-shot |
| Math Slash | up to +10 per game | 5 games/day |

### 4. Genesis NFTs — daily yield

Three tiers, all minted by spending points. Each NFT pays daily zkLTC, USDC, and LDEX as long as held.

| Tier | Cost | Daily Reward | Max Supply |
| --- | --- | --- | --- |
| LitShard | 1,000 pts | 0.0001 zkLTC + 10 USDC + 2 LDEX | 9,999 |
| LitCore | 5,000 pts | 0.0005 zkLTC + 50 USDC + 10 LDEX | 4,999 |
| LitGod | 25,000 pts | 0.005 zkLTC + 500 USDC + 100 LDEX | 999 |

### 5. Faucet v2 — bot-proof

Earlier farms drained the faucet. The new gate requires **both**:

- ✅ Hold at least one LitDEX NFT
- ✅ Own at least one `.lit` domain

Bots can't economically clear those bars; real users meet them organically by day two.

### 6. Cross-chain Bridge

LiteForge ↔ Sepolia ETH, run by a polling relayer (`litdex-bridge`). Lock-mint pattern with checkpoint-style finality.

### 7. Math Slash — skill-based earning

A 3D arcade game where players slash equations. Score-based points credit on chain via a manual claim flow that batches all unclaimed sessions into one `recordQuestFor` call. Anti-bot filters (score velocity, min duration, blacklist) keep the leaderboard fair.

---

## 🌐 Routing

Every section has its own URL — bookmarkable, shareable, refreshable.

```
/                  Home / Swap
/swap              Swap
/pool              Pool (add/remove liquidity)
/deploy            Deploy (token, NFT, staking, vesting)
/points            Points dashboard
/check-in          Daily check-in overlay
/nfts              Genesis NFTs
/messenger        On-chain messenger
/socials           Social quests
/games             Games lobby
/faucet            Faucet
/hub               Hub (defaults to global feed)
/hub/private       Private DMs
/hub/global        Global feed
/hub/market        .lit Marketplace
/hub/buy           Buy a .lit domain
/hub/profile       Profile
```

`vercel.json` adds a SPA fallback so direct URL hits and refreshes never 404.

---

## 🏃 Run locally

Prerequisites: Node 18+, a wallet with LiteForge testnet zkLTC.

```bash
git clone https://github.com/0xDarkSeidBull/litdex.git
cd litdex
npm install
npm run dev
```

Open http://localhost:5173.

For the docs site:

```bash
cd docs
npm install
npm run dev
```

---

## 📁 Repo structure

```
.
├── src/
│   ├── App.tsx                    # Top-level router + every page
│   ├── components/
│   │   ├── ChatUIPage.tsx         # Hub (private/global/market/buy/profile)
│   │   ├── HubPage.tsx            # Hub legacy entry
│   │   ├── NotificationsPanel.tsx
│   │   ├── SuccessCard.tsx
│   │   └── ui/                    # Reusable UI primitives
│   ├── lib/
│   │   ├── litdex-core-logic.ts   # Single-file export of all addresses, ABIs, on-chain helpers
│   │   ├── hub-logic.ts           # Hub-specific helpers
│   │   ├── feedback.ts            # Toast / success card helpers
│   │   └── notifications.ts       # In-app notif store
│   └── ...
├── docs/                          # VitePress documentation site
│   ├── .vitepress/
│   ├── getting-started/
│   ├── swap/, pool/, deploy/, hub/, points/, nfts/, messenger/, socials/, games/, faucet/
│   └── reference/
├── backend-snippets/              # Patch scripts for backend hot-fixes
│   ├── faucet-nft-domain-gate.js
│   ├── faucet-drop-games-check.js
│   ├── messenger-stop-double-credit.js
│   ├── install-hub-response-cache.js
│   └── ...
├── public/
│   ├── coins/                     # Token icons
│   ├── nfts/                      # Genesis NFT images
│   └── games/math-slash.html      # Math Slash game HTML
├── vercel.json                    # SPA rewrite + clean URLs
└── package.json
```

---

## 📚 Documentation

Full docs live at **https://docs.litdex.test-hub.xyz** (or `docs/` in this repo).

Sections covered:

- Getting Started (wallet, faucet, `.lit` name)
- Swap + Cross-Chain Bridge
- Pool (add/remove liquidity)
- Deploy (token, NFT collection, staking, vesting)
- Hub (private chat, global feed, marketplace, domain, profile)
- Points System (overview, check-in, caps, leaderboard)
- NFTs (overview, tiers, mint + claim)
- Messenger (overview, on-chain mechanics)
- Socials & Quests
- Games (Math Slash)
- Faucet
- FAQ + Troubleshooting + Contracts reference

---

## 🔐 Security & decentralization notes

- All user assets (tokens, LP positions, NFTs, `.lit` names) live in user wallets. The dApp custodies nothing.
- `.lit` names are owned by users, not by LitDEX. Operator approval is per-wallet, persistent on-chain, and only granted when the user explicitly lists.
- Backend services are read-only relays except for the points relayer (which calls `recordQuestFor` after on-chain verification — idempotent via questId).
- Faucet eligibility checks happen server-side before signing, so on-chain drips can't be triggered without the prerequisites.
- Anti-bot for games is server-side (score velocity, duration floor) — client tampering doesn't credit points.

---

## 🛣️ Roadmap

- [x] DEX (LiteSwap V2 + OmniFun routing)
- [x] V2-style pools
- [x] Token + NFT + Staking + Vesting deploy
- [x] Cross-chain bridge (LiteForge ↔ Sepolia)
- [x] Points system V7 with daily caps
- [x] Genesis NFTs (3 tiers)
- [x] Daily check-in with streak bonuses
- [x] Hub: private chat, global feed, marketplace, profile, `.lit` registration
- [x] Math Slash arcade game
- [x] Bot-proof faucet (NFT + `.lit` domain gate)
- [x] Messenger with daily caps
- [x] Weekly leaderboard with zkLTC bonuses
- [x] Clean URL routing across all pages
- [x] VitePress documentation site
- [ ] Math Slash → zkLTC conversion re-enabled (rate retuning)
- [ ] Coin Catch (second arcade game, already wired in core logic)
- [ ] Mainnet migration

---

## 🤝 Community

- **X**: [@LitDeXApp](https://x.com/LitDeXApp)
- **Telegram Group**: [@litdex_discussion](https://t.me/litdex_discussion)
- **Telegram Channel**: [@litdex_app](https://t.me/litdex_app)

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built with ❤️ on **LiteForge** for the **LiteForge Hackathon**.

</div>
