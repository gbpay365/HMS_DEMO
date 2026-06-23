#!/usr/bin/env node
'use strict';

/**
 * Seed tbl_fin_account from lib/data/ohada_english_6digit_coa.json (Core_Account canonical COA).
 *
 *   node scripts/seed-coa-from-core.js
 *   node scripts/seed-coa-from-core.js --force
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { seedFinAccounts, loadSeedAccounts } = require('../lib/finAccountSeedData');
const { resolveOhadaCoaPath } = require('../lib/resolveOhadaCoaPath');

function createPoolFromEnv() {
  try {
    const { createDbPool } = require('../lib/dbPool');
    return createDbPool();
  } catch (_) {
    const host = process.env.DB_HOST || '127.0.0.1';
    const user = process.env.DB_USER || process.env.DB_USERNAME || 'root';
    const password = process.env.DB_PASSWORD || process.env.DB_PASS || '';
    const database = process.env.DB_NAME || process.env.DB_DATABASE || process.env.MYSQL_DATABASE;
    if (!database) throw new Error('DB_NAME / database is required');
    const port = parseInt(process.env.DB_PORT || '3306', 10);
    return mysql.createPool({ host, user, password, database, port, waitForConnections: true, connectionLimit: 4 });
  }
}

async function main() {
  const force = process.argv.includes('--force');
  const coaPath = resolveOhadaCoaPath();
  const expected = loadSeedAccounts().length;
  console.log(`Seeding OHADA 6-digit COA from ${coaPath} (${expected} accounts)${force ? ' [force reset]' : ''}…`);

  const pool = createPoolFromEnv();
  await pool.query('SELECT 1');
  const r = await seedFinAccounts(pool, { forceUpdate: force, forceReset: force });
  console.log(JSON.stringify(r, null, 2));
  await pool.end();
  if (r.skipped) {
    console.log('Skipped — COA already present. Re-run with --force to replace.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
