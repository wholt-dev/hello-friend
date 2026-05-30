// ════════════════════════════════════════════════════════════════
//  LITDEX MONTH STATS — pure SQLite + filesystem introspection
//  Works even when the Caldera RPC is down because every quest,
//  message, mint, deploy, game session, and ledger entry is also
//  written to local SQLite as it happens.
//
//  Run on EACH server:
//    games server (37.27.10.231):
//      node /tmp/stats.js > /tmp/games-stats.txt
//    hub server (vmi3299842):
//      node /tmp/stats.js > /tmp/hub-stats.txt
//
//  Either pipe the file back here or just paste the printed
//  output. Output is plain text suitable for an X/Twitter thread.
//
//  Install:
//    wget -O /tmp/stats.js \
//      "https://raw.githubusercontent.com/0xDarkSeidBull/litdex/feat/casino-three/backend-snippets/litdex-month-stats.js"
//    node /tmp/stats.js
// ════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

let Database;
try { Database = require('better-sqlite3'); }
catch { console.error('better-sqlite3 not installed in this dir; run from /root/litvm-dex/game-server or /root/litdex-hub'); process.exit(1); }

// Find candidate DB files in common locations.
const CANDIDATE_DIRS = [
  '/root/litvm-dex/game-server',
  '/root/litvm-dex/twitter-auth',
  '/root/litvm-dex/scripts',
  '/root/litdex-hub',
  process.cwd(),
];
function findDbs() {
  const out = new Set();
  for (const d of CANDIDATE_DIRS) {
    try {
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) {
        if (f.endsWith('.db') || f.endsWith('.sqlite')) out.add(path.join(d, f));
      }
    } catch {}
  }
  return [...out];
}

function safeQuery(db, sql, ...params) {
  try { return db.prepare(sql).all(...params); }
  catch (e) { return null; }
}
function safeOne(db, sql, ...params) {
  try { return db.prepare(sql).get(...params); }
  catch (e) { return null; }
}
function tablesIn(db) {
  const rows = safeQuery(db, "SELECT name FROM sqlite_master WHERE type='table'") || [];
  return rows.map((r) => r.name);
}
function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
function fmtNum(n) {
  if (n == null) return '—';
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString('en-IN');
}

// Big bag for all collected metrics.
const STATS = {
  scope: 'unknown',
  uniqueWallets: new Set(),
  byCategory: {},
  rawTables: {},
};

function addCat(cat, key, val) {
  STATS.byCategory[cat] = STATS.byCategory[cat] || {};
  STATS.byCategory[cat][key] = val;
}

