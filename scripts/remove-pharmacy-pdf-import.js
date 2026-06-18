'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

const PDF_IMPORT_DATE = '2026-06-13';

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [toRemove] = await pool.query(
    `SELECT id, name, price, created_at
     FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) = 'pharmacy'
       AND DATE(created_at) = ?
       AND status = 1`,
    [PDF_IMPORT_DATE]
  );

  const [seedUpdated] = await pool.query(
    `SELECT id, name, created_at, updated_at
     FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) = 'pharmacy'
       AND DATE(created_at) < ?
       AND DATE(updated_at) = ?
       AND status = 1`,
    [PDF_IMPORT_DATE, PDF_IMPORT_DATE]
  );

  console.log(`PDF import rows to remove: ${toRemove.length}`);
  console.log(`Pre-existing rows updated on import day: ${seedUpdated.length}`);
  if (seedUpdated.length) {
    seedUpdated.forEach((r) => console.log('  updated seed row:', r.id, r.name));
  }

  if (!toRemove.length) {
    console.log('Nothing to remove.');
    await pool.end();
    return;
  }

  const ids = toRemove.map((r) => r.id);
  const [result] = await pool.query(
    `UPDATE tbl_service_catalog SET status = 0 WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );

  const [remaining] = await pool.query(
    `SELECT COUNT(*) AS c FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) = 'pharmacy' AND status = 1`
  );

  console.log(`Deactivated ${result.affectedRows} pharmacy items from PDF import.`);
  console.log(`Active pharmacy items remaining: ${remaining[0].c}`);

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
