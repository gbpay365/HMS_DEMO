'use strict';

/**
 * Export pharmacy catalog + inventory from dev DB to Update/data/pharmacy-deploy-export.json
 * for offline import on the deploy server.
 *
 * Usage: node scripts/export-pharmacy-deploy-data.js
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'Update', 'data');
const OUT_FILE = path.join(OUT_DIR, 'pharmacy-deploy-export.json');

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
  try {
    const [catalog] = await conn.query(
      `SELECT * FROM tbl_service_catalog WHERE LOWER(TRIM(category)) = 'pharmacy' ORDER BY id`
    );
    const [inventory] = await conn.query(
      `SELECT i.* FROM tbl_inventory_item i
       INNER JOIN tbl_service_catalog sc ON sc.id = i.service_catalog_id
       WHERE LOWER(TRIM(sc.category)) = 'pharmacy' ORDER BY i.id`
    );
    const catIds = [...new Set((inventory || []).map((r) => r.category_id).filter(Boolean))];
    let categories = [];
    if (catIds.length) {
      const [rows] = await conn.query(
        `SELECT * FROM tbl_inventory_category WHERE id IN (${catIds.map(() => '?').join(',')})`,
        catIds
      );
      categories = rows || [];
    }
    const itemIds = (inventory || []).map((r) => r.id);
    let movements = [];
    if (itemIds.length) {
      const [rows] = await conn.query(
        `SELECT * FROM tbl_inventory_movement WHERE inventory_item_id IN (${itemIds.map(() => '?').join(',')}) ORDER BY id`,
        itemIds
      );
      movements = rows || [];
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      sourceDatabase: cfg.database,
      counts: {
        catalog: (catalog || []).length,
        inventory: (inventory || []).length,
        categories: categories.length,
        movements: movements.length,
      },
      tbl_service_catalog: catalog || [],
      tbl_inventory_category: categories,
      tbl_inventory_item: inventory || [],
      tbl_inventory_movement: movements,
    };

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
    console.log('Exported pharmacy deploy data:');
    console.log(`  ${OUT_FILE}`);
    console.log(`  catalog=${payload.counts.catalog} inventory=${payload.counts.inventory} movements=${payload.counts.movements}`);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error('Export failed:', e.message);
  process.exit(1);
});
