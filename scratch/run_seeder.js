'use strict';

const { loadEnv } = require('../lib/loadEnv');
loadEnv();

const mysql = require('mysql2/promise');
const ensureAclSchema = require('../lib/ensureAclSchema');

async function run() {
  console.log('Connecting to database...');
  const pool = mysql.createPool({
    host:                    process.env.DB_HOST || 'localhost',
    port:                    parseInt(process.env.DB_PORT || '3306'),
    user:                    process.env.DB_USER,
    password:                process.env.DB_PASSWORD,
    database:                process.env.DB_NAME,
  });

  try {
    console.log('Running ACL schema database seeder...');
    await ensureAclSchema(pool);
    console.log('Seeder ran successfully!');

    console.log('\nVerifying new top navigation elements in database...');
    const [rows] = await pool.query(
      `SELECT code, kind, parent_code, label, url, required_perm
         FROM tbl_acl_ui_element
        WHERE code IN (
          'topnav.clinical.prescriptions',
          'topnav.hr.attendance',
          'topnav.hr.holidays',
          'topnav.ops.wallet_admin',
          'topnav.ops.credit',
          'topnav.ops.insurance',
          'topnav.ops.insurance_claims',
          'topnav.cfg.payment_validity'
        )`
    );

    console.log(`Found ${rows.length} of 8 seeded elements:`);
    console.log(JSON.stringify(rows, null, 2));

    if (rows.length === 8) {
      console.log('\nSUCCESS: All 8 new topbar navigation elements are present in the database!');
    } else {
      console.warn(`\nWARNING: Only found ${rows.length} elements. Some might be missing.`);
    }

  } catch (error) {
    console.error('An error occurred during database operations:', error);
  } finally {
    await pool.end();
    console.log('Database connection pool closed.');
  }
}

run();
