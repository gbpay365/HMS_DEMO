'use strict';
require('../lib/loadEnv').loadEnv();
const { createDbPool } = require('../lib/dbPool');
const { patientSearchWhere, patientSearchBindings } = require('../lib/hmsCaseInsensitiveSearch');

async function search(q) {
  const pool = createDbPool();
  const [rows] = await pool.query(
    `SELECT id, first_name, last_name FROM tbl_patient
     WHERE status = 1 AND ${patientSearchWhere('')}
     LIMIT 5`,
    patientSearchBindings(q)
  );
  await pool.end?.().catch(() => {});
  return rows;
}

async function main() {
  const cases = [
    ['josso', 'Afor'],
    ['JOSSO', 'Afor'],
    ['afor', 'Afor'],
    ['AFOR', 'Afor'],
  ];
  let ok = true;
  for (const [q, expectFirst] of cases) {
    const rows = await search(q);
    const hit = rows.some((r) => String(r.first_name || '').toLowerCase() === expectFirst.toLowerCase());
    console.log(JSON.stringify({ q, count: rows.length, hit, first: rows[0]?.first_name }));
    if (!hit && rows.length === 0) ok = false;
  }
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
