#!/usr/bin/env node
'use strict';

/**
 * Replicate HMS service catalog + inventory → Account_Core Products.
 *
 *   node scripts/sync-products-to-account-core.js
 *   node scripts/sync-products-to-account-core.js --dry-run
 *
 * Requires CORE_ACCOUNT_URL, CORE_ACCOUNT_WEBHOOK_KEY (or CORE_ACCOUNT_API_KEY),
 * and CORE_ACCOUNT_SYNC_ENABLED=1 in HMS .env.
 */

require('../lib/loadEnv').loadEnv();
const { createDbPool } = require('../lib/dbPool');
const { syncProductsToAccountCore } = require('../lib/coreAccountProductSync');

(async () => {
  const pool = await createDbPool();
  const result = await syncProductsToAccountCore(pool, {
    dryRun: process.argv.includes('--dry-run'),
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
