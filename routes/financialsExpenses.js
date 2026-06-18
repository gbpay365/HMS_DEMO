'use strict';

const { tableExists, finTablesOk } = require('../lib/hmsFinGeneralLedger');
const { postExpenseToGl } = require('../lib/hmsFinJournalPost');
const ensureFinJournal019 = require('../lib/ensureFinJournal019');
const { mapFinRows } = require('../lib/hmsFormatDate');
const { expensesPayload, expenseNewPayload } = require('../lib/finReactPayloads');

const DEFAULT_CATEGORIES = [
 'Utilities',
 'Supplies',
 'Salaries & wages',
 'Rent',
 'Transport',
 'Communications',
 'Maintenance',
 'Professional fees',
 'Insurance',
 'Taxes & duties',
 'Bank charges',
 'Equipment',
 'Other',
];

function expenseRead(req, res, next) {
 const p = res.locals.userPerms || [];
 const ok =
  p.includes('*') ||
  p.includes('expenses.read') ||
  p.includes('expenses.write') ||
  p.includes('billing.read') ||
  p.includes('billing.write') ||
  p.includes('accounting.read') ||
  p.includes('accounting.write') ||
  p.includes('financials.read') ||
  p.includes('financials.write');
 if (ok) return next();
 const aclLayout = require('../lib/aclLayout');
 const role = String((req.session && req.session.user && req.session.user.role) || '');
 const home = aclLayout.staffHomeUrl(role) || '/profile';
 return res.redirect(home + '?err=' + encodeURIComponent('Access denied.'));
}

function expenseWrite(req, res, next) {
 const p = res.locals.userPerms || [];
 const ok =
  p.includes('*') ||
  p.includes('expenses.write') ||
  p.includes('billing.write') ||
  p.includes('accounting.write') ||
  p.includes('financials.write');
 if (ok) return next();
 const aclLayout = require('../lib/aclLayout');
 const role = String((req.session && req.session.user && req.session.user.role) || '');
 const home = aclLayout.staffHomeUrl(role) || '/profile';
 return res.redirect(home + '?err=' + encodeURIComponent('You do not have permission to record expenses.'));
}

async function expenseTableOk(pool) {
 return tableExists(pool, 'tbl_expense');
}

async function loadCategoryChoices(pool, facilityId) {
 const seen = new Set();
 const out = [];
 const add = (c) => {
  const t = String(c || '').trim();
  if (!t) return;
  const k = t.toLowerCase();
  if (seen.has(k)) return;
  seen.add(k);
  out.push(t);
 };
 DEFAULT_CATEGORIES.forEach(add);
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 try {
  const [rows] = await pool.query(
   `SELECT DISTINCT TRIM(category) AS c FROM tbl_expense WHERE facility_id = ? AND TRIM(category) <> '' ORDER BY c ASC`,
   [fid]
  );
  for (const r of rows || []) add(r.c);
 } catch (_) {
  /* ignore */
 }
 out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
 return out;
}

async function loadExpenseRows(pool, facilityId) {
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 if (!(await expenseTableOk(pool))) return { ok: true, rows: [], error: '' };
 const finOk = await finTablesOk(pool);
 const glSelect = finOk
  ? ', CASE WHEN jh.id IS NOT NULL THEN 1 ELSE 0 END AS gl_posted, jh.id AS journal_id'
  : ', 0 AS gl_posted, NULL AS journal_id';
 const glJoin = finOk
  ? `LEFT JOIN tbl_fin_journal_header jh ON jh.facility_id = e.facility_id AND jh.source_type = 'expense' AND jh.source_id = e.id`
  : '';
 try {
  const [rows] = await pool.query(
   `SELECT e.*,
           TRIM(CONCAT(COALESCE(emp.first_name,''),' ',COALESCE(emp.last_name,''))) AS created_by_name
           ${glSelect}
    FROM tbl_expense e
    LEFT JOIN tbl_employee emp ON emp.id = e.created_by
    ${glJoin}
    WHERE e.facility_id = ?
    ORDER BY e.expense_date DESC, e.id DESC
    LIMIT 500`,
   [fid]
  );
  return { ok: true, rows: mapFinRows(Array.isArray(rows) ? rows : []), error: '' };
 } catch (e) {
  return { ok: false, rows: [], error: e.message || 'Could not load expenses.' };
 }
}

function expenseSavedMessage(glCode, finOk) {
 if (glCode === 1) return 'Expense recorded and posted to the general ledger.';
 if (glCode === 2) return 'Expense recorded (GL entry already existed).';
 if (!finOk) {
  return 'Expense recorded. Journal tables are not available — amounts stay in tbl_expense until you run journal migration or Sync to GL.';
 }
 return 'Expense recorded.';
}

