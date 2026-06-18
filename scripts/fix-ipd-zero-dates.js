#!/usr/bin/env node
'use strict';
/** One-off: null legacy zero dates on tbl_admission (fixes /ipd/hospitalizations 500). */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { cleanAdmissionZeroDates } = require('../lib/ensureIpdHospitalizationSchema');

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
    waitForConnections: true,
    connectionLimit: 2,
  });
  try {
    await cleanAdmissionZeroDates(pool);
    console.log('IPD zero dates cleaned on tbl_admission.');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
