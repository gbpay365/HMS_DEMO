#!/usr/bin/env node
'use strict';

require('../lib/loadEnv').loadEnv();
const { createDbPool } = require('../lib/dbPool');
const { retryFailedCoreAccountSync } = require('../lib/coreAccountWebhook');

async function retryEmployees(pool) {
  const [rows] = await pool
    .query(
      `SELECT id FROM tbl_employee
        WHERE external_core_sync_status IN ('pending','failed')
        ORDER BY id ASC LIMIT 100`
    )
    .catch(() => [[]]);
  const { syncEmployeeToCoreAccount } = require('../lib/coreAccountEmployeeSync');
  let sent = 0;
  let failed = 0;
  for (const r of rows || []) {
    const out = await syncEmployeeToCoreAccount(pool, r.id, 'upsert');
    if (out.ok) sent += 1;
    else if (!out.skipped) failed += 1;
  }
  return { sent, failed, total: (rows || []).length };
}

(async () => {
  const pool = await createDbPool();
  const cashier = await retryFailedCoreAccountSync(pool, 100);
  const employees = await retryEmployees(pool);
  console.log(JSON.stringify({ cashier, employees }, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
