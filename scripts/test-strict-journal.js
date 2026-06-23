#!/usr/bin/env node
'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');
const { validateJournalEntry } = require('../lib/finJournalValidation');

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_user || process.env.DB_user || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });

  const cases = [
    {
      name: 'manual D/C',
      opts: {
        sourceType: 'manual_import',
        mode: 'post',
        facilityId: 1,
        lines: [
          { code: '552601', debit: 1000, credit: 0 },
          { code: '701601', debit: 0, credit: 1000 },
        ],
      },
      expect: true,
    },
    {
      name: 'manual D/D/C (no alternation)',
      opts: {
        sourceType: 'manual_import',
        mode: 'post',
        facilityId: 1,
        lines: [
          { code: '552601', debit: 500, credit: 0 },
          { code: '552604', debit: 500, credit: 0 },
          { code: '701601', debit: 0, credit: 1000 },
        ],
      },
      expect: false,
    },
    {
      name: 'receipt D/C/C (TVA exempt)',
      opts: {
        sourceType: 'billing_receipt',
        mode: 'post',
        facilityId: 1,
        lines: [
          { code: '552601', debit: 1000, credit: 0 },
          { code: '701601', debit: 0, credit: 840 },
          { code: '445710', debit: 0, credit: 160 },
        ],
      },
      expect: true,
    },
    {
      name: 'credit to cash (normal balance)',
      opts: {
        sourceType: 'manual_import',
        mode: 'post',
        facilityId: 1,
        lines: [
          { code: '552601', debit: 0, credit: 1000 },
          { code: '701601', debit: 1000, credit: 0 },
        ],
      },
      expect: false,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const r = await validateJournalEntry(pool, c.opts);
    const pass = r.ok === c.expect;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${c.name}: ok=${r.ok}${r.error ? ' — ' + r.error : ''}`);
    if (!pass) failed++;
  }
  await pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
