'use strict';
/** Backfill journal entries for received purchase orders missing GL posts. */
require('../lib/loadEnv').loadEnv();
const mysql = require('mysql2/promise');
const { backfillPurchaseOrderJournals } = require('../lib/hmsFinSyncGl');

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });
  const r = await backfillPurchaseOrderJournals(pool, 1, 500);
  console.log(JSON.stringify(r, null, 2));
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
