'use strict';

const { finPageData } = require('../lib/reactRouteHelpers');
const { journalViewPayload, journalNewPayload } = require('../lib/finReactPayloads');
const ensureFinAccountingSchema = require('../lib/ensureFinAccountingSchema');
const { finTablesOk } = require('../lib/hmsFinGeneralLedger');
const { loadPostingAccounts } = require('../lib/hmsFinPostingCatalog');
const { journalPostManualWithResult, journalPostLastError } = require('../lib/hmsFinJournalPost');
const { mapFinRows, formatDisplayDate } = require('../lib/hmsFormatDate');

function finRead(req, res, next) {
 const p = res.locals.userPerms || [];
 const ok =
  p.includes('*') ||
  p.includes('accounting.read') ||
  p.includes('accounting.write') ||
  p.includes('financials.read') ||
  p.includes('financials.write');
 if (ok) return next();
 const role = String((req.session && req.session.user && req.session.user.role) || '');
 const aclLayout = require('../lib/aclLayout');
 const home = aclLayout.staffHomeUrl(role) || '/profile';
 return res.redirect(home + '?err=' + encodeURIComponent('Access denied.'));
}

function finWrite(req, res, next) {
 const p = res.locals.userPerms || [];
 const ok = p.includes('*') || p.includes('financials.write') || p.includes('accounting.write');
 if (ok) return next();
 const role = String((req.session && req.session.user && req.session.user.role) || '');
 const aclLayout = require('../lib/aclLayout');
 const home = aclLayout.staffHomeUrl(role) || '/profile';
 return res.redirect(home + '?err=' + encodeURIComponent('You need financials.write or accounting.write to post journals.'));
}

function ymBounds(d) {
 const s = String(d || '').trim().slice(0, 10);
 if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
 return s;
}

function parseMoneyXaf(raw) {
 const n = parseInt(String(raw || '').replace(/\D+/g, ''), 10);
 return Number.isFinite(n) && n >= 0 ? n : 0;
}

