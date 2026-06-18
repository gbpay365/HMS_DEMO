'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const SCRIPT_DIR = __dirname;
const APP_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const ROOT_NODE_MODULES = path.join(APP_ROOT, 'node_modules');

function ensureRootDeps() {
  if (!fs.existsSync(path.join(ROOT_NODE_MODULES, 'mysql2'))) {
    console.error('[sync] mysql2 is not installed.');
    console.error('[sync] From HMS root run:  npm install --omit=dev');
    console.error('[sync] Or run:  scripts\\install-sync-deps.bat');
    process.exit(1);
  }
  if (!Module.globalPaths.includes(ROOT_NODE_MODULES)) {
    Module.globalPaths.unshift(ROOT_NODE_MODULES);
  }
}

ensureRootDeps();

const mysql = require('mysql2/promise');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return false;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
  return true;
}

function loadHmsAppEnv(repoRoot) {
  const envPath = path.join(repoRoot, '.env');
  const prodPath = path.join(repoRoot, '.env.production');
  const loaded = [];
  if (loadEnvFile(envPath)) loaded.push('.env');
  if (!process.env.DB_NAME && loadEnvFile(prodPath)) loaded.push('.env.production');
  return loaded;
}

function applyHmsLocalDbCredentials() {
  if (process.env.LOCAL_DB_USE_HMS_ENV === '0') return false;
  if (!process.env.DB_USER && !process.env.DB_NAME) return false;
  if (process.env.DB_HOST) process.env.LOCAL_DB_HOST = process.env.DB_HOST;
  if (process.env.DB_PORT) process.env.LOCAL_DB_PORT = process.env.DB_PORT;
  if (process.env.DB_USER) process.env.LOCAL_DB_USER = process.env.DB_USER;
  if (process.env.DB_PASSWORD !== undefined) process.env.LOCAL_DB_PASSWORD = process.env.DB_PASSWORD;
  if (process.env.DB_NAME) process.env.LOCAL_DB_NAME = process.env.DB_NAME;
  return true;
}

function loadSyncEnv() {
  const repoRoot = path.join(SCRIPT_DIR, '..', '..');
  const candidates = [
    process.env.RAILWAY_SYNC_ENV,
    process.env.DB_SYNC_ENV,
    path.join(repoRoot, 'db-sync.env'),
    path.join(repoRoot, 'scripts', 'db-sync.env'),
    path.join(SCRIPT_DIR, 'db-sync.env'),
    path.join(SCRIPT_DIR, 'railway-sync.env'),
    path.join(repoRoot, 'scripts', 'railway-sync.env'),
    path.join(repoRoot, 'docs', 'scripts', 'railway-sync.env'),
  ].filter(Boolean);

  let syncEnvFile = null;
  for (const p of candidates) {
    if (loadEnvFile(p)) {
      syncEnvFile = p;
      break;
    }
  }

  const hmsLoaded = loadHmsAppEnv(repoRoot);
  const usedHms = applyHmsLocalDbCredentials();

  return { syncEnvFile, hmsLoaded, usedHms, repoRoot };
}

function getLocalConfig() {
  const cfg = {
    host: process.env.LOCAL_DB_HOST || 'localhost',
    port: parseInt(process.env.LOCAL_DB_PORT || '3306', 10),
    user: process.env.LOCAL_DB_USER || 'root',
    password: process.env.LOCAL_DB_PASSWORD || '',
    database: process.env.LOCAL_DB_NAME || 'hms',
    multipleStatements: true,
  };
  if (!cfg.user || !cfg.database) {
    throw new Error(
      'Local MySQL credentials missing. Set LOCAL_DB_* in railway-sync.env or DB_* in HMS .env (LOCAL_DB_USE_HMS_ENV=1).'
    );
  }
  return cfg;
}

