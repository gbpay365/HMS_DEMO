#!/usr/bin/env node
'use strict';

/**
 * Store BetterPay partner ID in the database (and optional config file).
 * Usage: node scripts/set-betterpay-partner.js YOUR_PARTNER_ID
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const partner = String(process.argv[2] || '').trim();
if (!partner) {
  console.error('Usage: node scripts/set-betterpay-partner.js <PARTNER_IDENTIFIER>');
  process.exit(1);
}

async function main() {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
    waitForConnections: true,
    connectionLimit: 2,
  });

  try {
    const betterPayConfig = require('../lib/betterPayConfig');
    await betterPayConfig.saveSettings(pool, { partner_identifier: partner });
    const cfg = await betterPayConfig.loadSettings(pool);
    console.log('BetterPay configured:', cfg.configured ? 'yes' : 'no');
    console.log('Partner ID:', cfg.partner_identifier || '(empty)');
    if (!cfg.configured) process.exit(2);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
