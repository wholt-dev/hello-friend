# Contracts

All LitDEX contracts on the LiteForge chain (4441). Verified on the [explorer](https://liteforge.explorer.caldera.xyz).

## Core

| Contract | Address |
| --- | --- |
| `PointsSystem` | `0x526B0629C81d3314929dB8166372F792F3da3419` |
| `DailyCheckin` | `0xDdE6F0ee964A9fdF71CDB2cBDF1e5E44263d3825` |
| `LitDeXNFT` | `0x59df2d661eb6F5fb97a694E1D2e4D17e2A7b7D15` |
| `LitDeXDeployer` | (see app — auto-routed) |

## Hub

| Contract | Address |
| --- | --- |
| `Messenger` | `0x9624FBBD6931b9D75961994E13604c1DC2c56225` |
| `Marketplace` | `0x191678312D1d95eF2A05DfCEEa5401b6c654385E` |
| `Posts` | (see Hub backend) |
| `Registry` | (see Hub backend) |

## Routers

| Router | Address | Use |
| --- | --- | --- |
| LiteSwap V2 (LitDEX) | (see app) | Native AMM |
| OmniFun | (see app) | Partner AMM |

## Read endpoints (cheat sheet)

```javascript
// Points balance
PointsSystem.getPoints(wallet) → (total, deployDaily, msgDaily)

// NFT inventory
LitDeXNFT.getUserNFTs(wallet) → [{ nftType, lastClaimDay }]

// Pending NFT yield
LitDeXNFT.getPendingRewards(wallet) → (zkltc, usdc, ldex)

// Daily check-in
DailyCheckin.hasCheckedInToday(wallet) → bool
DailyCheckin.streakOf(wallet) → uint
```

## API endpoints

| Path | Returns |
| --- | --- |
| `https://api.test-hub.xyz/points/:wallet` | `{ total, daily }` |
| `https://api.test-hub.xyz/faucet/enabled` | `{ enabled }` |
| `https://api.test-hub.xyz/faucet/eligibility/:wallet` | `{ eligible, nft, domain }` |
| `https://api.test-hub.xyz/msg/count/:wallet` | `{ msgsToday }` |
| `https://hub.test-hub.xyz/hub/names/owned/:wallet` | `{ names: [...] }` |
| `https://game.test-hub.xyz/simple/leaderboard` | weekly leaderboard rows |
| `https://game.test-hub.xyz/simple/pending/:wallet` | `{ gamesPending, totalScore, pointsAvailable }` |

## Network

| Field | Value |
| --- | --- |
| Chain | LiteForge |
| Chain ID | 4441 (`0x115D`) |
| RPC | `https://liteforge.rpc.caldera.xyz/http` |
| Explorer | `https://liteforge.explorer.caldera.xyz` |
| Native | zkLTC |

## Source

The frontend's `src/lib/litdex-core-logic.ts` is a single-file export of all addresses, ABIs, and helpers. Read it for the canonical reference.

> All contracts are testnet. Mainnet addresses will be published when LitDEX migrates from LiteForge testnet to its production chain.
