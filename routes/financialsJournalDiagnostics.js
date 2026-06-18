/**
 * Journal / GL diagnostics (PHP financials-journal-diagnostics.php parity).
 */
const ensureFinJournal019 = require('../lib/ensureFinJournal019');
const { ensureFinJournalLineFkToHeader, repairOrphanJournalLines } = require('../lib/ensureFinJournalLineFk');
const { journalHealthSnapshot, journalHealthHintMessage } = require('../lib/hmsFinJournalHealth');

module.exports = function registerFinancialsJournalDiagnostics(app, pool, requireAuth, requirePerm) {
 const finRead = requirePerm('accounting.read', 'accounting.write', 'financials.read', 'financials.write');

 function facilityId(req) {
  return Math.max(1, parseInt(req.session.facilityId, 10) || 1);
 }

 /** PHP hms_fin_can_write — repair button only (no accounting.write). */
 function canFinRepairWrite(req, res) {
  const r = String(req.session.user?.role || '');
  if (r === '1' || r === '99') return true;
  const p = res.locals.userPerms || [];
  return p.includes('*') || p.includes('financials.write') || p.includes('billing.write');
 }

 function parseDates(req) {
  let d1 = String(req.body?.d1 || req.query.d1 || '').trim();
  let d2 = String(req.body?.d2 || req.query.d2 || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d1)) {
   d1 = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d2)) {
   d2 = new Date().toISOString().slice(0, 10);
  }
  return { d1, d2 };
 }

 app.get('/financials/journal-diagnostics', requireAuth, finRead, async (req, res) => {
  try {
   await ensureFinJournal019(pool).catch(() => {});
   const fid = facilityId(req);
   const { d1, d2 } = parseDates(req);
   const snap = await journalHealthSnapshot(pool, fid, d1, d2);
   const hint = journalHealthHintMessage(snap, d1, d2);
   const { journalDiagnosticsPayload } = require('../lib/finReactPayloads');
   res.render('financials-journal-diagnostics', {
    title: 'Journal / GL diagnostics — ZAIZENS',
    ...journalDiagnosticsPayload({
     d1,
     d2,
     snap,
     hint,
     canRepair: canFinRepairWrite(req, res),
     repairMsg: req.query.repairMsg != null ? String(req.query.repairMsg) : null,
     repairOk: req.query.repairOk === '1',
     flash: req.query.msg || null,
     error: req.query.err || null,
    }),
   });
  } catch (e) {
   res.status(500).render('error', { title: 'Error', message: e.message, status: 500 });
  }
 });

 app.post('/financials/journal-diagnostics', requireAuth, finRead, async (req, res) => {
  const { d1, d2 } = parseDates(req);
  const q = new URLSearchParams({ d1, d2 });
  const doRepair = !!req.body.repair_journal_schema;
  const doOrphans = !!req.body.repair_orphan_lines;
  if ((!doRepair && !doOrphans) || !canFinRepairWrite(req, res)) {
   q.set('err', 'Repair not allowed.');
   return res.redirect('/financials/journal-diagnostics?' + q.toString());
  }
  try {
   const parts = [];
   let orphanResult = { remaining: 0 };
   if (doOrphans) {
    orphanResult = await repairOrphanJournalLines(pool, facilityId(req));
    parts.push(...(orphanResult.details || []));
    if (orphanResult.remaining > 0) {
     q.set('repairOk', '0');
    } else {
     q.set('repairOk', '1');
    }
   }
   if (doRepair) {
    await ensureFinJournal019(pool, { repairFk: false });
    const fkResult = await ensureFinJournalLineFkToHeader(pool);
    parts.push('Schema columns checked (ensureFinJournal019).');
    parts.push(fkResult.message || fkResult.action);
    if (!fkResult.ok) {
     q.set('repairOk', '0');
     if (fkResult.orphanCount > 0) {
      parts.push('Run “Relink orphan lines” first, then schema repair again.');
     }
    } else if (q.get('repairOk') !== '0') {
     q.set('repairOk', '1');
     parts.push('Re-open Trial balance / General ledger.');
    }
   } else if (q.get('repairOk') !== '0') {
    q.set('repairOk', orphanResult.remaining === 0 ? '1' : '0');
   }
   q.set('repairMsg', parts.join(' '));
  } catch (e) {
   q.set('repairOk', '0');
   q.set('repairMsg', String(e.message || e));
  }
  res.redirect('/financials/journal-diagnostics?' + q.toString());
 });
};
