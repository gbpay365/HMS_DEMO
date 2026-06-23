#!/usr/bin/env node
'use strict';

/**
 * One-way full employee replication HMS → Account_Core.
 * Usage: node scripts/sync-all-employees-to-core.js
 * Requires CORE_ACCOUNT_SYNC_ENABLED=1 and API running on CORE_ACCOUNT_URL.
 */
require('../lib/loadEnv').loadEnv();
const { createDbPool } = require('../lib/dbPool');
const { syncAllEmployeesToCoreAccount } = require('../lib/coreAccountEmployeeSync');

(async () => {
  const pool = await createDbPool();
  const result = await syncAllEmployeesToCoreAccount(pool, { replaceAll: true });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
