#!/usr/bin/env node
'use strict';
/** Merge radiology + scan service catalog into Scans & Imaging (radiology price wins on duplicates). */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { mergeScansImagingCatalog, SCANS_IMAGING_LABEL } = require('../lib/scansImagingCatalog');

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });
  try {
    const r = await mergeScansImagingCatalog(pool);
    console.log(`${SCANS_IMAGING_LABEL} merge complete:`);
    console.log(`  Rows processed:     ${r.totalRows}`);
    console.log(`  Unique services:    ${r.uniqueServices}`);
    console.log(`  Winners updated:    ${r.winnersUpdated}`);
    console.log(`  Duplicates removed: ${r.duplicatesRemoved}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
