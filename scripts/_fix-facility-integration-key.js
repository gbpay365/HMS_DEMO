'use strict';
require('../lib/loadEnv').loadEnv();
const { createDbPool } = require('../lib/dbPool');

(async () => {
  const pool = createDbPool();
  await pool.query(
    `UPDATE tbl_facility_integration
        SET core_account_api_key = ?,
            core_account_sync_enabled = 1,
            core_account_url = ?
      WHERE facility_id = 1`,
    ['zaizens-hms-journal-sync-key', 'https://zaizens-account.up.railway.app']
  );
  console.log('facility integration updated');
  await pool.end?.();
})();
