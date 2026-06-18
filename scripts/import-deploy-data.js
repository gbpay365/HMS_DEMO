'use strict';

/**
 * Import deploy data export JSON into the deploy server MySQL database.
 *
 * Usage (on deploy server):
 *   node scripts/import-deploy-data.js
 *   node scripts/import-deploy-data.js --file C:\HMS_JS\Update\data\deploy-data-export.json
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ROOT = path.resolve(__dirname, '..');

const DEFAULT_ORDER = [
  'tbl_service_catalog',
  'tbl_lab_catalog',
  'tbl_lab_test_group',
  'tbl_lab_test_group_line',
  'tbl_radiology_test_group',
  'tbl_radiology_test_group_line',
  'tbl_ipd_surgery_template',
  'tbl_inventory_category',
  'tbl_inventory_item',
  'tbl_inventory_movement',
];

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return false;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
  return true;
}

function parseArgs(argv) {
  const opts = { file: path.join(ROOT, 'Update', 'data', 'deploy-data-export.json') };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--file' || a === '-f') && argv[i + 1]) opts.file = argv[++i];
    else if (a.startsWith('--file=')) opts.file = a.slice(7);
  }
  return opts;
}

async function tableColumns(conn, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [table]
  );
  return (rows || []).map((r) => r.name);
}

async function upsertRows(conn, table, rows) {
  if (!rows.length) return 0;
  const targetCols = await tableColumns(conn, table);
  const cols = Object.keys(rows[0]).filter((c) => targetCols.includes(c));
  if (!cols.includes('id')) throw new Error(`${table}: id column required`);
  let n = 0;
  for (const row of rows) {
    const vals = cols.map((c) => row[c]);
    const placeholders = cols.map(() => '?').join(', ');
    const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = VALUES(${c})`).join(', ');
    await conn.query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE ${updates || 'id = id'}`,
      vals
    );
    n++;
  }
  return n;
}

function getDbConfig() {
  loadEnvFile(path.join(ROOT, '.env'));
  loadEnvFile(path.join(ROOT, 'scripts', 'db-sync.env'));
  if (process.env.DB_NAME) {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME,
      multipleStatements: true,
    };
  }
  return {
    host: process.env.LOCAL_DB_HOST || 'localhost',
    port: parseInt(process.env.LOCAL_DB_PORT || '3306', 10),
    user: process.env.LOCAL_DB_USER || 'root',
    password: process.env.LOCAL_DB_PASSWORD || '',
    database: process.env.LOCAL_DB_NAME || 'hms_demo',
    multipleStatements: true,
  };
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!fs.existsSync(opts.file)) throw new Error(`File not found: ${opts.file}`);

  const payload = JSON.parse(fs.readFileSync(opts.file, 'utf8'));
  const cfg = getDbConfig();
  const conn = await mysql.createConnection(cfg);
  const order = Array.isArray(payload.importOrder) && payload.importOrder.length
    ? payload.importOrder
    : DEFAULT_ORDER.filter((t) => Array.isArray(payload[t]) && payload[t].length);

  try {
    console.log('=== Import deploy data ===');
    console.log(`File: ${opts.file}`);
    console.log(`Target: ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const table of order) {
      const rows = payload[table] || [];
      const n = await upsertRows(conn, table, rows);
      console.log(`  ${table}: ${n} row(s)`);
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Import complete.');
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error('Import failed:', e.message);
  process.exit(1);
});
