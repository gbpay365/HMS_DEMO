'use strict';
require('../lib/loadEnv').loadEnv();
const { createDbPool } = require('../lib/dbPool');
const { syncOneJournalToAccountCore } = require('../lib/syncJournalsToAccountCore');

(async () => {
  const pool = createDbPool();
  const [[h]] = await pool.query(
    `SELECT id, facility_id, entry_date, reference, narration, journal_code
       FROM tbl_fin_journal_header WHERE status='posted' ORDER BY id ASC LIMIT 1`
  );
  process.env.CORE_ACCOUNT_SYNC_ENABLED = '1';
  process.env.CORE_ACCOUNT_URL = 'http://127.0.0.1:8765';
  process.env.CORE_ACCOUNT_WEBHOOK_KEY = 'hms-webhook-dev-key';
  const out = await syncOneJournalToAccountCore(pool, h, { force: true });
  console.log(JSON.stringify(out, null, 2));
  await pool.end?.();
})();
