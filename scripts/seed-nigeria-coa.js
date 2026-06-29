'use strict';

/**
 * Seed Nigeria IFRS chart of accounts into the active database.
 * Usage: HMS_COUNTRY=NG DB_NAME=NG node scripts/seed-nigeria-coa.js
 */
process.env.HMS_COUNTRY = process.env.HMS_COUNTRY || 'NG';

const mysql = require('mysql2/promise');
const { seedFinAccounts, loadSeedAccounts } = require('../lib/finAccountSeedData');

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'NG',
    waitForConnections: true,
    connectionLimit: 2,
  });

  const expected = loadSeedAccounts().length;
  console.log(`Seeding Nigeria IFRS COA (${expected} accounts) into ${process.env.DB_NAME || 'NG'}…`);
  const result = await seedFinAccounts(pool, { forceReset: true });
  console.log(JSON.stringify(result, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
