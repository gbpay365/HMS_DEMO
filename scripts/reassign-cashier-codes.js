'use strict';

/** One-off: reassign cashier desk codes (tbl_cashier + tbl_cashier_txn). */
require('../lib/loadEnv').loadEnv();
const mysql = require('mysql2/promise');

const TARGETS = [
  { id: 3, code: 'CA01', identity: 'Cashier 01', label: 'Lariza Kinyuy' },
  { id: 2, code: 'CA98', identity: 'Cashier 98', label: 'Super Admin' },
  { id: 1, code: 'CA99', identity: 'Cashier 99', label: 'System Admin' },
];

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const t of TARGETS) {
      await conn.query(
        'UPDATE tbl_cashier SET cashier_code = ?, cashier_identity = ?, updated_at = NOW() WHERE id = ?',
        [`__TMP_${t.id}`, `__TMP_${t.id}`, t.id]
      );
    }

    for (const t of TARGETS) {
      await conn.query(
        'UPDATE tbl_cashier SET cashier_code = ?, cashier_identity = ?, updated_at = NOW() WHERE id = ?',
        [t.code, t.identity, t.id]
      );
      const [r] = await conn.query(
        'UPDATE tbl_cashier_txn SET cashier_code = ?, cashier_identity = ? WHERE cashier_id = ?',
        [t.code, t.identity, t.id]
      );
      console.log(`${t.label}: ${t.code} / ${t.identity} (${r.affectedRows || 0} txns)`);
    }

    await conn.commit();

    const [rows] = await pool.query(
      `SELECT c.id, c.cashier_code, c.cashier_identity, e.first_name, e.last_name
         FROM tbl_cashier c
         LEFT JOIN tbl_employee e ON e.id = c.employee_id
        WHERE c.status = 1
        ORDER BY c.cashier_code`
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
