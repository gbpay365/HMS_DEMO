'use strict';

const { livreJournalPayload } = require('../lib/finReactPayloads');
const ensureFinAccountingSchema = require('../lib/ensureFinAccountingSchema');
const { fetchLivreJournalRows, buildExcelBuffer, buildPrintHtml } = require('../lib/finLivreJournal');
const { JOURNAL_CODES } = require('../lib/finAccountingConfig');

function finRead(req, res, next) {
  const p = res.locals.userPerms || [];
  const ok =
    p.includes('*') ||
    p.includes('accounting.read') ||
    p.includes('accounting.write') ||
    p.includes('financials.read') ||
    p.includes('financials.write');
  if (ok) return next();
  return res.redirect('/financials?err=' + encodeURIComponent('Access denied.'));
}

function ymBounds(d) {
  const s = String(d || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

module.exports = function registerFinancialsLivreJournal(app, pool, requireAuth) {
  app.get('/financials/livre-journal', requireAuth, finRead, async (req, res) => {
    await ensureFinAccountingSchema(pool);
    const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
    const from =
      ymBounds(req.query.from) ||
      new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
    const to =
      ymBounds(req.query.to) ||
      new Date(new Date().getFullYear(), 11, 31).toISOString().slice(0, 10);
    const jc = String(req.query.journal || 'all').trim().slice(0, 8);

    let rows = [];
    try {
      rows = await fetchLivreJournalRows(pool, fid, from, to, jc);
    } catch (e) {
      return res.redirect('/financials/journal?err=' + encodeURIComponent(e.message || 'Load failed'));
    }

    res.render('financials-livre-journal', {
      title: 'Livre-journal — ZAIZENS',
      ...livreJournalPayload({
        subtitle: `${from} → ${to}${jc !== 'all' ? ` · ${jc}` : ''}`,
        columns: [
          { key: 'entry_date', label: 'Date' },
          { key: 'journal_code', label: 'Journal' },
          { key: 'piece_number', label: 'Pièce' },
          { key: 'account_code', label: 'Account' },
          { key: 'account_label', label: 'Label' },
          { key: 'debit', label: 'Debit', align: 'right', format: 'money' },
          { key: 'credit', label: 'Credit', align: 'right', format: 'money' },
          { key: 'narration', label: 'Narration' },
        ],
        rows: rows.map((r) => ({ ...r, entry_date: String(r.entry_date || '').slice(0, 10) })),
        journalCodes: Object.values(JOURNAL_CODES),
        filterFrom: from,
        filterTo: to,
        filterJournal: jc,
        flash: req.query.msg || null,
        error: req.query.err || null,
      }),
    });
  });

  app.get('/financials/livre-journal/export.xlsx', requireAuth, finRead, async (req, res) => {
    await ensureFinAccountingSchema(pool);
    const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
    const from = ymBounds(req.query.from) || `${new Date().getFullYear()}-01-01`;
    const to = ymBounds(req.query.to) || `${new Date().getFullYear()}-12-31`;
    const jc = String(req.query.journal || 'all').trim();
    const rows = await fetchLivreJournalRows(pool, fid, from, to, jc);
    const buf = buildExcelBuffer(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="livre-journal-${from}-${to}.xlsx"`);
    res.send(buf);
  });

  app.get('/financials/livre-journal/print', requireAuth, finRead, async (req, res) => {
    await ensureFinAccountingSchema(pool);
    const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
    const from = ymBounds(req.query.from) || `${new Date().getFullYear()}-01-01`;
    const to = ymBounds(req.query.to) || `${new Date().getFullYear()}-12-31`;
    const jc = String(req.query.journal || 'all').trim();
    const rows = await fetchLivreJournalRows(pool, fid, from, to, jc);
    const html = buildPrintHtml(rows, { from, to, journalCode: jc });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });
};
