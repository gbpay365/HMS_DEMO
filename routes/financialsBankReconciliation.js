/**
 * Bank reconciliation — parity with htdocs_php/htdocs/financials-bank-reconciliation.php.
 */
const { finTablesOk, finAccountBalanceCodeAsOf, formatXaf, isoDate } = require('../lib/hmsFinGeneralLedger');
const ensureFinJournal019 = require('../lib/ensureFinJournal019');

function facilityId(req) {
 return Math.max(1, parseInt(req.session.facilityId, 10) || 1);
}

function sanitizeBankCode(raw) {
 const d = String(raw ?? '').replace(/\D/g, '');
 return d ? d.slice(0, 20) : '512000';
}

function parseStatementBalance(raw) {
 const s = String(raw ?? '').trim();
 if (s === '') return null;
 const n = Number(s.replace(/\s/g, '').replace(',', '.'));
 if (!Number.isFinite(n)) return null;
 return Math.round(n * 100) / 100;
}

module.exports = function registerFinancialsBankReconciliation(app, pool, requireAuth, requirePerm) {
 const finRead = requirePerm('accounting.read', 'accounting.write', 'financials.read', 'financials.write');

 app.get('/financials/bank-reconciliation', requireAuth, finRead, async (req, res) => {
  try {
   await ensureFinJournal019(pool).catch(() => {});
   const fid = facilityId(req);
   const bankCode = sanitizeBankCode(req.query.bank);
   let asof = String(req.query.asof || '').trim();
   if (!isoDate(asof)) asof = new Date().toISOString().slice(0, 10);
   const stmtBalRaw = req.query.stmt != null ? String(req.query.stmt) : '';
   const stmtAmount = parseStatementBalance(stmtBalRaw);

   const finOk = await finTablesOk(pool);
   let book = 0;
   if (finOk) {
    book = await finAccountBalanceCodeAsOf(pool, fid, asof, bankCode);
   }
   const diff = stmtAmount !== null ? Math.round((stmtAmount - book) * 100) / 100 : null;

   const reportDate = new Date().toISOString().slice(0, 10);
   const reportRef = `BR-${asof.replace(/-/g, '')}-${bankCode}`;

   const { bankReconPayload } = require('../lib/finReactPayloads');
   res.render('financials-bank-reconciliation', {
    title: 'Bank reconciliation - ZAIZENS',
    ...bankReconPayload({
     bankCode,
     asof,
     stmtBal: stmtBalRaw.trim(),
     stmtAmount,
     book,
     diff,
     flash: req.query.msg || null,
     error: req.query.err || null,
    }),
   });
  } catch (err) {
   console.error('FINANCIALS BANK REC:', err.message);
   res.status(500).render('error', { title: 'Error', message: err.message, status: 500 });
  }
 });
};
