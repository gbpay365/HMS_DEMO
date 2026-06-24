'use strict';
require('../lib/loadEnv').loadEnv();
const { createDbPool } = require('../lib/dbPool');
const { journalPostExtended } = require('../lib/hmsFinJournalPost');

(async () => {
  process.env.CORE_ACCOUNT_SYNC_ENABLED = '1';
  process.env.CORE_ACCOUNT_URL = 'https://zaizens-account.up.railway.app';
  process.env.CORE_ACCOUNT_WEBHOOK_KEY = 'zaizens-hms-journal-sync-key';

  const pool = createDbPool();
  const sourceId = Math.floor(Date.now() % 1000000);
  const out = await journalPostExtended(pool, {
    facilityId: 1,
    sourceType: 'manual_test',
    sourceId,
    reference: `AUTO-SYNC-TEST-${sourceId}`,
    narration: 'Debug auto-replicate verification',
    createdBy: 1,
    entryDate: '2026-06-24',
    journalCode: 'JNL',
    status: 'posted',
    lines: [
      { account_code: '552601', account_label: 'Cash', debit: 1000, credit: 0, line_memo: 'test cash' },
      { account_code: '706631', account_label: 'Revenue', debit: 0, credit: 839.41, line_memo: 'test rev' },
      { account_code: '445710', account_label: 'TVA', debit: 0, credit: 160.59, line_memo: 'test tva' },
    ],
  });
  console.log(JSON.stringify(out, null, 2));

  if (out.ok && out.journalId) {
    const [[row]] = await pool.query(
      'SELECT external_core_sync_status FROM tbl_fin_journal_header WHERE id = ?',
      [out.journalId]
    );
    console.log('sync status:', row);
  }
  await pool.end?.();
})();
