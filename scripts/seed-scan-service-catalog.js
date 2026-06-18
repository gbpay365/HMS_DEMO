#!/usr/bin/env node
'use strict';

/**
 * Load CT/MRI/nuclear/fluoroscopy tariff into Service Catalog (category: scan).
 * Usage: node scripts/seed-scan-service-catalog.js
 *        node scripts/seed-scan-service-catalog.js --deactivate-missing
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { seedScanServiceCatalog } = require('../lib/scanCatalogSeedData');

async function main() {
  const deactivateMissing = process.argv.includes('--deactivate-missing');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });

  try {
    const r = await seedScanServiceCatalog(pool, { deactivateMissing });
    console.log('Scan catalog seed complete:');
    console.log(`  Items in list: ${r.total}`);
    console.log(`  Inserted:      ${r.inserted}`);
    console.log(`  Updated:       ${r.updated}`);
    if (deactivateMissing) console.log(`  Deactivated:   ${r.deactivated}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
