#!/usr/bin/env node
'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  });
  const [rows] = await pool.query(
    `SELECT id, name, category, price, cpt_code FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) IN ('radiology', 'scan') AND status = 1`
  );
  const rad = rows.filter((r) => r.category === 'radiology');
  const scn = rows.filter((r) => r.category === 'scan');
  const exact = [];
  for (const r of rad) {
    const nk = norm(r.name);
    for (const s of scn) {
      if (norm(s.name) === nk) exact.push({ r, s });
    }
  }
  console.log('exact duplicates:', exact.length);
  exact.forEach((d) => console.log(' -', d.r.name, '| rad', d.r.price, 'scan', d.s.price));
  await pool.end();
})();
