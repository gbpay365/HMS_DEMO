'use strict';

const { amountPaidWords } = require('./amountInWords');
const { resolveCashierForEmployee, formatCashierDisplay } = require('./cashierIdentity');

/** Resolve employee display name for receipt "received by" line. */
async function resolveCashierDisplayName(pool, employeeId) {
  const uid = parseInt(employeeId, 10);
  if (!uid || !Number.isFinite(uid)) return null;

  const cashierRow = await resolveCashierForEmployee(pool, uid, { autoAssign: false });
  if (cashierRow) return formatCashierDisplay(cashierRow);

  try {
    const [[emp]] = await pool.query(
      'SELECT first_name, last_name, username FROM tbl_employee WHERE id = ? LIMIT 1',
      [uid]
    );
    if (!emp) return null;
    const full = [emp.first_name, emp.last_name].filter(Boolean).join(' ').trim();
    return full || emp.username || null;
  } catch (_) {
    return null;
  }
}

/** Attach cashier_name for print views (keeps numeric created_by for audit). */
async function enrichBillingReceiptForPrint(pool, receipt) {
  if (!receipt || typeof receipt !== 'object') return receipt;
  const cashierName = await resolveCashierDisplayName(pool, receipt.created_by);
  return { ...receipt, cashier_name: cashierName };
}

function amountWordsForPrint(amount) {
  return amountPaidWords(amount);
}

module.exports = {
  resolveCashierDisplayName,
  enrichBillingReceiptForPrint,
  amountWordsForPrint,
};
