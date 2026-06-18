#!/usr/bin/env node
'use strict';

/**
 * Load radiology & imaging tariffs into Service Catalog (category: radiology).
 * Usage: node scripts/seed-radiology-service-catalog.js
 *        node scripts/seed-radiology-service-catalog.js --deactivate-missing
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { seedRadiologyServiceCatalog } = require('../lib/radiologyCatalogSeedData');

async function main() {
  const deactivateMissing = process.argv.includes('--deactivate-missing');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });

  try {
    const r = await seedRadiologyServiceCatalog(pool, { deactivateMissing });
    console.log('Radiology catalog seed complete:');
    console.log(`  Exams in list: ${r.total}`);
    console.log(`  Inserted:      ${r.inserted}`);
    console.log(`  Updated:       ${r.updated}`);
    if (deactivateMissing) console.log(`  Deactivated:   ${r.deactivated} (old radiology rows not in list)`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
