/**
 * Trial balance — PHP financials-trial-balance.php parity (journal-based TB + optional period sync).
 */
const { finPageData } = require('../lib/reactRouteHelpers');
const ensureFinJournal019 = require('../lib/ensureFinJournal019');
const {
 finTablesOk,
 finJournalEntryDateBounds,
 finGlEmptySiteHint,
 finGlEmptyHeadersWithoutLinesHint,
 finGlEmptyNoJournalsAnywhereHint,
 formatXaf,
 isoDate,
 labelPatientContext
} = require('../lib/hmsFinGeneralLedger');
const { finTbMovementRows, finTbBalanceRows, mergeTrialBalanceRows } = require('../lib/hmsFinTrialBalance');
const { ohadaClassFromCode, reportCategoryFromClass } = require('../lib/hmsFinOhadaLabels');
const { journalHealthSnapshot, journalHealthHintMessage } = require('../lib/hmsFinJournalHealth');
const {
 backfillReceiptJournalsForDateRange,
 backfillExpenseJournalsForDateRange
} = require('../lib/hmsFinSyncGl');

module.exports = function registerFinancialsTrialBalance(app, pool, requireAuth, requirePerm) {
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

 /**
  * Shared TB data for HTML page and JSON API.
  * @param {import('mysql2/promise').Pool} pool
  * @param {Record<string, string>} query — typically req.query (d1, d2)
  */
 async function loadTrialBalancePayload(pool, fid, query) {
  await ensureFinJournal019(pool).catch(() => {});
  const finOk = await finTablesOk(pool);

  let d1 = String((query && (Array.isArray(query.d1) ? query.d1[0] : query.d1)) || '').trim();
  let d2 = String((query && (Array.isArray(query.d2) ? query.d2[0] : query.d2)) || '').trim();
  if (finOk && !d1 && !d2) {
   const jb = await finJournalEntryDateBounds(pool, fid);
   if (jb) {
    d1 = jb.min;
    d2 = jb.max;
   }
  }
  if (!isoDate(d1)) d1 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  if (!isoDate(d2)) d2 = new Date().toISOString().slice(0, 10);

  let periodRows = [];
  let closingRows = [];
  let tbSqlErr = '';
  if (finOk) {
   try {
    periodRows = await finTbMovementRows(pool, fid, d1, d2);
   } catch (e) {
    tbSqlErr = String(e.message || e);
   }
   try {
    closingRows = await finTbBalanceRows(pool, fid, d2);
   } catch (e) {
    if (!tbSqlErr) tbSqlErr = String(e.message || e);
   }
  }

  const merged = mergeTrialBalanceRows(periodRows, closingRows);
  const tbRows = merged.map((row) => ({
   ...row,
   category: reportCategoryFromClass(ohadaClassFromCode(row.code))
  }));

  const tbEmpty = finOk && periodRows.length === 0 && closingRows.length === 0;
  let tbHealthMsg = '';
  if (finOk && tbEmpty && !tbSqlErr) {
   const snap = await journalHealthSnapshot(pool, fid, d1, d2);
   tbHealthMsg = journalHealthHintMessage(snap, d1, d2);
  }
  let tbSiteHint = '';
  let tbExtraHint = '';
  if (finOk && tbEmpty && !tbSqlErr && !tbHealthMsg) {
   tbSiteHint = await finGlEmptySiteHint(pool, fid, d1, d2);
   if (!tbSiteHint) {
    tbExtraHint = await finGlEmptyHeadersWithoutLinesHint(pool, fid, d1, d2);
    if (!tbExtraHint) tbExtraHint = await finGlEmptyNoJournalsAnywhereHint(pool, d1, d2);
   }
  }

  let td = 0;
  let tc = 0;
  for (const row of tbRows) {
   td += Number(row.md) || 0;
   tc += Number(row.mc) || 0;
  }
  const movementDifference = Math.round((td - tc) * 100) / 100;

  return {
   finOk,
   fid,
   d1,
   d2,
   periodRows,
   closingRows,
   tbRows,
   tbEmpty,
   tbSqlErr,
   tbHealthMsg,
   tbSiteHint,
   tbExtraHint,
   totals: {
    movement_debit: Math.round(td * 100) / 100,
    movement_credit: Math.round(tc * 100) / 100,
    movement_difference: movementDifference
   }
  };
 }

 app.get('/financials/trial-balance', requireAuth, finRead, async (req, res) => {
  try {
   const fid = facilityId(req);
   const p = await loadTrialBalancePayload(pool, fid, req.query);

   const canSyncTb = p.finOk && canFinWrite(req, res);
   const syncTbFlash = req.query.msg ? String(req.query.msg) : '';

   const tbToolbarSecondary = [];
   if (p.finOk && p.tbEmpty) {
    const qSync = new URLSearchParams({ rf_d1: p.d1, rf_d2: p.d2, ex_d1: p.d1, ex_d2: p.d2 }).toString();
    tbToolbarSecondary.push({
     label: 'Sync to GL',
     url: '/financials/sync-gl?' + qSync,
     icon: 'fa-refresh',
     btnClass: 'btn-warning'
    });
    tbToolbarSecondary.push({
     label: 'Journal diagnostics',
     url: '/financials/journal-diagnostics?' + new URLSearchParams({ d1: p.d1, d2: p.d2 }).toString(),
     icon: 'fa-stethoscope',
     btnClass: 'btn-outline-secondary'
    });
   }

   res.render('financials-trial-balance', {
    title: 'Trial balance - ZAIZENS',
    ...finPageData('trial-balance', 'trial', {
     title: 'Trial balance',
     subtitle: `${p.d1} → ${p.d2}`,
     columns: [
      { key: 'account_code', label: 'Account' },
      { key: 'account_label', label: 'Label' },
      { key: 'debit', label: 'Debit', align: 'right', format: 'money' },
      { key: 'credit', label: 'Credit', align: 'right', format: 'money' },
     ],
     rows: p.tbRows || [],
     flash: syncTbFlash || null,
     error: req.query.err || null,
    }),
   });
  } catch (e) {
   res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
  }
 });

 /** JSON for integrations (Node pattern: api/financials/general-ledger). */
 app.get('/api/financials/trial-balance', requireAuth, finRead, async (req, res) => {
  try {
   const fid = facilityId(req);
   const p = await loadTrialBalancePayload(pool, fid, req.query);

   const apiRows = (p.tbRows || []).map((row) => ({
    account_code: row.code,
    account_label: labelPatientContext(row.label || ''),
    category: row.category,
    movement_debit: row.md,
    movement_credit: row.mc,
    period_net: row.periodNet,
    balance_as_of_d2: row.balanceBf
   }));

   res.json({
    ok: true,
    fin_tables_ok: p.finOk,
    facility_id: p.fid,
    d1: p.d1,
    d2: p.d2,
    tb_empty: p.tbEmpty,
    tb_sql_error: p.tbSqlErr || null,
    hints: {
     health: p.tbHealthMsg || null,
     site: p.tbSiteHint || null,
     extra: p.tbExtraHint || null
    },
    period_movement: p.periodRows,
    balances_as_of_d2: p.closingRows,
    rows: apiRows,
    totals: p.totals
   });
  } catch (e) {
   res.status(500).json({ ok: false, error: e.message });
  }
 });

 app.post('/financials/trial-balance', requireAuth, finRead, async (req, res) => {
  if (!req.body.sync_tb_gl || !canFinWrite(req, res)) {
   return res.redirect('/financials/trial-balance?err=' + encodeURIComponent('Action not allowed.'));
  }
  const redirD1 = String(req.body.d1 || '').trim();
  const redirD2 = String(req.body.d2 || '').trim();
  if (!isoDate(redirD1) || !isoDate(redirD2)) {
   return res.redirect('/financials/trial-balance?err=' + encodeURIComponent('Invalid date range.'));
  }
  const fid = facilityId(req);
  await ensureFinJournal019(pool).catch(() => {});
  const nr = await backfillReceiptJournalsForDateRange(pool, fid, redirD1, redirD2, 5000);
  let ne = { processed: 0, inserted: 0, duplicate: 0, failed: 0, first_error: '' };
  try {
   ne = await backfillExpenseJournalsForDateRange(pool, fid, redirD1, redirD2, 5000);
  } catch (e) {
   /* tbl_expense may be absent */
  }
  const eIns = ne.inserted || 0;
  const eProc = ne.processed || 0;
  const rIns = nr.inserted || 0;
  const rProc = nr.processed || 0;
  const rFail = nr.failed || 0;
  const fe = String(nr.first_error || '');
  const msg =
   `GL sync: receipts scanned ${rProc}, new journals ${rIns}` +
   (rFail > 0 ? `, failed ${rFail}` : '') +
   (fe ? ` — ${fe}` : '') +
   `; expenses scanned ${eProc}, new ${eIns}. Refresh if lines do not appear.`;
  const q = new URLSearchParams({ d1: redirD1, d2: redirD2, msg });
  res.redirect('/financials/trial-balance?' + q.toString());
 });
};
