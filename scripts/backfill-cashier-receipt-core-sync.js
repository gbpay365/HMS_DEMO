'use strict';

/**
 * Backfill Account_Core for cashier receipts where GL journal synced but receipt webhook did not run.
 * Usage: node scripts/backfill-cashier-receipt-core-sync.js [--payment-method=Wallet] [--limit=100]
 */

const { loadEnv } = require('../lib/loadEnv');
loadEnv();

const { createDbPool } = require('../lib/dbPool');

async function main() {
  const pool = await createDbPool();
  const payFilter = (process.argv.find((a) => a.startsWith('--payment-method=')) || '')
    .split('=')[1]
    ?.trim();
  const limit = parseInt(
    String((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || '100'),
    10
  ) || 100;

  let sql = `
    SELECT t.id
      FROM tbl_cashier_txn t
      LEFT JOIN tbl_fin_journal_header h ON h.id = t.journal_header_id
     WHERE t.txn_type = 'receipt'
       AND (t.external_sync_status IS NULL OR t.external_sync_status IN ('pending', 'failed'))
       AND (h.id IS NULL OR h.external_core_sync_status IS NULL OR h.external_core_sync_status IN ('pending', 'failed'))`;
  const params = [];
  if (payFilter) {
    sql += ' AND LOWER(TRIM(t.payment_method)) = LOWER(TRIM(?))';
    params.push(payFilter);
  }
  sql += ' ORDER BY t.id ASC LIMIT ?';
  params.push(Math.min(500, Math.max(1, limit)));

  const [rows] = await pool.query(sql, params).catch(() => [[]]);
  const { syncCashierTxnToCoreAccount } = require('../lib/coreAccountWebhook');

  let sent = 0;
  let failed = 0;
  for (const row of rows || []) {
    const out = await syncCashierTxnToCoreAccount(pool, row.id);
    if (out.ok) sent += 1;
    else if (!out.skipped) failed += 1;
    console.log('txn', row.id, out.ok ? 'ok' : out.skipped ? 'skipped' : 'failed', out.data?.error || out.error || '');
  }
  console.log(JSON.stringify({ processed: (rows || []).length, sent, failed }));
  await pool.end().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
