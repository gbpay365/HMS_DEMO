#!/usr/bin/env node
'use strict';

/**
 * Clear all solution subscriptions and assign a new installation ID.
 * Use when moving HMS to a new server before requesting fresh license codes.
 *
 * Usage:
 *   node scripts/reset-hms-licenses.js --yes
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const yes = process.argv.includes('--yes') || process.argv.includes('-y');

async function main() {
  if (!yes) {
    console.error('This deletes ALL solution licenses and generates a new installation ID.');
    console.error('Re-run with --yes to proceed.');
    process.exit(1);
  }

  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
    waitForConnections: true,
    connectionLimit: 2,
  });

  try {
    const hmsLicense = require('../lib/hmsLicense');
    const result = await hmsLicense.resetAllLicensesForRedeploy(pool, {
      reason: 'cli_reset_hms_licenses',
    });
    console.log('Licenses removed:', result.removedCount);
    console.log('Previous installation ID:', result.previousInstallationId);
    console.log('New installation ID:', result.installationId);
    console.log('Done. Open /hms-admin/subscriptions to request new codes.');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