function getRailwayConfig() {
  const cfg = {
    host: process.env.RAILWAY_MYSQL_HOST || 'crossover.proxy.rlwy.net',
    port: parseInt(process.env.RAILWAY_MYSQL_PORT || '36338', 10),
    user: process.env.RAILWAY_MYSQL_USER || 'root',
    password: process.env.RAILWAY_MYSQL_PASSWORD || '',
    database: process.env.RAILWAY_MYSQL_DATABASE || 'railway',
    multipleStatements: true,
    connectTimeout: parseInt(process.env.RAILWAY_CONNECT_TIMEOUT_MS || '60000', 10),
  };
  if (!cfg.password) {
    throw new Error('Set RAILWAY_MYSQL_PASSWORD in docs/scripts/railway-sync.env (copy from railway-sync.env.example).');
  }
  return cfg;
}

async function tableColumns(conn, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME AS name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [table]
  );
  return (rows || []).map((r) => r.name);
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 AS ok FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table]
  );
  return !!(rows && rows.length);
}

async function primaryKeyColumns(conn, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME AS name
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = 'PRIMARY'
      ORDER BY ORDINAL_POSITION`,
    [table]
  );
  return (rows || []).map((r) => r.name);
}

function dedupeRows(rows, keyColumns) {
  if (!keyColumns.length) return rows;
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = keyColumns.map((c) => String(row[c] ?? '')).join('\0');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function readTableRows(conn, table, columns, keyColumns) {
  const colList = columns.map((c) => `\`${c}\``).join(', ');
  const orderBy = keyColumns.length
    ? ` ORDER BY ${keyColumns.map((c) => `\`${c}\``).join(', ')}`
    : '';
  const [rows] = await conn.query(`SELECT ${colList} FROM \`${table}\`${orderBy}`);
  return rows || [];
}