function pullGameDb(db) {
  STATS.scope = 'games-server';
  const T = new Set(tablesIn(db));
  const has = (t) => T.has(t);
  const distinctWallets = (col, table) => {
    const r = safeOne(db, `SELECT COUNT(DISTINCT ${col}) AS n FROM ${table}`);
    return r ? Number(r.n || 0) : 0;
  };

  // Math Slash (simple_*)
  if (has('game_rewards')) {
    const totalScore = safeOne(db, 'SELECT COALESCE(SUM(score), 0) AS s FROM game_rewards');
    const totalGames = safeOne(db, 'SELECT COUNT(*) AS n FROM game_rewards');
    const totalClaimed = safeOne(db, "SELECT COUNT(*) AS n FROM game_rewards WHERE claimed = 1");
    const players = distinctWallets('wallet', 'game_rewards');
    addCat('Math Slash', 'Total games played', fmtNum(totalGames?.n));
    addCat('Math Slash', 'Total score',       fmtNum(totalScore?.s));
    addCat('Math Slash', 'Claimed sessions',  fmtNum(totalClaimed?.n));
    addCat('Math Slash', 'Unique players',    fmtNum(players));
  }

  // Pump or Dump
  if (has('pumpdump_sessions')) {
    const sess = safeOne(db, 'SELECT COUNT(*) AS n FROM pumpdump_sessions');
    const players = distinctWallets('wallet', 'pumpdump_sessions');
    const cashout = safeOne(db, "SELECT COALESCE(SUM(delta), 0) AS s, COUNT(*) AS n FROM pumpdump_ledger WHERE reason = 'cashout' AND delta > 0");
    addCat('Pump or Dump', 'Sessions',         fmtNum(sess?.n));
    addCat('Pump or Dump', 'Unique players',   fmtNum(players));
    addCat('Pump or Dump', 'Pts paid out',     fmtNum(cashout?.s));
    addCat('Pump or Dump', 'Cashout count',    fmtNum(cashout?.n));
  }

  // Lit Tower
  if (has('littower_sessions')) {
    const sess = safeOne(db, 'SELECT COUNT(*) AS n FROM littower_sessions');
    const players = distinctWallets('wallet', 'littower_sessions');
    const total = safeOne(db, "SELECT COALESCE(SUM(delta), 0) AS s FROM littower_ledger WHERE reason = 'reward'");
    addCat('Lit Tower', 'Sessions',         fmtNum(sess?.n));
    addCat('Lit Tower', 'Unique players',   fmtNum(players));
    addCat('Lit Tower', 'Pts minted',       fmtNum(total?.s));
  }

  // ZK Miner
  if (has('zkminer_sessions')) {
    const sess = safeOne(db, 'SELECT COUNT(*) AS n FROM zkminer_sessions');
    const players = distinctWallets('wallet', 'zkminer_sessions');
    const total = safeOne(db, "SELECT COALESCE(SUM(delta), 0) AS s FROM zkminer_ledger WHERE reason = 'reward'");
    addCat('ZK Miner', 'Sessions',          fmtNum(sess?.n));
    addCat('ZK Miner', 'Unique players',    fmtNum(players));
    addCat('ZK Miner', 'Pts minted',        fmtNum(total?.s));
  }

  // Lit Launch
  if (has('litlaunch_sessions')) {
    const sess = safeOne(db, 'SELECT COUNT(*) AS n FROM litlaunch_sessions');
    const players = distinctWallets('wallet', 'litlaunch_sessions');
    const total = safeOne(db, "SELECT COALESCE(SUM(delta), 0) AS s FROM litlaunch_ledger WHERE reason = 'reward'");
    addCat('Lit Launch', 'Sessions',        fmtNum(sess?.n));
    addCat('Lit Launch', 'Unique players',  fmtNum(players));
    addCat('Lit Launch', 'Pts minted',      fmtNum(total?.s));
  }

  // Block Chain
  if (has('blockchain_sessions')) {
    const sess = safeOne(db, 'SELECT COUNT(*) AS n FROM blockchain_sessions');
    const players = distinctWallets('wallet', 'blockchain_sessions');
    const total = safeOne(db, "SELECT COALESCE(SUM(delta), 0) AS s FROM blockchain_ledger WHERE reason = 'reward'");
    const best = safeOne(db, 'SELECT MAX(highest_tile) AS m FROM blockchain_sessions');
    addCat('Block Chain', 'Sessions',         fmtNum(sess?.n));
    addCat('Block Chain', 'Unique players',   fmtNum(players));
    addCat('Block Chain', 'Pts minted',       fmtNum(total?.s));
    addCat('Block Chain', 'Highest tile ever',fmtNum(best?.m));
  }

  // Casino: dice / limbo / mines / plinko / wheel / coinflip
  const casinos = [
    { name: 'Lit Dice',      table: 'litdice_rounds',    ledger: 'litdice_ledger' },
    { name: 'Lit Limbo',     table: 'litlimbo_rounds',   ledger: 'litlimbo_ledger' },
    { name: 'Lit Mines',     table: 'litmines_rounds',   ledger: 'litmines_ledger' },
    { name: 'Lit Plinko',    table: 'litplinko_rounds',  ledger: 'litplinko_ledger' },
    { name: 'Lit Wheel',     table: 'litwheel_rounds',   ledger: 'litwheel_ledger' },
    { name: 'Lit Coin Flip', table: 'litcoin_rounds',    ledger: 'litcoin_ledger' },
  ];
  for (const c of casinos) {
    if (!has(c.table)) continue;
    const rounds = safeOne(db, `SELECT COUNT(*) AS n FROM ${c.table}`);
    const players = distinctWallets('wallet', c.table);
    const wins = safeOne(db, `SELECT COUNT(*) AS n, COALESCE(SUM(awarded), 0) AS s FROM ${c.table} WHERE awarded > 0`);
    const losses = safeOne(db, `SELECT COUNT(*) AS n FROM ${c.table} WHERE settled = 1 AND awarded = 0`);
    const stakeBurnt = safeOne(db, `SELECT COALESCE(SUM(-delta), 0) AS s FROM ${c.ledger} WHERE reason = 'entry'`);
    addCat(c.name, 'Rounds',         fmtNum(rounds?.n));
    addCat(c.name, 'Unique players', fmtNum(players));
    addCat(c.name, 'Wins',           fmtNum(wins?.n));
    addCat(c.name, 'Losses',         fmtNum(losses?.n));
    addCat(c.name, 'Pts paid out',   fmtNum(wins?.s));
    addCat(c.name, 'Stake burnt',    fmtNum(stakeBurnt?.s));
  }

  // Faucet (game-server twitter-auth or this server)
  if (has('faucet_claims')) {
    const total = safeOne(db, 'SELECT COUNT(*) AS n FROM faucet_claims');
    const players = distinctWallets('wallet', 'faucet_claims');
    addCat('Faucet', 'Claims',          fmtNum(total?.n));
    addCat('Faucet', 'Unique wallets',  fmtNum(players));
  }
  if (has('faucet_drips')) {
    const total = safeOne(db, 'SELECT COUNT(*) AS n FROM faucet_drips');
    const players = distinctWallets('wallet', 'faucet_drips');
    addCat('Faucet', 'Drips',           fmtNum(total?.n));
    addCat('Faucet', 'Unique wallets',  fmtNum(players));
  }

  // Quest log (catch-all if exists)
  for (const t of ['quest_log', 'quests', 'check_ins', 'checkins']) {
    if (!has(t)) continue;
    const total = safeOne(db, `SELECT COUNT(*) AS n FROM ${t}`);
    addCat('Quests', `${t} rows`,  fmtNum(total?.n));
  }

  // Daily check-in
  if (has('daily_checkin')) {
    const total = safeOne(db, 'SELECT COUNT(*) AS n FROM daily_checkin');
    const players = distinctWallets('wallet', 'daily_checkin');
    addCat('Check-In', 'Total check-ins',  fmtNum(total?.n));
    addCat('Check-In', 'Unique wallets',   fmtNum(players));
  }
}

