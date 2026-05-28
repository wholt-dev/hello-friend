# Backend Snippets

Reference backend code for the litdex-hub VPS (`/root/litvm-dex/game-server/`).

These files are **not used by the frontend repo** — they are paste-ready
references to deploy alongside `mathslash_simple.js` on the game server.

## Files

| File | Drop into | Purpose |
|------|-----------|---------|
| `pumpdump.js` | `/root/litvm-dex/game-server/pumpdump.js` | Backend route for the Pump or Dump game (mounted under `/pumpdump`) |

## Pump or Dump — quick deploy

On the VPS (`ubuntu-8gb-hel1-1` or wherever litdex-game pm2 runs):

```bash
# 1. Pull the route file straight from this repo
curl -fsSL https://raw.githubusercontent.com/0xDarkSeidBull/litdex/main/backend-snippets/pumpdump.js \
  -o /root/litvm-dex/game-server/pumpdump.js

# 2. Mount it in server.js (one-shot sed insert after the existing /simple mount)
sed -i "/app.use('\/simple', simpleGame);/a const pumpdump = require('.\/pumpdump');\napp.use('\/pumpdump', pumpdump);" \
  /root/litvm-dex/game-server/server.js

# Confirm the two new lines landed (should print 4 lines total):
grep -nE "simpleGame|pumpdump" /root/litvm-dex/game-server/server.js

# 3. Add the anti-bot signing pepper to the project .env
echo "" >> /root/litvm-dex/.env
echo "PUMPDUMP_PEPPER=$(openssl rand -hex 32)" >> /root/litvm-dex/.env

# 4. Restart the litdex-game pm2 process
pm2 restart litdex-game

# 5. Watch logs for any errors
pm2 logs litdex-game --lines 30 --nostream
```

## Smoke test

```bash
WALLET=0xYOUR_TEST_WALLET_LOWERCASE
PORT=$(pm2 show litdex-game | grep -oE 'port: [0-9]+' | head -1 | awk '{print $2}')
PORT=${PORT:-3001}

echo "=== STATS ==="
curl -s http://localhost:$PORT/pumpdump/stats/$WALLET | python3 -m json.tool

echo "=== CHALLENGE ==="
curl -s -X POST http://localhost:$PORT/pumpdump/challenge \
  -H "Content-Type: application/json" \
  -d "{\"wallet\":\"$WALLET\",\"fingerprint\":\"abc\"}" | python3 -m json.tool

echo "=== START (skip PoW for first test) ==="
curl -s -X POST http://localhost:$PORT/pumpdump/start \
  -H "Content-Type: application/json" \
  -d "{\"wallet\":\"$WALLET\",\"fingerprint\":\"abc\"}" | python3 -m json.tool
```

Expected:

- `STATS` → JSON with `gamesLeft: 5`, `entryCost: 100`, `increment: 10`, etc.
- `CHALLENGE` → `{ challenge: "...", difficulty: 4 }`
- `START` → JSON with `sessionId`, `token`, `candles[]` (8 candles), `pot: 100`

## How it integrates

- DB: same `simple_game.db` as math-slash (separate `pumpdump_*` tables)
- Wallet: same `process.env.PRIVATE_KEY` for on-chain credit signing
- On-chain credit: same `PointsSystem.recordQuestFor(user, pts, questId)` as math-slash
- Daily limit: 5 games / day per wallet (matches math-slash)
- Entry cost: 100 PTS pot start (virtual — not actually deducted on-chain;
  net credit on cashout = `pot - 100`, no credit on wrong)

## Anti-bot stack

| Layer | What it does |
|-------|--------------|
| PoW challenge | 4-bit SHA256 prefix, ~50-200ms human cost, blocks naive bots |
| Reaction-time analysis | flags <150ms decisions, low std-dev, uniform timing |
| Pointer entropy | flags low (unique-coords / events) ratio over a session |
| Server-authoritative outcome | client never sees next candle direction before submitting guess |
| HMAC session token | 5-min TTL, signed with `PUMPDUMP_PEPPER` from `.env` |
| 24h soft ban | wallet flagged with severity ≥ 60 is rejected for 24h |

## Provably-fair audit

After cashout, `/pumpdump/cashout` reveals `serverSeed` and the user can
recompute every candle from `HMAC(serverSeed, sessionId:nonce)`.
`GET /pumpdump/verify/:sessionId` returns the full session log for offline
verification.

## Frontend

The browser game lives at `/public/games/pump-or-dump.html` (in this repo)
and is iframe-mounted by `PumpDumpPage` in `src/App.tsx`.
URL pattern when launched from the lobby:

```
/games/pump-or-dump.html?wallet=<addr>&autostart=1
```

The game falls back to a free **DEMO mode** if the backend is unreachable,
so the frontend ships fully playable even before the route is deployed.
