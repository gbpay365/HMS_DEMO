/**
 * PHP parity placeholders — screens not yet ported from legacy PHP financials.
 * Linked from the accounting rail (Planned section). Implemented modules live in dedicated route files.
 * See docs/CANONICAL-SOURCE.md — edit repo root only.
 */
const { stubPayload } = require('../lib/finReactPayloads');

const STUB_NOTE =
  'This screen is planned for a future release. Use Journal, General ledger, and Sync to GL for day-to-day accounting.';

module.exports = function registerFinancialsStubs(app, pool, requireAuth, requirePerm) {
 const finRead = requirePerm('accounting.read', 'accounting.write', 'financials.read', 'financials.write');

 function stub(phpPage, title, extraNote, navPath) {
  return (req, res) => {
   res.render('financials-stub', {
    title: `${title} - ZAIZENS`,
    finNav: 'planned',
    finNavPath: navPath || phpPage,
    ...stubPayload({
     stubTitle: title,
     phpPage,
     extraNote: extraNote || STUB_NOTE,
     flash: req.query.msg || null,
     error: req.query.err || null,
    }),
   });
  };
 }

 function stubWithApi(phpPage, phpApi, title, extraNote, navPath) {
  return (req, res) => {
   res.render('financials-stub', {
    title: `${title} - ZAIZENS`,
    finNav: 'planned',
    finNavPath: navPath || phpPage,
    ...stubPayload({
     stubTitle: title,
     phpPage,
     phpApi,
     extraNote: extraNote || STUB_NOTE,
     flash: req.query.msg || null,
     error: req.query.err || null,
    }),
   });
  };
 }

 // General ledger & journals — trial balance, GL, journal-diagnostics, journal-loader, sync-gl, journal CRUD, expenses, cash-flow, AR, AP, bank rec, chart of accounts live in dedicated route modules.
 app.get('/financials/sync-billing', requireAuth, finRead, stub('financials-sync-billing.php', 'Sync billing to GL', null, 'sync-billing'));
 app.get('/financials/gl-repair', requireAuth, finRead, stub('financials-gl-repair.php', 'GL repair', null, 'gl-repair'));
 app.get('/financials/cost-centers', requireAuth, finRead, stub('financials-cost-centers.php', 'Cost centers', null, 'cost-centers'));

 // Third parties & treasury — AR, AP, and bank reconciliation live in dedicated route modules.
 // Statements & period close — monthly statement: routes/financialsStatementMonthly.js
 app.get('/financials/statement-annual', requireAuth, finRead, stub('financials-statement-annual.php', 'Financial statement (annual)', null, 'statement-annual'));
 app.get('/financials/month-end', requireAuth, finRead, stub('financials-month-end.php', 'Profit & loss — month end', null, 'month-end'));

};
