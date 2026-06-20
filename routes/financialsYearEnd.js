/**
 * Year-end reporting — parity with htdocs_php/htdocs/financials-year-end.php.
 */
const { formatXaf } = require('../lib/hmsFinGeneralLedger');
const { finYearEndReport } = require('../lib/hmsFinYearEnd');
const ensureFinAccountingSchema = require('../lib/ensureFinAccountingSchema');
const { fiscalYearStatus } = require('../lib/finFiscalClose');

function facilityId(req) {
 return Math.max(1, parseInt(req.session.facilityId, 10) || 1);
}

module.exports = function registerFinancialsYearEnd(app, pool, requireAuth, requirePerm) {
 const finRead = requirePerm('accounting.read', 'accounting.write', 'financials.read', 'financials.write');

 app.get('/financials/year-end', requireAuth, finRead, async (req, res) => {
  try {
   await ensureFinAccountingSchema(pool).catch(() => {});
   const fid = facilityId(req);
   const data = await finYearEndReport(pool, fid, req.query.y);
   const fiscalYear = parseInt(String(req.query.y || data.y || new Date().getFullYear()), 10);
   const fyStatus = await fiscalYearStatus(pool, fid, fiscalYear);

   const { yearEndPayload } = require('../lib/finReactPayloads');
   res.render('financials-year-end', {
    title: 'Profit & Loss Year End - ZAIZENS',
    ...yearEndPayload({
     ...data,
     fiscalYear,
     fiscalYearStatus: fyStatus.status || 'open',
     flash: req.query.msg || null,
     error: req.query.err || null,
    }),
   });
  } catch (err) {
   console.error('FINANCIALS YEAR END:', err.message);
   res.status(500).render('error', { title: 'Error', message: err.message, status: 500 });
  }
 });
};
