/**
 * Treasury & bank overview — PHP financials.php section 2 (bank rec + cash flow; no separate treasury PHP page).
 */
const { formatXaf, isoDate } = require('../lib/hmsFinGeneralLedger');
const { finTreasuryOverview } = require('../lib/hmsFinTreasury');
const ensureFinJournal019 = require('../lib/ensureFinJournal019');

function facilityId(req) {
 return Math.max(1, parseInt(req.session.facilityId, 10) || 1);
}

module.exports = function registerFinancialsTreasury(app, pool, requireAuth, requirePerm) {
 const finRead = requirePerm('accounting.read', 'accounting.write', 'financials.read', 'financials.write');

 app.get('/financials/treasury', requireAuth, finRead, async (req, res) => {
  try {
   await ensureFinJournal019(pool).catch(() => {});
   const fid = facilityId(req);
   let asof = String(req.query.asof || '').trim();
   let d1 = String(req.query.d1 || '').trim();
   let d2 = String(req.query.d2 || '').trim();
   const now = new Date();
   if (!isoDate(asof)) asof = now.toISOString().slice(0, 10);
   if (!isoDate(d2)) d2 = asof;
   if (!isoDate(d1)) {
    d1 = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
   }
   if (d1 > d2) {
    const t = d1;
    d1 = d2;
    d2 = t;
   }

   const includeZero = req.query.all === '1';
   const data = await finTreasuryOverview(pool, fid, { asof, d1, d2, includeZero });
   const reportDate = new Date().toISOString().slice(0, 10);
   const reportRef = `TR-${asof.replace(/-/g, '')}`;

   const { treasuryPayload } = require('../lib/finReactPayloads');
   res.render('financials-treasury', {
    title: 'Treasury & bank - ZAIZENS',
    ...treasuryPayload({
     ...data,
     flash: req.query.msg || null,
     error: req.query.err || null,
    }),
   });
  } catch (err) {
   console.error('FINANCIALS TREASURY:', err.message);
   res.status(500).render('error', { title: 'Error', message: err.message, status: 500 });
  }
 });
};
