'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');
const cfg = require('../lib/integrationConfig');

(async () => {
  const pool = createDbPool();
  console.log('integration', {
    enabled: cfg.isIntegrationEnabled(),
    url: cfg.coreAccountUrl(),
    hasKey: !!cfg.coreAccountApiKey(),
    facilityId: cfg.facilityId(),
  });

  const [jSync] = await pool.query(
    `SELECT external_core_sync_status, COUNT(*)::int AS n
       FROM tbl_fin_journal_header
      GROUP BY external_core_sync_status`
  ).catch(() => [[]]);
  console.log('journal sync status', jSync);

  const [ctSync] = await pool.query(
    `SELECT external_sync_status, COUNT(*)::int AS n FROM tbl_cashier_txn GROUP BY external_sync_status`
  ).catch(() => [[]]);
  console.log('cashier txn sync status', ctSync);

  const [[pending]] = await pool.query(
    `SELECT COUNT(*)::int AS n FROM tbl_fin_journal_header
      WHERE status='posted' AND source_type <> 'account_core'
        AND (external_core_sync_status IS NULL OR external_core_sync_status IN ('pending','failed'))`
  );
  console.log('journals pending sync', pending);

  await pool.end?.();
})();
