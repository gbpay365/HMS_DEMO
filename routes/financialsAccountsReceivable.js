/**
 * Accounts receivable (detail as-at) — parity with htdocs_php/htdocs/financials-accounts-receivable.php.
 */
const { formatXaf, isoDate } = require('../lib/hmsFinGeneralLedger');
const { finArBaseTablesOk, finArDetailLedgerAsOf } = require('../lib/hmsFinAccountsReceivable');

function facilityId(req) {
 return Math.max(1, parseInt(req.session.facilityId, 10) || 1);
}

module.exports = function registerFinancialsAccountsReceivable(app, pool, requireAuth, requirePerm) {
 const finRead = requirePerm('accounting.read', 'accounting.write', 'financials.read', 'financials.write');

 app.get('/financials/accounts-receivable', requireAuth, finRead, async (req, res) => {
  try {
   let asof = String(req.query.asof || '').trim();
   if (!isoDate(asof)) asof = new Date().toISOString().slice(0, 10);
   const fid = facilityId(req);
   const arOk = await finArBaseTablesOk(pool);
   let data = {
    chargeSource: null,
    rows: [],
    sumGross: 0,
    sumPaid: 0,
    sumAdj: 0,
    sumNet: 0,
    queryError: ''
   };
   if (arOk) {
    data = await finArDetailLedgerAsOf(pool, fid, asof);
   }

   const reportDate = new Date().toISOString().slice(0, 10);
   const reportRef = `ARD-${asof.replace(/-/g, '')}`;
   const { formatDisplayDate } = require('../lib/hmsFormatDate');
   const asofDisplay = formatDisplayDate(asof);

   const { arPayload } = require('../lib/finReactPayloads');
   res.render('financials-accounts-receivable', {
    title: 'Accounts receivable — detail - ZAIZENS',
    ...arPayload({
     asof,
     asofDisplay,
     arRows: data.rows,
     sumGross: data.sumGross,
     sumPaid: data.sumPaid,
     sumAdj: data.sumAdj,
     sumNet: data.sumNet,
     queryError: data.queryError,
     flash: req.query.msg || null,
     error: req.query.err || null,
    }),
   });
  } catch (err) {
   console.error('FINANCIALS AR:', err.message);
   res.status(500).render('error', { title: 'Error', message: err.message, status: 500 });
  }
 });
};
