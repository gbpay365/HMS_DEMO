'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');

async function tryStep(conn, label, fn) {
  try {
    const r = await fn();
    console.log('OK', label, r === undefined ? '' : r);
    return r;
  } catch (e) {
    console.error('FAIL', label, e.message);
    throw e;
  }
}

(async () => {
  const pool = createDbPool();
  const conn = await pool.getConnection();
  const uid = 1250;
  const fid = 1;
  try {
    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO tbl_cashier_disbursement
       (facility_id, txn_type, category, amount, payment_method, narration, created_by)
       VALUES (?, 'expense', 'general', 100, 'Cash', 'step test', ?)`,
      [fid, uid]
    );
    const disbursementId = ins?.insertId;
    console.log('disbursementId', disbursementId);

    await tryStep(conn, 'ensureCashierTxnSchema', async () => {
      const { ensureCashierTxnSchema } = require('../lib/ensureCashierTxnSchema');
      return ensureCashierTxnSchema(conn);
    });

    await tryStep(conn, 'findExisting', async () => {
      const [[row]] = await conn.query(
        'SELECT id FROM tbl_cashier_txn WHERE source_module=? AND source_pk=? LIMIT 1',
        ['cashier_disbursement', disbursementId]
      );
      return row;
    });

    await tryStep(conn, 'ensureCashierIdentitySchema', async () => {
      const { ensureCashierIdentitySchema } = require('../lib/ensureCashierIdentitySchema');
      return ensureCashierIdentitySchema(conn);
    });

    await tryStep(conn, 'syncCashierIdentities', async () => {
      const { syncCashierIdentities } = require('../lib/cashierIdentity');
      return syncCashierIdentities(conn, { facilityId: fid });
    });

    await tryStep(conn, 'resolveCashier', async () => {
      const { resolveCashierForEmployee } = require('../lib/cashierIdentity');
      return resolveCashierForEmployee(conn, uid, { facilityId: fid, forceAssign: true });
    });

    await conn.rollback();
  } catch (e) {
    console.error('outer', e.message);
    await conn.rollback().catch(() => {});
  } finally {
    conn.release();
    await pool.end?.();
  }
})();
