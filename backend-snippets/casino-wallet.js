/* eslint-disable no-console */
//
// LitDeX Casino Wallet — off-chain balance ledger with on-chain
// deposit/withdraw rails.
//
// Why:
//   - Six casino games each calling spendPoints() / recordQuestFor() on
//     every start and end is a nonce-collision nightmare under load.
//   - With this module, users move points ONCE into a casino balance,
//     then play freely (DB-only debits/credits at game time), and
//     withdraw whenever they want.
//
// Schema (created lazily on first init):
//   casino_balance(wallet TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0,
//                  total_deposited INTEGER NOT NULL DEFAULT 0,
//                  total_withdrawn INTEGER NOT NULL DEFAULT 0)
//   casino_ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,
//                 wallet TEXT NOT NULL, delta INTEGER NOT NULL,
//                 reason TEXT NOT NULL, ref TEXT, tx_hash TEXT, ts INTEGER NOT NULL)
//
// Public API:
//   const cw = require('./casino-wallet');
//   cw.init({ db, txq });                    // share an opened SQLite + casino-tx
//   cw.balance(wallet)                       -> integer points
//   cw.spend(wallet, amount, reason, ref)    -> boolean (atomic)
//   cw.credit(wallet, amount, reason, ref)   -> boolean (atomic)
//   await cw.deposit(wallet, amount)         -> { ok, txHash }  (on-chain → casino)
//   await cw.withdraw(wallet, amount)        -> { ok, txHash }  (casino → on-chain)
//

const STAKE_MULTIPLE = 5;          // user must deposit/withdraw in multiples of 5
const MIN_DEPOSIT    = 5;
const MAX_DEPOSIT    = 1_000_000;  // sanity cap per call
const MIN_WITHDRAW   = 5;

let _db = null;
let _txq = null;
let _initialised = false;

function init({ db, txq }) {
  if (_initialised) return;
  _db = db;
  _txq = txq;
  _db.exec(`
    CREATE TABLE IF NOT EXISTS casino_balance (
      wallet           TEXT PRIMARY KEY,
      balance          INTEGER NOT NULL DEFAULT 0,
      total_deposited  INTEGER NOT NULL DEFAULT 0,
      total_withdrawn  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS casino_ledger (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet    TEXT NOT NULL,
      delta     INTEGER NOT NULL,
      reason    TEXT NOT NULL,
      ref       TEXT,
      tx_hash   TEXT,
      ts        INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_casino_ledger_wallet ON casino_ledger(wallet);
  `);
  _initialised = true;
}

function balance(wallet) {
  const w = String(wallet).toLowerCase();
  const r = _db.prepare('SELECT balance FROM casino_balance WHERE wallet = ?').get(w);
  return r ? Number(r.balance) : 0;
}

