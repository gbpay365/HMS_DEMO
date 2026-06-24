'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');
const { dedupeFinAccountsByCode, ensureFinAccountUniqueCodeIndex } = require('../lib/finAccountSeedData');

(async () => {
  const pool = createDbPool();
  const removed = await dedupeFinAccountsByCode(pool);
  const ok = await ensureFinAccountUniqueCodeIndex(pool);
  const [idx] = await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename='tbl_fin_account'`);
  console.log({ removed, ok, indexes: idx });
  await pool.end?.();
})();
