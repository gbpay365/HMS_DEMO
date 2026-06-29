'use strict';

const { resolvePaymentTicketForPrint } = require('./resolvePaymentTicketForPrint');
const {
  refundableAmountForTicket,
  paidRefundSummaryForTicket,
  syncTicketPaidWithRefundLines,
} = require('./cashierRefundPost');

function mapRefundMethod(paymentMethod) {
  const m = String(paymentMethod || '').toLowerCase();
  if (m.includes('wallet')) return 'Wallet';
  if (m.includes('card') || m === 'pos') return 'Card';
  return 'Cash';
}

/**
 * Look up a cashier bill by ticket / payment code for refund and billing flows.
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} rawCode
 */
async function lookupCashierBill(pool, rawCode) {
  const code = String(rawCode || '').trim();
  if (!code) {
    return { ok: false, error: 'Bill number is required.', status: 400 };
  }

  const resolved = await resolvePaymentTicketForPrint(pool, code);
  if (!resolved?.ticket) {
    return { ok: false, error: 'No bill found with that number.', status: 404 };
  }

  let t = resolved.ticket;
  await syncTicketPaidWithRefundLines(pool, t);
  if (t.id) {
    const [[fresh]] = await pool
      .query(
        `SELECT t.*, p.first_name, p.last_name
           FROM tbl_payment_ticket t
           JOIN tbl_patient p ON p.id = t.patient_id
          WHERE t.id = ?
          LIMIT 1`,
        [t.id]
      )
      .catch(() => [[]]);
    if (fresh) t = fresh;
  }

  const status = String(t.status || '').toLowerCase();
  if (status === 'cancelled' || status === 'canceled') {
    return { ok: false, error: 'This bill has been cancelled.', status: 400 };
  }

  const total = parseFloat(t.total_amount) || 0;
  const paid = parseFloat(t.amount_paid) || 0;
  const amountPaid = paid > 0 ? paid : status === 'paid' ? total : 0;
  const patientName = `${t.first_name || ''} ${t.last_name || ''}`.trim();
  const refundable = await refundableAmountForTicket(pool, t);
  const paidRefunds = await paidRefundSummaryForTicket(pool, t.id);

  return {
    ok: true,
    bill: {
      ticket_id: t.id || null,
      ticket_code: t.ticket_code,
      patient_id: t.patient_id,
      patient_name: patientName || '—',
      total_amount: total,
      amount_paid: amountPaid,
      balance_due: Math.max(0, Math.round((total - amountPaid) * 100) / 100),
      refundable_amount: refundable,
      already_refunded: paidRefunds.total,
      paid_refund_refs: paidRefunds.refs,
      status,
      payment_method: t.payment_method || null,
      suggested_refund_method: mapRefundMethod(t.payment_method),
      source: resolved.source,
    },
  };
}

module.exports = { lookupCashierBill };
