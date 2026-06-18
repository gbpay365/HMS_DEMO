/**
 * Sync billing receipts and expenses to GL — PHP financials-sync-gl.php parity.
 */
const ensureFinJournal019 = require('../lib/ensureFinJournal019');
const { finTablesOk } = require('../lib/hmsFinGeneralLedger');
const {
 backfillReceiptJournals,
 backfillReceiptJournalsForDateRange,
 backfillExpenseJournals,
 backfillExpenseJournalsForDateRange
} = require('../lib/hmsFinSyncGl');

module.exports = function registerFinancialsSyncGl(app, pool, requireAuth, requirePerm) {
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

 function iso(d) {
  const s = String(d || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
 }

 app.get('/financials/sync-gl', requireAuth, finRead, async (req, res) => {
  try {
   await ensureFinJournal019(pool).catch(() => {});
   const finOk = await finTablesOk(pool);
   const canRun = canFinWrite(req, res);

   let rfD1 = String(req.query.rf_d1 || '').trim();
   let rfD2 = String(req.query.rf_d2 || '').trim();
   let exD1 = String(req.query.ex_d1 || '').trim();
   let exD2 = String(req.query.ex_d2 || '').trim();

   if (!rfD1 && !rfD2) {
    rfD1 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    rfD2 = new Date().toISOString().slice(0, 10);
   }
   if (!exD1 && !exD2) {
    if (iso(rfD1) && iso(rfD2)) {
     exD1 = rfD1;
     exD2 = rfD2;
    } else {
     exD1 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
     exD2 = new Date().toISOString().slice(0, 10);
    }
   }

   const { syncGlPayload } = require('../lib/finReactPayloads');
   res.render('financials-sync-gl', {
    title: 'Sync to GL - ZAIZENS',
    ...syncGlPayload({
     finOk,
     canRun,
     rfD1: iso(rfD1) || rfD1,
     rfD2: iso(rfD2) || rfD2,
     exD1: iso(exD1) || exD1,
     exD2: iso(exD2) || exD2,
     flash: req.query.msg || null,
     error: req.query.err || null,
    }),
   });
  } catch (e) {
   res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
  }
 });

 app.post('/financials/sync-gl', requireAuth, finRead, async (req, res) => {
  await ensureFinJournal019(pool).catch(() => {});
  const finOk = await finTablesOk(pool);
  const canRun = canFinWrite(req, res);
  const fid = facilityId(req);

  let receiptBatch = Math.max(50, Math.min(2000, parseInt(req.body.receipt_batch, 10) || 500));
  let expenseBatch = Math.max(50, Math.min(2000, parseInt(req.body.expense_batch, 10) || 500));
  const rfD1 = String(req.body.rf_d1 || '').trim();
  const rfD2 = String(req.body.rf_d2 || '').trim();
  const exD1 = String(req.body.ex_d1 || '').trim();
  const exD2 = String(req.body.ex_d2 || '').trim();

  let msg = '';
  if (finOk && canRun) {
   const useRfRange = iso(rfD1) && iso(rfD2);
   const useExRange = iso(exD1) && iso(exD2);
   const r = useRfRange
    ? await backfillReceiptJournalsForDateRange(pool, fid, rfD1, rfD2, receiptBatch)
    : await backfillReceiptJournals(pool, fid, receiptBatch);
   const e = useExRange
    ? await backfillExpenseJournalsForDateRange(pool, fid, exD1, exD2, expenseBatch)
    : await backfillExpenseJournals(pool, fid, expenseBatch);

   msg =
    `Receipts: ${r.processed} row(s) scanned — ${r.inserted} new journal(s), ${r.duplicate} already linked, ${r.failed} failed. Expenses: ` +
    `${e.processed} scanned — ${e.inserted} new, ${e.duplicate} duplicate, ${e.failed} failed. Re-run if the batch limit cut off rows.`;

   const rIns = r.inserted || 0;
   const eIns = e.inserted || 0;
   const rProc = r.processed || 0;
   const eProc = e.processed || 0;
   if (rIns === 0 && eIns === 0 && (rProc > 0 || eProc > 0)) {
    msg +=
     ' Those operational rows already have matching GL journals (nothing new to insert). ' +
     'If Trial balance / General ledger still look empty, widen From/To so the period includes each journal header entry_date, or open Journal diagnostics for this site and range.';
    try {
     const [[spanRow]] = await pool.query(
      'SELECT MIN(entry_date) AS a, MAX(entry_date) AS b FROM tbl_fin_journal_header WHERE facility_id = ?',
      [fid]
     );
     const a = String(spanRow?.a ?? '').trim().slice(0, 10);
     const b = String(spanRow?.b ?? '').trim().slice(0, 10);
     if (a && b) {
      msg += ` On site #${fid}, journal entry_date ranges from ${a} through ${b} — set reports to include that range.`;
     }
    } catch (e2) {
     /* ignore */
    }
   }
  } else if (!finOk) {
   msg = 'Journal tables are not available.';
  } else if (!canRun) {
   msg = 'You need financials.write (or journal/billing write) permission to run the sync.';
  }

  const { syncGlPayload } = require('../lib/finReactPayloads');
  res.render('financials-sync-gl', {
   title: 'Sync to GL - ZAIZENS',
   ...syncGlPayload({
    finOk,
    canRun,
    rfD1: iso(rfD1) || rfD1,
    rfD2: iso(rfD2) || rfD2,
    exD1: iso(exD1) || exD1,
    exD2: iso(exD2) || exD2,
    flash: msg || null,
    error: req.query.err || null,
   }),
  });
 });
};
