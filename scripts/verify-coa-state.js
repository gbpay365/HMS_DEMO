'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');
const { loadSeedAccounts } = require('../lib/finAccountSeedData');

(async () => {
  const pool = createDbPool();
  const expected = loadSeedAccounts().length;
  const [[cnt]] = await pool.query('SELECT COUNT(*) AS c FROM tbl_fin_account WHERE active = 1').catch(() => [[{ c: 0 }]]);
  const [keys] = await pool.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tbl_fin_account'`
  ).catch(() => [[]]);
  const codes = ['552601', '701601', '571100', '401100', '411100'];
  const [sample] = await pool.query(
    `SELECT code, label_en, ohada_class, is_posting, active FROM tbl_fin_account WHERE code IN (${codes.map(() => '?').join(',')})`,
    codes
  ).catch(() => [[]]);
  console.log(JSON.stringify({ driver: pool.driver, expected, active: Number(cnt?.c || 0), indexes: keys, sample }, null, 2));
  await pool.end?.();
})();
