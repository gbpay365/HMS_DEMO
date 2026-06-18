'use strict';

/**
 * Export service catalog + pharmacy inventory from dev DB for manual deploy.
 * Output: Update/data/deploy-data-export.json
 *
 * Usage: node scripts/export-deploy-data.js
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'Update', 'data');
const OUT_FILE = path.join(OUT_DIR, 'deploy-data-export.json');

const CATALOG_TABLES = [
  'tbl_service_catalog',
  'tbl_lab_catalog',
  'tbl_lab_test_group',
  'tbl_lab_test_group_line',
  'tbl_radiology_test_group',
  'tbl_radiology_test_group_line',
  'tbl_ipd_surgery_template',
];

const PHARMACY_TABLES = [
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

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 AS ok FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table]
  );
  return !!(rows && rows.length);
}

async function exportTable(conn, table) {
  if (!(await tableExists(conn, table))) return [];
  const [rows] = await conn.query(`SELECT * FROM ${table} ORDER BY id`);
  return rows || [];
}

async function exportPharmacyInventoryCategories(conn) {
  const [inventory] = await conn.query(
    `SELECT i.* FROM tbl_inventory_item i
     INNER JOIN tbl_service_catalog sc ON sc.id = i.service_catalog_id
     WHERE LOWER(TRIM(sc.category)) = 'pharmacy' ORDER BY i.id`
  );
  const catIds = [...new Set((inventory || []).map((r) => r.category_id).filter(Boolean))];
  let categories = [];
  if (catIds.length && (await tableExists(conn, 'tbl_inventory_category'))) {
    const [rows] = await conn.query(
      `SELECT * FROM tbl_inventory_category WHERE id IN (${catIds.map(() => '?').join(',')})`,
      catIds
    );
    categories = rows || [];
  }
  const itemIds = (inventory || []).map((r) => r.id);
  let movements = [];
  if (itemIds.length && (await tableExists(conn, 'tbl_inventory_movement'))) {
    const [rows] = await conn.query(
      `SELECT * FROM tbl_inventory_movement WHERE inventory_item_id IN (${itemIds.map(() => '?').join(',')}) ORDER BY id`,
      itemIds
    );
    movements = rows || [];
  }
  return { inventory: inventory || [], categories, movements };
}

async function main() {
  loadEnvFile(path.join(ROOT, '.env'));
  const cfg = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
  };

  const conn = await mysql.createConnection(cfg);
  const payload = {
    exportedAt: new Date().toISOString(),
    sourceDatabase: cfg.database,
    counts: {},
    importOrder: [],
  };

  try {
    for (const table of CATALOG_TABLES) {
      const rows = await exportTable(conn, table);
      payload[table] = rows;
      payload.counts[table] = rows.length;
      if (rows.length) payload.importOrder.push(table);
    }

    const pharmacy = await exportPharmacyInventoryCategories(conn);
    payload.tbl_inventory_category = pharmacy.categories;
    payload.tbl_inventory_item = pharmacy.inventory;
    payload.tbl_inventory_movement = pharmacy.movements;
    payload.counts.tbl_inventory_category = pharmacy.categories.length;
    payload.counts.tbl_inventory_item = pharmacy.inventory.length;
    payload.counts.tbl_inventory_movement = pharmacy.movements.length;
    for (const table of PHARMACY_TABLES) {
      if (payload[table] && payload[table].length) payload.importOrder.push(table);
    }

    const [[pharmacyCatalog]] = await conn.query(
      `SELECT COUNT(*) AS c FROM tbl_service_catalog WHERE LOWER(TRIM(category)) = 'pharmacy' AND status = 1`
    );
    payload.counts.pharmacy_catalog_active = parseInt(pharmacyCatalog && pharmacyCatalog.c, 10) || 0;

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');

    console.log('Exported deploy data:');
    console.log(`  ${OUT_FILE}`);
    for (const table of payload.importOrder) {
      console.log(`  ${table}: ${payload.counts[table]}`);
    }
    console.log(`  pharmacy_catalog_active: ${payload.counts.pharmacy_catalog_active}`);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error('Export failed:', e.message);
  process.exit(1);
});
