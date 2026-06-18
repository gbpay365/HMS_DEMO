/**
 * General ledger (PHP financials-general-ledger.php + api/financials-general-ledger.php parity).
 */
const {
 finTablesOk,
 finOpeningBalancesBefore,
 finGlLines,
 finJournalEntryDateBounds,
 finOpsFiscalReceiptsPeriod,
 groupLinesByAccount,
 labelPatientContext,
 finGlEmptySiteHint,
 finGlEmptyHeadersWithoutLinesHint,
 finGlEmptyNoJournalsAnywhereHint,
 formatXaf,
 isoDate
} = require('../lib/hmsFinGeneralLedger');
const ensureFinJournal019 = require('../lib/ensureFinJournal019');
const {
 backfillReceiptJournalsForDateRange,
 backfillExpenseJournalsForDateRange,
 backfillReceiptJournals,
 backfillExpenseJournals
} = require('../lib/hmsFinSyncGl');

module.exports = function registerFinancialsGeneralLedger(app, pool, requireAuth, requirePerm) {
 const finRead = requirePerm('accounting.read', 'accounting.write', 'financials.read', 'financials.write');

 function facilityId(req) {
  return Math.max(1, parseInt(req.session.facilityId, 10) || 1);
 }

 function canFinWrite(req, res) {
  const r = String(req.session.user?.role || '');
  if (r === '1' || r === '99') return true;
  const p = res.locals.userPerms || [];
  return (
   p.includes('*') ||
   p.includes('financials.write') ||
   p.includes('billing.write') ||
   p.includes('accounting.write')
  );
 }

 async function buildGlViewModel(req, res) {
  await ensureFinJournal019(pool).catch(() => {});
  const fid = facilityId(req);
  let d1 = String(req.query.d1 || '').trim();
  let d2 = String(req.query.d2 || '').trim();
  const acct = String(req.query.acct || '').trim();

  const finOk = await finTablesOk(pool);
  if (finOk && !d1 && !d2) {
   const jb = await finJournalEntryDateBounds(pool, fid);
   if (jb) {
    d1 = jb.min;
    d2 = jb.max;
   }
  }
  if (!isoDate(d1)) d1 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  if (!isoDate(d2)) d2 = new Date().toISOString().slice(0, 10);

  const opening = finOk ? await finOpeningBalancesBefore(pool, fid, d1) : {};
  const lines = finOk ? await finGlLines(pool, fid, d1, d2, acct || null) : [];
  const byAcct = groupLinesByAccount(lines);
  const accounts = Object.keys(byAcct).sort().map((code) => {
   const rows = byAcct[code];
   let run = parseFloat(opening[code]) || 0;
   const rowRuns = rows.map((r) => {
    run += (parseFloat(r.debit) || 0) - (parseFloat(r.credit) || 0);
    return { ...r, running: Math.round(run * 100) / 100 };
   });
   return {
    code,
    label: labelPatientContext(rows[0]?.account_label || ''),
    opening: Math.round((parseFloat(opening[code]) || 0) * 100) / 100,
    rows: rowRuns,
    closing: Math.round(run * 100) / 100
   };
  });

  const opsRecGl = await finOpsFiscalReceiptsPeriod(pool, fid, d1, d2);
  const glEmptyVsBilling = finOk && lines.length === 0 && (opsRecGl.total || 0) > 0.005;

  let glSiteHint = '';
  let glExtraHint = '';
  if (finOk && lines.length === 0 && !acct) {
   glSiteHint = await finGlEmptySiteHint(pool, fid, d1, d2);
   if (!glSiteHint) {
    glExtraHint = await finGlEmptyHeadersWithoutLinesHint(pool, fid, d1, d2);
    if (!glExtraHint) glExtraHint = await finGlEmptyNoJournalsAnywhereHint(pool, d1, d2);
   }
  }

  const postedOk = String(req.query.posted || '') === '1';
  const postProc = req.query.proc != null && req.query.proc !== '' && !Number.isNaN(Number(req.query.proc)) ? parseInt(req.query.proc, 10) : null;
  const postIns = req.query.ins != null && req.query.ins !== '' && !Number.isNaN(Number(req.query.ins)) ? parseInt(req.query.ins, 10) : null;
  const postDup = req.query.dup != null && req.query.dup !== '' && !Number.isNaN(Number(req.query.dup)) ? parseInt(req.query.dup, 10) : null;
  const postFail = req.query.fail != null && req.query.fail !== '' && !Number.isNaN(Number(req.query.fail)) ? parseInt(req.query.fail, 10) : null;

  return {
   finOk,
   fid,
   d1,
   d2,
   acct,
   opening,
   lines,
   accounts,
   opsRecGl,
   glEmptyVsBilling,
   canPostGl: canFinWrite(req, res),
   glSiteHint,
   glExtraHint,
   postedOk,
   postProc,
   postIns,
   postDup,
   postFail,
   formatXaf,
   labelPatientContext
  };
 }

 app.get('/financials/general-ledger', requireAuth, finRead, async (req, res) => {
  try {
   const vm = await buildGlViewModel(req, res);
   const { glPayload } = require('../lib/finReactPayloads');
   res.render('financials-general-ledger', {
    title: 'General ledger - ZAIZENS',
    ...glPayload({ ...vm, flash: req.query.msg || null, error: req.query.err || null }),
   });
  } catch (e) {
   res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
  }
 });

 app.post('/financials/general-ledger', requireAuth, finRead, async (req, res) => {
  if (req.body.post_receipts_to_gl && canFinWrite(req, res)) {
   const q = new URLSearchParams();
   const d1 = isoDate(String(req.body.d1 || '').trim());
   const d2 = isoDate(String(req.body.d2 || '').trim());
   const fid = facilityId(req);
   await ensureFinJournal019(pool).catch(() => {});
   let nr;
   let ne;
   if (d1 && d2) {
    nr = await backfillReceiptJournalsForDateRange(pool, fid, d1, d2, 5000);
    ne = await backfillExpenseJournalsForDateRange(pool, fid, d1, d2, 5000);
   } else {
    nr = await backfillReceiptJournals(pool, fid, 500);
    ne = await backfillExpenseJournals(pool, fid, 500);
   }
   const proc = (nr.processed || 0) + (ne.processed || 0);
   const ins = (nr.inserted || 0) + (ne.inserted || 0);
   const dup = (nr.duplicate || 0) + (ne.duplicate || 0);
   const fail = (nr.failed || 0) + (ne.failed || 0);
   q.set('posted', '1');
   q.set('proc', String(proc));
   q.set('ins', String(ins));
   q.set('dup', String(dup));
   q.set('fail', String(fail));
   if (d1) q.set('d1', d1);
   if (d2) q.set('d2', d2);
   const ac = String(req.body.acct || '').trim();
   if (ac) q.set('acct', ac);
   return res.redirect('/financials/general-ledger?' + q.toString());
  }
  res.redirect('/financials/general-ledger?err=' + encodeURIComponent('Action not allowed or invalid request.'));
 });

 /** JSON API parity with api/financials-general-ledger.php (GET data for integrations). */
 app.get('/api/financials/general-ledger', requireAuth, finRead, async (req, res) => {
  try {
   const vm = await buildGlViewModel(req, res);
   res.json({
    ok: true,
    facility_id: vm.fid,
    fin_tables_ok: vm.finOk,
    d1: vm.d1,
    d2: vm.d2,
    account_prefix: vm.acct || null,
    opening_balances: vm.opening,
    lines: vm.lines,
    by_account: groupLinesByAccount(vm.lines),
    ops_fiscal_receipts: vm.opsRecGl,
    hints: {
     site: vm.glSiteHint || null,
     extra: vm.glExtraHint || null
    }
   });
  } catch (e) {
   res.status(500).json({ ok: false, error: e.message });
  }
 });
};
