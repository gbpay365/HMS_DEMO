'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');

(async () => {
  const pool = createDbPool();
  const uid = 1250; // Super Admin from prior logs
  const fid = 1;
  const amount = 500;
  const narration = 'debug petty cash test';
  const paymentMethod = 'Cash';
  const category = 'general';
  const txnType = 'expense';
  const glKind = 'expense';

  const conn = await pool.getConnection();
  let step = 'start';
  try {
    step = 'ensureDisbursementSchema';
    const { ensureCashierDisbursementSchema } = require('../lib/ensureCashierDisbursementSchema');
    await ensureCashierDisbursementSchema(conn);

    step = 'beginTransaction';
    await conn.beginTransaction();

    step = 'insertDisbursement';
    const [ins] = await conn.query(
      `INSERT INTO tbl_cashier_disbursement
       (facility_id, txn_type, category, amount, payment_method, narration, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [fid, txnType, category, amount, paymentMethod, narration.slice(0, 500), uid]
    );
    const disbursementId = parseInt(String(ins?.insertId || 0), 10) || 0;
    console.log('disbursementId', disbursementId);
    if (disbursementId < 1) throw new Error('no disbursement id');

    step = 'recordDisbursementInTransaction';
    const { recordDisbursementInTransaction } = require('../lib/cashierTxnWire');
    const cashierTxnResult = await recordDisbursementInTransaction(conn, {
      facilityId: fid,
      userId: uid,
      disbursementId,
      glKind,
      amount,
      paymentMethod,
      expenseCategory: category,
      narration,
    });
    console.log('cashierTxnResult', cashierTxnResult);

    step = 'commit';
    await conn.commit();
    console.log('OK committed', { disbursementId, cashierTxnResult });
  } catch (e) {
    console.error('FAIL at step:', step, e.message);
    await conn.rollback().catch(() => {});
  } finally {
    conn.release();
    await pool.end?.();
  }
})();
