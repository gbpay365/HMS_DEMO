'use strict';

const { loadEnv } = require('../lib/loadEnv');
loadEnv();

const mysql = require('mysql2/promise');
const aclLayout = require('../lib/aclLayout');

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
    console.log('Initializing layout cache...');
    await aclLayout.init(pool);
    console.log('Layout cache initialized.');

    console.log('\nBuilding Top Navigation for Super Admin (Role 99) with all permissions...');
    const topnav = aclLayout.buildTopNav(['*'], '99');

    console.log('\n--- Top Navigation Dropdown Menus ---');
    topnav.menus.forEach(menu => {
      console.log(`Dropdown: ${menu.parent.label} (${menu.parent.code})`);
      menu.children.forEach(ch => {
        const isNew = [
          'topnav.clinical.prescriptions',
          'topnav.hr.attendance',
          'topnav.hr.holidays',
          'topnav.ops.wallet_admin',
          'topnav.ops.credit',
          'topnav.ops.insurance',
          'topnav.ops.insurance_claims',
          'topnav.cfg.payment_validity'
        ].includes(ch.code);
        console.log(`  - [${isNew ? 'NEW' : 'EXISTING'}] ${ch.label} (Code: ${ch.code}) -> ${ch.url}`);
      });
    });

    // Count how many of our 8 new items were found in the output
    let foundCount = 0;
    const newCodes = [
      'topnav.clinical.prescriptions',
      'topnav.hr.attendance',
      'topnav.hr.holidays',
      'topnav.ops.wallet_admin',
      'topnav.ops.credit',
      'topnav.ops.insurance',
      'topnav.ops.insurance_claims',
      'topnav.cfg.payment_validity'
    ];

    topnav.menus.forEach(menu => {
      menu.children.forEach(ch => {
        if (newCodes.includes(ch.code)) {
          foundCount++;
        }
      });
    });

    console.log(`\nVerification: Found ${foundCount} of 8 new items in built layout.`);
    if (foundCount === 8) {
      console.log('SUCCESS: All 8 new dropdown options are successfully rendered by the layout engine!');
    } else {
      console.error('ERROR: Some dropdown options are missing from the built layout.');
    }

  } catch (error) {
    console.error('Error during layout verification:', error);
  } finally {
    await pool.end();
    console.log('Database pool closed.');
  }
}

run();
