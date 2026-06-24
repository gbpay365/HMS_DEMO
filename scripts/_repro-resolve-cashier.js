'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');

async function tryStep(conn, label, fn) {
  try {
    const r = await fn();
    console.log('OK', label, JSON.stringify(r));
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

    await tryStep(conn, 'ensureCashierIdentitySchema', async () => {
      const { ensureCashierIdentitySchema } = require('../lib/ensureCashierIdentitySchema');
      return ensureCashierIdentitySchema(conn);
    });

    await tryStep(conn, 'selectCashier', async () => {
      const [[row]] = await conn.query(
        `SELECT id, cashier_code FROM tbl_cashier WHERE employee_id = ? AND status = 1 LIMIT 1`,
        [uid]
      );
      return row;
    });

    await tryStep(conn, 'fetchCashierRoles', async () => {
      const { fetchCashierRoles } = require('../lib/cashierIdentity');
      return fetchCashierRoles(conn);
    });

    await tryStep(conn, 'selectEmployee', async () => {
      const [[emp]] = await conn.query(
        'SELECT id, role FROM tbl_employee WHERE id = ? AND status = 1 LIMIT 1',
        [uid]
      );
      return emp;
    });

    await tryStep(conn, 'assignCashierToEmployee', async () => {
      const { assignCashierToEmployee } = require('../lib/cashierIdentity');
      return assignCashierToEmployee(conn, uid, fid);
    });

    await conn.rollback();
  } catch (e) {
    await conn.rollback().catch(() => {});
  } finally {
    conn.release();
    await pool.end?.();
  }
})();