function pullHubDb(db) {
  STATS.scope = 'hub-server';
  const T = new Set(tablesIn(db));
  const has = (t) => T.has(t);
  const distinctWallets = (col, table) => {
    const r = safeOne(db, `SELECT COUNT(DISTINCT ${col}) AS n FROM ${table}`);
    return r ? Number(r.n || 0) : 0;
  };

  // Hub messenger
  for (const t of ['messages', 'messenger_messages', 'msg_log']) {
    if (!has(t)) continue;
    const total = safeOne(db, `SELECT COUNT(*) AS n FROM ${t}`);
    const cols = safeQuery(db, `PRAGMA table_info(${t})`) || [];
    const colNames = cols.map((c) => c.name.toLowerCase());
    let senderCol = colNames.find((c) => c.includes('sender') || c.includes('from')) || 'wallet';
    let recipCol  = colNames.find((c) => c.includes('recipient') || c.includes('to')) || null;
    const senders = senderCol ? distinctWallets(senderCol, t) : 0;
    addCat('Messenger', `${t} total`, fmtNum(total?.n));
    addCat('Messenger', `${t} unique senders`, fmtNum(senders));
    if (recipCol) addCat('Messenger', `${t} unique recipients`, fmtNum(distinctWallets(recipCol, t)));
  }

  // Bridge (cross-chain zkLTC)
  for (const t of ['bridge_log', 'bridges', 'cross_chain']) {
    if (!has(t)) continue;
    const total = safeOne(db, `SELECT COUNT(*) AS n FROM ${t}`);
    const players = distinctWallets('wallet', t);
    let total_eth = null;
    const cols = (safeQuery(db, `PRAGMA table_info(${t})`) || []).map((c) => c.name.toLowerCase());
    const amtCol = cols.find((c) => c === 'amount' || c === 'eth' || c === 'value' || c === 'wei');
    if (amtCol) {
      const r = safeOne(db, `SELECT COALESCE(SUM(${amtCol}), 0) AS s FROM ${t}`);
      total_eth = r ? r.s : null;
    }
    addCat('Bridge', `${t} count`,    fmtNum(total?.n));
    addCat('Bridge', `${t} wallets`,  fmtNum(players));
    if (total_eth != null) addCat('Bridge', `${t} ${amtCol}`, total_eth);
  }

  // Marketplace + .lit domain mints (NFTs)
  for (const t of ['nft_mints', 'litdex_nft', 'nft_log', 'mint_log']) {
    if (!has(t)) continue;
    const total = safeOne(db, `SELECT COUNT(*) AS n FROM ${t}`);
    const players = distinctWallets('wallet', t);
    addCat('NFTs', `${t} mints`,    fmtNum(total?.n));
    addCat('NFTs', `${t} wallets`,  fmtNum(players));
  }
  for (const t of ['lit_domains', 'lit_names', 'domain_registry']) {
    if (!has(t)) continue;
    const total = safeOne(db, `SELECT COUNT(*) AS n FROM ${t}`);
    addCat('.lit Domains', `${t} count`, fmtNum(total?.n));
  }

  // Token deploys
  for (const t of ['token_deploys', 'deploys', 'deployments']) {
    if (!has(t)) continue;
    const total = safeOne(db, `SELECT COUNT(*) AS n FROM ${t}`);
    const players = distinctWallets('wallet', t);
    addCat('Deploys', `${t} count`,   fmtNum(total?.n));
    addCat('Deploys', `${t} wallets`, fmtNum(players));
  }

  // Marketplace listings/sales
  for (const t of ['market_listings', 'market_sales', 'market']) {
    if (!has(t)) continue;
    const total = safeOne(db, `SELECT COUNT(*) AS n FROM ${t}`);
    addCat('Market', `${t} rows`, fmtNum(total?.n));
  }
}

