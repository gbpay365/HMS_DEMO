/**
 * Chart of accounts — parity with htdocs_php/htdocs/financials-accounts.php.
 */
const { finCoaGroupedByClass, coaClassTitle } = require('../lib/hmsFinChartOfAccounts');
const { seedFinAccounts } = require('../lib/finAccountSeedData');

module.exports = function registerFinancialsChartOfAccounts(app, pool, requireAuth, requirePerm) {
 const finRead = requirePerm('accounting.read', 'accounting.write', 'financials.read', 'financials.write');
 const finWrite = requirePerm('accounting.write', 'financials.write');

 app.post('/financials/accounts/seed', requireAuth, finWrite, async (req, res) => {
  try {
   const r = await seedFinAccounts(pool, { forceUpdate: true });
   const msg = `Chart of accounts seeded: ${r.inserted} added, ${r.updated} updated (${r.total} SYSCOHADA accounts).`;
   return res.redirect('/financials/accounts?msg=' + encodeURIComponent(msg));
  } catch (err) {
   console.error('FINANCIALS COA SEED:', err.message);
   return res.redirect('/financials/accounts?err=' + encodeURIComponent(err.message || 'Seed failed.'));
  }
 });

 app.get('/financials/accounts', requireAuth, finRead, async (req, res) => {
  try {
   let pack = await finCoaGroupedByClass(pool);
   const hasRows =
    pack.byClass &&
    Object.keys(pack.byClass).some((k) => (pack.byClass[k] || []).length > 0);
   if (pack.ok && !hasRows) {
    await seedFinAccounts(pool);
    pack = await finCoaGroupedByClass(pool);
   }
   const classKeys = Object.keys(pack.byClass)
    .map((k) => parseInt(k, 10))
    .filter((k) => Number.isFinite(k))
    .sort((a, b) => a - b);

   const { coaPayload } = require('../lib/finReactPayloads');
   res.render('financials-chart-of-accounts', {
    title: 'Chart of accounts - ZAIZENS',
    ...coaPayload({
     coaOk: pack.ok,
     coaError: pack.error,
     byClass: pack.byClass,
     classKeys,
     coaClassTitle,
     flash: req.query.msg || null,
     error: req.query.err || null,
    }),
   });
  } catch (err) {
   console.error('FINANCIALS COA:', err.message);
   res.status(500).render('error', { title: 'Error', message: err.message, status: 500 });
  }
 });
};
