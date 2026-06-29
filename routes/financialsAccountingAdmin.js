'use strict';

const ensureFinAccountingSchema = require('../lib/ensureFinAccountingSchema');
const {
  reverseJournal,
  reimputeLine,
  postDraftJournal,
  lockPeriod,
} = require('../lib/finJournalLifecycle');
const { listTiers, upsertTier, letterLines, tierStatement } = require('../lib/finTierLedger');
const { closeFiscalYear, fiscalYearStatus } = require('../lib/finFiscalClose');
const { listRecurring, saveRecurring, runDueRecurring } = require('../lib/finRecurringEntry');

function finWrite(req, res, next) {
  const p = res.locals.userPerms || [];
  if (p.includes('*') || p.includes('financials.write') || p.includes('accounting.write')) return next();
  return res.redirect('/financials?err=' + encodeURIComponent('Write permission required.'));
}

module.exports = function registerFinancialsAccountingAdmin(app, pool, requireAuth, requirePerm) {
  app.post('/financials/journal/:id/post', requireAuth, finWrite, async (req, res) => {
    await ensureFinAccountingSchema(pool);
    const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
    const uid = parseInt(String(req.session.userId || 0), 10) || 0;
    const id = parseInt(String(req.params.id || '0'), 10) || 0;
    const r = await postDraftJournal(pool, fid, id, uid, {
      autoCreateSubAccounts: Boolean(req.body.auto_create_sub_accounts || req.body.autoCreateSubAccounts),
    });
    if (!r.ok && r.needsSubAccounts) {
      const detail = (r.missing || []).map((m) => `${m.motherCode} → ${m.proposedCode}`).join('; ');
      return res.redirect(
        `/financials/journal-view?id=${id}&err=` +
          encodeURIComponent(`${r.error || 'GL sub-accounts required.'} ${detail}`)
      );
    }
    const q = r.ok ? 'msg' : 'err';
    return res.redirect(`/financials/journal-view?id=${id}&${q}=` + encodeURIComponent(r.ok ? 'Journal posted.' : r.error));
  });

  app.post('/financials/journal/:id/reverse', requireAuth, finWrite, async (req, res) => {
    await ensureFinAccountingSchema(pool);
    const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
    const uid = parseInt(String(req.session.userId || 0), 10) || 0;
    const id = parseInt(String(req.params.id || '0'), 10) || 0;
    const reason = String(req.body.reason || '').trim();
    const r = await reverseJournal(pool, fid, id, uid, reason);
    if (!r.ok) {
      return res.redirect(`/financials/journal-view?id=${id}&err=` + encodeURIComponent(r.error));
    }
    return res.redirect(`/financials/journal-view?id=${r.journalId}&msg=` + encodeURIComponent('Reversal posted.'));
  });

  app.post('/financials/journal/reimpute', requireAuth, finWrite, async (req, res) => {
    await ensureFinAccountingSchema(pool);
    const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
    const uid = parseInt(String(req.session.userId || 0), 10) || 0;
    const journalId = parseInt(String(req.body.journal_id || '0'), 10) || 0;
    const lineId = parseInt(String(req.body.line_id || '0'), 10) || 0;
    const newCode = String(req.body.new_account_code || '').trim();
    const newLabel = String(req.body.new_account_label || newCode).trim();
    const r = await reimputeLine(pool, fid, journalId, lineId, newCode, newLabel, uid);
    const q = r.ok ? 'msg' : 'err';
    const msg = r.ok ? 'Réimputation posted.' : r.error;
    return res.redirect(`/financials/journal-view?id=${journalId}&${q}=` + encodeURIComponent(msg));
  });

  app.post('/financials/period-lock', requireAuth, finWrite, async (req, res) => {
    await ensureFinAccountingSchema(pool);
    const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
    const uid = parseInt(String(req.session.userId || 0), 10) || 0;
    const y = parseInt(String(req.body.year || '0'), 10);
    const m = parseInt(String(req.body.month || '0'), 10);
    const r = await lockPeriod(pool, fid, y, m, uid, req.body.reason);
    return res.redirect('/financials/settings?section=general&' + (r.ok ? 'msg' : 'err') + '=' + encodeURIComponent(r.ok ? 'Period locked.' : r.error));
  });

  app.post('/financials/fiscal-close', requireAuth, finWrite, async (req, res) => {
    await ensureFinAccountingSchema(pool);
    const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
    const uid = parseInt(String(req.session.userId || 0), 10) || 0;
    const fy = parseInt(String(req.body.fiscal_year || new Date().getFullYear()), 10);
    const r = await closeFiscalYear(pool, fid, fy, uid);
    return res.redirect(`/financials/year-end?y=${fy}&` + (r.ok ? 'msg' : 'err') + '=' + encodeURIComponent(r.ok ? `Fiscal year ${fy} closed.` : r.error));
  });

  app.get('/financials/tiers', requireAuth, requirePerm('accounting.read', 'financials.read'), async (req, res) => {
    await ensureFinAccountingSchema(pool);
    const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
    const tiers = await listTiers(pool, fid, req.query.type);
    res.json({ tiers });
  });

  app.post('/financials/tiers', requireAuth, finWrite, async (req, res) => {
    await ensureFinAccountingSchema(pool);
    const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
    const r = await upsertTier(pool, fid, req.body);
    return res.redirect('/financials/settings?section=general&' + (r.ok ? 'msg' : 'err') + '=' + encodeURIComponent(r.ok ? 'Tier saved.' : r.error));
  });

  app.post('/financials/lettering', requireAuth, finWrite, async (req, res) => {
    await ensureFinAccountingSchema(pool);
    const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
    const uid = parseInt(String(req.session.userId || 0), 10) || 0;
    const r = await letterLines(
      pool,
      fid,
      parseInt(req.body.tier_id, 10),
      parseInt(req.body.debit_line_id, 10),
      parseInt(req.body.credit_line_id, 10),
      req.body.amount,
      uid
    );
    return res.redirect('/financials/accounts-receivable?' + (r.ok ? 'msg' : 'err') + '=' + encodeURIComponent(r.ok ? `Lettered ${r.letterCode}` : r.error));
  });

  app.get('/financials/recurring', requireAuth, requirePerm('accounting.read', 'financials.read'), async (req, res) => {
    await ensureFinAccountingSchema(pool);
    const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
    const items = await listRecurring(pool, fid);
    res.json({ items });
  });

  app.post('/financials/recurring/run', requireAuth, finWrite, async (req, res) => {
    await ensureFinAccountingSchema(pool);
    const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
    const uid = parseInt(String(req.session.userId || 0), 10) || 0;
    const r = await runDueRecurring(pool, fid, uid);
    return res.redirect('/financials/journal?msg=' + encodeURIComponent(`Recurring: ${r.posted} posted.`));
  });
};