// Auto-detect: if the DB looks game-server (has pumpdump_sessions etc) treat as games,
// if it looks hub (has messages or bridge tables) treat as hub. Could be both.
function classifyAndPull(db, dbPath) {
  const T = new Set(tablesIn(db));
  const isGames = ['pumpdump_sessions', 'littower_sessions', 'zkminer_sessions', 'litlaunch_sessions', 'blockchain_sessions', 'litdice_rounds', 'game_rewards']
    .some((t) => T.has(t));
  // Hub side: actual schema uses encrypted_messages, lit_names, posts.
  const isHub = ['encrypted_messages', 'lit_names', 'posts', 'messages', 'messenger_messages',
                 'bridge_log', 'bridges', 'nft_mints', 'token_deploys',
                 'faucet_claims', 'conversions', 'listings_cache']
    .some((t) => T.has(t));
  console.error(`[stats] inspecting ${dbPath} (games=${isGames} hub=${isHub} tables=${T.size})`);
  STATS.rawTables[dbPath] = [...T];
  if (isGames) pullGameDb(db);
  if (isHub)   pullHubDb(db);
}

function main() {
  const dbs = findDbs();
  if (dbs.length === 0) {
    console.error('No SQLite DBs found in candidate dirs. cd into the right folder before running.');
    process.exit(1);
  }
  console.error(`[stats] found ${dbs.length} DB(s): ${dbs.join(', ')}`);
  for (const p of dbs) {
    try {
      const db = new Database(p, { readonly: true });
      classifyAndPull(db, p);
      db.close();
    } catch (e) {
      console.error(`[stats] failed ${p}: ${e.message}`);
    }
  }

  // Print human-readable report.
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  LITDEX MONTH STATS — ' + new Date().toISOString().slice(0, 10));
  console.log('  Source: local SQLite (chain RPC down OK)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  for (const cat of Object.keys(STATS.byCategory).sort()) {
    console.log(`▶ ${cat}`);
    const m = STATS.byCategory[cat];
    for (const k of Object.keys(m)) {
      console.log(`    ${pad(k, 28)} ${m[k]}`);
    }
    console.log('');
  }
  console.log('───────────────────────────────────────────────────────────');
  console.log('  Tables seen per DB:');
  for (const p of Object.keys(STATS.rawTables)) {
    console.log(`    ${p}`);
    console.log(`      ${STATS.rawTables[p].join(', ')}`);
  }
  console.log('═══════════════════════════════════════════════════════════');

  // JSON dump too (easy to copy into a tweet thread compose tool).
  console.log('\nJSON:');
  console.log(JSON.stringify(STATS.byCategory, null, 2));
}

main();
