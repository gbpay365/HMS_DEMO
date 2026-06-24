'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');
const { ensureIntegrationSchema } = require('../lib/ensureIntegrationSchema');

(async () => {
  const pool = createDbPool();
  await ensureIntegrationSchema(pool);
  const [cols] = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'tbl_fin_journal_header'
       AND column_name LIKE 'external_core%'`
  );
  const [[counts]] = await pool.query(
    `SELECT COUNT(*)::int AS posted FROM tbl_fin_journal_header WHERE status = 'posted'`
  );
  console.log('external_core columns', cols);
  console.log('posted journals', counts);
  await pool.end?.();
})();
