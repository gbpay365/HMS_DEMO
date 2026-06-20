'use strict';

/**
 * Insert a paid receipt row for a payment ticket (Cash / Wallet / etc.).
 * Uses VALUES (not INSERT…SELECT) so PostgreSQL RETURNING id works reliably.
 * @returns {Promise<number>} billing document id (0 if unknown)
 */
async function insertReceiptForPaymentTicket(conn, {
  facilityId,
  patientId,
  ticketId,
  totalAmount,
  paymentMethod,
  receiptNo,
  invoiceNo,
  userId,
}) {
  const fid = parseInt(String(facilityId || 1), 10) || 1;
  const pid = parseInt(String(patientId || 0), 10) || 0;
  const tid = parseInt(String(ticketId || 0), 10) || 0;
  const amt = parseFloat(totalAmount) || 0;
  const uid = userId != null ? parseInt(String(userId), 10) || 0 : 0;

  const [result] = await conn.query(
    `INSERT INTO tbl_billing_document
     (facility_id, patient_id, doc_type, doc_number, invoice_doc_number, total_amount, payment_method,
      status, source_module, source_pk, created_by, created_at)
     VALUES (?, ?, 'receipt', ?, ?, ?, ?, 'paid', 'payment_ticket', ?, ?, NOW())`,
    [fid, pid, receiptNo, invoiceNo, amt, paymentMethod, tid, uid]
  );

  let docId = parseInt(String(result?.insertId || 0), 10) || 0;
  if (docId > 0) return docId;

  const [[row]] = await conn.query(
    `SELECT id FROM tbl_billing_document
     WHERE source_module = 'payment_ticket' AND source_pk = ?
     ORDER BY id DESC LIMIT 1`,
    [tid]
  ).catch(() => [[null]]);
  docId = parseInt(String(row?.id || 0), 10) || 0;
  if (docId > 0) return docId;

  if (receiptNo) {
    const [[byNum]] = await conn.query(
      `SELECT id FROM tbl_billing_document WHERE doc_number = ? ORDER BY id DESC LIMIT 1`,
      [receiptNo]
    ).catch(() => [[null]]);
    docId = parseInt(String(byNum?.id || 0), 10) || 0;
  }
  return docId;
}

module.exports = { insertReceiptForPaymentTicket };
