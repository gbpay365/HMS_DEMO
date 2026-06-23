'use strict';
require('../lib/loadEnv').loadEnv();
const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'UPDATE tbl_cashier SET cashier_code = ?, cashier_identity = ?, updated_at = NOW() WHERE id = 2',
      ['CA98', 'Cashier 98']
    );
    const [r] = await conn.query(
      'UPDATE tbl_cashier_txn SET cashier_code = ?, cashier_identity = ? WHERE cashier_id = 2',
      ['CA98', 'Cashier 98']
    );
    await conn.commit();
    console.log(`Super Admin: CA98 / Cashier 98 (${r.affectedRows || 0} txns)`);
    const [rows] = await pool.query(
      `SELECT c.cashier_code, c.cashier_identity, e.first_name, e.last_name
         FROM tbl_cashier c JOIN tbl_employee e ON e.id = c.employee_id
        WHERE c.status = 1 ORDER BY c.cashier_code`
    );
    console.table(rows);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
