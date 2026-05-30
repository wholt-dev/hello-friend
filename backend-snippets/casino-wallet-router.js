/* eslint-disable no-console */
//
// HTTP router for the casino-wallet module.
//
// Mount this on the games server with a prefix:
//   const cwRouter = require('./casino-wallet-router')({ db, txq });
//   app.use('/casino', cwRouter);
//
// Endpoints:
//   GET  /casino/balance/:wallet    -> { balance, totalDeposited, totalWithdrawn }
//   GET  /casino/ledger/:wallet     -> { ledger: [{delta,reason,ref,tx_hash,ts}, ...] }
//   POST /casino/deposit            { wallet, amount } -> { ok, txHash, balance }
//   POST /casino/withdraw           { wallet, amount } -> { ok, txHash, balance }

const express = require('express');

const ALLOWED_ORIGINS = [
  'https://litdex.test-hub.xyz',
  'https://litdex-darkseidbulls-projects.vercel.app',
  'https://litdex.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin || '';
  // Allow any vercel preview subdomain too.
  const isVercelPreview = /^https:\/\/litdex(-[a-z0-9-]+)?\.vercel\.app$/.test(origin);
  if (ALLOWED_ORIGINS.includes(origin) || isVercelPreview) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    // Permissive fallback for direct API consumers (curl, etc.).
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
}

module.exports = function createRouter({ db, txq }) {
  const cw = require('./casino-wallet');
  cw.init({ db, txq });

  const router = express.Router();
  router.use(corsMiddleware);
  // Self-contained JSON body parsing so this router works regardless of
  // where it is mounted relative to the global express.json() middleware.
  router.use(express.json());

  router.get('/balance/:wallet', (req, res) => {
    try {
      const w = String(req.params.wallet || '').toLowerCase();
      if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });
      res.json(cw.summary(w));
    } catch (e) {
      console.error('[/casino/balance]', e.message);
      res.status(500).json({ error: 'balance_failed' });
    }
  });

  router.get('/ledger/:wallet', (req, res) => {
    try {
      const w = String(req.params.wallet || '').toLowerCase();
      if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });
      res.json({ ledger: cw.ledger(w, req.query.limit) });
    } catch (e) {
      console.error('[/casino/ledger]', e.message);
      res.status(500).json({ error: 'ledger_failed' });
    }
  });

  router.post('/deposit', async (req, res) => {
    try {
      const { wallet, amount } = req.body || {};
      const w = String(wallet || '').toLowerCase();
      if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });
      console.log(`[/casino/deposit] wallet=${w} amount=${amount}`);
      const result = await cw.deposit(w, amount);
      if (!result.ok) {
        console.log(`[/casino/deposit] failed: ${result.error}`);
        return res.status(400).json(result);
      }
      console.log(`[/casino/deposit] ok tx=${result.txHash} balance=${result.balance}`);
      res.json(result);
    } catch (e) {
      console.error('[/casino/deposit]', e.message, e.stack);
      res.status(500).json({ error: 'deposit_failed', detail: e.message });
    }
  });

  router.post('/withdraw', async (req, res) => {
    try {
      const { wallet, amount } = req.body || {};
      const w = String(wallet || '').toLowerCase();
      if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });
      console.log(`[/casino/withdraw] wallet=${w} amount=${amount}`);
      const result = await cw.withdraw(w, amount);
      if (!result.ok) {
        console.log(`[/casino/withdraw] failed: ${result.error}`);
        return res.status(400).json(result);
      }
      console.log(`[/casino/withdraw] ok tx=${result.txHash} balance=${result.balance}`);
      res.json(result);
    } catch (e) {
      console.error('[/casino/withdraw]', e.message, e.stack);
      res.status(500).json({ error: 'withdraw_failed', detail: e.message });
    }
  });

  return router;
};
