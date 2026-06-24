'use strict';
require('dotenv').config();
const { createDbPool } = require('../lib/dbPool');

(async () => {
  const pool = createDbPool();
  const [[dup]] = await pool.query(
    `SELECT COUNT(*) AS c FROM (
       SELECT code FROM tbl_fin_account WHERE active=1 GROUP BY code HAVING COUNT(*)>1
     ) d`
  );
  const [[parents]] = await pool.query(
    `SELECT COUNT(*) AS c FROM tbl_fin_account WHERE active=1 AND parent_id IS NOT NULL`
  );
  const [[total]] = await pool.query(`SELECT COUNT(*) AS c FROM tbl_fin_account WHERE active=1`);
  const [classes] = await pool.query(
    `SELECT ohada_class, COUNT(*) AS n FROM tbl_fin_account WHERE active=1 GROUP BY ohada_class ORDER BY ohada_class`
  );
  console.log(JSON.stringify({
    active: Number(total?.c || 0),
    duplicateCodes: Number(dup?.c || 0),
    withParent: Number(parents?.c || 0),
    byClass: classes,
  }, null, 2));
  await pool.end?.();
})();