function isoDate(d) {
 const s = String(d || '').trim().slice(0, 10);
 return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function parseAmountXaf(raw) {
 return parseInt(String(raw || '').replace(/\D+/g, ''), 10) || 0;
}

module.exports = function registerFinancialsExpenses(app, pool, requireAuth) {
 /** PHP expense-management.php parity */
 app.get('/expense-management', requireAuth, expenseRead, (req, res) => {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect('/financials/expenses' + q);
 });
 app.get('/expense-management-new', requireAuth, expenseWrite, (req, res) => {
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect('/financials/expenses/new' + q);
 });

 app.get('/financials/expenses', requireAuth, expenseRead, async (req, res) => {
  const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
  const tableOk = await expenseTableOk(pool);
  const finOk = await finTablesOk(pool);
  const pack = tableOk ? await loadExpenseRows(pool, fid) : { ok: true, rows: [], error: '' };
  res.render('financials-expenses', {
   title: 'Expense management — ZAIZENS',
   ...expensesPayload({
    rows: pack.rows,
    loadErr: pack.error,
    flash: req.query.msg || null,
    error: req.query.err || null,
   }),
  });
 });

 app.get('/financials/expenses/new', requireAuth, expenseWrite, async (req, res) => {
  const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
  const tableOk = await expenseTableOk(pool);
  const finOk = await finTablesOk(pool);
  const categories = tableOk ? await loadCategoryChoices(pool, fid) : [];
  res.render('financials-expenses-new', {
   title: 'New expense — ZAIZENS',
   ...expenseNewPayload({
    tableOk,
    finOk,
    categories,
    body: {},
    flash: req.query.msg || null,
    error: req.query.err || null,
   }),
  });
 });

 app.post('/financials/expenses/new', requireAuth, expenseWrite, async (req, res) => {
  const fid = parseInt(String(req.session.facilityId || 1), 10) || 1;
  const uid = parseInt(String(req.session.userId || req.session.user?.id || 0), 10) || 0;
  const tableOk = await expenseTableOk(pool);
  const categories = tableOk ? await loadCategoryChoices(pool, fid) : [];

  if (!tableOk) {
   return res.redirect('/financials/expenses/new?err=' + encodeURIComponent('Run migration 026_expense_management.sql first.'));
  }

  const ed = isoDate(req.body.expense_date);
  let cat = String(req.body.category || '').trim();
  if (cat.length > 120) cat = cat.slice(0, 120);
  const desc = String(req.body.description || '').trim().slice(0, 512);
  const amt = parseAmountXaf(req.body.amount_xaf);
  const pay = String(req.body.payment_method || '').trim().slice(0, 64);
  const ref = String(req.body.reference || '').trim().slice(0, 120);
  const ven = String(req.body.vendor || '').trim().slice(0, 200);
  const notes = String(req.body.notes || '').trim();

  let err = '';
  if (!ed) err = 'Please enter a valid expense date.';
  else if (!cat) err = 'Category is required.';
  else if (amt < 1) err = 'Amount must be at least 1 FCFA.';

  if (err) {
   return res.render('financials-expenses-new', {
    title: 'New expense — ZAIZENS',
    ...expenseNewPayload({
     tableOk: true,
     categories,
     body: req.body,
     flash: null,
     error: err,
    }),
   });
  }

  try {
   const [ins] = await pool.query(
    `INSERT INTO tbl_expense (facility_id, expense_date, category, description, amount_xaf, payment_method, reference, vendor, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [fid, ed, cat, desc, amt, pay || null, ref || null, ven || null, notes || null, uid]
   );
   const newId = ins.insertId;
   let glCode = 0;
   const finOk = await finTablesOk(pool);
   if (newId && finOk) {
    await ensureFinJournal019(pool).catch(() => {});
    glCode = await postExpenseToGl(pool, fid, newId, ed, amt, pay || null, cat, desc, uid);
   }
   const msg = expenseSavedMessage(glCode, finOk);
   return res.redirect('/financials/expenses?msg=' + encodeURIComponent(msg));
  } catch (e) {
   const finOk = await finTablesOk(pool);
   return res.render('financials-expenses-new', {
    title: 'New expense — ZAIZENS',
    ...expenseNewPayload({
     tableOk: true,
     finOk,
     categories,
     body: req.body,
     flash: null,
     error: e.message || 'Could not save expense.',
    }),
   });
  }
 });
};
