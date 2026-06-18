/**
 * Accounts payable (expense detail) — parity with htdocs_php/htdocs/financials-accounts-payable.php.
 */
const { formatXaf, isoDate } = require('../lib/hmsFinGeneralLedger');
const { finApTableOk, finApDetailExpenseRows } = require('../lib/hmsFinAccountsPayable');

function facilityId(req) {
 return Math.max(1, parseInt(req.session.facilityId, 10) || 1);
}

module.exports = function registerFinancialsAccountsPayable(app, pool, requireAuth, requirePerm) {
 const finRead = requirePerm('accounting.read', 'accounting.write', 'financials.read', 'financials.write');

 app.get('/financials/accounts-payable', requireAuth, finRead, async (req, res) => {
  try {
   let d1 = String(req.query.d1 || '').trim();
   let d2 = String(req.query.d2 || '').trim();
   if (!isoDate(d1)) d1 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
   if (!isoDate(d2)) d2 = new Date().toISOString().slice(0, 10);
   const fid = facilityId(req);

   const apOk = await finApTableOk(pool);
   let pack = { ok: false, rows: [], sumAp: 0, queryError: '' };
   if (apOk) {
    pack = await finApDetailExpenseRows(pool, fid, d1, d2);
   }

   const reportDate = new Date().toISOString().slice(0, 10);
   const reportRef = `APD-${d2.replace(/-/g, '')}`;
   const { formatPeriodRange } = require('../lib/hmsFormatDate');
   const periodDisplay = formatPeriodRange(d1, d2);

   const { apPayload } = require('../lib/finReactPayloads');
   res.render('financials-accounts-payable', {
    title: 'Accounts payable — detail - ZAIZENS',
    ...apPayload({
     periodDisplay,
     apRows: pack.rows,
     sumAp: pack.sumAp,
     queryError: pack.queryError,
     flash: req.query.msg || null,
     error: req.query.err || null,
    }),
   });
  } catch (err) {
   console.error('FINANCIALS AP:', err.message);
   res.status(500).render('error', { title: 'Error', message: err.message, status: 500 });
  }
 });
};
