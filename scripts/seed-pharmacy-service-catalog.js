#!/usr/bin/env node
'use strict';

/**
 * Load pharmacy price list into Service Catalog (category: pharmacy).
 * Usage: node scripts/seed-pharmacy-service-catalog.js
 *        node scripts/seed-pharmacy-service-catalog.js --deactivate-missing
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { seedPharmacyServiceCatalog } = require('../lib/pharmacyCatalogSeedData');

async function main() {
  const deactivateMissing = process.argv.includes('--deactivate-missing');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });

  try {
    const r = await seedPharmacyServiceCatalog(pool, { deactivateMissing });
    console.log('Pharmacy catalog seed complete:');
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
