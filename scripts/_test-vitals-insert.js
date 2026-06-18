'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');
const { ensureVitalSignColumns } = require('../lib/ensureVitalSignSchema');

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await ensureVitalSignColumns(pool);
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_vital_sign'
        AND COLUMN_NAME IN ('recorded_at','created_at')`
  );
  console.log('columns', cols);
  try {
    const [r] = await pool.query(
      `INSERT INTO tbl_vital_sign
        (facility_id, patient_id, opd_visit_id, admission_id, bp_sys, bp_dia, heart_rate, temp_c, spo2, rr,
         weight_kg, height_cm, waist_cm, recorded_by, recorded_at, source_station, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?,?,NOW())`,
      [1, 1, null, null, 120, 80, 72, 37, 98, 16, 70, 170, null, 1, 'nursing', 1]
    );
    console.log('OK insert id', r.insertId);
    await pool.query('DELETE FROM tbl_vital_sign WHERE id = ?', [r.insertId]);
  } catch (e) {
    console.log('ERR', e.message);
  }
  await pool.end();
})();
