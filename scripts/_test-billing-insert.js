require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');
const { insertReceiptForPaymentTicket } = require('../lib/cashierInsertBillingDocument');
const { nextReceiptNumber, ensurePostgresReceiptInvoiceSeq } = require('../lib/receiptNumber');
const { nextInvoiceNumber } = require('../lib/invoiceNumber');

(async () => {
  const pool = createDbPool();
  await ensurePostgresReceiptInvoiceSeq(pool);
  const [[ticket]] = await pool.query(
    "SELECT id, facility_id, patient_id, total_amount FROM tbl_payment_ticket WHERE status='pending' LIMIT 1"
  );
  if (!ticket) {
    console.log('No pending ticket to test');
    await pool.end?.();
    return;
  }
  console.log('Testing with ticket', ticket.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const receiptNo = await nextReceiptNumber(conn, ticket.facility_id || 1);
    const invoiceNo = await nextInvoiceNumber(conn, ticket.facility_id || 1);
    console.log('receipt', receiptNo, 'invoice', invoiceNo);
    const docId = await insertReceiptForPaymentTicket(conn, {
      facilityId: ticket.facility_id || 1,
      patientId: ticket.patient_id,
      ticketId: ticket.id,
      totalAmount: ticket.total_amount,
      paymentMethod: 'Cash',
      receiptNo,
      invoiceNo,
      userId: 1,
    });
    console.log('billingDocId', docId);
    await conn.rollback();
    console.log('OK (rolled back)');
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error('FAIL:', e.message);
  } finally {
    conn.release();
    await pool.end?.();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
