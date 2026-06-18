/**
 * Accounts payable (expense register) — parity with PHP financials-accounts-payable.php.
 */
const { tableExists, columnExists, isoDate } = require('./hmsFinGeneralLedger');
const { formatDisplayDate } = require('./hmsFormatDate');

async function finApTableOk(pool) {
 return await tableExists(pool, 'tbl_expense');
}

function round2(n) {
 return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Line-level expenses in period (PHP financials-accounts-payable.php custom query).
 * @returns {Promise<{ ok: boolean, rows: Array<{ id: number, expense_date: string, category: string, vendor: string, description: string, amount_xaf: number }>, sumAp: number, queryError: string }>}
 */
async function finApDetailExpenseRows(pool, facilityId, dateFrom, dateTo) {
 const d1 = isoDate(String(dateFrom || '').trim());
 const d2 = isoDate(String(dateTo || '').trim());
 const fid = Math.max(1, parseInt(facilityId, 10) || 1);
 const empty = { ok: false, rows: [], sumAp: 0, queryError: '' };
 if (!d1 || !d2) return { ...empty, ok: true, queryError: 'Invalid date range.' };
 if (!(await finApTableOk(pool))) return empty;

 const hasVendor = await columnExists(pool, 'tbl_expense', 'vendor');
 const hasDate = await columnExists(pool, 'tbl_expense', 'expense_date');
 const hasCategory = await columnExists(pool, 'tbl_expense', 'category');
 const hasDesc = await columnExists(pool, 'tbl_expense', 'description');
 const hasAmountXaf = await columnExists(pool, 'tbl_expense', 'amount_xaf');
 const hasAmount = await columnExists(pool, 'tbl_expense', 'amount');
 const hasFac = await columnExists(pool, 'tbl_expense', 'facility_id');

 const amtExpr = hasAmountXaf ? 'amount_xaf' : hasAmount ? 'amount' : '0';

 const colDate = hasDate ? 'expense_date' : 'DATE(created_at) AS expense_date';
 const colCat = hasCategory ? 'category' : "'' AS category";
 const colVend = hasVendor ? 'vendor' : "'' AS vendor";
 const colDesc = hasDesc ? 'description' : "'' AS description";
 const whereDate = hasDate ? 'expense_date' : 'DATE(created_at)';
 const orderDate = hasDate ? 'expense_date' : 'created_at';

 const whereFac = hasFac ? 'facility_id = ? AND ' : '';
 const sql = `SELECT id, ${colDate}, ${colCat}, ${colVend}, ${colDesc}, ${amtExpr} AS amount_xaf
   FROM tbl_expense
   WHERE ${whereFac}${whereDate} >= ? AND ${whereDate} <= ?
   ORDER BY ${orderDate} DESC, id DESC`;

 const params = hasFac ? [fid, d1, d2] : [d1, d2];

 try {
  const [rawRows] = await pool.query(sql, params);
  const rows = [];
  let sumAp = 0;
  for (const row of rawRows || []) {
   const ed = row.expense_date != null ? String(row.expense_date).slice(0, 10) : '';
   const amt = round2(row.amount_xaf);
   sumAp += amt;
   const expense_date_display = formatDisplayDate(ed || row.expense_date);
   rows.push({
    id: parseInt(row.id, 10) || 0,
    expense_date: ed,
    expense_date_display,
    category: String(row.category ?? ''),
    vendor: String(row.vendor ?? ''),
    description: String(row.description ?? ''),
    amount_xaf: amt
   });
  }
  return { ok: true, rows, sumAp: round2(sumAp), queryError: '' };
 } catch (e) {
  return {
   ok: true,
   rows: [],
   sumAp: 0,
   queryError: e && e.message ? String(e.message) : 'Query failed'
  };
 }
}

module.exports = {
 finApTableOk,
 finApDetailExpenseRows
};
