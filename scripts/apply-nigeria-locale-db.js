'use strict';

/**
 * Apply Nigeria currency + geo defaults to the NG database.
 * Usage: node scripts/apply-nigeria-locale-db.js
 */
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'NG',
    multipleStatements: true,
  });

  await conn.query(`
    INSERT INTO tbl_hms_fin_setting (k, v) VALUES ('company.currency', 'NGN')
      ON DUPLICATE KEY UPDATE v = VALUES(v);
    INSERT INTO tbl_hms_fin_setting (k, v) VALUES ('tax.tva_rate_standard', '7.5')
      ON DUPLICATE KEY UPDATE v = VALUES(v);
    INSERT INTO tbl_hms_fin_setting (k, v) VALUES ('company.fiscal_regime', 'Nigeria (Companies Act / IFRS)')
      ON DUPLICATE KEY UPDATE v = VALUES(v);
    INSERT INTO tbl_hms_fin_setting (k, v) VALUES ('accounting.chart', 'NIGERIA_IFRS')
      ON DUPLICATE KEY UPDATE v = VALUES(v);
  `);

  try {
    await conn.query("UPDATE tbl_service_catalog SET currency = 'NGN' WHERE currency IS NULL OR currency = '' OR currency = 'XAF'");
    const [r] = await conn.query("SELECT ROW_COUNT() AS n");
    console.log(`Updated service catalog currency rows: ${r[0]?.n ?? 'ok'}`);
  } catch (e) {
    console.warn('tbl_service_catalog.currency:', e.message);
  }

  await conn.end();
  console.log('Nigeria locale DB settings applied.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
