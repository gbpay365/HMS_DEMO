#!/usr/bin/env node
'use strict';

/**
 * Replicate HMS GL journals → Account_Core journal entries.
 *
 *   node scripts/sync-journals-to-account-core.js
 *   node scripts/sync-journals-to-account-core.js --dry-run
 *   node scripts/sync-journals-to-account-core.js --force
 *   node scripts/sync-journals-to-account-core.js --limit=500
 *
 * Requires CORE_ACCOUNT_URL, CORE_ACCOUNT_WEBHOOK_KEY (or CORE_ACCOUNT_API_KEY),
 * and CORE_ACCOUNT_SYNC_ENABLED=1 in HMS .env (sync still runs when invoked manually).
 */

require('../lib/loadEnv').loadEnv();
const { createDbPool } = require('../lib/dbPool');
const { syncAllJournalsToAccountCore } = require('../lib/syncJournalsToAccountCore');

function argFlag(name) {
  return process.argv.includes(`--${name}`);
}

function argValue(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.split('=').slice(1).join('=');
}

(async () => {
  const pool = await createDbPool();
  const result = await syncAllJournalsToAccountCore(pool, {
    dryRun: argFlag('dry-run'),
    force: argFlag('force'),
    onlyPending: !argFlag('force'),
    limit: parseInt(argValue('limit', '5000'), 10) || 5000,
    facilityId: parseInt(argValue('facility', '1'), 10) || 1,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
