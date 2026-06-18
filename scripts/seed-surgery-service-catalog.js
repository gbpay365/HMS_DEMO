#!/usr/bin/env node
'use strict';

/**
 * Load surgical procedures tariff into Service Catalog (category: surgery).
 * Usage: node scripts/seed-surgery-service-catalog.js
 *        node scripts/seed-surgery-service-catalog.js --deactivate-missing
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { seedSurgeryServiceCatalog } = require('../lib/surgeryCatalogSeedData');

async function main() {
  const deactivateMissing = process.argv.includes('--deactivate-missing');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });

  try {
    const r = await seedSurgeryServiceCatalog(pool, { deactivateMissing });
    console.log('Surgery catalog seed complete:');
    console.log(`  Procedures in list: ${r.total}`);
    console.log(`  Inserted:           ${r.inserted}`);
    console.log(`  Updated:            ${r.updated}`);
    if (deactivateMissing) console.log(`  Deactivated:        ${r.deactivated}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
