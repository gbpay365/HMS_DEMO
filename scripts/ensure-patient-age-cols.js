'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');
const { ensurePatientAgeColumns, ensurePatientPhoneColumn } = require('../lib/patientAge');

(async () => {
  const url = process.env.DATABASE_URL;
  const pool = url
    ? mysql.createPool(url)
    : mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      });
  await ensurePatientAgeColumns(pool);
  await ensurePatientPhoneColumn(pool);
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_patient'
       AND COLUMN_NAME IN ('age_years', 'age_only_registration')`
  );
  console.log('OK — columns:', cols.map((c) => c.COLUMN_NAME).join(', ') || '(none)');
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
