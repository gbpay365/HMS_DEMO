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

/** Attach cashier_name and cash change fields for print views (keeps numeric created_by for audit). */
async function enrichBillingReceiptForPrint(pool, receipt) {
  if (!receipt || typeof receipt !== 'object') return receipt;
  const cashierName = await resolveCashierDisplayName(pool, receipt.created_by);
  let cash_tendered = null;
  let change_amount = null;

  if (String(receipt.source_module || '') === 'payment_ticket' && receipt.source_pk) {
    const ticketId = parseInt(receipt.source_pk, 10) || 0;
    if (ticketId > 0) {
      const [[ticket]] = await pool
        .query(
          'SELECT payment_method, cash_tendered, change_amount FROM tbl_payment_ticket WHERE id = ? LIMIT 1',
          [ticketId]
        )
        .catch(() => [[null]]);
      if (ticket && String(ticket.payment_method || '').trim().toLowerCase() === 'cash') {
        const tendered = parseFloat(ticket.cash_tendered);
        const change = parseFloat(ticket.change_amount);
        if (Number.isFinite(tendered) && tendered > 0) cash_tendered = tendered;
        if (Number.isFinite(change) && change > 0) change_amount = change;
      }
    }
  }

  return { ...receipt, cashier_name: cashierName, cash_tendered, change_amount };
}

function amountWordsForPrint(amount) {
  return amountPaidWords(amount);
}

module.exports = {
  resolveCashierDisplayName,
  enrichBillingReceiptForPrint,
  amountWordsForPrint,
};