async function replaceTargetTable(targetConn, table, columns, rows, keyColumns) {
  const exists = await tableExists(targetConn, table);
  if (!exists) {
    return { table, skipped: true, reason: 'missing_on_target', source: rows.length, target: 0 };
  }

  const deduped = dedupeRows(rows, keyColumns);

  await targetConn.query(`DELETE FROM \`${table}\``);
  const [[{ remaining }]] = await targetConn.query(`SELECT COUNT(*) AS remaining FROM \`${table}\``);
  if (Number(remaining) > 0) {
    throw new Error(`${table}: expected 0 rows after DELETE on target, found ${remaining}`);
  }

  if (deduped.length) {
    const colList = columns.map((c) => `\`${c}\``).join(', ');
    const rowPlaceholder = `(${columns.map(() => '?').join(', ')})`;
    const batchSize = parseInt(process.env.SYNC_BATCH_SIZE || '200', 10);
    for (let i = 0; i < deduped.length; i += batchSize) {
      const batch = deduped.slice(i, i + batchSize);
      const placeholders = batch.map(() => rowPlaceholder).join(', ');
      const sql = `INSERT INTO \`${table}\` (${colList}) VALUES ${placeholders}`;
      const vals = [];
      for (const row of batch) {
        for (const c of columns) vals.push(row[c] === undefined ? null : row[c]);
      }
      await targetConn.query(sql, vals);
    }
    if (columns.includes('id')) {
      const maxId = Math.max(...deduped.map((r) => Number(r.id) || 0));
      if (maxId > 0) {
        await targetConn.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = ?`, [maxId + 1]).catch(() => {});
      }
    }
  }

  const [[{ cnt }]] = await targetConn.query(`SELECT COUNT(*) AS cnt FROM \`${table}\``);
  return {
    table,
    skipped: false,
    source: deduped.length,
    target: Number(cnt) || 0,
  };
}

async function listDatabaseTables(conn) {
  const [rows] = await conn.query(
    `SELECT table_name AS name
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  );
  return (rows || []).map((r) => r.name || r.TABLE_NAME).filter(Boolean);
}

function parseCsvList(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function filterTables(allTables, { include, exclude }) {
  const excludeSet = new Set(exclude.map((t) => t.toLowerCase()));
  let list = allTables.filter((t) => !excludeSet.has(t.toLowerCase()));
  if (include.length) {
    const includeSet = new Set(include.map((t) => t.toLowerCase()));
    list = list.filter((t) => includeSet.has(t.toLowerCase()));
  }
  return list;
}

/** Presets for selective synchronisation (local ↔ railway). */
const SYNC_PRESETS = Object.freeze({
  acl: [
    'tbl_acl_module',
    'tbl_acl_permission',
    'tbl_acl_portal',
    'tbl_acl_ui_element',
    'tbl_role',
    'tbl_acl_role_permission',
    'tbl_acl_role_portal',
    'tbl_acl_role_ui_hidden',
    'tbl_acl_role_nav_grant',
    'tbl_workflow_step_roles',
    'tbl_acl_audit',
  ],
  catalog: [
    'tbl_service_catalog',
    'tbl_lab_catalog',
    'tbl_lab_test_group',
    'tbl_lab_test_group_line',
    'tbl_radiology_test_group',
    'tbl_radiology_test_group_line',
    'tbl_ipd_surgery_template',
  ],
  'pharmacy-inventory': [
    'tbl_service_catalog',
    'tbl_inventory_category',
    'tbl_inventory_item',
    'tbl_inventory_movement',
  ],
  specialisation: [
    'tbl_department',
    'tbl_doctor_specialisation_removed',
    'tbl_doctor_specialisation',
    'tbl_employee_doctor_specialisation',
  ],
  roles: ['tbl_role'],
  employees: ['tbl_employee', 'tbl_employee_department', 'tbl_employee_doctor_specialisation'],
});

function resolvePresetTables(presetName) {
  const key = String(presetName || '').trim().toLowerCase();
  if (!key) return [];
  if (key === 'all-config') {
    const seen = new Set();
    const out = [];
    for (const tables of Object.values(SYNC_PRESETS)) {
      for (const t of tables) {
        if (!seen.has(t)) {
          seen.add(t);
          out.push(t);
        }
      }
    }
    return out;
  }
  return SYNC_PRESETS[key] ? [...SYNC_PRESETS[key]] : [];
}

async function syncTables(sourceConn, targetConn, tables, { dryRun = false, label = 'sync' } = {}) {
  await targetConn.query('SET FOREIGN_KEY_CHECKS = 0');
  const results = [];

  for (const table of tables) {
    const sourceExists = await tableExists(sourceConn, table);
    if (!sourceExists) {
      console.warn(`SKIP ${table} — missing on source`);
      results.push({ table, skipped: true, reason: 'missing_on_source', source: 0, target: 0 });
      continue;
    }

    const sourceCols = await tableColumns(sourceConn, table);
    const targetCols = new Set(await tableColumns(targetConn, table));
    const columns = sourceCols.filter((c) => targetCols.has(c));
    const missingOnTarget = sourceCols.filter((c) => !targetCols.has(c));
    if (missingOnTarget.length) {
      console.warn(`  ${table}: omitting columns not on target: ${missingOnTarget.join(', ')}`);
    }

    const keyColumns = await primaryKeyColumns(sourceConn, table);
    const rows = await readTableRows(sourceConn, table, columns, keyColumns);
    console.log(`${label} ${table} (${rows.length} source row(s))…`);

    if (dryRun) {
      results.push({ table, skipped: false, dryRun: true, source: rows.length, target: null });
      continue;
    }

    const result = await replaceTargetTable(targetConn, table, columns, rows, keyColumns);
    results.push(result);
    if (result.skipped) {
      console.warn(`  → SKIPPED (${result.reason})`);
    } else {
      console.log(`  → target: ${result.target} row(s)`);
    }
  }

  await targetConn.query('SET FOREIGN_KEY_CHECKS = 1');
  return results;
}

function printSummary(results) {
  console.log('\n=== Summary ===');
  let ok = true;
  for (const r of results) {
    if (r.skipped) {
      console.log(`  ${r.table}: SKIPPED${r.reason ? ` (${r.reason})` : ''}`);
      continue;
    }
    if (r.dryRun) {
      console.log(`  ${r.table}: DRY-RUN source=${r.source}`);
      continue;
    }
    if (r.bidirectional) {
      console.log(`  ${r.table}: railway→local=${r.toLocal || 0} local→railway=${r.toRail || 0} mode=${r.mode || 'merge'}`);
      continue;
    }
    const match = r.source === r.target ? 'OK' : 'MISMATCH';
    if (match !== 'OK') ok = false;
    console.log(`  ${r.table}: source=${r.source} target=${r.target} [${match}]`);
  }
  return ok;
}

function rowKey(row, keyColumns) {
  return keyColumns.map((c) => String(row[c] ?? '')).join('\0');
}

function detectTimestampColumn(columns) {
  const cols = new Set(columns);
  if (cols.has('updated_at')) return 'updated_at';
  if (cols.has('modified_at')) return 'modified_at';
  if (cols.has('created_at')) return 'created_at';
  return null;
}

function tsValue(row, tsCol) {
  if (!tsCol || row[tsCol] == null) return 0;
  const n = new Date(row[tsCol]).getTime();
  return Number.isFinite(n) ? n : 0;
}

async function upsertRows(conn, table, columns, rows, keyColumns) {
  if (!rows.length) return 0;
  const deduped = dedupeRows(rows, keyColumns);
  const colList = columns.map((c) => `\`${c}\``).join(', ');
  const rowPlaceholder = `(${columns.map(() => '?').join(', ')})`;
  const nonKey = columns.filter((c) => !keyColumns.includes(c));
  const updateClause = nonKey.length
    ? ` ON DUPLICATE KEY UPDATE ${nonKey.map((c) => `\`${c}\`=VALUES(\`${c}\`)`).join(', ')}`
    : '';
  const batchSize = parseInt(process.env.SYNC_BATCH_SIZE || '200', 10);
  let written = 0;

  for (let i = 0; i < deduped.length; i += batchSize) {
    const batch = deduped.slice(i, i + batchSize);
    const placeholders = batch.map(() => rowPlaceholder).join(', ');
    const sql = `INSERT INTO \`${table}\` (${colList}) VALUES ${placeholders}${updateClause}`;
    const vals = [];
    for (const row of batch) {
      for (const c of columns) vals.push(row[c] === undefined ? null : row[c]);
    }
    await conn.query(sql, vals);
    written += batch.length;
  }

  if (columns.includes('id')) {
    const maxId = Math.max(...deduped.map((r) => Number(r.id) || 0));
    if (maxId > 0) {
      await conn.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = ?`, [maxId + 1]).catch(() => {});
    }
  }
  return written;
}

async function commonColumns(localConn, railConn, table) {
  const localCols = await tableColumns(localConn, table);
  const railCols = new Set(await tableColumns(railConn, table));
  const columns = localCols.filter((c) => railCols.has(c));
  const missingOnRail = localCols.filter((c) => !railCols.has(c));
  const missingOnLocal = [...railCols].filter((c) => !localCols.includes(c));
  return { columns, missingOnRail, missingOnLocal };
}

async function syncTableBidirectional(localConn, railConn, table, opts = {}) {
  const localExists = await tableExists(localConn, table);
  const railExists = await tableExists(railConn, table);
  if (!localExists && !railExists) {
    return { table, skipped: true, reason: 'missing_both', bidirectional: true };
  }
  if (!localExists || !railExists) {
    const sourceConn = localExists ? localConn : railConn;
    const targetConn = localExists ? railConn : localConn;
    const direction = localExists ? 'local-to-railway' : 'railway-to-local';
    const [single] = await syncTables(sourceConn, targetConn, [table], {
      dryRun: opts.dryRun,
      label: opts.dryRun ? `Would copy (${direction})` : `Copying (${direction})`,
    });
    return { ...single, bidirectional: true, mode: 'one-sided-copy', direction };
  }

  const keyColumns = await primaryKeyColumns(localConn, table);
  if (!keyColumns.length) {
    return { table, skipped: true, reason: 'no_primary_key', bidirectional: true };
  }

  const { columns, missingOnRail, missingOnLocal } = await commonColumns(localConn, railConn, table);
  if (!columns.length) {
    return { table, skipped: true, reason: 'no_common_columns', bidirectional: true };
  }
  if (missingOnRail.length) {
    console.warn(`  ${table}: omitting columns not on Railway: ${missingOnRail.join(', ')}`);
  }
  if (missingOnLocal.length) {
    console.warn(`  ${table}: omitting columns not on local: ${missingOnLocal.join(', ')}`);
  }

  const tsCol = detectTimestampColumn(columns);
  const noTsOwner = String(opts.noTsOwner || process.env.BIDIRECTIONAL_NO_TS_OWNER || 'local').toLowerCase();

  if (!tsCol) {
    if (noTsOwner === 'railway') {
      const [single] = await syncTables(railConn, localConn, [table], {
        dryRun: opts.dryRun,
        label: opts.dryRun ? 'Would sync (railway→local, no timestamp)' : 'Syncing (railway→local, no timestamp)',
      });
      return { ...single, bidirectional: true, mode: 'railway-wins-no-ts' };
    }
    const [single] = await syncTables(localConn, railConn, [table], {
      dryRun: opts.dryRun,
      label: opts.dryRun ? 'Would sync (local→railway, no timestamp)' : 'Syncing (local→railway, no timestamp)',
    });
    return { ...single, bidirectional: true, mode: 'local-wins-no-ts' };
  }

  const localRows = await readTableRows(localConn, table, columns, keyColumns);
  const railRows = await readTableRows(railConn, table, columns, keyColumns);
  const localMap = new Map(localRows.map((r) => [rowKey(r, keyColumns), r]));
  const railMap = new Map(railRows.map((r) => [rowKey(r, keyColumns), r]));

  const toLocal = [];
  const toRail = [];

  for (const [key, rr] of railMap) {
    const lr = localMap.get(key);
    if (!lr) {
      toLocal.push(rr);
      continue;
    }
    if (tsValue(rr, tsCol) > tsValue(lr, tsCol)) toLocal.push(rr);
  }

  for (const [key, lr] of localMap) {
    const rr = railMap.get(key);
    if (!rr) {
      toRail.push(lr);
      continue;
    }
    if (tsValue(lr, tsCol) > tsValue(rr, tsCol)) toRail.push(lr);
  }

  console.log(
    `${opts.dryRun ? 'Would merge' : 'Merging'} ${table}: railway→local ${toLocal.length}, local→railway ${toRail.length} (by ${tsCol})`
  );

  if (!opts.dryRun) {
    await localConn.query('SET FOREIGN_KEY_CHECKS = 0');
    await railConn.query('SET FOREIGN_KEY_CHECKS = 0');
    await upsertRows(localConn, table, columns, toLocal, keyColumns);
    await upsertRows(railConn, table, columns, toRail, keyColumns);
    await localConn.query('SET FOREIGN_KEY_CHECKS = 1');
    await railConn.query('SET FOREIGN_KEY_CHECKS = 1');
  }

  return {
    table,
    skipped: false,
    bidirectional: true,
    mode: 'timestamp-merge',
    tsCol,
    toLocal: toLocal.length,
    toRail: toRail.length,
    dryRun: !!opts.dryRun,
  };
}

async function syncTablesBidirectional(localConn, railConn, tables, opts = {}) {
  const results = [];
  for (const table of tables) {
    try {
      results.push(await syncTableBidirectional(localConn, railConn, table, opts));
    } catch (err) {
      console.error(`ERROR ${table}:`, err.message);
      results.push({ table, skipped: true, reason: err.message, bidirectional: true });
    }
  }
  return results;
}

module.exports = {
  SCRIPT_DIR,
  loadSyncEnv,
  getLocalConfig,
  getRailwayConfig,
  listDatabaseTables,
  parseCsvList,
  filterTables,
  resolvePresetTables,
  SYNC_PRESETS,
  syncTables,
  syncTableBidirectional,
  syncTablesBidirectional,
  printSummary,
};
