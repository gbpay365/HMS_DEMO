require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');
const { nextReceiptNumber, ensurePostgresReceiptInvoiceSeq } = require('../lib/receiptNumber');
const { nextInvoiceNumber } = require('../lib/invoiceNumber');
const { insertReceiptForPaymentTicket } = require('../lib/cashierInsertBillingDocument');

(async () => {
  const pool = createDbPool();
  await ensurePostgresReceiptInvoiceSeq(pool);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    try {
      console.log('step receipt...');
      const r = await nextReceiptNumber(conn, 1);
      console.log('receipt OK', r);
      console.log('step invoice...');
      const i = await nextInvoiceNumber(conn, 1);
      console.log('invoice OK', i);
      console.log('step billing doc...');
      const docId = await insertReceiptForPaymentTicket(conn, {
        facilityId: 1,
        patientId: 1,
        ticketId: 99999,
        totalAmount: 100,
        paymentMethod: 'Cash',
        receiptNo: r,
        invoiceNo: i,
        userId: 1,
      });
      console.log('doc OK', docId);
      await conn.rollback();
    } catch (e) {
      console.error('IN TX FAIL:', e.message);
      await conn.rollback().catch(() => {});
    }
  } finally {
    conn.release();
    await pool.end?.();
  }
})();
