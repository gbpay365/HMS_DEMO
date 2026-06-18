'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');
const ensure = require('../lib/ensureIpdHospitalizationSchema');

(async () => {
  const pool = mysql.createPool(process.env.DATABASE_URL);
  await ensure(pool);
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_admission'
       AND COLUMN_NAME IN ('hospitalization_reason','primary_surgeon_id','care_plan_template_id')`
  );
  console.log('tbl_admission IPD columns:', cols.map((c) => c.COLUMN_NAME).join(', ') || '(none)');
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
