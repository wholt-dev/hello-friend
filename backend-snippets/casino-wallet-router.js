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

module.exports = function createRouter({ db, txq }) {
  const cw = require('./casino-wallet');
  cw.init({ db, txq });

  const router = express.Router();

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
      const result = await cw.deposit(w, amount);
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      console.error('[/casino/deposit]', e.message);
      res.status(500).json({ error: 'deposit_failed' });
    }
  });

  router.post('/withdraw', async (req, res) => {
    try {
      const { wallet, amount } = req.body || {};
      const w = String(wallet || '').toLowerCase();
      if (!w.match(/^0x[a-f0-9]{40}$/)) return res.status(400).json({ error: 'bad_wallet' });
      const result = await cw.withdraw(w, amount);
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      console.error('[/casino/withdraw]', e.message);
      res.status(500).json({ error: 'withdraw_failed' });
    }
  });

  return router;
};
