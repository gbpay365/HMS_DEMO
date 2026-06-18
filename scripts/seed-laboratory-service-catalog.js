#!/usr/bin/env node
'use strict';

/**
 * Load laboratory price list into Service Catalog (category: laboratory).
 * Usage: node scripts/seed-laboratory-service-catalog.js
 *        node scripts/seed-laboratory-service-catalog.js --deactivate-missing
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { seedLaboratoryServiceCatalog } = require('../lib/laboratoryCatalogSeedData');

async function main() {
  const deactivateMissing = process.argv.includes('--deactivate-missing');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tbl_service_catalog (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category VARCHAR(50) NOT NULL DEFAULT 'service',
        name VARCHAR(255) NOT NULL,
        department_name VARCHAR(120) DEFAULT NULL,
        price DECIMAL(12,2) NOT NULL DEFAULT 0,
        status TINYINT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const r = await seedLaboratoryServiceCatalog(pool, { deactivateMissing });
    console.log('Laboratory catalog seed complete:');
    console.log(`  Tests in list: ${r.total}`);
    console.log(`  Inserted:      ${r.inserted}`);
    console.log(`  Updated:       ${r.updated}`);
    if (deactivateMissing) console.log(`  Deactivated:   ${r.deactivated} (old lab rows not in list)`);
    console.log(`  LIMS catalog:  ${r.labCatalogUpserted} rows synced to tbl_lab_catalog`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
