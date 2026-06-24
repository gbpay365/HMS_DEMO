'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');

(async () => {
  const pool = createDbPool();
  const conn = await pool.getConnection();
  const roles = ['11', '107'];
  const placeholders = roles.map(() => '?').join(',');
  const params = [...roles, 1];
  const sql = `
    SELECT e.id
      FROM tbl_employee e
     WHERE e.status = 1
       AND CAST(e.role AS CHAR) IN (${placeholders})
       AND (e.facility_id IS NULL OR e.facility_id = ? OR e.facility_id = 0)
     ORDER BY e.id ASC`;
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(sql, params).catch((e) => {
      console.error('query caught:', e.message);
      return [[]];
    });
    console.log('rows', rows);
    const [[test]] = await conn.query('SELECT 1 AS ok');
    console.log('follow-up', test);
    await conn.rollback();
  } catch (e) {
    console.error('outer', e.message);
    await conn.rollback().catch(() => {});
  } finally {
    conn.release();
    await pool.end?.();
  }
})();
