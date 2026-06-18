'use strict';

const { allocateUniquePaymentCode } = require('./paymentTicketCode');

/** Cancel rolling EMG pending tickets for a visit (after final ER settlement or discharge workflow). */
async function cancelPendingEmgTickets(db, visitId) {
  const vid = parseInt(visitId, 10) || 0;
  if (vid < 1) return;
  await db
    .query(
      `UPDATE tbl_payment_ticket
          SET status = 'cancelled'
        WHERE status = 'pending'
          AND emergency_visit_id = ?`,
      [vid]
    )
    .catch(() => {});
}

/**
 * After cashier collects an EMG ticket, issue er_payment_code when the visit is clinically discharged
 * so ER desk can confirm discharge without a separate er-settle step.
 */
async function ensureErDischargeCodeAfterCollect(conn, visitId, uid) {
  const vid = parseInt(visitId, 10) || 0;
  if (vid < 1) return null;

  const [[v]] = await conn
    .query(
      `SELECT id, er_payment_code, queue_status
         FROM tbl_opd_visit
        WHERE id = ? AND is_emergency = 1
        LIMIT 1 FOR UPDATE`,
      [vid]
    )
    .catch(() => [[null]]);

  if (!v || String(v.queue_status) !== 'clinical_discharged') return null;

  let code = String(v.er_payment_code || '').trim();
  if (!code) {
    code = await allocateUniquePaymentCode(conn, 'emergency_settlement');
    await conn.query(
      `UPDATE tbl_opd_visit
          SET er_payment_code = ?,
              er_paid_at = NOW(),
              er_payment_code_generated_at = COALESCE(er_payment_code_generated_at, NOW())
        WHERE id = ?`,
      [code, vid]
    );
  }

  await cancelPendingEmgTickets(conn, vid);
  return code;
}

module.exports = {
  cancelPendingEmgTickets,
  ensureErDischargeCodeAfterCollect,
};
