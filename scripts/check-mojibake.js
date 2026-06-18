'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');
const { repairServiceCatalogTextEncoding } = require('../lib/fixUtf8Mojibake');

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
    charset: 'utf8mb4',
  });
  const repaired = await repairServiceCatalogTextEncoding(pool);
  console.log('repaired', repaired);
  const [rows] = await pool.query(
    `SELECT id, name FROM tbl_service_catalog WHERE id IN (295, 296, 25) ORDER BY id`
  );
  for (const row of rows) {
    console.log(row.id, JSON.stringify(row.name));
  }
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
