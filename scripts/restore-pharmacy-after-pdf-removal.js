'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');
const { seedPharmacyServiceCatalog } = require('../lib/pharmacyCatalogSeedData');

const PDF_IMPORT_DATE = '2026-06-13';

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [updatedByPdf] = await pool.query(
    `SELECT id FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) = 'pharmacy'
       AND DATE(created_at) < ?
       AND DATE(updated_at) = ?
       AND status = 1`,
    [PDF_IMPORT_DATE, PDF_IMPORT_DATE]
  );

  if (updatedByPdf.length) {
    const ids = updatedByPdf.map((r) => r.id);
    await pool.query(
      `UPDATE tbl_service_catalog SET status = 0 WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    console.log(`Deactivated ${ids.length} pharmacy rows corrupted by PDF update.`);
  }

  const r = await seedPharmacyServiceCatalog(pool);
  console.log(`Restored built-in pharmacy catalog: ${r.inserted} added, ${r.updated} updated.`);

  const [remaining] = await pool.query(
    `SELECT COUNT(*) AS c FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) = 'pharmacy' AND status = 1`
  );
  console.log(`Active pharmacy items now: ${remaining[0].c}`);

  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
