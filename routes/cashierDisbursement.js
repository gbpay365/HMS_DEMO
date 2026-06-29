'use strict';

/**
 * Cashier petty-cash disbursement — JSON API + form POST.
 */
module.exports = function registerCashierDisbursement(app, pool, requireAuth, requirePerm) {
  app.post('/api/cashier/disbursement', requireAuth, requirePerm('cashier.write'), async (req, res) => {
    try {
      const { parseDisbursementInput, executeCashierDisbursement } = require('../lib/cashierDisbursementPost');
      const input = parseDisbursementInput(req.body || {}, req.session || {});
      const result = await executeCashierDisbursement(pool, input);
      if (!result.ok && result.needsSubAccounts) {
        return res.status(422).json(result);
      }
      if (!result.ok) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (err) {
      console.error('CASHIER DISBURSEMENT API:', err.message);
      return res.status(500).json({ ok: false, error: err.message || 'Disbursement failed.' });
    }
  });

  app.post('/api/cashier/disbursement/preview', requireAuth, requirePerm('cashier.write'), async (req, res) => {
    try {
      const { parseDisbursementInput } = require('../lib/cashierDisbursementPost');
      const { previewDisbursementPostingAccounts } = require('../lib/cashierDisbursementJournal');
      const input = parseDisbursementInput(req.body || {}, req.session || {});
      const journalKind = input.glKind === 'payout' ? 'payout' : 'expense';
      const preview = await previewDisbursementPostingAccounts(pool, {
        facilityId: input.fid,
        journalKind,
        glKind: input.glKind,
        disbursementType: input.txnType,
        expenseCategory: input.category,
        paymentMethod: input.paymentMethod,
        narration: input.narration,
        amount: input.amount,
      });
      if (!preview.ok && preview.needsSubAccounts) {
        return res.status(422).json({ ok: false, ...preview });
      }
      if (!preview.ok) {
        return res.status(400).json({ ok: false, error: preview.error || 'Preview failed.' });
      }
      return res.json({ ok: true, resolved: preview.resolved });
    } catch (err) {
      console.error('CASHIER DISBURSEMENT PREVIEW:', err.message);
      return res.status(500).json({ ok: false, error: err.message || 'Preview failed.' });
    }
  });

  app.post('/cashier/disbursement', requireAuth, requirePerm('cashier.write'), async (req, res) => {
    try {
      const { parseDisbursementInput, executeCashierDisbursement } = require('../lib/cashierDisbursementPost');
      const input = parseDisbursementInput(req.body || {}, req.session || {});
      const result = await executeCashierDisbursement(pool, input);
      if (!result.ok && result.needsSubAccounts) {
        const detail = (result.missing || [])
          .map((m) => `${m.motherCode} → ${m.proposedCode}`)
          .join('; ');
        const errMsg = `${result.error || 'GL sub-accounts required.'} Missing: ${detail}`;
        return res.redirect('/cashier?err=' + encodeURIComponent(errMsg));
      }
      if (!result.ok) {
        return res.redirect('/cashier?err=' + encodeURIComponent(result.error || 'Disbursement failed.'));
      }
      return res.redirect('/cashier/ledger?msg=' + encodeURIComponent(result.message));
    } catch (err) {
      console.error('CASHIER DISBURSEMENT:', err.message);
      return res.redirect('/cashier?err=' + encodeURIComponent(err.message || 'Disbursement failed.'));
    }
  });
};
