'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');

(async () => {
  const pool = createDbPool();
  const [rows] = await pool.query(
    `SELECT facility_id, core_account_url, core_account_api_key,
            LENGTH(core_account_api_key) AS key_len
       FROM tbl_facility_integration_settings
      ORDER BY facility_id`
  ).catch(async () => {
    const [r] = await pool.query(`SELECT 1`);
    return [[]];
  });
  console.log('facility integration settings', rows);
  await pool.end?.();
})();
