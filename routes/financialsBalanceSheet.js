'use strict';

const { buildBalanceSheetFromGl } = require('../lib/finBalanceSheetGl');
const ensureFinAccountingSchema = require('../lib/ensureFinAccountingSchema');

module.exports = function registerFinancialsBalanceSheet(app, pool, requireAuth, requirePerm) {
  app.get(
    '/financials/balance-sheet',
    requireAuth,
    requirePerm('accounting.read', 'accounting.write', 'financials.read', 'financials.write'),
    async (req, res) => {
      await ensureFinAccountingSchema(pool);
      const asof = String(req.query.asof || '').trim() || new Date().toISOString().split('T')[0];
      const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
      const { balanceSheetPayload } = require('../lib/finReactPayloads');
      const result = await buildBalanceSheetFromGl(pool, fid, asof);

      res.render('financials-balance-sheet', {
        title: 'Balance Sheet — ZAIZENS',
        ...balanceSheetPayload({
          asof,
          byClass: result.byClass,
          glOk: result.ok,
          glMessage: result.message || null,
          flash: req.query.msg || null,
          error: req.query.err || null,
        }),
      });
    }
  );
};
