'use strict';

/**
 * Push pharmacy service-catalog tariffs and linked inventory stock from DEV → deploy target.
 *
 * Source (dev): HMS .env  (DB_* → hms on XAMPP)
 * Target:       Railway by default, or DEPLOY_DB_* in scripts/db-sync.env
 *
 * Usage (from repo root):
 *   node scripts/push-dev-pharmacy-to-target.js
 *   node scripts/push-dev-pharmacy-to-target.js --dry-run
 *   node scripts/push-dev-pharmacy-to-target.js --target railway
 *   node scripts/push-dev-pharmacy-to-target.js --target deploy
 *   node scripts/push-dev-pharmacy-to-target.js --include-movements
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const ROOT = path.resolve(__dirname, '..');

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
  const opts = { dryRun: false, target: 'railway', includeMovements: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--include-movements') opts.includeMovements = true;
    else if (a === '--target' && argv[i + 1]) opts.target = String(argv[++i]).toLowerCase();
    else if (a.startsWith('--target=')) opts.target = a.slice(9).toLowerCase();
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  return opts;
}

function getDevConfig() {
  loadEnvFile(path.join(ROOT, '.env'));
  if (!process.env.DB_NAME) loadEnvFile(path.join(ROOT, '.env.production'));
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hms',
    multipleStatements: true,
  };
}

function getTargetConfig(target) {
  loadEnvFile(path.join(ROOT, 'scripts', 'db-sync.env'));
  if (target === 'deploy') {
    return {
      host: process.env.DEPLOY_DB_HOST || process.env.LOCAL_DB_HOST || 'localhost',
      port: parseInt(process.env.DEPLOY_DB_PORT || process.env.LOCAL_DB_PORT || '3306', 10),
      user: process.env.DEPLOY_DB_USER || process.env.LOCAL_DB_USER || 'root',
      password: process.env.DEPLOY_DB_PASSWORD || process.env.LOCAL_DB_PASSWORD || '',
      database: process.env.DEPLOY_DB_NAME || process.env.LOCAL_DB_NAME || 'hms_demo',
      multipleStatements: true,
      connectTimeout: 30000,
    };
  }
  return {
    host: process.env.RAILWAY_MYSQL_HOST || 'crossover.proxy.rlwy.net',
    port: parseInt(process.env.RAILWAY_MYSQL_PORT || '36338', 10),
    user: process.env.RAILWAY_MYSQL_USER || 'root',
    password: process.env.RAILWAY_MYSQL_PASSWORD || '',
    database: process.env.RAILWAY_MYSQL_DATABASE || 'railway',
    multipleStatements: true,
    connectTimeout: 60000,
  };
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

async function upsertById(conn, table, rows, { dryRun = false } = {}) {
  if (!rows.length) return { table, upserted: 0, skipped: 0 };
  const sourceCols = Object.keys(rows[0]);
  const targetCols = await tableColumns(conn, table);
  const cols = sourceCols.filter((c) => targetCols.includes(c));
  if (!cols.includes('id')) throw new Error(`${table}: missing id column on shared columns`);

  let upserted = 0;
  for (const row of rows) {
    const vals = cols.map((c) => row[c]);
    const placeholders = cols.map(() => '?').join(', ');
    const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = VALUES(${c})`).join(', ');
    const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})
                 ON DUPLICATE KEY UPDATE ${updates || 'id = id'}`;
    if (!dryRun) await conn.query(sql, vals);
    upserted++;
  }
  return { table, upserted, skipped: 0 };
}

async function loadPharmacyCatalog(conn) {
  const [rows] = await conn.query(
    `SELECT * FROM tbl_service_catalog
     WHERE LOWER(TRIM(category)) = 'pharmacy'
     ORDER BY id`
  );
  return rows || [];
}

async function loadPharmacyInventory(conn) {
  const [rows] = await conn.query(
    `SELECT i.* FROM tbl_inventory_item i
     INNER JOIN tbl_service_catalog sc ON sc.id = i.service_catalog_id
     WHERE LOWER(TRIM(sc.category)) = 'pharmacy'
     ORDER BY i.id`
  );
  return rows || [];
}

async function loadInventoryCategories(conn, categoryIds) {
  const ids = [...new Set(categoryIds.filter((id) => id != null))];
  if (!ids.length) return [];
  const [rows] = await conn.query(
    `SELECT * FROM tbl_inventory_category WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  return rows || [];
}

async function loadMovements(conn, itemIds) {
  const ids = [...new Set(itemIds.filter((id) => id != null))];
  if (!ids.length) return [];
  const [rows] = await conn.query(
    `SELECT * FROM tbl_inventory_movement
     WHERE inventory_item_id IN (${ids.map(() => '?').join(',')})
     ORDER BY id`,
    ids
  );
  return rows || [];
}

async function pruneOrphanPharmacyInventory(targetConn, catalogIds, { dryRun = false } = {}) {
  if (!catalogIds.length) return { removed: 0 };
  const placeholders = catalogIds.map(() => '?').join(',');
  const [orphans] = await targetConn.query(
    `SELECT i.id FROM tbl_inventory_item i
     LEFT JOIN tbl_service_catalog sc
       ON sc.id = i.service_catalog_id
      AND LOWER(TRIM(sc.category)) = 'pharmacy'
      AND sc.status = 1
     WHERE sc.id IS NULL
       AND (
         i.service_catalog_id IS NOT NULL
         OR i.sku REGEXP '^HMS-[0-9]+-C[0-9]+$'
       )`
  );
  const toRemove = (orphans || []).map((r) => r.id);
  if (!toRemove.length) return { removed: 0 };
  if (!dryRun) {
    await targetConn.query('SET FOREIGN_KEY_CHECKS = 0');
    await targetConn.query(
      `DELETE FROM tbl_inventory_movement WHERE inventory_item_id IN (${toRemove.map(() => '?').join(',')})`,
      toRemove
    );
    await targetConn.query(
      `DELETE FROM tbl_inventory_item WHERE id IN (${toRemove.map(() => '?').join(',')})`,
      toRemove
    );
    await targetConn.query('SET FOREIGN_KEY_CHECKS = 1');
  }
  return { removed: toRemove.length };
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log('Usage: node scripts/push-dev-pharmacy-to-target.js [--dry-run] [--target railway|deploy] [--include-movements]');
    process.exit(0);
  }

  const devCfg = getDevConfig();
  const targetCfg = getTargetConfig(opts.target);

  console.log('=== Push pharmacy catalog + inventory (DEV → target) ===');
  console.log('Started:', new Date().toISOString());
  console.log(`Source: ${devCfg.user}@${devCfg.host}:${devCfg.port}/${devCfg.database}`);
  console.log(`Target: ${targetCfg.user}@${targetCfg.host}:${targetCfg.port}/${targetCfg.database} (${opts.target})`);
  if (opts.dryRun) console.log('Mode: DRY-RUN');
  console.log('');

  const devConn = await mysql.createConnection(devCfg);
  const targetConn = await mysql.createConnection(targetCfg);

  try {
    const catalog = await loadPharmacyCatalog(devConn);
    const inventory = await loadPharmacyInventory(devConn);
    const categories = await loadInventoryCategories(
      devConn,
      inventory.map((r) => r.category_id)
    );
    const movements = opts.includeMovements
      ? await loadMovements(
          devConn,
          inventory.map((r) => r.id)
        )
      : [];

    console.log(`Loaded from dev: catalog=${catalog.length}, inventory=${inventory.length}, categories=${categories.length}, movements=${movements.length}`);

    if (!opts.dryRun) await targetConn.query('SET FOREIGN_KEY_CHECKS = 0');

    const results = [];
    results.push(await upsertById(targetConn, 'tbl_service_catalog', catalog, { dryRun: opts.dryRun }));
    if (categories.length) {
      results.push(await upsertById(targetConn, 'tbl_inventory_category', categories, { dryRun: opts.dryRun }));
    }
    results.push(await upsertById(targetConn, 'tbl_inventory_item', inventory, { dryRun: opts.dryRun }));
    if (movements.length) {
      results.push(await upsertById(targetConn, 'tbl_inventory_movement', movements, { dryRun: opts.dryRun }));
    }

    const catalogIds = catalog.map((r) => r.id);
    const pruned = await pruneOrphanPharmacyInventory(targetConn, catalogIds, { dryRun: opts.dryRun });

    if (!opts.dryRun) await targetConn.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('\n=== Summary ===');
    for (const r of results) console.log(`  ${r.table}: upserted ${r.upserted}`);
    console.log(`  orphan inventory removed: ${pruned.removed}`);
    console.log(opts.dryRun ? '\nDRY-RUN complete (no writes).' : '\nPush complete.');
  } finally {
    await devConn.end();
    await targetConn.end();
  }
}

main().catch((e) => {
  console.error('Push failed:', e.message);
  process.exit(1);
});