module.exports = function registerFinancialsJournal(app, pool, requireAuth) {
 async function ensureTables(req, res, next) {
  try {
   await ensureFinAccountingSchema(pool, { facilityId: parseInt(String(req.session.facilityId || 1), 10) || 1 });
  } catch (_) {
   /* ignore */
  }
  next();
 }

 app.get('/financials/journal', requireAuth, finRead, ensureTables, async (req, res) => {
  if (!(await finTablesOk(pool))) {
   return res.redirect('/financials?err=' + encodeURIComponent('General ledger tables are not available. Run financial migration 019.'));
  }
  const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
  const from = ymBounds(req.query.from) || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const to = ymBounds(req.query.to) || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);
  let rows = [];
  try {
   const [r] = await pool.query(
    `SELECT h.id,
            h.entry_date AS journal_date,
            h.narration AS description,
            h.reference,
            h.journal_code,
            h.piece_number,
            h.status,
            h.source_type AS source,
            (SELECT COALESCE(SUM(debit),0) FROM tbl_fin_journal_line jl WHERE jl.journal_id = h.id) AS total_dr
     FROM tbl_fin_journal_header h
     WHERE h.facility_id = ? AND h.entry_date >= ? AND h.entry_date <= ?
     ORDER BY h.entry_date DESC, h.id DESC
     LIMIT 200`,
    [fid, from, to]
   );
   rows = mapFinRows(Array.isArray(r) ? r : []);
  } catch (e) {
   return res.status(500).render('error', { title: 'Error', message: e.message || 'Journal list failed', status: 500 });
  }
   res.render('financials-journal', {
    title: 'Financials — Journal — ZAIZENS',
    ...finPageData('journal', 'journal', {
     title: 'Journal entries',
     subtitle: `${from} → ${to}`,
     columns: [
      { key: 'journal_date', label: 'Date' },
      { key: 'journal_code', label: 'Journal' },
      { key: 'piece_number', label: 'Piece' },
      { key: 'description', label: 'Description' },
      { key: 'status', label: 'Status' },
      { key: 'total_dr', label: 'Amount', align: 'right', format: 'money' },
      { key: 'id', label: '', format: 'link', linkTemplate: '/financials/journal-view?id={id}', linkLabel: 'View' },
     ],
     rows: rows || [],
     flash: req.query.msg || null,
     error: req.query.err || null,
    }),
   });
 });

 app.get('/financials/journal-view', requireAuth, finRead, ensureTables, async (req, res) => {
  if (!(await finTablesOk(pool))) {
   return res.redirect('/financials/journal?err=' + encodeURIComponent('Journal tables missing.'));
  }
  const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
  const id = parseInt(String(req.query.id || '0'), 10) || 0;
  if (id < 1) return res.redirect('/financials/journal');
  let header = null;
  let lines = [];
  try {
   const [[h]] = await pool.query(
    'SELECT * FROM tbl_fin_journal_header WHERE id = ? AND facility_id = ? LIMIT 1',
    [id, fid]
   );
   header = h || null;
   if (header) {
    const [lr] = await pool.query(
     `SELECT jl.id, jl.account_code AS acode, jl.account_label AS alabel,
             jl.debit, jl.credit, jl.line_memo
      FROM tbl_fin_journal_line jl
      WHERE jl.journal_id = ?
      ORDER BY jl.id ASC`,
     [id]
    );
    lines = (Array.isArray(lr) ? lr : []).map((row) => ({
     ...row,
     line_memo: row.line_memo || '',
    }));
   }
  } catch (e) {
   return res.status(500).render('error', { title: 'Error', message: e.message || 'Load failed', status: 500 });
  }
  if (!header) return res.redirect('/financials/journal');
  if (header) {
   header = { ...header, entry_date: formatDisplayDate(header.entry_date), created_at_display: formatDisplayDate(header.created_at) };
  }
  const { journalViewPayload } = require('../lib/finReactPayloads');
  res.render('financials-journal-view', {
   title: `Journal #${id} — ZAIZENS`,
   ...journalViewPayload({
    j: header,
    lines,
    flash: req.query.msg || null,
    error: req.query.err || null,
   }),
  });
 });

 app.get('/financials/journal-new', requireAuth, finWrite, ensureTables, async (req, res) => {
  if (!(await finTablesOk(pool))) {
   return res.redirect('/financials/journal?err=' + encodeURIComponent('Journal tables missing.'));
  }
  let accounts = await loadPostingAccounts(pool);
  if (!accounts.length) {
   const { seedFinAccounts } = require('../lib/finAccountSeedData');
   await seedFinAccounts(pool).catch(() => {});
   accounts = await loadPostingAccounts(pool);
  }
  res.render('financials-journal-new', {
   title: 'New journal entry — ZAIZENS',
   ...journalNewPayload({
    accounts,
    body: {},
    flash: req.query.msg || null,
    error: req.query.err || null,
   }),
  });
 });

 app.post('/financials/journal-new', requireAuth, finWrite, ensureTables, async (req, res) => {
  if (!(await finTablesOk(pool))) {
   return res.redirect('/financials/journal-new?err=' + encodeURIComponent('Journal tables missing.'));
  }
  const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
  const uid = parseInt(String(req.session.userId || req.session.user?.id || 0), 10) || 0;
  let accounts = await loadPostingAccounts(pool);
  if (!accounts.length) {
   const { seedFinAccounts } = require('../lib/finAccountSeedData');
   await seedFinAccounts(pool).catch(() => {});
   accounts = await loadPostingAccounts(pool);
  }
  const validIds = new Set(accounts.map((a) => parseInt(a.id, 10) || 0));

  const jdate = ymBounds(req.body.journal_date);
  const desc = String(req.body.description || '').trim();
  const ref = String(req.body.reference || '').trim().slice(0, 64);

  let err = '';
  if (!jdate) err = 'Invalid journal date.';
  else if (!desc) err = 'Description is required.';

  const lines = [];
  if (!err) {
   const maxLines = 40;
   for (let i = 0; i < maxLines; i++) {
    if (req.body[`acc_${i}`] === undefined && req.body[`dr_${i}`] === undefined && req.body[`cr_${i}`] === undefined) {
     if (i >= 2) break;
     continue;
    }
    const aid = parseInt(String(req.body[`acc_${i}`] ?? '0'), 10) || 0;
    const dr = parseMoneyXaf(req.body[`dr_${i}`]);
    const cr = parseMoneyXaf(req.body[`cr_${i}`]);
    const memo = String(req.body[`memo_${i}`] || '').trim().slice(0, 255);
    if (aid < 1) continue;
    if (dr > 0 && cr > 0) {
     err = 'Each line must be either debit or credit, not both.';
     break;
    }
    if (dr < 1 && cr < 1) continue;
    lines.push({ aid, dr, cr, memo });
   }
   let td = 0;
   let tc = 0;
   for (const ln of lines) {
    td += ln.dr;
    tc += ln.cr;
   }
   if (!err && lines.length === 0) err = 'Add at least one journal line.';
   else if (!err && lines.length < 2) {
    err = 'Double entry requires at least two lines (debit and credit sides).';
   } else if (!err && (td !== tc || td < 1)) {
    err = 'Total debits must equal total credits and be greater than zero.';
   }
   if (!err) {
    for (const ln of lines) {
     if (!validIds.has(ln.aid)) {
      err = 'Invalid account on a line.';
      break;
     }
    }
   }
  }

  const glLines = [];
  if (!err) {
   const byId = new Map(accounts.map((a) => [parseInt(a.id, 10) || 0, a]));
   for (const ln of lines) {
    const a = byId.get(ln.aid);
    if (!a) continue;
    const code = String(a.code || '').trim().slice(0, 32);
    const lab = String(a.label_en || a.code || '').trim().slice(0, 160);
    glLines.push({
     code,
     label: lab,
     debit: ln.dr,
     credit: ln.cr,
     line_memo: ln.memo,
    });
   }
  }

  if (err) {
   return res.render('financials-journal-new', {
    title: 'New journal entry — ZAIZENS',
    ...journalNewPayload({ accounts, body: req.body, flash: null, error: err }),
   });
  }

  const asDraft = req.body.save_as_draft === '1';
  const result = await journalPostManualWithResult(pool, fid, jdate, ref, desc, uid, glLines, {
    asDraft,
    journalCode: String(req.body.journal_code || 'OD').trim().slice(0, 8) || 'OD',
  });
  if (!result.ok || !result.journalId) {
   return res.render('financials-journal-new', {
    title: 'New journal entry — ZAIZENS',
    ...journalNewPayload({
     accounts,
     body: req.body,
     flash: null,
     error: journalPostLastError() || 'Could not post journal.',
    }),
   });
  }
  const msg = result.duplicate
    ? 'Journal was already posted (duplicate source).'
    : asDraft
      ? 'Draft journal saved.'
      : 'Journal posted.';
  return res.redirect(`/financials/journal-view?id=${result.journalId}&msg=` + encodeURIComponent(msg));
 });
};
