/**
 * Journal CSV import — PHP financials-journal-loader.php parity.
 */
const ensureFinJournal019 = require('../lib/ensureFinJournal019');
const { finTablesOk } = require('../lib/hmsFinGeneralLedger');
const { parseJournalCsv } = require('../lib/hmsFinJournalCsv');
const { journalPostManual, finJournalRecentHeaders } = require('../lib/hmsFinJournalPost');

module.exports = function registerFinancialsJournalLoader(app, pool, requireAuth, requirePerm) {
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

 app.get('/financials/journal-loader', requireAuth, finRead, async (req, res) => {
  try {
   await ensureFinJournal019(pool).catch(() => {});
   const fid = facilityId(req);
   const finOk = await finTablesOk(pool);
   const canWrite = canFinWrite(req, res);
   const recent = finOk ? await finJournalRecentHeaders(pool, fid, 60) : [];
   const { journalLoaderPayload } = require('../lib/finReactPayloads');
   res.render('financials-journal-loader', {
    title: 'Journal loader - ZAIZENS',
    ...journalLoaderPayload({
     finOk,
     canWrite,
     recent,
     flash: req.query.msg || null,
     error: req.query.err || null,
    }),
   });
  } catch (e) {
   res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
  }
 });

 app.post('/financials/journal-loader', requireAuth, finRead, async (req, res) => {
  if (!req.body.import_csv || !canFinWrite(req, res)) {
   return res.redirect('/financials/journal-loader?err=' + encodeURIComponent('Action not allowed.'));
  }
  await ensureFinJournal019(pool).catch(() => {});
  const finOk = await finTablesOk(pool);
  if (!finOk) {
   return res.redirect('/financials/journal-loader?err=' + encodeURIComponent('General ledger unavailable.'));
  }
  const fid = facilityId(req);
  const uid = parseInt(req.session.userId || req.session.user?.id, 10) || 0;
  const raw = String(req.body.csv || '');
  const parsed = parseJournalCsv(raw);
  if (!parsed.ok) {
   return res.redirect('/financials/journal-loader?err=' + encodeURIComponent(parsed.errors.join(' ')));
  }
  let ok = 0;
  for (const batch of parsed.batches) {
   const lines = batch.lines;
   const nar = String(batch.narration || '');
   const ref = String(batch.reference || '');
   const d = String(batch.date || '');
   const posted = await journalPostManual(pool, fid, d, ref, nar, uid, lines);
   if (posted) ok++;
  }
  const msg = `${ok} ${ok === 1 ? 'journal entry' : 'journal entries'} imported.`;
  res.redirect('/financials/journal-loader?msg=' + encodeURIComponent(msg));
 });
};
