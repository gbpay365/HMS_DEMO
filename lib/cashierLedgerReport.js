'use strict';

const { fmtMoney } = require('./cashierDailySummary');
const { formatDisplayDate } = require('./hmsFormatDate');
const { formatEmployeeName } = require('./cashierIdentity');

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchCashierLedgerRows(pool, opts = {}) {
  const fid = Math.max(1, parseInt(String(opts.facilityId || 1), 10) || 1);
  const dateFrom = String(opts.dateFrom || opts.date || todayIso()).slice(0, 10);
  const dateTo = String(opts.dateTo || opts.date || dateFrom).slice(0, 10);
  const cashierCode = String(opts.cashierCode || '').trim();
  const paymentMethod = String(opts.paymentMethod || '').trim();
  const limit = Math.min(500, Math.max(1, parseInt(String(opts.limit || 200), 10) || 200));

  let sql = `
    SELECT t.id, t.created_at, t.txn_type, t.cashier_code, t.cashier_identity, t.payment_method,
           t.opening_balance, t.debit_amount, t.credit_amount, t.closing_balance,
           t.amount, t.reference, t.narration, t.source_module, t.source_pk,
           t.journal_header_id, t.gl_debit_account, t.gl_credit_account,
           e.first_name, e.last_name
      FROM tbl_cashier_txn t
      LEFT JOIN tbl_employee e ON e.id = t.employee_id
     WHERE t.facility_id = ?
       AND DATE(t.created_at) BETWEEN ? AND ?`;
  const params = [fid, dateFrom, dateTo];
  if (cashierCode) {
    sql += ' AND t.cashier_code = ?';
    params.push(cashierCode);
  }
  if (paymentMethod) {
    sql += ' AND t.payment_method = ?';
    params.push(paymentMethod);
  }
  sql += ' ORDER BY t.id DESC LIMIT ?';
  params.push(limit);

  const [rows] = await pool.query(sql, params).catch(() => [[]]);
  return (rows || []).map((r) => ({
    ...r,
    employee_name: formatEmployeeName(r) || '—',
    opening_balance_fmt: fmtMoney(r.opening_balance),
    debit_amount_fmt: fmtMoney(r.debit_amount),
    credit_amount_fmt: fmtMoney(r.credit_amount),
    closing_balance_fmt: fmtMoney(r.closing_balance),
    amount_fmt: fmtMoney(r.amount),
    created_at_fmt: formatDisplayDate(r.created_at),
  }));
}

/** Last closing balance per cashier + payment method for a business date (EOD). */
async function fetchLedgerClosingBalances(pool, opts = {}) {
  const fid = Math.max(1, parseInt(String(opts.facilityId || 1), 10) || 1);
  const date = String(opts.date || todayIso()).slice(0, 10);
  const [rows] = await pool
    .query(
      `SELECT t.cashier_code, t.cashier_identity, t.payment_method, t.closing_balance, t.cashier_id,
              e.first_name, e.last_name
         FROM tbl_cashier_txn t
         LEFT JOIN tbl_cashier c ON c.id = t.cashier_id
         LEFT JOIN tbl_employee e ON e.id = COALESCE(c.employee_id, t.employee_id)
         INNER JOIN (
           SELECT cashier_id, payment_method, MAX(id) AS max_id
             FROM tbl_cashier_txn
            WHERE facility_id = ? AND DATE(created_at) = ?
            GROUP BY cashier_id, payment_method
         ) latest ON t.id = latest.max_id
        ORDER BY t.cashier_code, t.payment_method`,
      [fid, date]
    )
    .catch(() => [[]]);
  return (rows || []).map((r) => ({
    cashier_code: r.cashier_code,
    cashier_identity: r.cashier_identity,
    employee_name: formatEmployeeName(r) || '—',
    payment_method: r.payment_method,
    closing_balance: n(r.closing_balance),
    closing_balance_fmt: fmtMoney(r.closing_balance),
  }));
}

async function buildCashierLedgerReport(pool, opts = {}) {
  const date = String(opts.date || todayIso()).slice(0, 10);
  const rows = await fetchCashierLedgerRows(pool, { ...opts, dateFrom: date, dateTo: date });
  const closingBalances = await fetchLedgerClosingBalances(pool, { ...opts, date });
  return {
    date,
    date_fmt: formatDisplayDate(date),
    rows,
    closingBalances,
    total_count: rows.length,
  };
}

module.exports = {
  fetchCashierLedgerRows,
  fetchLedgerClosingBalances,
  buildCashierLedgerReport,
};
