/**
 * Cash flow statement — parity with htdocs_php/htdocs/financials-cash-flow.php.
 */
const {
 finTablesOk,
 finPlForDateRange,
 finPrefixBalanceAsOf,
 finPrefixMovementPeriod,
 finOpsFiscalReceiptsPeriod,
 finOpsTransactionsPeriod,
 formatXaf,
 isoDate
} = require('../lib/hmsFinGeneralLedger');
const ensureFinJournal019 = require('../lib/ensureFinJournal019');

function facilityId(req) {
 return Math.max(1, parseInt(req.session.facilityId, 10) || 1);
}

function dayBeforeIso(d1) {
 const d = isoDate(d1);
 if (!d) return '';
 const [y, m, day] = d.split('-').map((x) => parseInt(x, 10));
 const dt = new Date(y, m - 1, day, 12, 0, 0);
 dt.setDate(dt.getDate() - 1);
 const yy = dt.getFullYear();
 const mm = String(dt.getMonth() + 1).padStart(2, '0');
 const dd = String(dt.getDate()).padStart(2, '0');
 return `${yy}-${mm}-${dd}`;
}

/** PHP hms_fin_can_write: role 1, or financials.write / billing.write (ACL); no accounting.write. */
function canSyncGl(req, res) {
 const r = String(req.session.user?.role || '');
 if (r === '1' || r === '99') return true;
 const p = Array.isArray(res.locals.userPerms) ? res.locals.userPerms : [];
 return p.includes('*') || p.includes('financials.write') || p.includes('billing.write');
}

module.exports = function registerFinancialsCashFlow(app, pool, requireAuth, requirePerm) {
 const finRead = requirePerm('accounting.read', 'accounting.write', 'financials.read', 'financials.write');

 app.get('/financials/cash-flow', requireAuth, finRead, async (req, res) => {
  try {
   await ensureFinJournal019(pool).catch(() => {});
   const fid = facilityId(req);
   let d1 = String(req.query.d1 || '').trim();
   let d2 = String(req.query.d2 || '').trim();
   if (!isoDate(d1)) d1 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
   if (!isoDate(d2)) d2 = new Date().toISOString().slice(0, 10);
   const d0 = dayBeforeIso(d1);
   const finOk = await finTablesOk(pool);

   let pl = { charges: 0, produits: 0, resultat: 0, period_from: d1, period_to: d2 };
   let cashOpen = 0;
   let cashClose = 0;
   let m5 = 0;
   let m2 = 0;
   let m1 = 0;
   if (finOk) {
    pl = await finPlForDateRange(pool, fid, d1, d2);
    cashOpen = await finPrefixBalanceAsOf(pool, fid, d0, '5');
    cashClose = await finPrefixBalanceAsOf(pool, fid, d2, '5');
    m5 = await finPrefixMovementPeriod(pool, fid, d1, d2, '5');
    m2 = await finPrefixMovementPeriod(pool, fid, d1, d2, '2');
    m1 = await finPrefixMovementPeriod(pool, fid, d1, d2, '1');
   }
   const opsRec = await finOpsFiscalReceiptsPeriod(pool, fid, d1, d2);
   const opsTxn = await finOpsTransactionsPeriod(pool, fid, d1, d2);
   const syncOk = canSyncGl(req, res);
   const glMismatchOps =
    finOk && opsRec.total > 0.005 && Math.abs(m5) < 0.02 && Math.abs(cashClose) < 0.02;

   const reportDate = new Date().toISOString().slice(0, 10);
   const reportRef = `CF-${d2.replace(/-/g, '')}`;

   const { cashFlowPayload } = require('../lib/finReactPayloads');
   res.render('financials-cash-flow', {
    title: 'Cash flow statement - ZAIZENS',
    ...cashFlowPayload({
     d1,
     d2,
     pl,
     cashOpen,
     cashClose,
     m5,
     canSyncGl: syncOk,
     glMismatchOps,
     flash: req.query.msg || null,
     error: req.query.err || null,
    }),
   });
  } catch (err) {
   console.error('FINANCIALS CASH FLOW:', err.message);
   res.status(500).render('error', { title: 'Error', message: err.message, status: 500 });
  }
 });
};
