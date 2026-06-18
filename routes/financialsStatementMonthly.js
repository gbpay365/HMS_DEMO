/**
 * Monthly financial statement — parity with htdocs_php/htdocs/financials-statement-monthly.php.
 */
const { formatXaf } = require('../lib/hmsFinGeneralLedger');
const { finMonthlyReviewStatement } = require('../lib/hmsFinStatementMonthly');
const ensureFinJournal019 = require('../lib/ensureFinJournal019');

function facilityId(req) {
 return Math.max(1, parseInt(req.session.facilityId, 10) || 1);
}

module.exports = function registerFinancialsStatementMonthly(app, pool, requireAuth, requirePerm) {
 const finRead = requirePerm('accounting.read', 'accounting.write', 'financials.read', 'financials.write');

 app.get('/financials/statement-monthly', requireAuth, finRead, async (req, res) => {
  try {
   await ensureFinJournal019(pool).catch(() => {});
   const fid = facilityId(req);
   const data = await finMonthlyReviewStatement(pool, fid, req.query.y, req.query.m);
   const reportDate = new Date().toISOString().slice(0, 10);

   const { statementMonthlyPayload } = require('../lib/finReactPayloads');
   res.render('financials-statement-monthly', {
    title: 'Monthly Review - ZAIZENS',
    ...statementMonthlyPayload({
     ...data,
     flash: req.query.msg || null,
     error: req.query.err || null,
    }),
   });
  } catch (err) {
   console.error('FINANCIALS STATEMENT MONTHLY:', err.message);
   res.status(500).render('error', { title: 'Error', message: err.message, status: 500 });
  }
 });
};