function _logLedger(wallet, delta, reason, ref, txHash) {
  _db.prepare(
    'INSERT INTO casino_ledger (wallet, delta, reason, ref, tx_hash, ts) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(String(wallet).toLowerCase(), Number(delta), String(reason), ref || null, txHash || null, Date.now());
}

// Atomic spend. Returns true if it went through, false if insufficient.
function spend(wallet, amount, reason, ref) {
  const w = String(wallet).toLowerCase();
  const amt = Math.floor(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) return false;
  const tx = _db.transaction(() => {
    const cur = _db.prepare('SELECT balance FROM casino_balance WHERE wallet = ?').get(w);
    const have = cur ? Number(cur.balance) : 0;
    if (have < amt) return false;
    _db.prepare(
      'UPDATE casino_balance SET balance = balance - ? WHERE wallet = ?'
    ).run(amt, w);
    _logLedger(w, -amt, reason || 'spend', ref || null, null);
    return true;
  });
  return tx();
}

// Atomic credit (game payout, refund, etc.).
function credit(wallet, amount, reason, ref) {
  const w = String(wallet).toLowerCase();
  const amt = Math.floor(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) return false;
  const tx = _db.transaction(() => {
    _db.prepare(`
      INSERT INTO casino_balance (wallet, balance) VALUES (?, ?)
      ON CONFLICT(wallet) DO UPDATE SET balance = balance + excluded.balance
    `).run(w, amt);
    _logLedger(w, amt, reason || 'credit', ref || null, null);
    return true;
  });
  return tx();
}

// Move points from on-chain → casino balance.
async function deposit(wallet, amount) {
  const w = String(wallet).toLowerCase();
  const amt = Math.floor(Number(amount));
  if (!Number.isFinite(amt)) return { ok: false, error: 'bad_amount' };
  if (amt < MIN_DEPOSIT)        return { ok: false, error: `min_deposit_${MIN_DEPOSIT}` };
  if (amt > MAX_DEPOSIT)        return { ok: false, error: `max_deposit_${MAX_DEPOSIT}` };
  if (amt % STAKE_MULTIPLE)     return { ok: false, error: `must_be_multiple_of_${STAKE_MULTIPLE}` };

  // Burn the user's on-chain points first. If the broadcast fails, no
  // casino credit happens.
  const txHash = await _txq.send('spendPoints', [w, BigInt(amt)]);
  if (!txHash) return { ok: false, error: 'on_chain_burn_failed' };

  const tx = _db.transaction(() => {
    _db.prepare(`
      INSERT INTO casino_balance (wallet, balance, total_deposited)
      VALUES (?, ?, ?)
      ON CONFLICT(wallet) DO UPDATE SET
        balance = balance + excluded.balance,
        total_deposited = total_deposited + excluded.total_deposited
    `).run(w, amt, amt);
    _logLedger(w, amt, 'deposit', null, txHash);
  });
  tx();
  return { ok: true, txHash, balance: balance(w) };
}

// Move points casino → on-chain.
async function withdraw(wallet, amount) {
  const w = String(wallet).toLowerCase();
  const amt = Math.floor(Number(amount));
  if (!Number.isFinite(amt)) return { ok: false, error: 'bad_amount' };
  if (amt < MIN_WITHDRAW)       return { ok: false, error: `min_withdraw_${MIN_WITHDRAW}` };
  if (amt % STAKE_MULTIPLE)     return { ok: false, error: `must_be_multiple_of_${STAKE_MULTIPLE}` };

  // Reserve the amount atomically, then emit the on-chain mint. If the
  // broadcast fails we restore the balance.
  const reserved = _db.transaction(() => {
    const cur = _db.prepare('SELECT balance FROM casino_balance WHERE wallet = ?').get(w);
    const have = cur ? Number(cur.balance) : 0;
    if (have < amt) return false;
    _db.prepare('UPDATE casino_balance SET balance = balance - ? WHERE wallet = ?').run(amt, w);
    return true;
  })();
  if (!reserved) return { ok: false, error: 'insufficient' };

  const ref = `wd_${Date.now()}_${w.slice(-6)}`;
  const txHash = await _txq.send('recordQuestFor', [w, BigInt(amt), ref]);
  if (!txHash) {
    _db.prepare('UPDATE casino_balance SET balance = balance + ? WHERE wallet = ?').run(amt, w);
    return { ok: false, error: 'on_chain_mint_failed' };
  }

  _db.transaction(() => {
    _db.prepare(`
      UPDATE casino_balance SET total_withdrawn = total_withdrawn + ? WHERE wallet = ?
    `).run(amt, w);
    _logLedger(w, -amt, 'withdraw', ref, txHash);
  })();
  return { ok: true, txHash, balance: balance(w) };
}

function ledger(wallet, limit) {
  const w = String(wallet).toLowerCase();
  const lim = Math.max(1, Math.min(100, Math.floor(Number(limit) || 25)));
  return _db.prepare(
    'SELECT delta, reason, ref, tx_hash, ts FROM casino_ledger WHERE wallet = ? ORDER BY id DESC LIMIT ?'
  ).all(w, lim);
}

function summary(wallet) {
  const w = String(wallet).toLowerCase();
  const r = _db.prepare(
    'SELECT balance, total_deposited, total_withdrawn FROM casino_balance WHERE wallet = ?'
  ).get(w);
  return {
    balance: r ? Number(r.balance) : 0,
    totalDeposited: r ? Number(r.total_deposited) : 0,
    totalWithdrawn: r ? Number(r.total_withdrawn) : 0,
  };
}

module.exports = {
  init, balance, spend, credit, deposit, withdraw, ledger, summary,
  MIN_DEPOSIT, MAX_DEPOSIT, MIN_WITHDRAW, STAKE_MULTIPLE,
};
